import { PARRY, TELEGRAPH_MS } from '../axie/classKits.js'
import { CONNECT_MS } from './constants.js'
import { distance, wrapAngle } from './math.js'

/** Specials a parry can stop. Projectiles and lobbed zones cannot be parried. */
const PARRYABLE_SPECIALS = new Set(['charge', 'radial'])

/**
 * The stand-ins. Wander until something is close, close the gap, swing, back
 * off to reset — plus reading a lunge to parry it, baiting a raised parry, and
 * breaking off for a power-up or a Moonwell.
 *
 * Ported from src/ai/BotBrain.js. Every roll goes through the room's seeded
 * randomness, so a server match can be replayed exactly.
 */
export default class SimBrain {
  constructor(fighter, {
    aggroRange = 480, backoffTime = 900, parryReadChance = 0.45,
    parryReadRate = 0.35, parryReactChance = 0.7,
  } = {}) {
    this.fighter = fighter
    this.room = fighter.room
    this.aggroRange = aggroRange
    this.backoffTime = backoffTime
    this.parryReadChance = parryReadChance
    this.parryReadRate = parryReadRate
    this.parryReactChance = parryReactChance
    this.readSwing = new WeakMap()
    this.reactedTo = new WeakSet()
    // Human-like, and different per bot: how long a raised parry must be up
    // before this one notices it.
    this.noticeDelay = this.room.rng.int(110, 190)
    this.lastThink = 0
    // Steering round cover: which way this bot tries first, and until when.
    this.slideDir = this.room.rng.chance(0.5) ? 1 : -1
    this.slideUntil = 0
    this.lastPos = { x: fighter.x, y: fighter.y }
    this.state = 'wander'
    this.stateUntil = 0
    this.wanderTarget = null
    this.parryFocus = null
    // When this stand-in first noticed a wind-up, so it reacts like a person
    // rather than on the exact frame.
    this.sawWindup = -Infinity
  }

  get rng() { return this.room.rng }

  update(now, targets) {
    const me = this.fighter
    if (!me.alive) return
    this.checkStuck(now)

    const target = this.nearest(targets)
    const dist = target ? distance(me.x, me.y, target.x, target.y) : Infinity

    // When this stand-in first saw the wind-up it is now reacting to. Reading
    // one takes a moment, the way it does for a person.
    if (target?.winding && this.sawWindup < target.swing.startedAt) {
      this.sawWindup = target.swing.startedAt
    }

    // While parrying, keep facing the threat being parried.
    const focus = me.parryCommitted && this.parryFocus?.alive ? this.parryFocus : target
    if (focus) me.aim = Math.atan2(focus.y - me.y, focus.x - me.x)

    const dt = this.lastThink ? Math.min(0.25, (now - this.lastThink) / 1000) : 0
    this.lastThink = now
    if (this.considerParry(now, targets, dt)) return

    // Getting caught outside the closing field is worse than any fight.
    const field = this.room.field
    if (field?.active && field.outside(me.x, me.y, 80)) {
      me.intent.set(field.cx - me.x, field.cy - me.y).normalize()
      if (me.canDash(now)) me.dash(me.intent, now)
      return
    }

    // A Moon Gate to cash out at, or a dropped bounty worth the detour.
    const wildsGoal = this.room.botGoal?.(me)
    if (wildsGoal && (me.wilds?.leaving ? dist > me.attackRange * 0.9 || me.hp / me.maxHp < 0.35 : dist > 180)) {
      me.intent.set(wildsGoal.x - me.x, wildsGoal.y - me.y)
      const far = me.intent.length()
      if (far <= wildsGoal.stop) me.intent.set(0, 0)
      else {
        me.intent.normalize()
        if (me.wilds?.leaving && far > 400 && dist < 320 && me.canDash(now)) me.dash(me.intent, now)
      }
      return
    }

    if (dist > 180) {
      const goal = this.boonGoal(now, targets, dist)
      if (goal) {
        me.intent.set(goal.x - me.x, goal.y - me.y)
        if (me.intent.length() <= goal.stop) me.intent.set(0, 0)
        else me.intent.normalize()
        return
      }
    }

    switch (this.state) {
      case 'wander':
        this.wander(now)
        if (dist < this.aggroRange) this.state = 'chase'
        break

      case 'chase': {
        if (!target || dist > this.aggroRange * 1.4) {
          this.state = 'wander'
          break
        }
        if (me.canSpecial(now) && dist < this.specialRange(me)) {
          this.room.useSpecial(me, { x: target.x, y: target.y })
          break
        }
        me.intent.set(target.x - me.x, target.y - me.y).normalize()
        if (dist > me.attackRange * 3 && me.canDash(now)) me.dash(me.intent, now)
        if (dist <= me.attackRange * 0.8) this.state = 'strike'
        break
      }

      case 'strike':
        me.intent.set(0, 0)
        // A wind-up is information, and a stand-in reads it like anyone else:
        // guard what is coming, then answer it. This is the whole point of the
        // reworked fight — the decision is made before the blow, not inside a
        // window nobody can hit.
        if (target?.winding && dist <= target.attackRange * 1.2 && now - this.sawWindup > this.noticeDelay) {
          this.state = 'guard'
          this.stateUntil = now + 900
          break
        }
        // They are open: either recovering from a swing, or their guard broke.
        if (target?.guardBroken || (target?.swinging && !target.winding)) {
          if (this.room.useBasic(me)) {
            this.state = 'backoff'
            this.stateUntil = now + this.backoffTime
          }
          break
        }
        // Swinging into a raised guard is how a fight is lost slowly.
        // The room's own randomness, not the global one: two rooms with the
        // same seed have to play out the same fight.
        if (target?.guarding && this.room.rng.chance(0.75)) {
          this.state = 'bait'
          this.stateUntil = now + 700
          break
        }
        if (this.room.useBasic(me)) {
          this.state = 'backoff'
          this.stateUntil = now + this.backoffTime
        } else if (dist > me.attackRange) {
          this.state = 'chase'
        }
        break

      // Hold a guard while the blow comes in, then take the opening it earns.
      case 'guard':
        me.intent.set(0, 0)
        me.hold(now)
        if (me.riposting && dist <= me.attackRange) {
          if (this.room.useBasic(me)) {
            this.state = 'backoff'
            this.stateUntil = now + this.backoffTime
          }
          break
        }
        if (now >= this.stateUntil || !target?.alive || me.winded) {
          this.state = dist <= me.attackRange ? 'strike' : 'chase'
        }
        break

      case 'bait':
        if (!target?.alive) { this.state = 'wander'; break }
        // Their parry whiffed: they are planted and open. Punish it.
        if (target.parryRecovering && dist <= me.attackRange) {
          me.intent.set(0, 0)
          if (this.room.useBasic(me)) {
            this.state = 'backoff'
            this.stateUntil = now + this.backoffTime
          }
          break
        }
        if (dist < me.attackRange * 0.9) me.intent.set(me.x - target.x, me.y - target.y).normalize().scale(0.5)
        else if (dist > me.attackRange) me.intent.set(target.x - me.x, target.y - me.y).normalize().scale(0.6)
        else me.intent.set(0, 0)
        if (now >= this.stateUntil) this.state = 'chase'
        break

      case 'backoff':
        if (target) me.intent.set(me.x - target.x, me.y - target.y).normalize().scale(0.6)
        if (now >= this.stateUntil) this.state = dist < this.aggroRange ? 'chase' : 'wander'
        break
    }

    this.slide(now)
  }

