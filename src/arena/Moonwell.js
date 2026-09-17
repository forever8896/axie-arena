import Phaser from 'phaser'
import { play as playSfx } from '../fx/Sfx.js'
import { playStatusPlate } from '../fx/SkillVfx.js'
import { damageNumber } from '../fx/Juice.js'
import { findOpenSpot, floatLabel } from './PowerUps.js'
import { MOONWELL } from './boonConfig.js'

// The numbers live in boonConfig.js so the headless simulation can read them.
export { MOONWELL }

export default class Moonwells {
  constructor(scene) {
    this.scene = scene
    this.wells = []
    this.enabled = true
    this.nextAt = MOONWELL.firstAt
    this.healed = 0
    ensureTexture(scene)
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
    // `enabled` only stops new blooms; a well already open still heals.
    if (this.enabled && this.elapsed >= this.nextAt && !this.wells.length) {
      this.nextAt = this.elapsed + MOONWELL.every + Phaser.Math.Between(-MOONWELL.jitter, MOONWELL.jitter)
      this.spawn(fighters)
    }
    for (const w of this.wells) this.healed += w.update(fighters)
    this.wells = this.wells.filter(w => !w.dead)
  }

  spawn(fighters, at) {
    const spot = at ?? findOpenSpot(this.scene, {
      clearance: MOONWELL.radius,
      lifetimeMs: MOONWELL.bloomMs + MOONWELL.activeMs,
      fighters,
      // Near someone on their own, away from the crowd: a lifeline for the
      // fighter being picked on, not a second prize for whoever is winning.
      score: (x, y) => {
        const d = fighters.filter(f => f.alive)
          .map(f => Phaser.Math.Distance.Between(x, y, f.x, f.y)).sort((a, b) => a - b)
        if (!d.length) return 0
        return -Math.abs(d[0] - 380) * 0.3 + Math.min(d[1] ?? 900, 900) * 0.4
      },
    })
    if (!spot) return null
    const well = new Well(this.scene, spot.x, spot.y)
    this.wells.push(well)
    this.scene.onMoonwell?.(well)
    return well
  }

  destroy() {
    this.wells.forEach(w => w.remove())
    this.wells = []
  }
}

export class Well {
  constructor(scene, x, y) {
    this.scene = scene
    this.x = x
    this.y = y
    const now = scene.time.now
    this.activeAt = now + MOONWELL.bloomMs
    this.activeUntil = this.activeAt + MOONWELL.activeMs
    this.poolLeft = MOONWELL.pool
    this.nextTick = this.activeAt
    this.dead = false
    this.ending = false
    this.shown = new Map()   // fighter -> { amount, at, fxAt }

    const R = MOONWELL.radius
    this.base = scene.add.circle(x, y, R, 0x1f4f3a, 0.28).setDepth(-18).setScale(0)
    this.glow = scene.add.image(x, y, 'fx-moonwell').setTint(0x9dffd8).setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(R * 2.3, R * 2.3).setAlpha(0).setDepth(-17)
    this.ring = scene.add.circle(x, y, R, 0x000000, 0).setStrokeStyle(3, 0xd9fff0, 0.9).setDepth(-16).setScale(0.1)
    scene.tweens.add({ targets: this.ring, scale: 1, duration: MOONWELL.bloomMs, ease: 'Sine.easeOut' })
    scene.tweens.add({ targets: this.base, scale: 1, duration: MOONWELL.bloomMs, ease: 'Sine.easeOut' })
    scene.tweens.add({ targets: this.glow, alpha: 0.35, duration: MOONWELL.bloomMs, ease: 'Sine.easeIn' })

    // Origins mushrooms sprouting around the rim, one by one, during the bloom.
    this.shrooms = []
    const n = 8
    const key = scene.textures.exists('icon-buff_mushroom') ? 'icon-buff_mushroom' : 'fx-dot'
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.2
      const sx = x + Math.cos(a) * (R + 4)
      const sy = y + Math.sin(a) * (R + 4)
      const img = scene.add.image(sx, sy, key).setOrigin(0.5, 0.9).setDepth(sy).setScale(0)
      const s = 26 / Math.max(img.frame.width, img.frame.height)
      scene.tweens.add({
        targets: img, scale: s * Phaser.Math.FloatBetween(0.85, 1.15), duration: 260, ease: 'Back.easeOut',
        delay: (i / n) * (MOONWELL.bloomMs - 300),
      })
      this.shrooms.push(img)
    }

