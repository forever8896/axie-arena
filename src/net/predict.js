/**
 * Your own Axie, moved now rather than in a round trip's time.
 *
 * The room is the authority and stays the authority: this never decides a hit,
 * a bounty or a death. It decides one thing — where your own body is between
 * the moment you press a key and the moment the room's answer arrives — and it
 * decides it by running the room's own code.
 *
 * That last part matters. This does not reimplement movement; it instantiates
 * the server's SimFighter against a stub room, feeds it the same inputs, and so
 * produces the same motion. A reimplementation would drift, and drift shows up
 * as your Axie snapping back under your hands.
 *
 * On every snapshot it rewinds to what the room said, replays the inputs the
 * room has not seen yet, and eases away whatever difference is left, so a
 * correction is felt as a slight slide rather than a jump.
 */
import SimFighter from '../sim/fighter.js'
import SimArena from '../sim/arena.js'
import { Vec2 } from '../sim/math.js'
import { FLAGS, has } from '../sim/constants.js'
import { STAMINA } from '../axie/combatConfig.js'
import { TICK_MS } from './protocol.js'

/** Corrections smaller than this are eased away; larger ones are obeyed at once. */
const SNAP_PX = 140

/** How fast a correction is absorbed. Whole at ~150ms. */
const EASE_PER_MS = 1 / 150

/** Inputs kept while they wait to be acknowledged. Three seconds' worth. */
const MAX_PENDING = 200

/**
 * Enough of a room for one fighter to move in: the arena to collide with, a
 * clock, and somewhere for the events it emits to go and be ignored, because a
 * prediction must never make a noise or spend a resource.
 */
class StubRoom {
  constructor() {
    this.arena = new SimArena()
    this.now = 0
    this.timers = []
  }

  event() {}

  after(ms, fn) {
    this.timers.push({ at: this.now + ms, fn })
  }

  step(dt) {
    this.now += dt
    if (!this.timers.length) return
    const due = this.timers.filter(t => t.at <= this.now)
    if (!due.length) return
    this.timers = this.timers.filter(t => t.at > this.now)
    for (const t of due) t.fn()
  }
}

export default class Prediction {
  constructor() {
    this.room = new StubRoom()
    this.fighter = null
    this.pending = []
    this.offset = new Vec2(0, 0)
    this.enabled = true
    /** Last measured distance between prediction and authority, for the HUD. */
    this.error = 0
    this.following = false
  }

  /** Called once the room has said which fighter is ours. */
  begin(snap, now) {
    this.room.now = now
    this.fighter = new SimFighter(this.room, {
      id: snap.id, axieClass: snap.cls, isPlayer: true, name: snap.name, x: snap.x, y: snap.y,
    })
    this.pending = []
    this.offset.set(0, 0)
    this.adopt(snap)
  }

  /** Take the authority's word for this fighter's state. */
  adopt(snap) {
    const f = this.fighter
    if (!f) return
    f.pos.set(snap.x, snap.y)
    f.vel.set(snap.vx ?? 0, snap.vy ?? 0)
    f.hp = snap.hp
    f.alive = snap.alive
    f.charge = snap.charge
    // Cooldowns come back as how far along they are, which is all that is
    // needed to know whether the next dash or parry is allowed.
    f.lastDash = this.room.now - (snap.ready?.dash ?? 1) * f.dashCooldown
    f.lastParry = this.room.now - (snap.ready?.parry ?? 1) * 1000
    f.spawnShieldUntil = has(snap.flags, FLAGS.SHIELDED) ? this.room.now + 1 : 0
    // Stamina and a broken guard both change how fast you move, so the local
    // copy has to carry them or it will predict a sprint the room refuses.
    f.stamina = (snap.stamina ?? 1) * STAMINA.max
    f.moon = snap.moon ?? 0
    f.guardBrokenUntil = has(snap.flags, FLAGS.GUARD_BROKEN) ? this.room.now + 1 : 0
  }

