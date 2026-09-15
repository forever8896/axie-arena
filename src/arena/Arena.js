import Phaser from 'phaser'
import { FIELD } from '../axie/palette.js'

export const WORLD = { width: 2400, height: 1800 }

// Kept dark on purpose: the camera bloom lifts these several stops, and a
// lighter face turns every block into a pale slab.
// Rocks sitting in a field, lit from above-left.
const WALL = {
  face: FIELD.stoneFace,
  top: FIELD.stoneTop,
  side: FIELD.stoneSide,
  edge: FIELD.stoneEdge,
}

const GRASS_TILE = 256

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

  /**
   * Everything here is drawn once and baked into textures.
   *
   * Phaser rebuilds a Graphics object's geometry every frame. The arena used
   * to leave ~60 of them live — hundreds of ellipses and rounded rects that
   * never change — and they dominated frame time. Now the whole ground layer
   * is one texture, and each wall and canopy is its own small texture so it
   * still depth-sorts against the fighters.
   */
  draw() {
    const s = this.scene
    this.ground = s.add.renderTexture(0, 0, WORLD.width, WORLD.height).setOrigin(0).setDepth(-99)
    this.drawGround()
    this.drawBushBases()
    this.drawWalls()
    this.drawBushCanopies()
  }

  /** Draw an off-list Graphics into the shared ground texture, then drop it. */
  stamp(g) {
    this.ground.draw(g)
    g.destroy()
  }

  /** Bake an off-list Graphics into its own texture covering `box`, at `depth`. */
  bake(g, box, depth) {
    const rt = this.scene.add.renderTexture(box.x, box.y, Math.ceil(box.w), Math.ceil(box.h))
      .setOrigin(0).setDepth(depth)
    rt.draw(g, -box.x, -box.y)
    g.destroy()
    return rt
  }

  offList() {
    return this.scene.make.graphics({ x: 0, y: 0, add: false })
  }

  drawGround() {
    const s = this.scene

    makeGrassTexture(s)

    // One tiled sprite rather than thousands of blades in the display list.
    s.add.tileSprite(0, 0, WORLD.width, WORLD.height, 'field-grass')
      .setOrigin(0).setDepth(-100)

    this.drawMeadowPatches()
    this.drawTrampledCentre()
    this.drawScatter()
    this.drawHedgeBorder()
  }

  /** Broad colour variation so the field is not one flat green. */
  drawMeadowPatches() {
    const rng = new Phaser.Math.RandomDataGenerator(['lunacia-patches'])
    const g = this.offList()

    for (let i = 0; i < 46; i++) {
      const x = rng.between(0, WORLD.width)
      const y = rng.between(0, WORLD.height)
      const rx = rng.between(150, 460)
      const ry = rng.between(90, 300)
      g.fillStyle(rng.pick([FIELD.grassLight, FIELD.grassDeep, FIELD.grassPale]), rng.realInRange(0.1, 0.24))
      g.fillEllipse(x, y, rx, ry)
    }
    this.stamp(g)
  }

  /** Worn dirt where the fighting happens, so the centre reads as an arena. */
  drawTrampledCentre() {
    const rng = new Phaser.Math.RandomDataGenerator(['lunacia-ring'])
    const g = this.offList()

    g.fillStyle(FIELD.dirt, 0.5)
    g.fillEllipse(this.cx, this.cy, 760, 560)
    g.fillStyle(FIELD.dirtDark, 0.28)
    g.fillEllipse(this.cx, this.cy, 610, 430)

    // Ragged edge, so the patch is not a clean ellipse.
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2
      g.fillStyle(FIELD.dirt, rng.realInRange(0.18, 0.42))
      g.fillEllipse(
        this.cx + Math.cos(a) * rng.between(330, 410),
        this.cy + Math.sin(a) * rng.between(240, 300),
        rng.between(60, 150), rng.between(40, 100),
      )
    }

    g.fillStyle(FIELD.dirtDark, 0.22)
    g.fillEllipse(this.cx, this.cy, 320, 230)
    this.stamp(g)
  }

  /** Tufts, stones and wildflowers, baked into one texture. */
  drawScatter() {
    const rng = new Phaser.Math.RandomDataGenerator(['lunacia-scatter'])
    // All 900 items go into one Graphics at their world positions and are
    // stamped in a single draw. One draw per item made 900 separate render
    // passes into the ground texture on the first frame, a multi-second hitch
    // on weak GPUs and software rendering.
    const brush = this.offList()

    for (let i = 0; i < 900; i++) {
      const x = rng.between(20, WORLD.width - 20)
      const y = rng.between(20, WORLD.height - 20)
      if (this.wallAt(x, y, 26)) continue

      const roll = rng.frac()
      // Items were authored around a local (20, 20) origin; shift to world.
      brush.save()
      brush.translateCanvas(x - 20, y - 20)

      if (roll < 0.62) {
        // Grass tuft: a few blades fanning from one point.
        const dark = rng.frac() < 0.45
        brush.lineStyle(2, dark ? FIELD.grassShadow : FIELD.grassPale, rng.realInRange(0.35, 0.7))
        const blades = rng.between(3, 5)
        for (let b = 0; b < blades; b++) {
          const lean = rng.realInRange(-7, 7)
          const h = rng.between(7, 15)
          brush.beginPath()
          brush.moveTo(20 + b * 3 - blades, 20)
          brush.lineTo(20 + b * 3 - blades + lean, 20 - h)
          brush.strokePath()
        }
      } else if (roll < 0.82) {
        // Wildflower.
        const c = rng.pick([FIELD.bloomWhite, FIELD.bloomGold, FIELD.bloomPink])
        brush.lineStyle(1, FIELD.grassShadow, 0.5)
        brush.lineBetween(20, 20, 20, 14)
        brush.fillStyle(c, 0.9)
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2
          brush.fillCircle(20 + Math.cos(a) * 2.2, 13 + Math.sin(a) * 2.2, 1.5)
        }
        brush.fillStyle(FIELD.bloomGold, 1).fillCircle(20, 13, 1.2)
      } else {
        // Small stone.
        const r = rng.between(3, 7)
        brush.fillStyle(0x000000, 0.18).fillEllipse(20, 22, r * 2.2, r)
        brush.fillStyle(FIELD.stoneFace, 0.95).fillEllipse(20, 20, r * 2, r * 1.4)
        brush.fillStyle(FIELD.stoneTop, 0.8).fillEllipse(20, 19, r * 1.2, r * 0.7)
      }

      brush.restore()
    }

    this.stamp(brush)
  }

  /** A hedge ring instead of a glowing line: the field has an edge you can see. */
  drawHedgeBorder() {
    const rng = new Phaser.Math.RandomDataGenerator(['lunacia-hedge'])
    const g = this.offList()
    const b = this.bounds
    const inset = 36

    const ring = []
    const stepX = 74
    const stepY = 74
    for (let x = b.left - inset; x <= b.right + inset; x += stepX) {
      ring.push({ x, y: b.top - inset })
      ring.push({ x, y: b.bottom + inset })
    }
    for (let y = b.top - inset; y <= b.bottom + inset; y += stepY) {
      ring.push({ x: b.left - inset, y })
      ring.push({ x: b.right + inset, y })
    }

    for (const p of ring) {
      const w = rng.between(78, 118)
      const h = rng.between(56, 84)
      g.fillStyle(0x000000, 0.22)
      g.fillEllipse(p.x + 5, p.y + 12, w, h * 0.7)
      g.fillStyle(FIELD.hedge, 1)
      g.fillEllipse(p.x, p.y, w, h)
      g.fillStyle(FIELD.hedgeLight, 0.55)
      g.fillEllipse(p.x - w * 0.12, p.y - h * 0.2, w * 0.6, h * 0.45)
    }
    this.stamp(g)
  }

  /**
   * Blocks are drawn per wall and depth-sorted by their base, so an Axie can
   * stand behind one and be occluded by it.
   */
  drawWalls() {
    const lift = 16          // fake height, drawn as an offset top face
    const radius = 9

    for (const w of this.walls) {
      const g = this.offList()

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

      const pad = 16
      this.bake(g, {
        x: w.left - pad, y: w.top - lift - pad,
        w: w.w + pad * 2, h: w.h + lift + pad * 2,
      }, w.bottom)
    }
  }

  drawBushBases() {
    const g = this.offList()
    for (const b of this.bushes) {
      g.fillStyle(0x000000, 0.2)
      g.fillEllipse(b.x + 6, b.y + 14, b.rx * 2, b.ry * 1.5)
    }
    this.stamp(g)
  }

  /** Drawn above the fighters, so standing in one half-hides you. */
  drawBushCanopies() {
    const rng = new Phaser.Math.RandomDataGenerator(['axie-bush'])
    for (const b of this.bushes) {
      const g = this.offList()
      g.fillStyle(FIELD.hedge, 0.72)
      g.fillEllipse(b.x, b.y, b.rx * 2, b.ry * 2)
      for (let i = 0; i < 18; i++) {
        const a = rng.realInRange(0, Math.PI * 2)
        const d = rng.realInRange(0.25, 0.95)
        g.fillStyle(rng.pick([FIELD.hedgeLight, FIELD.hedge, 0x63b356]), 0.6)
        g.fillEllipse(
          b.x + Math.cos(a) * b.rx * d,
          b.y + Math.sin(a) * b.ry * d,
          rng.between(30, 62), rng.between(20, 38),
        )
      }

      this.bake(g, {
        x: b.x - b.rx - 40, y: b.y - b.ry - 30,
        w: (b.rx + 40) * 2, h: (b.ry + 30) * 2,
      }, b.y + b.ry + 40)
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

/**
 * Builds the tiling grass texture once. Exported so the front end can stand on
 * the same field the game is played on.
 *
 * Elements that cross an edge are drawn again on the opposite side, so the
 * tile repeats without visible seams.
 */
export function makeGrassTexture(scene) {
  if (scene.textures.exists('field-grass')) return

  const size = GRASS_TILE
  const rng = new Phaser.Math.RandomDataGenerator(['lunacia-grass'])
  const g = scene.make.graphics({ x: 0, y: 0, add: false })

  g.fillStyle(FIELD.grassBase, 1).fillRect(0, 0, size, size)

  const wrapped = (x, y, draw) => {
    for (const dx of [0, -size, size]) {
      for (const dy of [0, -size, size]) draw(x + dx, y + dy)
    }
  }

  // Mottling, so the base is never a flat colour.
  for (let i = 0; i < 150; i++) {
    const x = rng.between(0, size)
    const y = rng.between(0, size)
    const rx = rng.between(26, 90)
    const ry = rng.between(18, 60)
    const c = rng.pick([FIELD.grassLight, FIELD.grassDeep, FIELD.grassPale, FIELD.grassShadow])
    g.fillStyle(c, rng.realInRange(0.06, 0.16))
    wrapped(x, y, (px, py) => g.fillEllipse(px, py, rx, ry))
  }

  // Fine blades for texture at close range.
  for (let i = 0; i < 520; i++) {
    const x = rng.between(0, size)
    const y = rng.between(0, size)
    const h = rng.between(4, 9)
    const lean = rng.realInRange(-3, 3)
    g.lineStyle(1, rng.pick([FIELD.grassDeep, FIELD.grassPale, FIELD.grassShadow]), rng.realInRange(0.2, 0.45))
    wrapped(x, y, (px, py) => {
      g.beginPath()
      g.moveTo(px, py)
      g.lineTo(px + lean, py - h)
      g.strokePath()
    })
  }

  g.generateTexture('field-grass', size, size)
  g.destroy()
}