  /**
   * Walking into a block does not get you round it. If a bot is pushing hard
   * and going nowhere, it commits to sliding along the wall for a moment,
   * which is what a person does without thinking about it.
   */
  checkStuck(now) {
    const me = this.fighter
    const moved = Math.hypot(me.x - this.lastPos.x, me.y - this.lastPos.y)
    this.lastPos = { x: me.x, y: me.y }
    if (now < this.slideUntil) return
    const pushing = me.intent.lengthSq() > 0.25
    if (pushing && moved < 0.6 && !me.stunned && !me.frozen && !me.parryCommitted) {
      this.slideUntil = now + 500
      this.slideDir = -this.slideDir
    }
  }

  /** Turns the intent along the wall while a slide is running. */
  slide(now) {
    if (now >= this.slideUntil) return false
    const me = this.fighter
    if (me.intent.lengthSq() < 0.01) return false
    const a = Math.atan2(me.intent.y, me.intent.x) + this.slideDir * (Math.PI / 2)
    me.intent.set(Math.cos(a), Math.sin(a))
    return true
  }

  /**
   * A telegraphed special can be seen coming, so bots usually react. A basic
   * cannot, so they read the lunge instead and gamble on the rest.
   */
  considerParry(now, targets, dt) {
    const me = this.fighter
    if (!me.canParry(now)) return false

    let gamble = false
    for (const rival of targets) {
      if (rival === me || !rival.alive || rival.stunned) continue
      const d = distance(me.x, me.y, rival.x, rival.y)
      const toMe = Math.atan2(me.y - rival.y, me.x - rival.x)
      const aimedAtMe = Math.abs(wrapAngle(toMe - rival.aim)) < rival.attackArc / 2 + 0.25
      const kind = rival.kit?.special?.kind

      if (rival.casting && aimedAtMe && PARRYABLE_SPECIALS.has(kind) &&
          d < this.specialRange(rival) + 40 && !this.reactedTo.has(rival.castToken ?? rival)) {
        this.reactedTo.add(rival.castToken ?? rival)
        if (this.rng.chance(this.parryReactChance)) {
          const spec = rival.kit.special
          const travel = kind === 'charge' ? Math.max(0, d - 62) / spec.speed * 1000 : 0
          const elapsed = now - rival.lastSpecial
          const delay = Math.max(0, TELEGRAPH_MS + travel - elapsed - 50)
          this.room.after(delay, () => {
            if (!me.alive || !rival.alive) return
            this.raiseParry(rival, this.room.now)
          })
          return false
        }
      }

      if (!aimedAtMe) continue

      if (rival.brain) {
        // Read a rival bot's lunge: attack ready, closing to striking distance.
        const striking = rival.brain.state === 'chase' || rival.brain.state === 'strike'
        if (striking && rival.canAttack(now) && d <= rival.attackRange * 0.83 &&
            this.readSwing.get(rival) !== rival.lastAttack) {
          this.readSwing.set(rival, rival.lastAttack)
          if (this.rng.chance(this.parryReadChance)) return this.raiseParry(rival, now)
        }
      } else if (d <= rival.attackRange * 0.95 && rival.canAttack(now)) {
        gamble = true
      }
    }

    if (gamble && dt > 0 && this.rng.chance(1 - Math.exp(-this.parryReadRate * dt))) {
      return this.raiseParry(null, now)
    }
    return false
  }

