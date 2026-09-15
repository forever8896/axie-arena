import Phaser from 'phaser'
import AxieSprite from '../axie/AxieSprite.js'
import { CLASS_COLORS } from '../axie/palette.js'
import { CLASS_KITS, CHARGE_PER_SECOND } from '../axie/classKits.js'
import { impact, damageNumber, hitStopFor, dustEmitter } from '../fx/Juice.js'
import { useBasic, useSpecial } from '../combat/abilities.js'
import { play, playVaried } from '../fx/Sfx.js'
import { playStatusPlate } from '../fx/SkillVfx.js'

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

    const kit = CLASS_KITS[axieClass]
    this.kit = kit
    this.maxHp = kit?.hp ?? 5
    this.hp = this.maxHp
    // Bots move at a fraction of their class speed so they stay readable.
    this.baseSpeed = (kit?.speed ?? 220) * (isPlayer ? 1 : 0.72)

    // Reach and timing come from the kit, so the reticle always shows the truth.
    this.attackRange = kit?.basic?.range ?? 96
    this.attackArc = Phaser.Math.DegToRad(kit?.basic?.arc ?? 100)
    this.attackCooldown = kit?.basic?.cooldown ?? 520
    this.lastAttack = 0
    this.lastSpecial = -Infinity

    // Specials charge from landing hits plus a slow trickle (docs/DESIGN.md).
    this.charge = 0
    this.alive = true
    this.bodyRadius = 30

    // Status effects.
    this.slowUntil = 0
    this.slowFactor = 1
    this.stunUntil = 0
    // After a stun ends, further stuns are ignored for a while: a stun is a
    // punish, not a lockdown.
    this.stunImmuneUntil = 0

    // Hit-stop is per fighter. Freezing the whole arena in a six-way
    // free-for-all is exactly what Sakurai warns against.
    this.frozenUntil = 0
    this.poisonTicks = 0
    this.poisonNext = 0
    this.poisonSpec = null
    this.poisonFrom = null

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

    this.healthBar = scene.add.graphics().setDepth(9000)
  }

  get x() { return this.pos.x }
  get y() { return this.pos.y }
  get dashing() { return this.scene.time.now < this.dashUntil }
  get invulnerable() { return this.scene.time.now < this.invulnerableUntil }
  get stunned() { return this.scene.time.now < this.stunUntil }
  get speed() {
    const slowed = this.scene.time.now < this.slowUntil ? this.slowFactor : 1
    return this.baseSpeed * slowed * (this.casting ? 0.35 : 1)
  }

  get frozen() { return this.scene.time.now < this.frozenUntil }
  get specialReady() { return this.charge >= 1 }

  addCharge(amount) {
    const wasReady = this.charge >= 1
    this.charge = Math.min(1, this.charge + amount)
    if (!wasReady && this.charge >= 1) {
      this.sprite?.playState('ready')
      if (this.sprite) playStatusPlate(this.scene, this, 'power_gain', { size: 1.6 })
    }
  }

  /** Local hit-stop: only the fighters involved stop. */
  freeze(ms) {
    this.frozenUntil = Math.max(this.frozenUntil, this.scene.time.now + ms)
  }

  update(delta) {
    if (!this.alive) return

    const step = delta / 1000
    this.addCharge(CHARGE_PER_SECOND * step)
    this.tickPoison()
    this.drawHealthBar()

    if (this.frozen) {
      this.sprite.setPosition(this.pos.x, this.pos.y)
      return
    }

    if (this.stunned) {
      this.vel.scale(0.85)
      this.pos.x += this.vel.x * step
      this.pos.y += this.vel.y * step
      this.clampToArena()
      this.sprite.setPosition(this.pos.x, this.pos.y)
      this.sprite.update(delta, 0)
      return
    }

    if (this.chargeState) {
      this.updateCharge(step)
      this.sprite.update(delta, this.vel.length())
      return
    }

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
    this.sprite.setAlpha(this.hidden ? 0.45 : 1)
    this.sprite.setPosition(this.pos.x, this.pos.y)
    this.sprite.update(delta, speed)

    this.dust.emitting = speed > 90
    this.dust.setDepth(this.pos.y - 1)
  }

  drawHealthBar() {
    const g = this.healthBar
    g.clear()
    if (!this.alive) return

    const w = 56
    const h = 7
    const x = this.pos.x - w / 2
    const y = this.pos.y - 78
    const frac = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1)

    g.fillStyle(0x16200f, 0.7).fillRoundedRect(x - 2, y - 2, w + 4, h + 4, 4)
    const color = this.isPlayer ? 0x7ce85a : (frac > 0.35 ? 0xffd964 : 0xff6b6b)
    g.fillStyle(color, 1).fillRoundedRect(x, y, Math.max(2, w * frac), h, 3)

    // A thin charge line under your own bar, so the special is readable in the fight.
    if (this.isPlayer) {
      g.fillStyle(0x16200f, 0.6).fillRect(x, y + h + 3, w, 3)
      g.fillStyle(this.specialReady ? 0xffffff : this.colors.body, 1)
      g.fillRect(x, y + h + 3, w * this.charge, 3)
    }
    g.setDepth(this.pos.y + 60)
  }

  clampToArena() {
    const b = this.scene.arenaBounds
    this.pos.x = Phaser.Math.Clamp(this.pos.x, b.left, b.right)
    this.pos.y = Phaser.Math.Clamp(this.pos.y, b.top, b.bottom)
    this.scene.arena?.resolveCircle(this.pos, this.bodyRadius)
  }

  /** True while standing in foliage: harder to see, harder for bots to spot. */
  get hidden() {
    return Boolean(this.scene.arena?.inBush(this.pos.x, this.pos.y))
  }

  canAttack(now) {
    return this.alive && !this.dashing && !this.stunned && !this.chargeState && !this.casting &&
      now - this.lastAttack >= this.attackCooldown
  }

  canSpecial() {
    return this.alive && this.specialReady && !this.dashing && !this.stunned && !this.chargeState && !this.casting
  }

  /** Beast's Impale: a longer, damaging dash that cannot be steered. */
  beginCharge(dir, speed, duration, onHit, targets) {
    this.chargeState = {
      dir: dir.clone().normalize(),
      until: this.scene.time.now + duration,
      onHit,
      targets,
    }
    this.vel.copy(this.chargeState.dir.clone().scale(speed))
    // Deliberately not invulnerable. Offensive movement should be answerable;
    // Stunlock rejected i-frames on Raigon's engage for the same reason.
    this.sprite.dashTrail(this.chargeState.dir)
    this.sprite.play('action/run', { kind: 'special', fit: duration, loop: true, holdMs: duration })
  }

  updateCharge(step) {
    this.pos.x += this.vel.x * step
    this.pos.y += this.vel.y * step
    this.clampToArena()
    this.sprite.setPosition(this.pos.x, this.pos.y)

    for (const t of this.chargeState.targets) {
      if (t === this || !t.alive) continue
      if (Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y) <= 62) this.chargeState.onHit(t)
    }

    if (this.scene.time.now >= this.chargeState.until) {
      this.chargeState = null
      this.sprite.play(this.kit?.special?.anim, { kind: 'special', peakAt: 140 })
      this.vel.scale(0.3)
    }
  }

  applySlow({ factor, duration }) {
    playStatusPlate(this.scene, this, 'debuff_apply', { size: 1.4 })
    this.slowFactor = factor
    this.slowUntil = Math.max(this.slowUntil, this.scene.time.now + duration)
    this.sprite.flash(0x7ce8ff, 120)
  }

  applyStun(duration) {
    const now = this.scene.time.now
    if (now < this.stunImmuneUntil) return
    play(this.scene, 'stunned', { volume: 0.5 })
    this.stunUntil = Math.max(this.stunUntil, now + duration)
    this.stunImmuneUntil = this.stunUntil + 1500
    this.sprite.playState('stun', { loop: true, holdMs: this.stunUntil - now })
    playStatusPlate(this.scene, this, 'stunned', { durationMs: this.stunUntil - now, size: 1.3 })
    this.intent.set(0, 0)
  }

  applyPoison(spec, from) {
    play(this.scene, 'poison', { volume: 0.45 })
    // Only on a fresh poisoning: a bite every half second would stack plates.
    if (this.poisonTicks <= 0) playStatusPlate(this.scene, this, 'poison_apply', { size: 1.4 })
    // Reapplying refreshes the remaining ticks but must not push back a tick
    // that is already scheduled. It used to: bug bites every 540ms and poison
    // ticks every 900ms, so every bite reset the timer and poison dealt no
    // damage at all while bug was actually fighting. Found through the
    // balance simulation, where bug stayed last despite two poison buffs.
    if (this.poisonTicks <= 0) this.poisonNext = this.scene.time.now + spec.interval
    this.poisonSpec = spec
    this.poisonFrom = from
    this.poisonTicks = spec.ticks
  }

  tickPoison() {
    if (this.poisonTicks <= 0) return
    const now = this.scene.time.now
    if (now < this.poisonNext) return

    this.poisonTicks--
    this.poisonNext = now + this.poisonSpec.interval
    this.hp -= this.poisonSpec.damage
    damageNumber(this.scene, this.x, this.y - 12, String(this.poisonSpec.damage), '#9ff0bb', this.poisonSpec.damage)
    this.sprite.flash(0x9a5ad4, 90)
    if (this.hp <= 0) this.die(this.poisonFrom)
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
    this.sprite.playState('dash', { fit: this.dashDuration + 120 })
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

  /** Both abilities live in combat/abilities.js, keyed by the kit. */
  swing(candidates, now) {
    return useBasic(this, candidates, now)
  }

  special(candidates, now, aimPoint) {
    return useSpecial(this, candidates, now, aimPoint)
  }

  inRange(target) {
    if (!target?.alive) return false
    return Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) <= this.attackRange
  }

  /**
   * `projectile` halves hit-stop, per Sakurai: ranged hits get less freeze than
   * blows landed up close.
   */
  takeDamage(amount, from, knockback = 210, { projectile = false } = {}) {
    if (!this.alive || this.invulnerable) return
    this.hp -= amount

    this.sprite.flash(0xffffff, 90)
    this.sprite.playState('hit')
    if (from?.kit?.hitSfx) playVaried(this.scene, from.kit.hitSfx, 0.45)
    const power = Phaser.Math.Clamp(amount / 400, 0.6, 1.8)
    impact(this.scene, this.x, this.y - 8, from?.colors.rim ?? 0xffffff, power)
    damageNumber(this.scene, this.x, this.y, String(Math.round(amount)), this.isPlayer ? '#ff8098' : '#ffe08a', amount)
    hitStopFor([this, from], amount, projectile)

    if (from && knockback) {
      const away = new Phaser.Math.Vector2(this.x - from.x, this.y - from.y).normalize().scale(knockback)
      this.vel.add(away)
    }

    if (this.hp <= 0) this.die(from)
  }

  die(from) {
    this.alive = false
    this.dust.emitting = false
    impact(this.scene, this.x, this.y - 8, this.colors.body, 1.8)
    this.healthBar.destroy()

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
