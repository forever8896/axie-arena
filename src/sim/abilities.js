import { CHARGE_PER_HIT, TELEGRAPH_MS } from '../axie/classKits.js'
import { CONNECT_MS } from './constants.js'
import { Vec2, clamp, distance, wrapAngle, degToRad } from './math.js'

/**
 * Every ability, as rules rather than pictures. Keyed by the `kind` field in
 * classKits, so adding a class is data plus one entry here.
 *
 * Ported from src/combat/abilities.js: the same reach, arcs, damage and
 * timings, with the drawing left to the client.
 */

export function useBasic(fighter, targets, now) {
  const spec = fighter.kit?.basic
  if (!spec || !fighter.canAttack(now)) return false
  fighter.lastAttack = now

  const hits = spec.hits ?? 1
  const strike = i => {
    if (!fighter.alive || fighter.stunned) return
    // The direction is fixed when the blow starts, so the hit lands where the
    // swing was drawn even if the aim has moved on.
    const aim = fighter.aim
    fighter.lockFacing(aim, CONNECT_MS + 60)
    fighter.room.event({ t: 'swing', id: fighter.id, aim, index: i })
    fighter.room.after(CONNECT_MS, () => coneHit(fighter, spec, targets, aim))
  }
  strike(0)
  for (let i = 1; i < hits; i++) fighter.room.after(i * 150, () => strike(i))
  return true
}

/**
 * Specials spend a full charge, then wind up behind a telegraph before firing.
 * The wind-up is sized to the ~250ms human reaction window.
 */
export function useSpecial(fighter, targets, now, aimPoint) {
  const spec = fighter.kit?.special
  if (!spec || !fighter.canSpecial(now)) return false
  const run = SPECIALS[spec.kind]
  if (!run) return false

  fighter.charge = 0
  fighter.lastSpecial = now
  fighter.casting = true
  fighter.castToken = {}

  const lockedAim = fighter.aim
  const lockedPoint = { x: aimPoint?.x ?? fighter.x + Math.cos(lockedAim) * 200, y: aimPoint?.y ?? fighter.y + Math.sin(lockedAim) * 200 }
  fighter.room.event({ t: 'telegraph', id: fighter.id, kind: spec.kind, aim: lockedAim, point: lockedPoint })

  fighter.room.after(TELEGRAPH_MS, () => {
    fighter.casting = false
    if (!fighter.alive || fighter.stunned) return
    fighter.aim = lockedAim
    fighter.room.event({ t: 'special', id: fighter.id, kind: spec.kind, aim: lockedAim, point: lockedPoint })
    run(fighter, spec, targets, lockedPoint)
  })
  return true
}

/**
 * Shared cone resolution. What the client draws is what was tested here: the
 * reach and arc from where the attacker stands, along the aim locked when the
 * swing began, and a hit counts when the body touches the cone.
 */
export function coneHit(fighter, spec, targets, aim = fighter.aim) {
  if (!fighter.alive || fighter.stunned) return
  const arc = degToRad(spec.arc)
  let connected = false
  fighter.room.event({ t: 'zone', id: fighter.id, aim, range: spec.range, arc })

  for (const other of targets) {
    if (other === fighter || !other.alive || other.invulnerable) continue
    if (!inCone(fighter, other, spec.range, arc, aim)) continue
    if (other.tryParry(fighter)) return

    other.takeDamage(spec.damage, fighter, spec.knockback)
    if (spec.poison) other.applyPoison(spec.poison, fighter)
    connected = true
  }

  if (connected) fighter.addCharge(CHARGE_PER_HIT)
  else fighter.room.event({ t: 'miss', id: fighter.id, aim, range: spec.range })
}

/** True when any part of the target's body is inside the cone. */
export function inCone(fighter, target, range, arc, aim = fighter.aim) {
  const pad = (target.bodyRadius ?? 0) * 0.5
  const d = distance(fighter.x, fighter.y, target.x, target.y)
  if (d - pad > range) return false
  if (arc >= Math.PI * 2 || d < 1) return true
  const toTarget = Math.atan2(target.y - fighter.y, target.x - fighter.x)
  const widen = Math.asin(Math.min(1, pad / d))
  return Math.abs(wrapAngle(toTarget - aim)) <= arc / 2 + widen
}

