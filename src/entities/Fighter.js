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
    this.speed = isPlayer ? 235 : 165
    this.attackRange = 96
    this.attackArc = Phaser.Math.DegToRad(100)
    this.attackCooldown = 520
    this.lastAttack = 0
    this.alive = true

    // Aim is independent of movement: you can back off while swinging forward.
    this.aim = 0

    this.dashSpeed = 780
    this.dashDuration = 190
    this.dashCooldown = 1800
    this.lastDash = -Infinity
    this.dashUntil = 0
    this.invulnerableUntil = 0

    this.sprite = new AxieSprite(scene, x, y, { axieClass, build })
    this.pos = new Phaser.Math.Vector2(x, y)
    this.vel = new Phaser.Math.Vector2(0, 0)
    this.intent = new Phaser.Math.Vector2(0, 0)

    this.dust = dustEmitter(scene, this.sprite.root)
    this.dust.setDepth(y - 1)
  }

  get x() { return this.pos.x }
  get y() { return this.pos.y }
  get dashing() { return this.scene.time.now < this.dashUntil }
  get invulnerable() { return this.scene.time.now < this.invulnerableUntil }

  update(delta) {
    if (!this.alive) return

    const step = delta / 1000

    if (this.dashing) {
      // A dash is committed movement — input does not steer it.
      this.pos.x += this.vel.x * step
      this.pos.y += this.vel.y * step
      this.clampToArena()
      this.sprite.setPosition(this.pos.x, this.pos.y)
      this.sprite.update(delta, this.vel.length())
      this.sprite.setAlpha(0.65)
      return
    }
    this.sprite.setAlpha(1)

    const wish = this.intent.clone()
    if (wish.lengthSq() > 1) wish.normalize()

    this.vel.lerp(wish.scale(this.speed), 0.22)
    if (this.vel.lengthSq() < 1) this.vel.set(0, 0)

    this.pos.x += this.vel.x * step
    this.pos.y += this.vel.y * step
    this.clampToArena()

    const speed = this.vel.length()
    // Facing follows the aim, not the movement, so strafing reads correctly.
    this.sprite.setFacing(Math.cos(this.aim) < 0 ? -1 : 1)
    this.sprite.setPosition(this.pos.x, this.pos.y)
    this.sprite.update(delta, speed)

    this.dust.emitting = speed > 90
    this.dust.setDepth(this.pos.y - 1)
  }

  clampToArena() {
    const b = this.scene.arenaBounds
    this.pos.x = Phaser.Math.Clamp(this.pos.x, b.left, b.right)
    this.pos.y = Phaser.Math.Clamp(this.pos.y, b.top, b.bottom)
  }

  canAttack(now) {
    return this.alive && !this.dashing && now - this.lastAttack >= this.attackCooldown
  }

  canDash(now) {
    return this.alive && !this.dashing && now - this.lastDash >= this.dashCooldown
  }

  /** Committed burst along `dir`, with brief invulnerability. */
  dash(dir, now) {
    if (!this.canDash(now)) return false

    const d = dir.lengthSq() > 0.01
      ? dir.clone().normalize()
      : new Phaser.Math.Vector2(Math.cos(this.aim), Math.sin(this.aim))

    this.lastDash = now
    this.dashUntil = now + this.dashDuration
    this.invulnerableUntil = now + this.dashDuration + 60
    this.vel.copy(d.scale(this.dashSpeed))
    this.sprite.dashTrail(d)
    return true
  }

  /** True when `target` sits inside the attack cone around `this.aim`. */
  inArc(target) {
    if (!target?.alive) return false
    const d = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y)
    if (d > this.attackRange) return false
    const toTarget = Math.atan2(target.y - this.y, target.x - this.x)
    return Math.abs(Phaser.Math.Angle.Wrap(toTarget - this.aim)) <= this.attackArc / 2
  }

  /**
   * Swings at the aim direction. Resolves on impact, not on the keypress, and
   * hits everything in the cone — so positioning matters more than target lock.
   */
  swing(candidates, now) {
    if (!this.canAttack(now)) return false
    this.lastAttack = now

    this.sprite.playAttack(() => {
      if (!this.alive) return
      let connected = false
      for (const other of candidates) {
        if (other === this || !other.alive || other.invulnerable) continue
        if (this.inArc(other)) { other.takeDamage(1, this); connected = true }
      }
      if (!connected) this.scene.swingMiss?.(this)
    })
    return true
  }

  inRange(target) {
    if (!target?.alive) return false
    return Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) <= this.attackRange
  }

  takeDamage(amount, from) {
    if (!this.alive || this.invulnerable) return
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