  /**
   * One fixed step of the player's own body. `input` is exactly what was sent
   * to the room, so the room will reach the same place when it gets there.
   */
  step(input, seq) {
    const f = this.fighter
    if (!f || !this.enabled) return
    this.pending.push({ seq, input })
    if (this.pending.length > MAX_PENDING) this.pending.shift()
    this.apply(input)
  }

  apply(input) {
    const f = this.fighter
    f.aim = input.aim
    f.intent.set(input.move.x, input.move.y)
    // Only the dash is predicted among the actions: it is movement, and
    // movement is the thing a round trip ruins. Everything else — whether a
    // blow landed, whether a parry caught it — stays the room's to say.
    if (input.guard && !input.act?.includes('attack')) f.hold(this.room.now)
    // Aiming plants you almost still, and the room knows it. A client that did
    // not predict that ran at full speed for a round trip and was dragged back
    // every snapshot, which is the one thing prediction exists to prevent.
    if (input.aiming) f.beginAim(this.room.now)
    else if (f.aiming) f.releaseAim(this.room.now)
    if (input.act?.includes('dash')) f.dash(f.intent, this.room.now)
    this.room.step(TICK_MS)
    f.update(TICK_MS)
  }

  /**
   * The room has spoken. Rewind to it, replay what it has not seen, and keep
   * whatever difference is left as an offset to be eased away.
   */
  reconcile(snap, acked) {
    const f = this.fighter
    if (!f || !snap) return

    // While the room is moving you — stunned, dashing on its say-so, charging,
    // knocked back, dead — prediction has nothing to add and everything to get
    // wrong. Follow the authority and take control back afterwards.
    const driven = !snap.alive ||
      has(snap.flags, FLAGS.STUNNED) || has(snap.flags, FLAGS.CHARGING) ||
      has(snap.flags, FLAGS.CASTING) || has(snap.flags, FLAGS.GUARD_BROKEN)
    if (driven) {
      this.following = true
      this.adopt(snap)
      this.pending = this.pending.filter(p => p.seq > acked)
      this.offset.set(0, 0)
      this.error = 0
      return
    }
    this.following = false

    const before = f.pos.clone()
    const clockWas = this.room.now
    this.adopt(snap)

    // Replay: one fixed step per input the room has yet to acknowledge.
    this.pending = this.pending.filter(p => p.seq > acked)
    this.room.now = clockWas - this.pending.length * TICK_MS
    for (const p of this.pending) this.apply(p.input)
    this.room.now = clockWas

    const drift = Math.hypot(before.x - f.pos.x, before.y - f.pos.y)
    this.error = Math.round(drift)
    if (drift > SNAP_PX) {
      // Too far to hide: the room knows something this client did not.
      this.offset.set(0, 0)
    } else {
      // Keep drawing where we were, then close the gap over a few frames.
      this.offset.set(before.x - f.pos.x, before.y - f.pos.y)
    }
  }

  /** Eases the correction away. Call once a frame with the frame's delta. */
  settle(delta) {
    if (this.offset.lengthSq() < 0.01) {
      this.offset.set(0, 0)
      return
    }
    const keep = Math.max(0, 1 - delta * EASE_PER_MS)
    this.offset.scale(keep)
  }

  /** Where to draw your own Axie this frame. */
  get x() { return (this.fighter?.pos.x ?? 0) + this.offset.x }
  get y() { return (this.fighter?.pos.y ?? 0) + this.offset.y }

  get speed() { return this.fighter?.vel.length() ?? 0 }

  /** Whether the local rules would allow this action right now. */
  allows(action) {
    const f = this.fighter
    if (!f || this.following) return false
    const now = this.room.now
    if (action === 'attack') return f.canAttack(now)
    if (action === 'dash') return f.canDash(now)
    if (action === 'parry') return f.canParry(now)
    if (action === 'guard') return f.canGuard(now)
    if (action === 'moon') return f.canMoon(now)
    if (action === 'special') return f.canSpecial(now)
    return false
  }
}
