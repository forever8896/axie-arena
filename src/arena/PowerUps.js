import Phaser from 'phaser'
import { WORLD } from './Arena.js'
import { play as playSfx } from '../fx/Sfx.js'
import { playStatusPlate } from '../fx/SkillVfx.js'
import { POWERUPS, POWERUP_RULES, POWERUP_ICONS } from './boonConfig.js'

// The numbers live in boonConfig.js so the headless simulation can read them.
export { POWERUPS, POWERUP_RULES, POWERUP_ICONS }

export default class PowerUps {
  constructor(scene) {
    this.scene = scene
    this.orbs = []
    this.bag = []
    this.enabled = true
    this.nextAt = POWERUP_RULES.firstAt
    this.taken = 0
  }

  /**
   * Match time, counted from this system's first update. The scene clock can
   * still read a previous value while create() runs, so a start stamped there
   * is not trustworthy: it fired the first spawn on the first frame.
   */
  get elapsed() {
    this.t0 ??= this.scene.time.now
    return this.scene.time.now - this.t0
  }

  update(fighters) {
    // `enabled` only stops new spawns; orbs already out still work.
    if (this.enabled && this.elapsed >= this.nextAt) {
      this.nextAt = this.elapsed + POWERUP_RULES.every
      if (this.orbs.length < POWERUP_RULES.maxOnField) this.spawn(fighters)
    }

    const now = this.scene.time.now
    for (const orb of this.orbs) {
      orb.update(now)
      if (orb.dead || !orb.live) continue
      for (const f of fighters) {
        if (!f.alive) continue
        if (Phaser.Math.Distance.Between(f.x, f.y, orb.x, orb.y) <= f.bodyRadius + POWERUP_RULES.pickupRadius) {
          this.grant(f, orb.type)
          orb.collect()
          break
        }
      }
    }
    this.orbs = this.orbs.filter(o => !o.dead)
  }

  /** Never the same type twice until every type has appeared, as Dota's runes. */
  nextType() {
    if (!this.bag.length) this.bag = Phaser.Utils.Array.Shuffle(Object.keys(POWERUPS))
    return this.bag.pop()
  }

  spawn(fighters, at) {
    const spot = at ?? findOpenSpot(this.scene, {
      clearance: 60,
      lifetimeMs: POWERUP_RULES.warnMs + 6000,
      avoid: this.orbs,
      avoidRange: 380,
      fighters,
    })
    if (!spot) return null
    const orb = new Orb(this.scene, spot.x, spot.y, this.nextType())
    this.orbs.push(orb)
    return orb
  }

  grant(fighter, type) {
    const def = POWERUPS[type]
    this.taken++
    fighter.applyPowerUp(type, def)

    const scene = this.scene
    const near = fighter === scene.player ||
      (scene.player && Phaser.Math.Distance.Between(fighter.x, fighter.y, scene.player.x, scene.player.y) < 700)
    if (near) playSfx(scene, def.sfx, { volume: fighter === scene.player ? 0.7 : 0.35 })
    playStatusPlate(scene, fighter, def.plate, { size: 1.9 })
    fighter.sprite.flash(def.color, 160)
    floatLabel(scene, fighter.x, fighter.y - 100, def.name, def.color)
    scene.onPowerUp?.(fighter, type)
  }

  destroy() {
    this.orbs.forEach(o => o.remove())
    this.orbs = []
  }
}

