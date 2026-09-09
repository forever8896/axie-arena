import Phaser from 'phaser'

/**
 * Deliberately simple: wander until something is close, close the gap, swing,
 * back off to reset. Four states is enough to keep the arena alive, and every
 * state maps onto an Axie animation we can play once real art is in.
 */
export default class BotBrain {
  constructor(fighter, { aggroRange = 320, backoffTime = 900 } = {}) {
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

    switch (this.state) {
      case 'wander':
        this.wander(now)
        if (dist < this.aggroRange) this.state = 'chase'
        break

      case 'chase':
        if (!target || dist > this.aggroRange * 1.4) {
          this.state = 'wander'
          break
        }
        me.intent.set(target.x - me.x, target.y - me.y).normalize()
        if (dist <= me.attackRange) this.state = 'strike'
        break

      case 'strike':
        me.intent.set(0, 0)
        if (me.swing(target, now)) {
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

  wander(now) {
    const me = this.fighter
    if (!this.wanderTarget || now >= this.stateUntil ||
        Phaser.Math.Distance.Between(me.x, me.y, this.wanderTarget.x, this.wanderTarget.y) < 30) {
      const b = me.scene.arenaBounds
      this.wanderTarget = {
        x: Phaser.Math.Between(b.left, b.right),
        y: Phaser.Math.Between(b.top, b.bottom),
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
      if (d < bestDist) { bestDist = d; best = t }
    }
    return best
  }
}
