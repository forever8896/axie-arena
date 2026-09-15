import Phaser from 'phaser'
import Projectile from './Projectile.js'
import Zone from './Zone.js'
import { impact } from '../fx/Juice.js'
import { CHARGE_PER_HIT, TELEGRAPH_MS } from '../axie/classKits.js'
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
      strikeShape(fighter, spec, i)
      fighter.scene.playBasicVfx?.(fighter, spec)
      fighter.sprite.playAttack(() => coneHit(fighter, spec, targets), spec.anim)
    })
  }
  return true
}

/**
 * Specials spend a full charge, then wind up behind a ground telegraph before
 * firing. The wind-up is sized to the ~250ms human reaction window, so a
 * special can be seen coming and answered (docs/DESIGN.md).
 */
export function useSpecial(fighter, targets, now, aimPoint) {
  const spec = fighter.kit?.special
  if (!spec || !fighter.canSpecial(now)) return false

  const run = SPECIALS[spec.kind]
  if (!run) return false

  fighter.charge = 0
  fighter.lastSpecial = now
  fighter.casting = true

  // Aim locks when the cast starts: committing to a direction is the risk.
  const lockedAim = fighter.aim
  const lockedPoint = { x: aimPoint.x, y: aimPoint.y }
  telegraph(fighter, spec, lockedAim, lockedPoint)
  // The authored wind-up, squeezed into the telegraph window.
  fighter.sprite.playState('prepare', { fit: TELEGRAPH_MS })

  fighter.scene.time.delayedCall(TELEGRAPH_MS, () => {
    fighter.casting = false
    if (!fighter.alive || fighter.stunned) return
    fighter.aim = lockedAim
    // Beast's charge animates as a sprint and gores when it lands; see Fighter.
    if (spec.kind !== 'charge') fighter.sprite.play(spec.anim, { kind: 'special' })
    fighter.scene.playSkillVfx?.(fighter, spec)
    if (spec.sfx) play(fighter.scene, spec.sfx, { volume: 0.6 })
    run(fighter, spec, targets, lockedPoint)
  })
  return true
}

/** Where the special will land, drawn on the ground for the wind-up. */
function telegraph(fighter, spec, aim, point) {
  const scene = fighter.scene
  const g = scene.add.graphics().setDepth(-15)
  const color = fighter.colors.rim
  const state = { t: 0 }

  const draw = () => {
    g.clear()
    const a = 0.2 + state.t * 0.35
    g.fillStyle(color, a * 0.45)
    g.lineStyle(3, color, a + 0.25)

    switch (spec.kind) {
      case 'charge': {
        const len = spec.speed * (spec.duration / 1000)
        const ex = fighter.x + Math.cos(aim) * len
        const ey = fighter.y + Math.sin(aim) * len
        g.lineStyle(46 * state.t + 8, color, a * 0.5)
        g.lineBetween(fighter.x, fighter.y, ex, ey)
        break
      }
      case 'wave':
        g.slice(fighter.x, fighter.y, spec.range,
          aim - Phaser.Math.DegToRad(spec.arc) / 2, aim + Phaser.Math.DegToRad(spec.arc) / 2)
        g.fillPath(); g.strokePath()
        break
      case 'lob': {
        const d = Math.min(spec.maxRange, Phaser.Math.Distance.Between(fighter.x, fighter.y, point.x, point.y))
        const lx = fighter.x + Math.cos(aim) * d
        const ly = fighter.y + Math.sin(aim) * d
        g.fillCircle(lx, ly, spec.radius * (0.4 + 0.6 * state.t))
        g.strokeCircle(lx, ly, spec.radius)
        break
      }
      case 'spread': {
        const spread = Phaser.Math.DegToRad(spec.spread)
        for (let i = 0; i < spec.count; i++) {
          const ang = aim - spread / 2 + spread * (i / (spec.count - 1))
          g.lineBetween(fighter.x, fighter.y,
            fighter.x + Math.cos(ang) * spec.projectileRange * 0.6 * state.t,
            fighter.y + Math.sin(ang) * spec.projectileRange * 0.6 * state.t)
        }
        break
      }
      case 'seeker':
        g.lineBetween(fighter.x, fighter.y,
          fighter.x + Math.cos(aim) * 160 * state.t, fighter.y + Math.sin(aim) * 160 * state.t)
        g.strokeCircle(fighter.x, fighter.y, 40 * state.t + 10)
        break
      case 'radial':
        g.fillCircle(fighter.x, fighter.y, spec.radius * state.t)
        g.strokeCircle(fighter.x, fighter.y, spec.radius)
        break
    }
  }

  scene.tweens.add({
    targets: state, t: 1, duration: TELEGRAPH_MS, ease: 'Sine.easeIn',
    onUpdate: draw,
    onComplete: () => g.destroy(),
  })
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

  // Charge once per swing that connects, not per target: cleaving a crowd
  // should not fill the meter instantly.
  if (connected) fighter.addCharge(CHARGE_PER_HIT)

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
    scene.cameras.main.shake(140, 0.006)
  },
}

/**
 * Each class draws its own strike, shaped to its real hitbox so the visual
 * never lies about reach. The Origins plate for that class plays on top.
 *
 * Normal blending with a dark underline, not additive: additive artwork
 * vanishes against a sunlit field.
 */