const SPECIALS = {
  /** Beast: a committed charge that gores everyone it passes through. */
  charge(fighter, spec, targets) {
    const dir = new Vec2(Math.cos(fighter.aim), Math.sin(fighter.aim))
    const alreadyHit = new Set()
    fighter.beginCharge(dir, spec.speed, spec.duration, t => {
      if (alreadyHit.has(t)) return
      alreadyHit.add(t)
      if (t.tryParry(fighter)) return
      t.takeDamage(spec.damage, fighter, 320)
    }, targets)
  },

  /** Aquatic: a pushing, slowing cone. Water goes through a raised parry. */
  wave(fighter, spec, targets) {
    const arc = degToRad(spec.arc)
    for (const other of targets) {
      if (other === fighter || !other.alive || other.invulnerable) continue
      if (!inCone(fighter, other, spec.range, arc)) continue
      other.takeDamage(spec.damage, fighter, spec.knockback)
      other.applySlow(spec.slow)
    }
  },

  /** Plant: lob a seed to the aim point; it leaves a patch where it lands. */
  lob(fighter, spec, _targets, aimPoint) {
    const dist = Math.min(spec.maxRange, distance(fighter.x, fighter.y, aimPoint.x, aimPoint.y))
    const tx = fighter.x + Math.cos(fighter.aim) * dist
    const ty = fighter.y + Math.sin(fighter.aim) * dist
    fighter.room.after(520, () => {
      fighter.room.addZone({
        owner: fighter, x: tx, y: ty, radius: spec.radius, duration: spec.zoneDuration,
        tickDamage: spec.tickDamage, tickRate: spec.tickRate,
      })
    })
    fighter.room.event({ t: 'lob', id: fighter.id, x: tx, y: ty, travel: 520, radius: spec.radius })
  },

  /** Bird: a fan of feathers. */
  spread(fighter, spec) {
    const spread = degToRad(spec.spread)
    for (let i = 0; i < spec.count; i++) {
      const t = spec.count === 1 ? 0.5 : i / (spec.count - 1)
      const angle = fighter.aim - spread / 2 + spread * t
      fighter.room.addProjectile({
        owner: fighter, x: fighter.x, y: fighter.y - 10, angle,
        speed: spec.projectileSpeed, range: spec.projectileRange, damage: spec.damage, radius: 7,
      })
    }
  },

  /** Bug: one shot that steers, and stuns what it hits. */
  seeker(fighter, spec) {
    fighter.room.addProjectile({
      owner: fighter, x: fighter.x, y: fighter.y - 10, angle: fighter.aim,
      speed: spec.projectileSpeed, range: spec.projectileRange, damage: spec.damage,
      seeking: true, turnRate: spec.turnRate, stun: spec.stun, radius: 11,
    })
  },

  /** Reptile: everything around you, at once. */
  radial(fighter, spec, targets) {
    for (const other of targets) {
      if (other === fighter || !other.alive || other.invulnerable) continue
      if (distance(fighter.x, fighter.y, other.x, other.y) > spec.radius) continue
      if (other.tryParry(fighter)) continue
      other.takeDamage(spec.damage, fighter, spec.knockback)
    }
  },
}

/** A travelling shot. Seekers steer at a limited rate, so they stay dodgeable. */
export class SimProjectile {
  constructor(room, { owner, x, y, angle, speed, range, damage, seeking = false, turnRate = 0, stun = 0, radius = 9 }) {
    this.room = room
    this.owner = owner
    this.id = room.nextId('p')
    this.pos = new Vec2(x, y)
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
  }

  update(dt, targets) {
    if (this.dead) return
    const step = dt / 1000

    if (this.seeking) {
      const target = this.nearest(targets)
      if (target) {
        const want = Math.atan2(target.y - this.pos.y, target.x - this.pos.x)
        const diff = wrapAngle(want - this.angle)
        this.angle += clamp(diff, -this.turnRate * step, this.turnRate * step)
      }
    }

    const dx = Math.cos(this.angle) * this.speed * step
    const dy = Math.sin(this.angle) * this.speed * step
    this.pos.x += dx
    this.pos.y += dy
    this.travelled += Math.hypot(dx, dy)

    for (const t of targets) {
      if (t === this.owner || !t.alive || t.invulnerable) continue
      if (distance(this.pos.x, this.pos.y, t.x, t.y) <= this.radius + 26) {
        t.takeDamage(this.damage, this.owner, 150, { projectile: true })
        if (this.stun) t.applyStun(this.stun)
        return this.destroy(true)
      }
    }

    if (this.room.arena.wallAt(this.pos.x, this.pos.y)) return this.destroy(true)
    const b = this.room.arena.bounds
    const out = this.pos.x < b.left || this.pos.x > b.right || this.pos.y < b.top || this.pos.y > b.bottom
    if (this.travelled >= this.range || out) this.destroy(false)
  }

  nearest(targets) {
    let best = null
    let bestDist = Infinity
    for (const t of targets) {
      if (t === this.owner || !t.alive) continue
      const d = distance(this.pos.x, this.pos.y, t.x, t.y)
      if (d < bestDist) { bestDist = d; best = t }
    }
    return best
  }

  destroy(hit) {
    if (this.dead) return
    this.dead = true
    this.room.event({ t: 'shot-end', id: this.id, hit, x: this.pos.x, y: this.pos.y })
  }

  snapshot() {
    return {
      id: this.id, x: Math.round(this.pos.x), y: Math.round(this.pos.y),
      a: Math.round(this.angle * 100) / 100, cls: this.owner.axieClass, seeking: this.seeking,
    }
  }
}

/** A patch of ground that damages anyone standing in it, on a tick. */
export class SimZone {
  constructor(room, { owner, x, y, radius, duration, tickDamage, tickRate }) {
    this.room = room
    this.owner = owner
    this.id = room.nextId('z')
    this.x = x
    this.y = y
    this.radius = radius
    this.tickDamage = tickDamage
    this.tickRate = tickRate
    this.expiresAt = room.now + duration
    this.nextTick = room.now + 200
    this.dead = false
    room.event({ t: 'zone-start', id: this.id, x, y, radius, cls: owner.axieClass, duration })
  }

  update(_dt, targets) {
    if (this.dead) return
    const now = this.room.now
    if (now >= this.nextTick) {
      this.nextTick = now + this.tickRate
      for (const t of targets) {
        if (t === this.owner || !t.alive || t.invulnerable) continue
        if (distance(this.x, this.y, t.x, t.y) <= this.radius) {
          t.takeDamage(this.tickDamage, this.owner, 0, { projectile: true })
        }
      }
    }
    if (now >= this.expiresAt) {
      this.dead = true
      this.room.event({ t: 'zone-end', id: this.id })
    }
  }

  snapshot() {
    return { id: this.id, x: this.x, y: this.y, r: this.radius, cls: this.owner.axieClass }
  }
}
