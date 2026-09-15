import Phaser from 'phaser'
import { WORLD } from './Arena.js'
import { damageNumber } from '../fx/Juice.js'

/**
 * The Wilds close in.
 *
 * After Brawl Stars' Showdown gas: from a set time the safe field shrinks
 * toward the centre, and anyone outside it takes damage that escalates the
 * longer they stay. Matches end because the arena makes them end.
 *
 * Tuned gentler than Showdown's 20% max health per second at the start, and
 * capped there, since here most rivals are bots that should still get a fight.
 */
export const CLOSE = {
  // Showdown starts its gas at 20s. At 30s, a 60-match simulation averaged
  // 132s per match with most fighters surviving until the field forced it.
  startsAt: 20000,
  // Closes all the way. A 280u floor let several fighters survive inside
  // indefinitely: half of a 60-match simulation ended in a stalemate.
  duration: 70000,
  minRadius: 0,
  tickMs: 500,
  baseFrac: 0.04,        // of max health per second, on first stepping out
  growthPerSec: 0.025,   // added per second spent outside
  maxFrac: 0.2,          // Showdown's rate, as the ceiling
}

export default class ClosingField {
  constructor(scene) {
    this.scene = scene
    this.cx = WORLD.width / 2
    this.cy = WORLD.height / 2
    this.maxRadius = Math.hypot(WORLD.width, WORLD.height) / 2 + 60
    this.radius = this.maxRadius
    this.startedAt = scene.time.now
    this.nextTick = 0
    this.warned = false

    // Shade is one rectangle with an inverted circular mask cut out of it.
    // A single wide stroke spiked at its joins, and a ring of quads showed
    // anti-aliased seams; a mask has neither.
    this.shade = scene.add.rectangle(-2000, -2000, WORLD.width + 4000, WORLD.height + 4000, 0x2a1640, 0.42)
      .setOrigin(0).setDepth(8500).setVisible(false)
    this.hole = scene.make.graphics({ x: 0, y: 0, add: false })
    const mask = this.hole.createGeometryMask()
    mask.setInvertAlpha(true)
    this.shade.setMask(mask)

    this.edge = scene.add.graphics().setDepth(8501)
  }

  get active() {
    return this.scene.time.now - this.startedAt >= CLOSE.startsAt
  }

  /** 0 before it starts, 1 once fully closed. */
  get progress() {
    const t = this.scene.time.now - this.startedAt - CLOSE.startsAt
    return Phaser.Math.Clamp(t / CLOSE.duration, 0, 1)
  }

  /** Seconds until it starts closing, or 0 once it has. */
  get secondsUntil() {
    return Math.max(0, Math.ceil((CLOSE.startsAt - (this.scene.time.now - this.startedAt)) / 1000))
  }

  /** The safe radius `ms` from now. */
  radiusIn(ms) {
    const t = this.scene.time.now + ms - this.startedAt - CLOSE.startsAt
    const eased = Phaser.Math.Easing.Sine.InOut(Phaser.Math.Clamp(t / CLOSE.duration, 0, 1))
    return Phaser.Math.Linear(this.maxRadius, CLOSE.minRadius, eased)
  }

  outside(x, y, pad = 0) {
    return Phaser.Math.Distance.Between(x, y, this.cx, this.cy) > this.radius - pad
  }

  update(fighters) {
    const eased = Phaser.Math.Easing.Sine.InOut(this.progress)
    this.radius = Phaser.Math.Linear(this.maxRadius, CLOSE.minRadius, eased)
    this.draw()

    if (!this.active) return
    const now = this.scene.time.now
    if (now < this.nextTick) return
    this.nextTick = now + CLOSE.tickMs

    for (const f of fighters) {
      if (!f.alive) continue
      if (!this.outside(f.x, f.y)) {
        f.outsideSince = null
        continue
      }
      f.outsideSince ??= now
      const secondsOut = (now - f.outsideSince) / 1000
      const frac = Math.min(CLOSE.maxFrac, CLOSE.baseFrac + CLOSE.growthPerSec * secondsOut)
      const dmg = Math.round(f.maxHp * frac * (CLOSE.tickMs / 1000))

      f.hp -= dmg
      f.sprite.flash(0x8a5cff, 80)
      damageNumber(this.scene, f.x, f.y - 20, String(dmg), '#c9a8ff', dmg)
      if (f.hp <= 0) f.die(null)
    }
  }

  draw() {
    const e = this.edge
    e.clear()
    this.hole.clear()
    this.shade.setVisible(this.active)
    if (!this.active) return

    this.hole.fillStyle(0xffffff, 1)
    this.hole.fillCircle(this.cx, this.cy, this.radius)

    const pulse = 0.6 + Math.sin(this.scene.time.now / 220) * 0.25
    e.lineStyle(10, 0x8a5cff, 0.25 * pulse)
    e.strokeCircle(this.cx, this.cy, this.radius + 4)
    e.lineStyle(3, 0xd9c2ff, 0.9 * pulse)
    e.strokeCircle(this.cx, this.cy, this.radius)
  }
}
