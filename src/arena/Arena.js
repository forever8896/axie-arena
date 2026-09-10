import Phaser from 'phaser'
import { ARENA_PALETTE } from '../axie/palette.js'

export const WORLD = { width: 2400, height: 1800 }

// Kept dark on purpose: the camera bloom lifts these several stops, and a
// lighter face turns every block into a pale slab.
const WALL = {
  face: 0x2a2352,
  top: 0x5a4d9e,
  side: 0x171232,
  edge: 0x8f7fe0,
}

/**
 * Cover layout. Mirrored on both axes so no spawn corner is safer than
 * another, with a broken centre so fights there have somewhere to break to.
 */
function mirrored(quadrant) {
  const out = []
  for (const w of quadrant) {
    out.push({ ...w })
    out.push({ ...w, x: -w.x })
    out.push({ ...w, y: -w.y })
    out.push({ ...w, x: -w.x, y: -w.y })
  }
  return out
}

const WALLS = mirrored([
  { x: 0, y: 250, w: 220, h: 46 },
  { x: 300, y: 0, w: 46, h: 200 },
  { x: 560, y: 380, w: 320, h: 46 },
  { x: 760, y: 190, w: 46, h: 300 },
  { x: 300, y: 660, w: 240, h: 46 },
  { x: 430, y: 560, w: 46, h: 220 },
  { x: 980, y: 700, w: 260, h: 46 },
  { x: 1090, y: 430, w: 46, h: 240 },
])

/** Soft cover: you can stand in it, and you are harder to see and to target. */
const BUSHES = mirrored([
  { x: 180, y: 470, rx: 130, ry: 84 },
  { x: 690, y: 90, rx: 112, ry: 74 },
  { x: 900, y: 620, rx: 150, ry: 92 },
  { x: 420, y: 800, rx: 120, ry: 78 },
])

export default class Arena {
  constructor(scene) {
    this.scene = scene
    this.cx = WORLD.width / 2
    this.cy = WORLD.height / 2

    // Layout is authored around the centre; store it in world coordinates.
    this.walls = WALLS.map(w => ({
      x: this.cx + w.x, y: this.cy + w.y, w: w.w, h: w.h,
      left: this.cx + w.x - w.w / 2, right: this.cx + w.x + w.w / 2,
      top: this.cy + w.y - w.h / 2, bottom: this.cy + w.y + w.h / 2,
    }))
    this.bushes = BUSHES.map(b => ({ x: this.cx + b.x, y: this.cy + b.y, rx: b.rx, ry: b.ry }))

    this.bounds = { left: 70, top: 96, right: WORLD.width - 70, bottom: WORLD.height - 70 }
  }

  draw() {
    this.drawGround()
    this.drawBushBases()
    this.drawWalls()
    this.drawBushCanopies()
  }

