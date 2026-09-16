import { CLASS_KITS, CHARGE_PER_SECOND, PARRY } from '../axie/classKits.js'
import { Vec2, clamp, distance, wrapAngle, degToRad } from './math.js'

/**
 * One Axie, as the simulation sees it: position, health, timers and the rules
 * for acting. Nothing here knows about sprites, sounds or the screen — it
 * reports what happened through `room.event(...)`, and the client turns those
 * into animation and noise.
 *
 * Ported from src/entities/Fighter.js with the numbers unchanged, so the feel
 * the balance simulation measured is the feel the server serves.
 */
export default class SimFighter {
  constructor(room, { id, axieClass = 'beast', isPlayer = false, name = 'axie', x = 0, y = 0 }) {
    this.room = room
    this.id = id
    this.axieClass = axieClass
    this.isPlayer = isPlayer
    this.name = name

    const kit = CLASS_KITS[axieClass]
    this.kit = kit
    this.maxHp = kit?.hp ?? 3000
    this.hp = this.maxHp
    // Bots move at a fraction of their class speed so they stay readable.
    this.baseSpeed = (kit?.speed ?? 220) * (isPlayer ? 1 : 0.72)

    this.attackRange = kit?.basic?.range ?? 96
    this.attackArc = degToRad(kit?.basic?.arc ?? 100)
    this.attackCooldown = kit?.basic?.cooldown ?? 520
    this.lastAttack = 0
    this.lastSpecial = -Infinity

    this.charge = 0
    this.alive = true
    this.bodyRadius = 30

    this.slowUntil = 0
    this.slowFactor = 1
    this.stunUntil = 0
    this.stunImmuneUntil = 0
    this.frozenUntil = 0

    this.lastParry = -Infinity
    this.parryUntil = 0
    this.parryRecoverUntil = 0
    this.parrySucceeded = false

    this.poisonTicks = 0
    this.poisonNext = 0
    this.poisonSpec = null
    this.poisonFrom = null

    this.aim = 0
    this.facingAim = 0
    this.facingLockUntil = 0

    this.dashSpeed = 780
    this.dashDuration = 190
    this.baseDashCooldown = 1800
    this.lastDash = -Infinity
    this.dashUntil = 0
    this.invulnerableUntil = 0

    this.pos = new Vec2(x, y)
    this.vel = new Vec2(0, 0)
    this.intent = new Vec2(0, 0)

    this.buffs = {}
    this.shieldHp = 0
    this.lastHurtAt = -Infinity
    this.lastHitBy = null
    this.spawnShieldUntil = 0

    this.chargeState = null
    this.casting = false
    this.castToken = null
    this.channel = null
    this.immortal = false
    // Filled in by a Wilds room: bounty, kills, when they arrived.
    this.wilds = null
  }

  get now() { return this.room.now }
  get x() { return this.pos.x }
  get y() { return this.pos.y }
  get dashing() { return this.now < this.dashUntil }
  get invulnerable() { return this.now < this.invulnerableUntil }
  get stunned() { return this.now < this.stunUntil }
  get frozen() { return this.now < this.frozenUntil }
  get specialReady() { return this.charge >= 1 }
  get shielded() { return this.spawnShieldUntil > this.now }
  get hidden() { return this.room.arena.inBush(this.pos.x, this.pos.y) }
  get parrying() { return this.parryUntil > 0 && this.now <= this.parryUntil + PARRY.graceMs }

  get parryRecovering() {
    const now = this.now
    return now >= this.parryUntil && now < this.parryRecoverUntil
  }

  get parryCommitted() { return this.parrying || this.parryRecovering }

