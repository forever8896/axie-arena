import Phaser from 'phaser'
import AxieSprite from '../axie/AxieSprite.js'
import { CLASS_COLORS } from '../axie/palette.js'
import { impact, damageNumber, hitStop, dustEmitter } from '../fx/Juice.js'

/**
 * One Axie in the arena. The player and the bots are the same thing; only the
 * source of `intent` differs, so anything that works for one works for both.
 */
export default class Fighter {
  constructor(scene, x, y, { axieClass = 'beast', build, isPlayer = false, name = 'axie' } = {}) {
    this.scene = scene
    this.isPlayer = isPlayer
    this.name = name
    this.axieClass = axieClass
    this.colors = CLASS_COLORS[axieClass] ?? CLASS_COLORS.beast

    this.maxHp = 5
    this.hp = this.maxHp
    this.speed = isPlayer ? 215 : 155
    this.attackRange = 54
    this.attackCooldown = 620
    this.lastAttack = 0
    this.alive = true

    this.sprite = new AxieSprite(scene, x, y, { axieClass, build })
    this.pos = new Phaser.Math.Vector2(x, y)
    this.vel = new Phaser.Math.Vector2(0, 0)
    this.intent = new Phaser.Math.Vector2(0, 0)

    this.dust = dustEmitter(scene, this.sprite.root)
    this.dust.setDepth(y - 1)
  }

  get x() { return this.pos.x }
  get y() { return this.pos.y }

  update(delta) {
    if (!this.alive) return

    const step = delta / 1000
    const wish = this.intent.clone()
    if (wish.lengthSq() > 1) wish.normalize()

    this.vel.lerp(wish.scale(this.speed), 0.22)
    if (this.vel.lengthSq() < 1) this.vel.set(0, 0)

    this.pos.x += this.vel.x * step
    this.pos.y += this.vel.y * step

    const b = this.scene.arenaBounds
    this.pos.x = Phaser.Math.Clamp(this.pos.x, b.left, b.right)
    this.pos.y = Phaser.Math.Clamp(this.pos.y, b.top, b.bottom)

    const speed = this.vel.length()
    if (Math.abs(this.vel.x) > 6) this.sprite.setFacing(this.vel.x)
    this.sprite.setPosition(this.pos.x, this.pos.y)
    this.sprite.update(delta, speed)

    this.dust.emitting = speed > 90
    this.dust.setDepth(this.pos.y - 1)
  }

  canAttack(now) {
    return this.alive && now - this.lastAttack >= this.attackCooldown
  }

  /** Swings regardless; connects only if the target is still in range on impact. */
  swing(target, now) {
    if (!this.canAttack(now)) return false
    this.lastAttack = now

    this.sprite.playAttack(() => {
      if (!this.alive || !target?.alive) return
      const d = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y)
      if (d <= this.attackRange * 1.25) target.takeDamage(1, this)
    })
    return true
  }

  inRange(target) {
    if (!target?.alive) return false
    return Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) <= this.attackRange
  }

  takeDamage(amount, from) {
    if (!this.alive) return
    this.hp -= amount

    this.sprite.flash(0xffffff, 90)
    impact(this.scene, this.x, this.y - 8, from?.colors.rim ?? 0xffffff, this.isPlayer ? 1.3 : 1)
    damageNumber(this.scene, this.x, this.y, `-${amount}`, this.isPlayer ? '#ff8098' : '#ffe08a')
    hitStop(this.scene, 70)

    if (from) {
      const away = new Phaser.Math.Vector2(this.x - from.x, this.y - from.y).normalize().scale(210)
      this.vel.add(away)
    }

    if (this.hp <= 0) this.die(from)
  }

  die(from) {
    this.alive = false
    this.dust.emitting = false
    impact(this.scene, this.x, this.y - 8, this.colors.body, 1.8)
    hitStop(this.scene, 110)

    this.scene.tweens.add({
      targets: this.sprite.root,
      alpha: 0,
      scaleX: 1.4,
      scaleY: 0.5,
      duration: 320,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.sprite.destroy()
        this.dust.destroy()
      },
    })

    this.scene.onFighterDown?.(this, from)
  }
}
