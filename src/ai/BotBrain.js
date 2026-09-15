import Phaser from 'phaser'
import { PARRY, TELEGRAPH_MS } from '../axie/classKits.js'

/** Specials a parry can stop. Projectiles and lobbed zones cannot be parried. */
const PARRYABLE_SPECIALS = new Set(['charge', 'radial'])

/**
 * Deliberately simple: wander until something is close, close the gap, swing,
 * back off to reset. Four states is enough to keep the arena alive, and every
 * state maps onto an Axie animation we can play once real art is in.
 */
export default class BotBrain {
  // 320 was too short for a 2400u field: bots rarely found each other before
  // the closing field did the work.
  constructor(fighter, { aggroRange = 480, backoffTime = 900, parryReadChance = 0.45, parryReadRate = 0.35, parryReactChance = 0.7 } = {}) {
    this.fighter = fighter
    this.aggroRange = aggroRange
    this.backoffTime = backoffTime
    // A basic lands faster than anyone reacts, so a parry against one is a
    // prediction. Against another bot, the tell is a rival planted in its
    // strike stance whose attack is about to come off cooldown: the bot reads
    // that moment once per swing, and commits with this chance.
    this.parryReadChance = parryReadChance
    // Against the player there is no stance to read, only proximity, so the
    // bot gambles at this low rate per second while the player could hit it.
    this.parryReadRate = parryReadRate
    this.readSwing = new WeakMap()
    // How long a raised parry must be up before this bot notices it. Human-like
    // and different per bot. Noticing instantly made every parry get baited:
    // bots landed 3% of 1,308 attempts, and a player could barely parry at all.
    this.noticeDelay = Phaser.Math.Between(110, 190)
    // A telegraphed special can be seen coming; this is the reaction chance.
    this.parryReactChance = parryReactChance
    this.lastThink = 0
    this.reactedTo = new WeakSet()

    this.state = 'wander'
    this.stateUntil = 0
    this.wanderTarget = null
  }

  update(now, targets) {
    const me = this.fighter
    if (!me.alive) return

    const target = this.nearest(targets)
    const dist = target ? Phaser.Math.Distance.Between(me.x, me.y, target.x, target.y) : Infinity

    // While parrying, keep facing the threat being parried. Re-aiming at the
    // nearest target turned the parry arc away mid-window: 48 of 108 bot
    // parries were then struck from outside it.
    const focus = me.parryCommitted && this.parryFocus?.alive ? this.parryFocus : target
    if (focus) me.aim = Math.atan2(focus.y - me.y, focus.x - me.x)

    const dt = this.lastThink ? Math.min(0.25, (now - this.lastThink) / 1000) : 0
    this.lastThink = now
    if (this.considerParry(now, targets, dt)) return

    // Getting caught outside the closing field is worse than any fight.
    const field = me.scene.field
    if (field?.active && field.outside(me.x, me.y, 80)) {
      me.intent.set(field.cx - me.x, field.cy - me.y).normalize()
      if (me.canDash(now)) me.dash(me.intent, now)
      return
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
        // Specials have their own preferred range; use one the moment it fits.
        if (me.canSpecial(now) && dist < this.specialRange(me)) {
          me.special(targets, now, { x: target.x, y: target.y })
          break
        }
        me.intent.set(target.x - me.x, target.y - me.y).normalize()
        // Close a big gap with a dash rather than jogging the whole way.
        if (dist > me.attackRange * 3 && me.canDash(now)) me.dash(me.intent, now)
        if (dist <= me.attackRange * 0.8) this.state = 'strike'
        break
      }

      case 'strike':
        me.intent.set(0, 0)
        // Don't swing into a parry you have had time to see; step off and wait
        // for the opening. A parry raised just before the swing goes unseen.
        if (target?.parrying && now - target.lastParry >= this.noticeDelay) {
          this.state = 'bait'
          this.stateUntil = target.parryRecoverUntil
          break
        }
        if (me.swing(targets, now)) {
          this.state = 'backoff'
          this.stateUntil = now + this.backoffTime
        } else if (dist > me.attackRange) {
          this.state = 'chase'
        }
        break

      case 'bait':
        if (!target?.alive) { this.state = 'wander'; break }
        // Their parry whiffed: they are planted and open. Punish it.
        if (target.parryRecovering && dist <= me.attackRange) {
          me.intent.set(0, 0)
          if (me.swing(targets, now)) {
            this.state = 'backoff'
            this.stateUntil = now + this.backoffTime
          }
          break
        }
        // Hover just outside their reach until the window closes.
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
  }