  get speed() {
    const slowed = this.now < this.slowUntil ? this.slowFactor : 1
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

  buff(type) {
    const b = this.buffs[type]
    return b && this.now < b.until ? b.def : null
  }

  // --- Acting -------------------------------------------------------------

  canAttack(now = this.now) {
    return this.alive && !this.shielded && !this.dashing && !this.stunned && !this.chargeState &&
      !this.casting && !this.parryCommitted && now - this.lastAttack >= this.attackCooldown
  }

  canSpecial(now = this.now) {
    return this.alive && !this.shielded && this.specialReady && !this.dashing && !this.stunned &&
      !this.chargeState && !this.casting && !this.parryCommitted
  }

  canDash(now = this.now) {
    return this.alive && !this.dashing && !this.parryCommitted && now - this.lastDash >= this.dashCooldown
  }

  canParry(now = this.now) {
    return this.alive && !this.dashing && !this.stunned && !this.chargeState && !this.casting &&
      now - this.lastParry >= PARRY.cooldownMs
  }

  lockFacing(aim, ms) {
    this.facingAim = aim
    this.facingLockUntil = this.now + ms
  }

  dash(dir, now = this.now) {
    if (!this.canDash(now)) return false
    const d = dir && dir.lengthSq() > 0.01
      ? dir.clone().normalize()
      : new Vec2(Math.cos(this.aim), Math.sin(this.aim))

    this.lastDash = now
    this.dashUntil = now + this.dashDuration
    this.invulnerableUntil = now + this.dashDuration + 60
    this.vel.copy(d.scale(this.dashSpeed))
    this.room.event({ t: 'dash', id: this.id, dir: { x: d.x, y: d.y } })
    return true
  }

  /** Raise a parry: a short window, then a recovery if nothing lands. */
  parry(now = this.now) {
    if (!this.canParry(now)) return false
    this.lastParry = now
    this.parryUntil = now + PARRY.windowMs
    this.parryRecoverUntil = now + PARRY.windowMs + PARRY.recoveryMs
    this.parrySucceeded = false
    this.room.event({ t: 'parry-raise', id: this.id })
    this.room.after(PARRY.windowMs, () => {
      if (!this.alive || this.parrySucceeded) return
      this.room.event({ t: 'parry-whiff', id: this.id })
    })
    return true
  }

  /**
   * Called by an attack about to land. True means the blow was parried: it
   * deals nothing and the attacker is staggered.
   */
  tryParry(attacker) {
    if (!this.alive || !attacker || attacker === this || !this.parrying) return false
    const toAttacker = Math.atan2(attacker.y - this.y, attacker.x - this.x)
    if (Math.abs(wrapAngle(toAttacker - this.aim)) > degToRad(PARRY.arcDeg) / 2) return false

    this.parrySucceeded = true
    this.parryUntil = 0
    this.parryRecoverUntil = 0
    this.addCharge(PARRY.chargeReward)
    this.freeze(PARRY.freezeMs)
    attacker.freeze(PARRY.freezeMs)
    attacker.stagger(PARRY.staggerMs)
    attacker.chargeState = null
    this.room.event({ t: 'parry', id: this.id, by: attacker.id })
    return true
  }

  stagger(ms) {
    const now = this.now
    this.stunUntil = Math.max(this.stunUntil, now + ms)
    this.casting = false
    this.intent.set(0, 0)
    this.vel.set(0, 0)
    this.room.event({ t: 'stagger', id: this.id, ms })
  }

  freeze(ms) {
    this.frozenUntil = Math.max(this.frozenUntil, this.now + ms)
  }

  addCharge(amount) {
    const wasReady = this.charge >= 1
    this.charge = Math.min(1, this.charge + amount)
    if (!wasReady && this.charge >= 1) this.room.event({ t: 'charged', id: this.id })
  }

  // --- Being hit ----------------------------------------------------------

  applyPowerUp(type, def) {
    if (def.instant) {
      if (type === 'moonrise') this.addCharge(1)
      return
    }
    this.buffs[type] = { def, until: this.now + def.durationMs, durationMs: def.durationMs }
    if (def.shieldFrac) this.shieldHp = Math.round(this.maxHp * def.shieldFrac)
  }

  heal(amount) {
    if (!this.alive) return 0
    const before = this.hp
    this.hp = Math.min(this.maxHp, this.hp + amount)
    return this.hp - before
  }

  absorb(amount) {
    if (this.shieldHp <= 0 || !this.buff('bulwark')) return amount
    const soaked = Math.min(this.shieldHp, amount)
    this.shieldHp -= soaked
    if (this.shieldHp <= 0) this.buffs.bulwark = null
    return amount - soaked
  }

  applySlow({ factor, duration }) {
    this.slowFactor = factor
    this.slowUntil = Math.max(this.slowUntil, this.now + duration)
    this.room.event({ t: 'slow', id: this.id })
  }

  applyStun(duration) {
    const now = this.now
    if (now < this.stunImmuneUntil) return
    this.stunUntil = Math.max(this.stunUntil, now + duration)
    this.stunImmuneUntil = this.stunUntil + 1500
    this.intent.set(0, 0)
    this.room.event({ t: 'stun', id: this.id, ms: duration })
  }

  applyPoison(spec, from) {
    if (this.poisonTicks <= 0) {
      this.poisonNext = this.now + spec.interval
      this.room.event({ t: 'poison', id: this.id })
    }
    this.poisonSpec = spec
    this.poisonFrom = from
    this.poisonTicks = spec.ticks
  }

  tickPoison() {
    if (this.poisonTicks <= 0) return
    const now = this.now
    if (now < this.poisonNext) return

    this.poisonTicks--
    this.poisonNext = now + this.poisonSpec.interval
    const dealt = this.absorb(this.poisonSpec.damage)
    this.hp -= dealt
    this.room.event({ t: 'tick', id: this.id, amount: dealt, kind: 'poison' })
    if (this.hp <= 0) this.fall(this.poisonFrom)
  }

  takeDamage(amount, from, knockback = 210, { projectile = false } = {}) {
    if (!this.alive || this.invulnerable) return
    amount = Math.round(amount * (from?.damageMult ?? 1))
    if (from && from !== this) {
      this.lastHurtAt = this.now
      this.lastHitBy = from
    }
    const dealt = this.absorb(amount)
    this.hp -= dealt

    this.room.event({
      t: 'hit', id: this.id, by: from?.id ?? null, amount: dealt, blocked: amount - dealt, projectile,
      x: this.pos.x, y: this.pos.y,
    })
    const stop = clamp(35 + amount / 9, 35, 115) * (projectile ? 0.5 : 1)
    this.freeze(stop)
    from?.freeze?.(stop)

    if (from && knockback) {
      const away = new Vec2(this.x - from.x, this.y - from.y).normalize().scale(knockback)
      this.vel.add(away)
    }
    if (this.hp <= 0) this.fall(from)
  }

  fall(from) {
    if (this.immortal) {
      this.hp = 1
      return
    }
    this.die(from)
  }

  die(from) {
    if (!this.alive) return
    this.alive = false
    this.room.event({ t: 'die', id: this.id, by: from?.id ?? null, x: this.pos.x, y: this.pos.y })
    this.room.onFighterDown?.(this, from)
  }

  /** Left the field alive — an extraction, a forfeit, or a lost connection. */
  vanish() {
    if (!this.alive) return
    // Whatever is still carried stays in the room rather than disappearing
    // with the fighter: leaving by any route must not destroy value.
    this.room.onVanish?.(this)
    this.alive = false
    this.room.event({ t: 'vanish', id: this.id, x: this.pos.x, y: this.pos.y })
  }

  // --- Frame --------------------------------------------------------------

  update(dt) {
    if (!this.alive) return
    const step = dt / 1000
    this.addCharge(CHARGE_PER_SECOND * step)
    this.tickPoison()
    if (!this.alive) return

    if (this.spawnShieldUntil && this.now >= this.spawnShieldUntil) this.spawnShieldUntil = 0
    if (this.frozen) return

    if (this.stunned) {
      this.vel.scale(0.85)
      this.move(step)
      return
    }

    if (this.chargeState) {
      this.updateCharge(step)
      return
    }

    if (this.dashing) {
      // A dash is committed movement — input does not steer it.
      this.move(step)
      return
    }

    const wish = this.intent.clone()
    if (wish.lengthSq() > 1) wish.normalize()
    this.vel.lerpTo(wish.scale(this.speed), 0.22)
    if (this.vel.lengthSq() < 1) this.vel.set(0, 0)
    this.move(step)
  }

  move(step) {
    this.pos.x += this.vel.x * step
    this.pos.y += this.vel.y * step
    this.room.arena.clampToBounds(this.pos)
    this.room.arena.resolveCircle(this.pos, this.bodyRadius)
  }

  /** Beast's Impale: a longer, damaging dash that cannot be steered. */
  beginCharge(dir, speed, duration, onHit, targets) {
    this.chargeState = {
      dir: dir.clone().normalize(),
      until: this.now + duration,
      onHit,
      targets,
    }
    this.vel.copy(this.chargeState.dir.clone().scale(speed))
    this.room.event({ t: 'charge-start', id: this.id })
  }

  updateCharge(step) {
    this.move(step)
    for (const t of this.chargeState.targets) {
      if (t === this || !t.alive) continue
      if (distance(this.x, this.y, t.x, t.y) <= 62) this.chargeState.onHit(t)
      if (!this.chargeState) return   // parried mid-charge
    }
    if (this.now >= this.chargeState.until) {
      this.chargeState = null
      this.vel.scale(0.3)
      this.room.event({ t: 'charge-end', id: this.id })
    }
  }

  /** What the client needs to draw this fighter. */
  snapshot() {
    return {
      id: this.id,
      cls: this.axieClass,
      name: this.name,
      x: Math.round(this.pos.x * 10) / 10,
      y: Math.round(this.pos.y * 10) / 10,
      aim: Math.round(this.aim * 100) / 100,
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      charge: Math.round(this.charge * 100) / 100,
      alive: this.alive,
      speed: Math.round(this.vel.length()),
      flags: (this.dashing ? 1 : 0) | (this.stunned ? 2 : 0) | (this.parrying ? 4 : 0) |
        (this.parryRecovering ? 8 : 0) | (this.casting ? 16 : 0) | (this.shielded ? 32 : 0) |
        (this.chargeState ? 64 : 0) | (this.hidden ? 128 : 0),
      shield: Math.round(this.shieldHp),
      buffs: Object.entries(this.buffs)
        .filter(([, b]) => b && this.now < b.until)
        .map(([type, b]) => ({ type, left: Math.round(b.until - this.now) })),
      bounty: this.wilds ? Math.round(this.wilds.bounty * 1000) / 1000 : null,
      channel: this.channel ? Math.round((this.channel.progress ?? 0) * 100) / 100 : null,
      bot: !this.isPlayer,
    }
  }
}
