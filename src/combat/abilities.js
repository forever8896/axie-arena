import Phaser from 'phaser'
import Projectile from './Projectile.js'
import Zone from './Zone.js'
import { impact, hitStop } from '../fx/Juice.js'
import { playVaried, play } from '../fx/Sfx.js'

/**
 * Every ability is a function of (fighter, spec, targets). They are keyed by
 * the `kind` field in classKits, so adding a class is data plus one entry here.
 */

export function useBasic(fighter, targets, now) {
  const spec = fighter.kit?.basic
  if (!spec || !fighter.canAttack(now)) return false
  fighter.lastAttack = now

  const hits = spec.hits ?? 1
  for (let i = 0; i < hits; i++) {
    fighter.scene.time.delayedCall(i * 150, () => {
      if (!fighter.alive) return
      if (spec.sfx) playVaried(fighter.scene, spec.sfx, 0.4)
      swipeArc(fighter, spec)
      fighter.sprite.playAttack(() => coneHit(fighter, spec, targets))
    })
  }
  return true
}

export function useSpecial(fighter, targets, now, aimPoint) {
  const spec = fighter.kit?.special
  if (!spec || !fighter.canSpecial(now)) return false
  fighter.lastSpecial = now

  const run = SPECIALS[spec.kind]
  if (!run) return false

  fighter.scene.playSkillVfx?.(fighter, spec)
  if (spec.sfx) play(fighter.scene, spec.sfx, { volume: 0.6 })
  run(fighter, spec, targets, aimPoint)
  return true
}

/** Shared cone resolution — the basic for every class, tuned per kit. */
function coneHit(fighter, spec, targets) {
  if (!fighter.alive) return
  const arc = Phaser.Math.DegToRad(spec.arc)
  let connected = false

  for (const other of targets) {
    if (other === fighter || !other.alive || other.invulnerable) continue
    if (!inCone(fighter, other, spec.range, arc)) continue

    other.takeDamage(spec.damage, fighter, spec.knockback)
    if (spec.poison) other.applyPoison(spec.poison, fighter)
    connected = true
  }

  if (!connected) fighter.scene.swingMiss?.(fighter)
}

export function inCone(fighter, target, range, arc) {
  const d = Phaser.Math.Distance.Between(fighter.x, fighter.y, target.x, target.y)
  if (d > range) return false
  if (arc >= Math.PI * 2) return true
  const toTarget = Math.atan2(target.y - fighter.y, target.x - fighter.x)
  return Math.abs(Phaser.Math.Angle.Wrap(toTarget - fighter.aim)) <= arc / 2
}