  /**
   * Decide whether to raise a parry this frame. Returns true if it did.
   *
   * Against a telegraphed special there is time to react, so bots usually do.
   * Against a basic there is not, so they gamble at a steady rate while a rival
   * that could hit them is lined up — which is exactly what baiting exploits.
   */
  considerParry(now, targets, dt) {
    const me = this.fighter
    if (!me.canParry(now)) return false

    let gamble = false
    for (const rival of targets) {
      if (rival === me || !rival.alive || rival.stunned) continue
      const d = Phaser.Math.Distance.Between(me.x, me.y, rival.x, rival.y)
      const toMe = Math.atan2(me.y - rival.y, me.x - rival.x)
      const aimedAtMe = Math.abs(Phaser.Math.Angle.Wrap(toMe - rival.aim)) < rival.attackArc / 2 + 0.25
      const kind = rival.kit?.special?.kind

      // A parryable special winding up at us. Its blow lands when the telegraph
      // ends (and, for a charge, once it has crossed the gap), so raise the
      // parry just before then. Raised at cast start, it expired first.
      if (rival.casting && aimedAtMe && PARRYABLE_SPECIALS.has(kind) &&
          d < this.specialRange(rival) + 40 && !this.reactedTo.has(rival.castToken ?? rival)) {
        this.reactedTo.add(rival.castToken ?? rival)
        if (Math.random() < this.parryReactChance) {
          const spec = rival.kit.special
          const travel = kind === 'charge' ? Math.max(0, d - 62) / spec.speed * 1000 : 0
          const elapsed = now - rival.lastSpecial
          const delay = Math.max(0, TELEGRAPH_MS + travel - elapsed - 50)
          me.scene.time.delayedCall(delay, () => {
            if (!me.alive || !rival.alive) return
            this.raiseParry(rival, me.scene.time.now)
          })
          return false
        }
      }

      if (!aimedAtMe) continue

      if (rival.brain) {
        // Read a rival bot's lunge: attack ready, closing to the distance at
        // which it strikes. It swings within a frame or two, and its 165ms
        // blow then lands inside the 200ms window. Once per swing.
        const striking = rival.brain.state === 'chase' || rival.brain.state === 'strike'
        if (striking && rival.canAttack(now) && d <= rival.attackRange * 0.83 &&
            this.readSwing.get(rival) !== rival.lastAttack) {
          this.readSwing.set(rival, rival.lastAttack)
          if (Math.random() < this.parryReadChance) return this.raiseParry(rival, now)
        }
      } else if (d <= rival.attackRange * 0.95 && rival.canAttack(now)) {
        gamble = true
      }
    }

    if (gamble && dt > 0 && Math.random() < 1 - Math.exp(-this.parryReadRate * dt)) {
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

  /** How close a bot wants to be before spending its special. */
  specialRange(me) {
    const spec = me.kit?.special
    if (!spec) return me.attackRange
    return spec.projectileRange ?? spec.maxRange ?? spec.range ?? spec.radius ?? me.attackRange * 2.2
  }

  wander(now) {
    const me = this.fighter
    if (!this.wanderTarget || now >= this.stateUntil ||
        Phaser.Math.Distance.Between(me.x, me.y, this.wanderTarget.x, this.wanderTarget.y) < 30) {
      const b = me.scene.arenaBounds
      const field = me.scene.field
      if (field?.active) {
        // Wander inside the safe field, never toward the edge of it.
        const a = Math.random() * Math.PI * 2
        const r = Math.random() * field.radius * 0.7
        this.wanderTarget = { x: field.cx + Math.cos(a) * r, y: field.cy + Math.sin(a) * r }
      } else {
        this.wanderTarget = {
          x: Phaser.Math.Between(b.left, b.right),
          y: Phaser.Math.Between(b.top, b.bottom),
        }
      }
      this.stateUntil = now + Phaser.Math.Between(2000, 4500)
    }
    me.intent.set(this.wanderTarget.x - me.x, this.wanderTarget.y - me.y).normalize().scale(0.55)
  }

  nearest(targets) {
    let best = null
    let bestDist = Infinity
    for (const t of targets) {
      if (t === this.fighter || !t.alive) continue
      const d = Phaser.Math.Distance.Between(this.fighter.x, this.fighter.y, t.x, t.y)
      // Foliage hides you unless you are almost on top of them.
      if (t.hidden && d > 150) continue
      if (d < bestDist) { bestDist = d; best = t }
    }
    return best
  }
}