  raiseParry(rival, now) {
    const me = this.fighter
    if (rival) me.aim = Math.atan2(rival.y - me.y, rival.x - me.x)
    this.parryFocus = rival
    return me.parry(now)
  }

  /** Somewhere worth going instead of fighting: a Moonwell, or a power-up. */
  boonGoal(now, targets, threat) {
    const me = this.fighter
    const travelMs = d => (d / Math.max(1, me.speed)) * 1000

    if (me.hp / me.maxHp < 0.65) {
      for (const w of this.room.wells) {
        if (w.dead || w.ending) continue
        const d = distance(me.x, me.y, w.x, w.y)
        if (d > 1100) continue
        if (now + travelMs(d) > w.activeUntil - 800) continue
        return { x: w.x, y: w.y, stop: w.radius * 0.45 }
      }
    }

    if (threat <= 230) return null
    let best = null
    let bestD = 560
    for (const o of this.room.orbs) {
      if (o.dead) continue
      if (o.type === 'moonrise' && me.charge > 0.6) continue
      const d = distance(me.x, me.y, o.x, o.y)
      if (d >= bestD) continue
      if (!o.live && o.liveAt - now > travelMs(d) + 300) continue
      const beaten = targets.some(t => t !== me && t.alive && distance(t.x, t.y, o.x, o.y) < d * 0.85)
      if (beaten) continue
      best = { x: o.x, y: o.y, stop: 0 }
      bestD = d
    }
    return best
  }

  specialRange(me) {
    const spec = me.kit?.special
    if (!spec) return me.attackRange
    return spec.projectileRange ?? spec.maxRange ?? spec.range ?? spec.radius ?? me.attackRange * 2.2
  }

  wander(now) {
    const me = this.fighter
    if (!this.wanderTarget || now >= this.stateUntil ||
        distance(me.x, me.y, this.wanderTarget.x, this.wanderTarget.y) < 30) {
      const b = this.room.arena.bounds
      const field = this.room.field
      const hot = this.room.hotspot
      if (hot && this.rng.chance(0.75)) {
        const a = this.rng.float(0, Math.PI * 2)
        const r = this.rng.float(0, hot.radius * 0.8)
        this.wanderTarget = { x: hot.x + Math.cos(a) * r, y: hot.y + Math.sin(a) * r }
      } else if (field?.active) {
        const a = this.rng.float(0, Math.PI * 2)
        const r = this.rng.float(0, field.radius * 0.7)
        this.wanderTarget = { x: field.cx + Math.cos(a) * r, y: field.cy + Math.sin(a) * r }
      } else {
        this.wanderTarget = { x: this.rng.float(b.left, b.right), y: this.rng.float(b.top, b.bottom) }
      }
      this.stateUntil = now + this.rng.int(2000, 4500)
    }
    me.intent.set(this.wanderTarget.x - me.x, this.wanderTarget.y - me.y).normalize().scale(0.55)
  }

  nearest(targets) {
    let best = null
    let bestDist = Infinity
    for (const t of targets) {
      if (t === this.fighter || !t.alive || t.shielded) continue
      const d = distance(this.fighter.x, this.fighter.y, t.x, t.y)
      // Foliage hides you unless they are almost on top of you.
      if (t.hidden && d > 150) continue
      if (d < bestDist) { bestDist = d; best = t }
    }
    return best
  }
}

export { CONNECT_MS, PARRY }
