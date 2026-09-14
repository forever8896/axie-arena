import Phaser from 'phaser'

/**
 * Deliberately simple: wander until something is close, close the gap, swing,
 * back off to reset. Four states is enough to keep the arena alive, and every
 * state maps onto an Axie animation we can play once real art is in.
 */
export default class BotBrain {
  // 320 was too short for a 2400u field: bots rarely found each other before
  // the closing field did the work.
  constructor(fighter, { aggroRange = 480, backoffTime = 900 } = {}) {
    this.fighter = fighter
    this.aggroRange = aggroRange
    this.backoffTime = backoffTime

    this.state = 'wander'
    this.stateUntil = 0
    this.wanderTarget = null
  }

  update(now, targets) {
    const me = this.fighter
    if (!me.alive) return

    const target = this.nearest(targets)
    const dist = target ? Phaser.Math.Distance.Between(me.x, me.y, target.x, target.y) : Infinity

    if (target) me.aim = Math.atan2(target.y - me.y, target.x - me.x)

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
        if (me.swing(targets, now)) {
          this.state = 'backoff'
          this.stateUntil = now + this.backoffTime
        } else if (dist > me.attackRange) {
          this.state = 'chase'
        }
        break

      case 'backoff':
        if (target) me.intent.set(me.x - target.x, me.y - target.y).normalize().scale(0.6)
        if (now >= this.stateUntil) this.state = dist < this.aggroRange ? 'chase' : 'wander'
        break
    }
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