const SPECIALS = {
  /** Beast: a committed charge that gores everyone it passes through. */
  charge(fighter, spec, targets) {
    const dir = new Phaser.Math.Vector2(Math.cos(fighter.aim), Math.sin(fighter.aim))
    const alreadyHit = new Set()

    fighter.beginCharge(dir, spec.speed, spec.duration, (t) => {
      if (alreadyHit.has(t)) return
      alreadyHit.add(t)
      t.takeDamage(spec.damage, fighter, 320)
      hitStop(fighter.scene, 60)
    }, targets)
  },

  /** Aquatic: a pushing, slowing cone. */
  wave(fighter, spec, targets) {
    const arc = Phaser.Math.DegToRad(spec.arc)
    waveVisual(fighter, spec)

    for (const other of targets) {
      if (other === fighter || !other.alive || other.invulnerable) continue
      if (!inCone(fighter, other, spec.range, arc)) continue
      other.takeDamage(spec.damage, fighter, spec.knockback)
      other.applySlow(spec.slow)
    }
    hitStop(fighter.scene, 60)
  },

  /** Plant: lob a seed to the aim point; it leaves a patch where it lands. */
  lob(fighter, spec, _targets, aimPoint) {
    const scene = fighter.scene
    const dist = Math.min(
      spec.maxRange,
      Phaser.Math.Distance.Between(fighter.x, fighter.y, aimPoint.x, aimPoint.y),
    )
    const tx = fighter.x + Math.cos(fighter.aim) * dist
    const ty = fighter.y + Math.sin(fighter.aim) * dist

    const seed = scene.add.circle(fighter.x, fighter.y, 10, fighter.colors.rim).setDepth(9000)
    const shadow = scene.add.ellipse(fighter.x, fighter.y, 20, 8, 0x000000, 0.35).setDepth(-19)

    // Arc the seed by tweening the ground position and lifting the sprite.
    scene.tweens.add({
      targets: shadow, x: tx, y: ty, duration: 520, ease: 'Sine.easeInOut',
      onUpdate: t => {
        const p = t.progress
        seed.setPosition(shadow.x, shadow.y - Math.sin(p * Math.PI) * 90)
      },
      onComplete: () => {
        seed.destroy()
        shadow.destroy()
        impact(scene, tx, ty, fighter.colors.body, 0.9)
        scene.zones.push(new Zone(scene, fighter, {
          x: tx, y: ty, radius: spec.radius, duration: spec.zoneDuration,
          tickDamage: spec.tickDamage, tickRate: spec.tickRate, color: fighter.colors.body,
        }))
      },
    })
  },

  /** Bird: a fan of feathers. */
  spread(fighter, spec) {
    const scene = fighter.scene
    const spread = Phaser.Math.DegToRad(spec.spread)
    for (let i = 0; i < spec.count; i++) {
      const t = spec.count === 1 ? 0.5 : i / (spec.count - 1)
      const angle = fighter.aim - spread / 2 + spread * t
      scene.projectiles.push(new Projectile(scene, fighter, {
        x: fighter.x, y: fighter.y - 10, angle,
        speed: spec.projectileSpeed, range: spec.projectileRange,
        damage: spec.damage, color: fighter.colors.rim, radius: 7,
      }))
    }
  },

  /** Bug: one shot that steers, and stuns what it hits. */
  seeker(fighter, spec) {
    const scene = fighter.scene
    scene.projectiles.push(new Projectile(scene, fighter, {
      x: fighter.x, y: fighter.y - 10, angle: fighter.aim,
      speed: spec.projectileSpeed, range: spec.projectileRange,
      damage: spec.damage, color: fighter.colors.body,
      seeking: true, turnRate: spec.turnRate, stun: spec.stun, radius: 11,
    }))
  },

  /** Reptile: everything around you, at once. */
  radial(fighter, spec, targets) {
    const scene = fighter.scene
    const ring = scene.add.circle(fighter.x, fighter.y, 20, fighter.colors.rim, 0)
      .setStrokeStyle(5, fighter.colors.rim, 0.9)
      .setDepth(fighter.y + 1).setBlendMode(Phaser.BlendModes.ADD)
    scene.tweens.add({
      targets: ring, radius: spec.radius, alpha: 0, duration: 320, ease: 'Cubic.easeOut',
      onUpdate: () => ring.setStrokeStyle(5, fighter.colors.rim, ring.alpha),
      onComplete: () => ring.destroy(),
    })

    for (const other of targets) {
      if (other === fighter || !other.alive || other.invulnerable) continue
      if (Phaser.Math.Distance.Between(fighter.x, fighter.y, other.x, other.y) > spec.radius) continue
      other.takeDamage(spec.damage, fighter, spec.knockback)
    }
    hitStop(fighter.scene, 80)
    scene.cameras.main.shake(140, 0.006)
  },
}

/**
 * A blade sweeping the attack cone. Gives the basic a readable shape and a
 * direction, which the body lunge alone never had.
 */
function swipeArc(fighter, spec) {
  const scene = fighter.scene
  const arc = Phaser.Math.DegToRad(spec.arc)
  const reach = spec.range
  const from = fighter.aim - arc / 2
  // Normal blending, not additive: an additive blade disappears against a
  // sunlit field. A dark underline keeps it legible on any ground colour.
  const g = scene.add.graphics().setDepth(fighter.y + 3)

  const state = { t: 0 }
  scene.tweens.add({
    targets: state, t: 1, duration: 190, ease: 'Cubic.easeOut',
    onUpdate: () => {
      g.clear()
      const head = from + arc * state.t
      const segments = 8
      const fade = 1 - state.t * state.t

      for (let i = 0; i < segments; i++) {
        const back = head - (arc * 0.34) * (i / segments)
        if (back < from) continue
        const r = reach * (0.8 + 0.2 * (1 - i / segments))
        const taper = 1 - i / segments

        g.lineStyle(10 * taper + 2, 0x1d2b12, fade * taper * 0.35)
        g.beginPath(); g.arc(fighter.x, fighter.y, r, back - 0.06, back); g.strokePath()

        g.lineStyle(7 * taper + 1.5, fighter.colors.rim, fade * taper * 0.95)
        g.beginPath(); g.arc(fighter.x, fighter.y, r, back - 0.05, back); g.strokePath()

        g.lineStyle(3 * taper, 0xffffff, fade * taper * 0.8)
        g.beginPath(); g.arc(fighter.x, fighter.y, r, back - 0.035, back); g.strokePath()
      }
    },
    onComplete: () => g.destroy(),
  })
}

function waveVisual(fighter, spec) {
  const scene = fighter.scene
  const arc = Phaser.Math.DegToRad(spec.arc)
  const g = scene.add.graphics().setDepth(fighter.y + 1).setBlendMode(Phaser.BlendModes.ADD)
  const state = { r: 24, a: 0.65 }

  scene.tweens.add({
    targets: state, r: spec.range, a: 0, duration: 340, ease: 'Cubic.easeOut',
    onUpdate: () => {
      g.clear()
      g.lineStyle(7, fighter.colors.rim, state.a)
      g.beginPath()
      g.arc(fighter.x, fighter.y, state.r, fighter.aim - arc / 2, fighter.aim + arc / 2)
      g.strokePath()
    },
    onComplete: () => g.destroy(),
  })
}
