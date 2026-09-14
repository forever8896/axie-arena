import Phaser from 'phaser'

/** A patch of ground that damages anyone standing in it, on a tick. */
export default class Zone {
  constructor(scene, owner, { x, y, radius, duration, tickDamage, tickRate, color }) {
    this.scene = scene
    this.owner = owner
    this.x = x
    this.y = y
    this.radius = radius
    this.tickDamage = tickDamage
    this.tickRate = tickRate
    this.expiresAt = scene.time.now + duration
    this.nextTick = scene.time.now + 200
    this.dead = false

    this.fill = scene.add.circle(x, y, radius, color, 0.16).setDepth(-18)
    this.ring = scene.add.circle(x, y, radius, color, 0)
      .setStrokeStyle(2, color, 0.55).setDepth(-17)

    scene.tweens.add({
      targets: this.ring, scaleX: 1.05, scaleY: 1.05,
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
    this.fill.setScale(0)
    scene.tweens.add({ targets: this.fill, scaleX: 1, scaleY: 1, duration: 220, ease: 'Back.easeOut' })
  }

  update(_delta, targets) {
    if (this.dead) return
    const now = this.scene.time.now

    if (now >= this.nextTick) {
      this.nextTick = now + this.tickRate
      for (const t of targets) {
        if (t === this.owner || !t.alive || t.invulnerable) continue
        if (Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y) <= this.radius) {
          t.takeDamage(this.tickDamage, this.owner, 0, { projectile: true })
        }
      }
    }

    if (now >= this.expiresAt) this.destroy()
  }

  destroy() {
    if (this.dead) return
    this.dead = true
    this.scene.tweens.add({
      targets: [this.fill, this.ring], alpha: 0, duration: 280,
      onComplete: () => { this.fill.destroy(); this.ring.destroy() },
    })
  }
}