    const leafKey = scene.textures.exists('icon-buff_leaf') ? 'icon-buff_leaf' : 'fx-dot'
    this.leaf = scene.add.image(x, y - 46, leafKey).setDepth(y + 40).setAlpha(0)
    this.leafScale = 40 / Math.max(this.leaf.frame.width, this.leaf.frame.height)
    this.leaf.setScale(this.leafScale * 0.4)
    this.leafGlow = scene.add.image(x, y - 46, 'fx-soft').setTint(0x9dffd8).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.8).setAlpha(0).setDepth(y + 39)
    scene.tweens.add({ targets: [this.leaf, this.leafGlow], alpha: 1, duration: MOONWELL.bloomMs, ease: 'Sine.easeIn' })
    scene.tweens.add({ targets: this.leaf, scale: this.leafScale, duration: MOONWELL.bloomMs, ease: 'Back.easeOut' })

    this.motes = scene.add.particles(x, y, 'fx-dot', {
      emitZone: { type: 'random', source: new Phaser.Geom.Circle(0, 0, R * 0.9) },
      speedY: { min: -60, max: -20 }, speedX: { min: -8, max: 8 },
      scale: { start: 0.35, end: 0 }, alpha: { start: 0.9, end: 0 },
      lifespan: 1100, frequency: 70, tint: [0x9dffd8, 0xd9fff0, 0xc6ff8a],
      blendMode: 'ADD', emitting: false,
    }).setDepth(y + 30)

    this.parts = [this.base, this.glow, this.ring, ...this.shrooms, this.leaf, this.leafGlow, this.motes]
  }

  get blooming() { return this.scene.time.now < this.activeAt }
  get active() { return !this.dead && !this.ending && this.scene.time.now >= this.activeAt }

  /** Shrinks as the pool drains, so how much is left is readable at a glance. */
  get radius() {
    return MOONWELL.radius * (0.55 + 0.45 * this.poolLeft / MOONWELL.pool)
  }

  contains(f) {
    return Phaser.Math.Distance.Between(f.x, f.y, this.x, this.y) <= this.radius
  }

  /** Returns health given this frame. */
  update(fighters) {
    if (this.dead || this.ending) return 0
    const scene = this.scene
    const now = scene.time.now
    const t = now / 1000

    this.leaf.y = this.y - 46 + Math.sin(t * 2.4) * 5
    this.leafGlow.y = this.leaf.y
    if (now < this.activeAt) return 0

    if (!this.started) {
      this.started = true
      this.motes.emitting = true
      scene.tweens.add({ targets: this.glow, alpha: 0.85, duration: 240 })
      this.ring.setStrokeStyle(4, 0xffffff, 1)
      const p = scene.player
      if (p && Phaser.Math.Distance.Between(p.x, p.y, this.x, this.y) < 900) playSfx(scene, 'heal', { volume: 0.4 })
    }

    const scale = this.radius / MOONWELL.radius
    this.ring.setScale(scale * (1 + Math.sin(t * 4) * 0.02))
    this.base.setScale(scale)
    this.glow.setDisplaySize(this.radius * 2.3, this.radius * 2.3).setAlpha(0.7 + Math.sin(t * 3) * 0.15)

    let given = 0
    if (now >= this.nextTick) {
      this.nextTick = now + MOONWELL.tickMs
      for (const f of fighters) {
        if (!f.alive || !this.contains(f) || f.hp >= f.maxHp) continue
        if (now - f.lastHurtAt < MOONWELL.hurtLockoutMs) continue
        const want = f.maxHp * MOONWELL.healFracPerSec * MOONWELL.tickMs / 1000
        const amount = Math.min(want, this.poolLeft, f.maxHp - f.hp)
        if (amount <= 0) continue
        f.heal(amount)
        this.poolLeft -= amount
        given += amount
        this.showHeal(f, amount, now)
      }
    }

    if (now >= this.activeUntil || this.poolLeft <= 1) this.end()
    return given
  }

  /** Healing numbers are batched: a +50 every quarter second is noise. */
  showHeal(f, amount, now) {
    const s = this.shown.get(f) ?? { amount: 0, at: 0, fxAt: -Infinity }
    s.amount += amount
    if (now - s.fxAt > 2200) {
      s.fxAt = now
      playStatusPlate(this.scene, f, 'heal', { size: 1.7 })
      if (f === this.scene.player) playSfx(this.scene, 'heal', { volume: 0.5 })
    }
    if (now - s.at >= 750) {
      damageNumber(this.scene, f.x, f.y - 10, `+${Math.round(s.amount)}`, '#8dffb4', s.amount * 0.6)
      f.sprite.flash(0x9dffb4, 90)
      s.amount = 0
      s.at = now
    }
    this.shown.set(f, s)
  }

  end() {
    this.ending = true
    this.motes.emitting = false
    const s = this.scene
    if (s.player && Phaser.Math.Distance.Between(s.player.x, s.player.y, this.x, this.y) < 600 && this.poolLeft <= 1) {
      floatLabel(s, this.x, this.y - 70, 'DRAINED', 0x9dffd8)
    }
    s.tweens.add({
      targets: this.parts.filter(p => p !== this.motes), alpha: 0, duration: 600,
      onComplete: () => this.remove(),
    })
  }

  remove() {
    this.dead = true
    this.parts.forEach(p => p.active && p.destroy())
  }
}

/** A soft radial glow, drawn once per game. */
export function ensureTexture(scene) {
  if (scene.textures.exists('fx-moonwell')) return
  const size = 256
  const tex = scene.textures.createCanvas('fx-moonwell', size, size)
  const ctx = tex.getContext()
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.45)')
  g.addColorStop(0.85, 'rgba(255,255,255,0.18)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  tex.refresh()
}
