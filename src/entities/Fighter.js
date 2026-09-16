import Phaser from 'phaser'
import AxieSprite from '../axie/AxieSprite.js'
import { CLASS_COLORS } from '../axie/palette.js'
import { CLASS_KITS, CHARGE_PER_SECOND, PARRY } from '../axie/classKits.js'
import { impact, damageNumber, hitStopFor, dustEmitter } from '../fx/Juice.js'
import { useBasic, useSpecial } from '../combat/abilities.js'
import { play, playVaried } from '../fx/Sfx.js'
import { playStatusPlate } from '../fx/SkillVfx.js'
import { drawFighterStatus, HUD_DEPTH } from '../fx/FighterHud.js'

/** Health, icons and name plates sit above the foliage and the blocks. */
export { HUD_DEPTH }

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

    // Parry: a short active window, then a vulnerable recovery if nothing hit.
    this.lastParry = -Infinity
    this.parryUntil = 0
    this.parryRecoverUntil = 0
    this.poisonTicks = 0
    this.poisonNext = 0
    this.poisonSpec = null
    this.poisonFrom = null

    // Aim is independent of movement: you can back off while swinging forward.
    this.aim = 0
    // A swing holds the facing it started with until the blow lands.
    this.facingAim = 0
    this.facingLockUntil = 0

    this.dashSpeed = 780
    this.dashDuration = 190
    this.baseDashCooldown = 1800
    this.lastDash = -Infinity
    this.dashUntil = 0
    this.invulnerableUntil = 0

    this.sprite = new AxieSprite(scene, x, y, { axieClass, build })
    this.pos = new Phaser.Math.Vector2(x, y)
    this.vel = new Phaser.Math.Vector2(0, 0)
    this.intent = new Phaser.Math.Vector2(0, 0)

    this.dust = dustEmitter(scene, this.sprite.root)
    this.dust.setDepth(y - 1)

    this.statusFx = scene.add.graphics().setDepth(9000)
    this.parryFx = scene.add.graphics()

    // Power-ups (arena/PowerUps.js): type -> { def, until }. The shield is a
    // separate pool that soaks damage before health does.
    this.buffs = {}
    this.shieldHp = 0
    // Icons above the Axie: dash, parry, special and any power-up held.
    this.hudIcons = {}
    // Last time a rival hurt us. Moonwells stop healing for a moment after.
    this.lastHurtAt = -Infinity
    // The rival who hit us last: in the Wilds, a fall to poison or a zone
    // still pays whoever caused it.
    this.lastHitBy = null
    // Endless Wilds: freshly arrived, cannot hurt or be hurt.
    this.spawnShieldUntil = 0
  }

  get x() { return this.pos.x }
  get y() { return this.pos.y }
  get dashing() { return this.scene.time.now < this.dashUntil }
  get invulnerable() { return this.scene.time.now < this.invulnerableUntil }
  get stunned() { return this.scene.time.now < this.stunUntil }
  get parrying() { return this.parryUntil > 0 && this.scene.time.now <= this.parryUntil + PARRY.graceMs }
  get parryRecovering() {
    const now = this.scene.time.now
    return now >= this.parryUntil && now < this.parryRecoverUntil
  }
  /** Mid-parry or recovering from one: committed, and unable to act. */
  get parryCommitted() { return this.parrying || this.parryRecovering }

  get speed() {
    const slowed = this.scene.time.now < this.slowUntil ? this.slowFactor : 1
    const planted = this.parryCommitted ? PARRY.moveFactor : 1
    const wind = this.buff('tailwind')?.speedMult ?? 1
    return this.baseSpeed * slowed * planted * wind * (this.casting ? 0.35 : 1)
  }

  get dashCooldown() {
    return this.baseDashCooldown * (this.buff('tailwind')?.dashCooldownMult ?? 1)
  }

  get damageMult() {
    return this.buff('fury')?.damageMult ?? 1
  }

  /** The definition of an active timed power-up, or null. */
  buff(type) {
    const b = this.buffs[type]
    return b && this.scene.time.now < b.until ? b.def : null
  }

  applyPowerUp(type, def) {
    if (def.instant) {
      if (type === 'moonrise') this.addCharge(1)
      return
    }
    this.buffs[type] = { def, until: this.scene.time.now + def.durationMs, durationMs: def.durationMs }
    if (def.shieldFrac) this.shieldHp = Math.round(this.maxHp * def.shieldFrac)
  }

  heal(amount) {
    if (!this.alive) return 0
    const before = this.hp
    this.hp = Math.min(this.maxHp, this.hp + amount)
    return this.hp - before
  }

  /** Damage left over after the Bulwark shield soaks what it can. */
  absorb(amount) {
    if (this.shieldHp <= 0 || !this.buff('bulwark')) return amount
    const soaked = Math.min(this.shieldHp, amount)
    this.shieldHp -= soaked
    if (this.shieldHp <= 0) {
      this.buffs.bulwark = null
      this.sprite.flash(0x7ce8ff, 140)
    }
    return amount - soaked
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
    this.drawStatus()
    this.drawParry()

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
    const faceAim = this.scene.time.now < this.facingLockUntil ? this.facingAim : this.aim
    this.sprite.setFacing(Math.cos(faceAim) < 0 ? -1 : 1)
    this.sprite.setAlpha(this.hidden ? 0.45 : 1)
    this.sprite.setPosition(this.pos.x, this.pos.y)
    this.sprite.update(delta, speed)

    this.dust.emitting = speed > 90
    this.dust.setDepth(this.pos.y - 1)
  }

  drawParry() {
    const g = this.parryFx
    g.clear()
    if (!this.alive || !this.parryCommitted) return

    const r = this.bodyRadius + 22
    const half = Phaser.Math.DegToRad(PARRY.arcDeg) / 2
    const cy = this.pos.y - 14
    g.setDepth(this.pos.y + 5)

    if (this.parrying) {
      // Bright and unmistakable: rivals need to see it to decide not to swing.
      const t = 1 - (this.parryUntil - this.scene.time.now) / PARRY.windowMs
      g.lineStyle(9, 0x1d2b12, 0.35)
      g.beginPath(); g.arc(this.pos.x, cy, r, this.aim - half, this.aim + half); g.strokePath()
      g.lineStyle(6, 0xffffff, 0.95 - t * 0.3)
      g.beginPath(); g.arc(this.pos.x, cy, r, this.aim - half, this.aim + half); g.strokePath()
      g.lineStyle(3, this.colors.rim, 1)
      g.beginPath(); g.arc(this.pos.x, cy, r + 6, this.aim - half, this.aim + half); g.strokePath()
    } else {
      // Recovering: a dim, broken arc — the opening.
      g.lineStyle(3, 0x9aa88a, 0.45)
      for (let i = 0; i < 6; i++) {
        const a0 = this.aim - half + (i / 6) * half * 2
        g.beginPath(); g.arc(this.pos.x, cy, r, a0, a0 + half / 8); g.strokePath()
      }
    }
  }

  /**
   * Everything you need mid-fight, above your own Axie: health, the shield,
   * and a row of icons for dash, parry, special and any power-up, each filling
   * as it comes back.
   *
   * The drawing lives in fx/FighterHud.js, which takes a description rather
   * than a Fighter, so a fighter the server owns is drawn by the same code.
   */
  drawStatus() {
    const now = this.scene.time.now
    drawFighterStatus(this.scene, this.statusFx, this.hudIcons, {
      x: this.pos.x,
      y: this.pos.y,
      isPlayer: this.isPlayer,
      alive: this.alive,
      hp: this.hp,
      maxHp: this.maxHp,
      shield: this.buff('bulwark') ? this.shieldHp : 0,
      charge: this.charge,
      specialReady: this.specialReady,
      colors: this.colors,
      dash: {
        ready: this.canDash(now),
        fill: Phaser.Math.Clamp((now - this.lastDash) / this.dashCooldown, 0, 1),
      },
      parry: {
        ready: now - this.lastParry >= PARRY.cooldownMs,
        fill: Phaser.Math.Clamp((now - this.lastParry) / PARRY.cooldownMs, 0, 1),
      },
      buffs: ['fury', 'bulwark', 'tailwind'].flatMap(type => {
        const def = this.buff(type)
        if (!def) return []
        const b = this.buffs[type]
        return [{ icon: def.icon, color: def.color, fill: (b.until - now) / b.durationMs }]
      }),
    }, now)
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

  lockFacing(aim, ms) {
    this.facingAim = aim
    this.facingLockUntil = this.scene.time.now + ms
  }

  /** Arrived in the Wilds moments ago: protected, and not yet allowed to strike. */
  get shielded() {
    return this.spawnShieldUntil > this.scene.time.now
  }

  canAttack(now) {
    return this.alive && !this.shielded && !this.dashing && !this.stunned && !this.chargeState && !this.casting &&
      !this.parryCommitted && now - this.lastAttack >= this.attackCooldown
  }

  canSpecial() {
    return this.alive && !this.shielded && this.specialReady && !this.dashing && !this.stunned && !this.chargeState && !this.casting &&
      !this.parryCommitted
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
      // Parried mid-charge: tryParry cleared the charge and staggered us.
      if (!this.chargeState) return
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
    // Poison does not interrupt Moonwell healing. It did, and one bite shut a
    // rival out of a well for three seconds: bug won 22.5% of 240 wells-only
    // matches against a fair 16.7%.
    this.hp -= this.absorb(this.poisonSpec.damage)
    damageNumber(this.scene, this.x, this.y - 12, String(this.poisonSpec.damage), '#9ff0bb', this.poisonSpec.damage)
    this.sprite.flash(0x9a5ad4, 90)
    if (this.hp <= 0) this.fall(this.poisonFrom)
  }

  canDash(now) {
    return this.alive && !this.dashing && !this.parryCommitted && now - this.lastDash >= this.dashCooldown
  }

  canParry(now) {
    return this.alive && !this.dashing && !this.stunned && !this.chargeState && !this.casting &&
      now - this.lastParry >= PARRY.cooldownMs
  }

  /** Raise a parry. Commits for the window, and for a recovery if nothing lands. */
  parry(now) {
    if (!this.canParry(now)) return false
    this.lastParry = now
    this.parryUntil = now + PARRY.windowMs
    this.parryRecoverUntil = now + PARRY.windowMs + PARRY.recoveryMs
    this.parrySucceeded = false

    // The braced opening of hit-with-shield, stretched across the window.
    this.sprite.play('defense/hit-with-shield', { kind: 'parry', peakAt: PARRY.windowMs, peakFraction: 0.4 })

    this.scene.time.delayedCall(PARRY.windowMs, () => {
      if (!this.alive || this.parrySucceeded) return
      // Whiffed: visibly off-balance, which is exactly what a baiting rival
      // is waiting to punish.
      this.sprite.playState('stun', { fit: PARRY.recoveryMs, holdMs: PARRY.recoveryMs, kind: 'parry' })
    })
    return true
  }

  /**
   * Called by an attack about to land on this fighter. True means the blow was
   * parried: it must deal nothing, and the attacker is staggered.
   */
  tryParry(attacker) {
    if (!this.alive || !attacker || attacker === this || !this.parrying) return false

    // Only blows from the front half: you cannot parry what you are not facing.
    const toAttacker = Math.atan2(attacker.y - this.y, attacker.x - this.x)
    if (Math.abs(Phaser.Math.Angle.Wrap(toAttacker - this.aim)) > Phaser.Math.DegToRad(PARRY.arcDeg) / 2) {
      return false
    }

    this.parrySucceeded = true
    this.parryUntil = 0
    this.parryRecoverUntil = 0   // a clean parry leaves you free to punish
    this.addCharge(PARRY.chargeReward)
    this.scene.onParry?.(this, attacker)

    attacker.stagger(PARRY.staggerMs)
    // A charging beast is stopped dead.
    attacker.chargeState = null
    return true
  }

  /** Knocked off balance by a parry: like a stun, but grants no stun immunity. */
  stagger(ms) {
    const now = this.scene.time.now
    this.stunUntil = Math.max(this.stunUntil, now + ms)
    this.casting = false
    this.intent.set(0, 0)
    this.vel.set(0, 0)
    this.sprite.playState('stun', { loop: true, holdMs: ms, kind: 'stagger' })
    playStatusPlate(this.scene, this, 'stunned', { durationMs: ms, size: 1.2 })
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
    amount = Math.round(amount * (from?.damageMult ?? 1))
    if (from && from !== this) {
      this.lastHurtAt = this.scene.time.now
      this.lastHitBy = from
    }
    const dealt = this.absorb(amount)
    if (dealt < amount) {
      damageNumber(this.scene, this.x + 18, this.y - 30, String(amount - dealt), '#7ce8ff', (amount - dealt) * 0.6)
    }
    this.hp -= dealt

    this.sprite.flash(0xffffff, 90)
    this.sprite.playState('hit')
    if (from?.kit?.hitSfx) playVaried(this.scene, from.kit.hitSfx, 0.45)
    const power = Phaser.Math.Clamp(amount / 400, 0.6, 1.8)
    impact(this.scene, this.x, this.y - 8, from?.colors.rim ?? 0xffffff, power)
    if (dealt > 0) {
      damageNumber(this.scene, this.x, this.y, String(Math.round(dealt)), this.isPlayer ? '#ff8098' : '#ffe08a', dealt)
    }
    hitStopFor([this, from], amount, projectile)

    if (from && knockback) {
      const away = new Phaser.Math.Vector2(this.x - from.x, this.y - from.y).normalize().scale(knockback)
      this.vel.add(away)
    }

    if (this.hp <= 0) this.fall(from)
  }

  /** Health reached zero. In the tutorial you cannot actually go down. */
  fall(from) {
    if (this.immortal) {
      this.hp = 1
      return
    }
    this.die(from)
  }

  clearOverlays() {
    this.statusFx.destroy()
    this.parryFx.destroy()
    Object.values(this.hudIcons).forEach(i => i.destroy())
    this.hudIcons = {}
    this.buffs = {}
    this.nameplate?.destroy()
    this.nameplate = null
  }

  /**
   * Leaves the arena alive — a Moon Gate extraction, or walking away. Not a
   * death: no kill, no onFighterDown.
   */
  vanish() {
    if (!this.alive) return
    this.alive = false
    this.dust.emitting = false
    this.clearOverlays()
    this.scene.tweens.add({
      targets: this.sprite.root, alpha: 0, scaleX: 0.6, scaleY: 1.5, y: this.pos.y - 60,
      duration: 520, ease: 'Cubic.easeIn',
      onComplete: () => { this.sprite.destroy(); this.dust.destroy() },
    })
  }

  die(from) {
    this.alive = false
    this.dust.emitting = false
    impact(this.scene, this.x, this.y - 8, this.colors.body, 1.8)
    this.clearOverlays()

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
