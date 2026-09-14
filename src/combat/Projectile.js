import Phaser from 'phaser'
import { impact } from '../fx/Juice.js'

/**
 * A travelling shot. Seekers steer toward the nearest rival at a limited turn
 * rate, so they are dodgeable rather than guaranteed.
 */
export default class Projectile {
  constructor(scene, owner, { x, y, angle, speed, range, damage, color,
    seeking = false, turnRate = 0, stun = 0, radius = 9 }) {
    this.scene = scene
    this.owner = owner
    this.pos = new Phaser.Math.Vector2(x, y)
    this.angle = angle
    this.speed = speed
    this.range = range
    this.travelled = 0
    this.damage = damage
    this.seeking = seeking
    this.turnRate = turnRate
    this.stun = stun
    this.radius = radius
    this.dead = false

    this.core = scene.add.circle(x, y, radius, color).setDepth(y + 4)
    this.halo = scene.add.circle(x, y, radius * 2.1, color, 0.28)
      .setDepth(y + 3).setBlendMode(Phaser.BlendModes.ADD)
  }

  update(delta, targets) {
    if (this.dead) return

    const step = delta / 1000

    if (this.seeking) {
      const target = this.nearest(targets)
      if (target) {
        const want = Math.atan2(target.y - this.pos.y, target.x - this.pos.x)
        const diff = Phaser.Math.Angle.Wrap(want - this.angle)
        this.angle += Phaser.Math.Clamp(diff, -this.turnRate * step, this.turnRate * step)
      }
    }

    const dx = Math.cos(this.angle) * this.speed * step
    const dy = Math.sin(this.angle) * this.speed * step
    this.pos.x += dx
    this.pos.y += dy
    this.travelled += Math.hypot(dx, dy)

    this.core.setPosition(this.pos.x, this.pos.y).setDepth(this.pos.y + 4)
    this.halo.setPosition(this.pos.x, this.pos.y).setDepth(this.pos.y + 3)

    for (const t of targets) {
      if (t === this.owner || !t.alive || t.invulnerable) continue
      if (Phaser.Math.Distance.Between(this.pos.x, this.pos.y, t.x, t.y) <= this.radius + 26) {
        t.takeDamage(this.damage, this.owner, 150, { projectile: true })
        if (this.stun) t.applyStun(this.stun)
        return this.destroy(true)
      }
    }

    if (this.scene.arena?.wallAt(this.pos.x, this.pos.y)) return this.destroy(true)

    const b = this.scene.arenaBounds
    const out = this.pos.x < b.left || this.pos.x > b.right || this.pos.y < b.top || this.pos.y > b.bottom
    if (this.travelled >= this.range || out) this.destroy(false)
  }

  nearest(targets) {
    let best = null
    let bestDist = Infinity
    for (const t of targets) {
      if (t === this.owner || !t.alive) continue
      const d = Phaser.Math.Distance.Between(this.pos.x, this.pos.y, t.x, t.y)
      if (d < bestDist) { bestDist = d; best = t }
    }
    return best
  }

  destroy(hit) {
    if (this.dead) return
    this.dead = true
    if (hit) impact(this.scene, this.pos.x, this.pos.y, this.core.fillColor, 0.7)
    this.core.destroy()
    this.halo.destroy()
  }
}
