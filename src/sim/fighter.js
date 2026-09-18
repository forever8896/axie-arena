import { CLASS_KITS, CHARGE_PER_SECOND, PARRY } from '../axie/classKits.js'
import { Vec2, clamp, distance, wrapAngle, degToRad } from './math.js'
import { FLAGS } from './constants.js'
import { SWING, GUARD, STAMINA, PACE, LANCE, phasesFor } from '../axie/combatConfig.js'

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
    /** The Moonshot's own meter, filling at half the special's rate. */
    this.moon = 0
    /** While aiming one: when it began, and when it goes off by itself. */
    this.aimingSince = 0
    this.aimingUntil = 0
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

    // The reworked fight: a swing in phases, a guard you hold, and one bar
    // behind everything you can spend. See docs/COMBAT.md.
    this.swing = null            // { startedAt, releaseAt, endsAt, aim, spec, riposte }
    this.guardUntil = 0          // held: refreshed every tick the button is down
    this.guardReadyAt = 0        // a guard takes a moment to come up
    this.riposteUntil = 0        // earned by blocking: a real opening to answer
    this.guardBrokenUntil = 0
    this.stamina = STAMINA.max
    this.spentAt = -Infinity

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
  get moonReady() { return this.moon >= 1 }
  get aiming() { return this.now < this.aimingUntil }
  get shielded() { return this.spawnShieldUntil > this.now }
  get hidden() { return this.room.arena.inBush(this.pos.x, this.pos.y) }
  get parrying() { return this.parryUntil > 0 && this.now <= this.parryUntil + PARRY.graceMs }

  get parryRecovering() {
    const now = this.now
    return now >= this.parryUntil && now < this.parryRecoverUntil
  }

  get parryCommitted() { return this.parrying || this.parryRecovering }

  /** Holding a guard, and it has finished coming up. */
  get guarding() {
    return this.now < this.guardUntil && this.now >= this.guardReadyAt && !this.guardBroken
  }

  get guardBroken() { return this.now < this.guardBrokenUntil }

  /** Mid-swing: winding up, striking, or open afterwards. */
  get swinging() { return Boolean(this.swing) }

  get winding() { return Boolean(this.swing) && this.now < this.swing.releaseAt }

  /** Earned by blocking a blow: a window to answer it. */
  get riposting() { return this.now < this.riposteUntil }

  /** Everything that costs stamina goes through here. */
  spend(amount) {
    this.stamina = Math.max(0, this.stamina - amount)
    this.spentAt = this.now
  }

  get winded() { return this.stamina < STAMINA.floor }

  get speed() {
    const slowed = this.now < this.slowUntil ? this.slowFactor : 1
    const planted = this.aiming ? LANCE.moveFactor
      : this.parryCommitted ? PARRY.moveFactor
        : this.winding ? SWING.moveFactor
          : this.guarding ? GUARD.moveFactor : 1
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
      !this.casting && !this.swinging && !this.guardBroken && !this.winded &&
      this.freeOfGuard(now) &&
      now - this.lastAttack >= this.attackCooldown
  }

  /**
   * Whether a guard is out of the way of a swing.
   *
   * Holding a guard used to cost nothing to leave: you could swing straight out
   * of it, which meant there was never a reason to lower it and the stance was
   * strictly free. Leaving it now takes a beat — unless you blocked something,
   * because answering from behind a guard you just used is the entire reward
   * for holding one.
   */
  freeOfGuard(now = this.now) {
    if (this.riposting) return true
    return now >= this.guardUntil + GUARD.lowerMs
  }

  canGuard(now = this.now) {
    return this.alive && !this.dashing && !this.stunned && !this.chargeState &&
      !this.casting && !this.swinging && !this.guardBroken && this.stamina > 0
  }

  canSpecial(now = this.now) {
    return this.alive && !this.shielded && this.specialReady && !this.dashing && !this.stunned &&
      !this.chargeState && !this.casting && !this.parryCommitted
  }

  canDash(now = this.now) {
    return this.alive && !this.dashing && !this.guardBroken && !this.winded &&
      now - this.lastDash >= this.dashCooldown
  }

  canMoon(now = this.now) {
    return this.alive && !this.shielded && this.moonReady && !this.dashing && !this.stunned &&
      !this.chargeState && !this.casting && !this.swinging && !this.parryCommitted &&
      !this.guardBroken
  }

  /**
   * Begin aiming a Moonshot. Held, not pressed: the meter is not spent until it
   * actually goes off, so being interrupted mid-aim costs the opening rather
   * than the shot.
   */
  beginAim(now = this.now) {
    if (this.aiming || !this.canMoon(now)) return false
    this.aimingSince = now
    this.aimingUntil = now + LANCE.maxAimMs
    this.room.event({ t: 'aim-start', id: this.id, ms: LANCE.maxAimMs })
    return true
  }

  /** Let go. Too early and it is called off; otherwise it fires. */
  releaseAim(now = this.now) {
    if (!this.aiming) return false
    const held = now - this.aimingSince
    this.aimingUntil = 0
    if (held < LANCE.minAimMs) {
      this.room.event({ t: 'aim-cancel', id: this.id })
      return false
    }
    return true
  }

  /** Knocked out of it: the aim is lost, the meter is not. */
  cancelAim() {
    if (!this.aiming) return
    this.aimingUntil = 0
    this.room.event({ t: 'aim-cancel', id: this.id })
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

  /**
   * Begin a swing. It winds up where everyone can see it, lands, and leaves you
   * open — and after the commit point you cannot call it off.
   *
   * The old attack was a cone resolved 165ms after the button, which over a
   * network meant the blow landed before its victim had been shown the swing.
   */
  beginSwing(spec, targets, now = this.now) {
    if (!this.canAttack(now)) return false
    const riposte = this.riposting
    const phases = phasesFor(this.kit)
    const windup = phases.windupMs * (riposte ? GUARD.riposteWindup : 1)

    this.lastAttack = now
    this.spend(phases.stamina)
    this.guardUntil = 0            // you cannot swing from behind your own guard
    if (riposte) this.riposteUntil = 0
    this.swing = {
      spec,
      targets,
      aim: this.aim,
      riposte,
      startedAt: now,
      commitAt: now + Math.min(SWING.commitMs, windup),
      releaseAt: now + windup,
      contactAt: now + windup,
      endsAt: now + windup + phases.releaseMs + phases.recoveryMs,
      struck: false,
    }
    this.lockFacing(this.aim, windup + SWING.releaseMs)
    this.room.event({
      t: 'windup', id: this.id, aim: this.aim, ms: Math.round(windup),
      range: spec.range, arc: spec.arc, riposte,
    })
    return true
  }

  /** Called every tick: carries a swing through its phases. */
  updateSwing() {
    const s = this.swing
    if (!s) return
    // Being stunned, broken or knocked out of it cancels the whole thing.
    if (!this.alive || this.stunned || this.guardBroken || this.chargeState) {
      this.swing = null
      this.room.event({ t: 'swing-cancel', id: this.id })
      return
    }
    if (!s.struck && this.now >= s.contactAt) {
      s.struck = true
      // The aim is the one the swing started with: what was drawn is what lands.
      this.room.event({ t: 'swing', id: this.id, aim: s.aim, index: 0, riposte: s.riposte })
      this.room.strike(this, s)
    }
    if (this.now >= s.endsAt) this.swing = null
  }

  /**
   * Hold a guard. Called every tick the button is down, so it is a state the
   * player maintains rather than a moment they have to hit.
   */
  hold(now = this.now) {
    if (!this.canGuard(now)) return false
    if (this.guardUntil <= now) {
      // Coming up fresh: it costs something and takes a moment, so it cannot be
      // thrown up after seeing the blow.
      this.spend(GUARD.raiseCost)
      this.guardReadyAt = now + GUARD.raiseMs
      this.room.event({ t: 'guard-up', id: this.id })
    }
    // Refreshed each tick; it drops the moment the button does.
    this.guardUntil = now + 90
    return true
  }

  /** A blow arrived while guarding. Returns what got through. */
  block(attacker, amount) {
    const toAttacker = Math.atan2(attacker.y - this.y, attacker.x - this.x)
    const covered = Math.abs(wrapAngle(toAttacker - this.aim)) <= degToRad(GUARD.arcDeg) / 2
    if (!covered) return amount

    // Guarding is not immunity: it costs stamina in proportion to the blow, and
    // a big enough hit on a tired guard breaks it.
    this.spend(amount / 28)
    this.riposteUntil = this.now + GUARD.riposteMs
    this.room.event({ t: 'block', id: this.id, by: attacker.id, x: this.x, y: this.y })
    if (this.stamina <= 0) this.breakGuard()
    return Math.round(amount * GUARD.damageTaken)
  }

  breakGuard() {
    this.guardUntil = 0
    this.riposteUntil = 0
    this.guardBrokenUntil = this.now + GUARD.breakStunMs
    this.room.event({ t: 'guard-break', id: this.id })
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
    this.addMoon(amount * LANCE.chargeFactor)
  }

  /** The Moonshot's meter. Half the rate, so about half as often. */
  addMoon(amount) {
    if (!this.kit?.ultimate) return
    const wasReady = this.moon >= 1
    this.moon = Math.min(1, this.moon + amount)
    if (!wasReady && this.moon >= 1) this.room.event({ t: 'moon-ready', id: this.id })
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
    // Nobody keeps a Moonshot pointed through a stun — but a stun shrugged off
    // by immunity is not a stun, and must not cost the aim either.
    this.cancelAim()
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
    // Paced like every other source of damage. It used to go straight to health
    // and so would have been the one thing the rework did not slow down, making
    // poison quietly stronger than everything it was balanced against.
    const dealt = this.absorb(Math.round(this.poisonSpec.damage * PACE.damage))
    this.hp -= dealt
    this.room.event({ t: 'tick', id: this.id, amount: dealt, kind: 'poison' })
    if (this.hp <= 0) this.fall(this.poisonFrom)
  }

  takeDamage(amount, from, knockback = 210, { projectile = false } = {}) {
    if (!this.alive || this.invulnerable) return
    // Fights are paced to hold two decisions rather than one, so every blow
    // lands a little softer than it used to.
    amount = Math.round(amount * PACE.damage * (from?.damageMult ?? 1))
    // A raised guard takes most of it, costs stamina in proportion, and earns
    // the window to answer. Everything the guard does happens here.
    if (from && from !== this && this.guarding) amount = this.block(from, amount)
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

    // Stamina comes back once you stop spending, and holding a guard is
    // spending. This is the clock a fight is actually played against.
    if (this.guarding) this.spend(GUARD.drainPerSec * step)
    if (this.stamina <= 0 && this.guarding) this.breakGuard()
    if (this.now - this.spentAt > STAMINA.idleMs) {
      this.stamina = Math.min(STAMINA.max, this.stamina + STAMINA.regenPerSec * step)
    }
    this.updateSwing()

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
      moon: Math.round(this.moon * 100) / 100,
      /** How far into the aim, so the telegraph grows on every screen alike. */
      aimHeld: this.aiming ? Math.round(this.now - this.aimingSince) : 0,
      alive: this.alive,
      speed: Math.round(this.vel.length()),
      // Velocity, so a client predicting its own movement can carry on from
      // exactly where the authority was rather than guessing from positions.
      vx: Math.round(this.vel.x),
      vy: Math.round(this.vel.y),
      flags: (this.dashing ? FLAGS.DASHING : 0) | (this.stunned ? FLAGS.STUNNED : 0) |
        (this.parrying ? FLAGS.PARRYING : 0) | (this.parryRecovering ? FLAGS.PARRY_RECOVER : 0) |
        (this.casting ? FLAGS.CASTING : 0) | (this.shielded ? FLAGS.SHIELDED : 0) |
        (this.chargeState ? FLAGS.CHARGING : 0) | (this.hidden ? FLAGS.HIDDEN : 0) |
        (this.guarding ? FLAGS.GUARDING : 0) | (this.winding ? FLAGS.WINDING : 0) |
        (this.riposting ? FLAGS.RIPOSTE : 0) | (this.guardBroken ? FLAGS.GUARD_BROKEN : 0) |
        (this.aiming ? FLAGS.AIMING : 0),
      shield: Math.round(this.shieldHp),
      buffs: Object.entries(this.buffs)
        .filter(([, b]) => b && this.now < b.until)
        .map(([type, b]) => ({ type, left: Math.round(b.until - this.now), of: b.durationMs })),
      // How far dash and parry have come back, 0 to 1. The icons above an Axie
      // fill as they return, and a client cannot work that out for itself: only
      // the room knows when you last used them.
      ready: {
        dash: Math.round(clamp((this.now - this.lastDash) / this.dashCooldown, 0, 1) * 100) / 100,
        parry: Math.round(clamp((this.now - this.lastParry) / PARRY.cooldownMs, 0, 1) * 100) / 100,
      },
      // The bar a fight is played against, and how far through a swing is, so
      // the wind-up can be drawn as the warning it is meant to be.
      stamina: Math.round(clamp(this.stamina / STAMINA.max, 0, 1) * 100) / 100,
      wind: this.swing
        ? Math.round(clamp((this.now - this.swing.startedAt) / (this.swing.releaseAt - this.swing.startedAt), 0, 1) * 100) / 100
        : 0,
      bounty: this.wilds ? Math.round(this.wilds.bounty * 1000) / 1000 : null,
      leaving: Boolean(this.wilds?.leaving),
      channel: this.channel
        ? {
          progress: Math.round((this.channel.progress ?? 0) * 100) / 100,
          interrupted: Boolean(this.channel.interruptedAt && this.now - this.channel.interruptedAt < 500),
        }
        : null,
      bot: !this.isPlayer,
    }
  }
}