function strikeShape(fighter, spec, hitIndex = 0) {
  const scene = fighter.scene
  const g = scene.add.graphics().setDepth(fighter.y + 3)
  const arc = Phaser.Math.DegToRad(spec.arc)
  const reach = spec.range
  const aim = fighter.aim
  const rim = fighter.colors.rim
  const body = fighter.colors.body
  const cx = fighter.x
  const cy = fighter.y - 10
  const at = (a, r) => ({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
  const state = { t: 0 }

  const stroke = (width, color, alpha, draw) => {
    g.lineStyle(width * 1.6 + 5, 0x1d2b12, alpha * 0.4); draw()
    g.lineStyle(width * 1.6, color, Math.min(1, alpha * 1.15)); draw()
    g.lineStyle(Math.max(1, width * 0.5), 0xffffff, alpha * 0.7); draw()
  }

  const shapes = {
    // Heavy wedge driven forward: a horn going in.
    beast: t => {
      const len = reach * (0.35 + 0.65 * t)
      const half = arc / 2 * (1 - t * 0.5)
      const a = 1 - t
      g.fillStyle(0x1d2b12, a * 0.3)
      g.fillTriangle(cx, cy, at(aim - half, len).x, at(aim - half, len).y, at(aim + half, len).x, at(aim + half, len).y)
      g.fillStyle(body, a * 0.55)
      g.fillTriangle(cx, cy, at(aim - half * 0.7, len).x, at(aim - half * 0.7, len).y, at(aim + half * 0.7, len).x, at(aim + half * 0.7, len).y)
      stroke(4, rim, a, () => { g.beginPath(); g.arc(cx, cy, len, aim - half, aim + half); g.strokePath() })
    },

    // Two crossing slashes, one per hit, alternating direction.
    aquatic: t => {
      const dir = hitIndex % 2 === 0 ? 1 : -1
      const a = 1 - t * t
      const sweep = arc * t
      const from = aim - (arc / 2) * dir
      for (let i = 0; i < 6; i++) {
        const k = i / 6
        const ang = from + sweep * dir * (1 - k * 0.3)
        const r = reach * (0.55 + 0.45 * (1 - k))
        stroke(5 * (1 - k) + 1, rim, a * (1 - k), () => {
          g.beginPath(); g.arc(cx, cy, r, Math.min(ang, ang - 0.12 * dir), Math.max(ang, ang - 0.12 * dir)); g.strokePath()
        })
      }
    },

    // Jaws: an upper and lower crescent snapping shut on the aim line.
    plant: t => {
      const close = Math.min(1, t * 1.8)
      const open = (arc / 2) * (1 - close)
      const r = reach * 0.85
      const a = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45
      for (const side of [-1, 1]) {
        const mid = aim + side * (open + 0.08)
        stroke(6, rim, a, () => { g.beginPath(); g.arc(cx, cy, r, mid - 0.32, mid + 0.32); g.strokePath() })
        // Teeth along each jaw.
        g.fillStyle(0xffffff, a)
        for (let k = -1; k <= 1; k++) {
          const tooth = at(mid + k * 0.18, r - 6)
          g.fillTriangle(tooth.x - 3, tooth.y, tooth.x + 3, tooth.y, at(mid + k * 0.18, r - 16 - 4 * close).x, at(mid + k * 0.18, r - 16 - 4 * close).y)
        }
      }
    },

    // A fast, thin jab along the full reach, with a flash at the tip.
    bird: t => {
      const reachNow = reach * Math.min(1, t * 2.2)
      const a = 1 - t
      const tip = at(aim, reachNow)
      stroke(3, rim, a, () => { g.beginPath(); g.moveTo(cx, cy); g.lineTo(tip.x, tip.y); g.strokePath() })
      g.fillStyle(0xffffff, a).fillCircle(tip.x, tip.y, 6 * (1 - t) + 2)
      const side = aim + Math.PI / 2
      g.lineStyle(2, rim, a * 0.8)
      g.lineBetween(tip.x - Math.cos(side) * 8, tip.y - Math.sin(side) * 8, tip.x + Math.cos(side) * 8, tip.y + Math.sin(side) * 8)
    },

    // Jagged double puncture: two fangs going in.
    bug: t => {
      const a = 1 - t
      const r = reach * (0.6 + 0.4 * Math.min(1, t * 2))
      for (const side of [-1, 1]) {
        const ang = aim + side * arc * 0.18
        const pts = []
        for (let k = 0; k <= 5; k++) {
          const rr = r * (0.3 + 0.7 * (k / 5))
          const jag = (k % 2 === 0 ? 1 : -1) * 0.1
          pts.push(at(ang + jag, rr))
        }
        stroke(3, body, a, () => { g.beginPath(); g.moveTo(pts[0].x, pts[0].y); pts.slice(1).forEach(q => g.lineTo(q.x, q.y)); g.strokePath() })
        g.fillStyle(0x9ff0bb, a).fillCircle(pts[5].x, pts[5].y, 4)
      }
    },

    // A wide sweep that wraps round the body, trailing behind the tail.
    reptile: t => {
      const a = 1 - t * t
      const head = aim - arc / 2 + arc * Math.min(1, t * 1.4)
      for (let i = 0; i < 10; i++) {
        const k = i / 10
        const back = head - arc * 0.45 * k
        if (back < aim - arc / 2) continue
        stroke(9 * (1 - k) + 2, i < 3 ? 0xffffff : rim, a * (1 - k), () => {
          g.beginPath(); g.arc(cx, cy, reach * (0.7 + 0.3 * (1 - k)), back - 0.07, back); g.strokePath()
        })
      }
    },
  }

  const draw = shapes[fighter.axieClass] ?? shapes.beast
  scene.tweens.add({
    targets: state, t: 1, duration: 260, ease: 'Sine.easeOut',
    onUpdate: () => { g.clear(); draw(state.t) },
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