  drawGround() {
    const P = ARENA_PALETTE
    const s = this.scene
    const g = s.add.graphics().setDepth(-100)

    g.fillStyle(P.deep, 1).fillRect(-500, -500, WORLD.width + 1000, WORLD.height + 1000)

    // Lit pool in the middle, falling off to the edges.
    const maxR = Math.max(WORLD.width, WORLD.height) * 0.6
    for (let i = 14; i >= 0; i--) {
      const t = i / 14
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(P.floorLit),
        Phaser.Display.Color.ValueToColor(P.deep),
        14, i,
      )
      g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1)
      g.fillEllipse(this.cx, this.cy, maxR * 2 * t + 320, maxR * 1.5 * t + 260)
    }

    const grid = this.scene.add.graphics().setDepth(-98)
    for (let x = 0; x <= WORLD.width; x += 120) {
      const fade = 1 - Math.abs(x - this.cx) / (WORLD.width * 0.7)
      grid.lineStyle(1, P.ring, Math.max(0.03, fade * 0.18))
      grid.lineBetween(x, 0, x, WORLD.height)
    }
    for (let y = 0; y <= WORLD.height; y += 120) {
      const fade = 1 - Math.abs(y - this.cy) / (WORLD.height * 0.7)
      grid.lineStyle(1, P.ring, Math.max(0.03, fade * 0.18))
      grid.lineBetween(0, y, WORLD.width, y)
    }

    // Scattered ground detail so the floor is never a flat plane.
    const rng = new Phaser.Math.RandomDataGenerator(['axie-arena'])
    const decor = this.scene.add.graphics().setDepth(-97)
    for (let i = 0; i < 190; i++) {
      const x = rng.between(60, WORLD.width - 60)
      const y = rng.between(60, WORLD.height - 60)
      if (this.wallAt(x, y)) continue
      const r = rng.between(2, 6)
      decor.fillStyle(rng.pick([P.ring, P.floorLit, 0x4a3a86]), rng.realInRange(0.12, 0.3))
      decor.fillEllipse(x, y, r * 2.4, r * 1.3)
    }

    // Boundary.
    const ring = this.scene.add.graphics().setDepth(-96)
    ring.lineStyle(8, P.glow, 0.13)
    ring.strokeRoundedRect(40, 62, WORLD.width - 80, WORLD.height - 102, 100)
    ring.lineStyle(2, P.glow, 0.45)
    ring.strokeRoundedRect(46, 68, WORLD.width - 92, WORLD.height - 114, 96)

    const mark = this.scene.add.graphics().setDepth(-97)
    mark.lineStyle(2, P.glow, 0.12).strokeCircle(this.cx, this.cy, 190)
    mark.lineStyle(1, P.glow, 0.08).strokeCircle(this.cx, this.cy, 280)
  }

  /**
   * Blocks are drawn per wall and depth-sorted by their base, so an Axie can
   * stand behind one and be occluded by it.
   */
  drawWalls() {
    const lift = 16          // fake height, drawn as an offset top face
    const radius = 9

    for (const w of this.walls) {
      const g = this.scene.add.graphics().setDepth(w.bottom)

      // Cast shadow on the ground.
      g.fillStyle(0x000000, 0.32)
      g.fillRoundedRect(w.left + 6, w.top + 10, w.w, w.h, radius)

      // Side face.
      g.fillStyle(WALL.side, 1)
      g.fillRoundedRect(w.left, w.top - lift + 6, w.w, w.h + lift, radius)

      // Top face, lifted.
      g.fillStyle(WALL.face, 1)
      g.fillRoundedRect(w.left, w.top - lift, w.w, w.h, radius)

      // Light from above-left: bright top edge, bright left edge.
      g.fillStyle(WALL.top, 0.9)
      g.fillRoundedRect(w.left, w.top - lift, w.w, 5, radius)
      g.fillStyle(WALL.top, 0.35)
      g.fillRoundedRect(w.left, w.top - lift, 5, w.h, radius)

      // Contact shadow where the block meets the floor.
      g.fillStyle(0x000000, 0.35)
      g.fillRoundedRect(w.left, w.bottom - 4, w.w, 8, radius)

      // Rim so blocks read against the dark floor.
      g.lineStyle(1, WALL.edge, 0.5)
      g.strokeRoundedRect(w.left, w.top - lift, w.w, w.h, radius)
    }
  }

  drawBushBases() {
    const g = this.scene.add.graphics().setDepth(-20)
    for (const b of this.bushes) {
      g.fillStyle(0x1d5c3a, 0.5)
      g.fillEllipse(b.x, b.y + 8, b.rx * 2, b.ry * 2)
    }
  }

  /** Drawn above the fighters, so standing in one half-hides you. */
  drawBushCanopies() {
    const rng = new Phaser.Math.RandomDataGenerator(['axie-bush'])
    for (const b of this.bushes) {
      const g = this.scene.add.graphics().setDepth(b.y + b.ry + 40)
      g.fillStyle(0x2f8a52, 0.62)
      g.fillEllipse(b.x, b.y, b.rx * 2, b.ry * 2)
      for (let i = 0; i < 14; i++) {
        const a = rng.realInRange(0, Math.PI * 2)
        const d = rng.realInRange(0.25, 0.95)
        g.fillStyle(rng.pick([0x3cb86a, 0x2a7a4a, 0x49d67f]), 0.55)
        g.fillEllipse(
          b.x + Math.cos(a) * b.rx * d,
          b.y + Math.sin(a) * b.ry * d,
          rng.between(30, 62), rng.between(20, 38),
        )
      }
    }
  }

  wallAt(x, y, pad = 0) {
    return this.walls.some(w =>
      x > w.left - pad && x < w.right + pad && y > w.top - pad && y < w.bottom + pad)
  }

  inBush(x, y) {
    return this.bushes.some(b =>
      ((x - b.x) / b.rx) ** 2 + ((y - b.y) / b.ry) ** 2 <= 1)
  }

  /**
   * Pushes a circle out of any wall it overlaps, along whichever axis needs
   * the smaller correction — so sliding along a wall feels natural.
   */
  resolveCircle(pos, radius) {
    // A bad radius would make every distance test fail open and write NaN
    // straight into the caller's position.
    if (!Number.isFinite(radius) || radius <= 0) return

    for (const w of this.walls) {
      const nearestX = Phaser.Math.Clamp(pos.x, w.left, w.right)
      const nearestY = Phaser.Math.Clamp(pos.y, w.top, w.bottom)
      const dx = pos.x - nearestX
      const dy = pos.y - nearestY

      if (dx * dx + dy * dy >= radius * radius) continue

      if (dx === 0 && dy === 0) {
        // Centre is inside the block: eject the short way out.
        const left = pos.x - w.left
        const right = w.right - pos.x
        const up = pos.y - w.top
        const down = w.bottom - pos.y
        const min = Math.min(left, right, up, down)
        if (min === left) pos.x = w.left - radius
        else if (min === right) pos.x = w.right + radius
        else if (min === up) pos.y = w.top - radius
        else pos.y = w.bottom + radius
        continue
      }

      const dist = Math.hypot(dx, dy) || 1
      pos.x = nearestX + (dx / dist) * radius
      pos.y = nearestY + (dy / dist) * radius
    }
  }
}
