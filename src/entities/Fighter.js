import Phaser from 'phaser'
import AxieSprite from '../axie/AxieSprite.js'

/**
 * One Axie in the arena. The player and the bots are the same thing; only the
 * source of `intent` differs, so anything that works for one works for both.
 */
export default class Fighter {
  constructor(scene, x, y, { tint, isPlayer = false, name = 'axie' } = {}) {
    this.scene = scene
    this.isPlayer = isPlayer
    this.name = name

    this.maxHp = 5
    this.hp = this.maxHp
    this.speed = isPlayer ? 210 : 150
    this.attackRange = 46
    this.attackCooldown = 700
    this.lastAttack = 0
    this.alive = true

    this.sprite = new AxieSprite(scene, x, y, { tint })
    this.pos = new Phaser.Math.Vector2(x, y)
    this.vel = new Phaser.Math.Vector2(0, 0)

    // Movement the controller wants this frame, as a unit-ish vector.
    this.intent = new Phaser.Math.Vector2(0, 0)
  }

  get x() { return this.pos.x }
  get y() { return this.pos.y }

  update(delta) {
    if (!this.alive) return

    const step = delta / 1000
    const wish = this.intent.clone()
    if (wish.lengthSq() > 1) wish.normalize()

    // Light acceleration so movement has weight without feeling floaty.
    this.vel.lerp(wish.scale(this.speed), 0.25)
    if (this.vel.lengthSq() < 1) this.vel.set(0, 0)

    this.pos.x += this.vel.x * step
    this.pos.y += this.vel.y * step

    const b = this.scene.arenaBounds
    this.pos.x = Phaser.Math.Clamp(this.pos.x, b.left, b.right)
    this.pos.y = Phaser.Math.Clamp(this.pos.y, b.top, b.bottom)

    if (Math.abs(this.vel.x) > 5) this.sprite.setFacing(this.vel.x)
    this.sprite.setPosition(this.pos.x, this.pos.y)
    this.sprite.update(delta, this.vel.length())
  }

  canAttack(now) {
    return this.alive && now - this.lastAttack >= this.attackCooldown
  }

  attack(target, now) {
    if (!this.canAttack(now) || !target?.alive) return false
    if (Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) > this.attackRange) return false

    this.lastAttack = now
    this.sprite.flash(0xffffff, 80)
    target.takeDamage(1, this)
    return true
  }

  takeDamage(amount, from) {
    if (!this.alive) return
    this.hp -= amount
    this.sprite.flash(0xff5c72, 140)

    // Knockback reads as impact without needing a hit animation.
    if (from) {
      const away = new Phaser.Math.Vector2(this.x - from.x, this.y - from.y).normalize().scale(160)
      this.vel.add(away)
    }

    if (this.hp <= 0) this.die()
  }

  die() {
    this.alive = false
    this.scene.tweens.add({
      targets: this.sprite.root,
      alpha: 0,
      scale: 0.6,
      duration: 260,
      onComplete: () => this.sprite.destroy(),
    })
  }
}