/** A bubble with the Origins status icon inside, bobbing over its shadow. */
class Orb {
  constructor(scene, x, y, type) {
    this.scene = scene
    this.x = x
    this.y = y
    this.type = type
    this.def = POWERUPS[type]
    this.bornAt = scene.time.now
    this.liveAt = this.bornAt + POWERUP_RULES.warnMs
    this.expiresAt = this.liveAt + POWERUP_RULES.lifetimeMs
    this.dead = false
    this.live = false

    const c = this.def.color
    // Ground shimmer while it forms: where to race to.
    this.warn = scene.add.circle(x, y, 44, c, 0.12).setStrokeStyle(3, c, 0.7).setDepth(-16)
      .setScale(0.2)
    scene.tweens.add({ targets: this.warn, scale: 1, duration: POWERUP_RULES.warnMs, ease: 'Sine.easeOut' })

    this.shadow = scene.add.ellipse(x, y + 4, 46, 16, 0x000000, 0.28).setDepth(-19).setScale(0)
    this.glow = scene.add.image(x, y - 34, 'fx-soft').setTint(c).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0).setDepth(y + 40)
    this.bubble = scene.add.circle(x, y - 34, 27, 0xffffff, 0.2).setStrokeStyle(3, 0xffffff, 0.85)
      .setDepth(y + 41).setScale(0)
    this.shine = scene.add.circle(x - 9, y - 45, 6, 0xffffff, 0.75).setDepth(y + 43).setScale(0)
    const icon = scene.textures.exists(`icon-${this.def.icon}`) ? `icon-${this.def.icon}` : 'fx-dot'
    this.icon = scene.add.image(x, y - 34, icon).setDepth(y + 42).setScale(0)
    const src = this.icon.frame
    this.iconScale = 34 / Math.max(src.width, src.height)
    this.parts = [this.warn, this.shadow, this.glow, this.bubble, this.shine, this.icon]
  }

  update(now) {
    if (this.dead) return

    if (!this.live && now >= this.liveAt) {
      this.live = true
      this.warn.setFillStyle(this.def.color, 0.08).setStrokeStyle(2, this.def.color, 0.35)
      this.scene.tweens.add({ targets: [this.shadow, this.bubble, this.shine], scale: 1, duration: 320, ease: 'Back.easeOut' })
      this.scene.tweens.add({ targets: this.icon, scale: this.iconScale, duration: 320, ease: 'Back.easeOut' })
      this.scene.tweens.add({ targets: this.glow, scale: 1.6, duration: 320, ease: 'Back.easeOut' })
      const p = this.scene.player
      if (p && Phaser.Math.Distance.Between(p.x, p.y, this.x, this.y) < 800) playSfx(this.scene, 'bubble', { volume: 0.35 })
    }
    if (!this.live) return

    const t = (now - this.liveAt) / 1000
    const bob = Math.sin(t * 3.2) * 5
    for (const o of [this.glow, this.bubble, this.icon]) o.y = this.y - 34 + bob
    this.shine.y = this.y - 45 + bob
    this.glow.setAlpha(0.55 + Math.sin(t * 5) * 0.2)

    // Blink out over the last three seconds.
    const left = this.expiresAt - now
    if (left < 3000) {
      const on = Math.floor(left / (left < 1200 ? 90 : 180)) % 2 === 0
      this.parts.forEach(o => o.setVisible(on))
    }
    if (left <= 0) this.expire()
  }

  collect() {
    if (this.dead) return
    this.dead = true
    const s = this.scene
    const burst = s.add.circle(this.x, this.icon.y, 20, this.def.color, 0).setStrokeStyle(4, 0xffffff, 1).setDepth(this.y + 44)
    s.tweens.add({
      targets: burst, radius: 70, alpha: 0, duration: 300, ease: 'Cubic.easeOut',
      onUpdate: () => burst.setStrokeStyle(4, 0xffffff, burst.alpha), onComplete: () => burst.destroy(),
    })
    s.tweens.add({
      targets: [this.bubble, this.icon, this.glow, this.shine], scale: 0, alpha: 0, duration: 180,
      onComplete: () => this.remove(),
    })
    this.warn.setVisible(false)
    this.shadow.setVisible(false)
  }

  expire() {
    this.dead = true
    this.scene.tweens.add({ targets: this.parts, alpha: 0, duration: 250, onComplete: () => this.remove() })
  }

  remove() {
    this.dead = true
    this.parts.forEach(o => o.active && o.destroy())
  }
}

/**
 * A spot clear of cover, inside where the closing field will still be safe
 * `lifetimeMs` from now, and away from `avoid`. Candidates are scored, so
 * something is always returned while any open ground remains.
 */
export function findOpenSpot(scene, { clearance, lifetimeMs, avoid = [], avoidRange = 0, fighters = [], score }) {
  const b = scene.arenaBounds
  const field = scene.field
  const safeR = field ? field.radiusIn(lifetimeMs) - clearance - 40 : Infinity
  let best = null
  let bestScore = -Infinity

  for (let i = 0; i < 40; i++) {
    let x, y
    if (safeR < Math.hypot(WORLD.width, WORLD.height)) {
      if (safeR < 60) return { x: field.cx, y: field.cy }
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * safeR
      x = field.cx + Math.cos(a) * r
      y = field.cy + Math.sin(a) * r
    } else {
      x = Phaser.Math.Between(b.left + clearance + 40, b.right - clearance - 40)
      y = Phaser.Math.Between(b.top + clearance + 40, b.bottom - clearance - 40)
    }
    if (x < b.left + clearance || x > b.right - clearance || y < b.top + clearance || y > b.bottom - clearance) continue
    if (scene.arena?.wallAt(x, y, clearance)) continue
    if (scene.arena?.inBush(x, y)) continue

    let s = Math.random() * 60
    for (const o of avoid) {
      if (Phaser.Math.Distance.Between(x, y, o.x, o.y) < avoidRange) s -= 1000
    }
    // Not on top of anyone: something has to be crossed to reach it.
    for (const f of fighters) {
      if (f.alive && Phaser.Math.Distance.Between(x, y, f.x, f.y) < 160) s -= 400
    }
    if (score) s += score(x, y)
    if (s > bestScore) { bestScore = s; best = { x, y } }
  }
  return best
}

export function floatLabel(scene, x, y, text, color) {
  const label = scene.add.text(x, y, text, {
    fontFamily: 'Rowdies, ui-sans-serif, system-ui, sans-serif',
    fontSize: '20px', color: `#${color.toString(16).padStart(6, '0')}`, stroke: '#16200f', strokeThickness: 6,
  }).setOrigin(0.5).setDepth(10001)
  scene.tweens.add({
    targets: label, y: y - 34, alpha: 0, scale: { from: 1.4, to: 1 },
    duration: 900, ease: 'Quad.easeOut', onComplete: () => label.destroy(),
  })
}
