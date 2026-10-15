import Phaser from 'phaser'
import { FIELD } from '../game/palette.js'

import { WORLD, BOUNDS, worldWalls, worldBushes } from './layout.js'
import { paintBush } from './Foliage.js'
import { ensureTexture as ensureSoftTexture } from './Moonwell.js'

export { WORLD }

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

export default class Arena {
  constructor(scene) {
    this.scene = scene
    this.cx = WORLD.width / 2
    this.cy = WORLD.height / 2

    // Layout is authored around the centre; store it in world coordinates.
    // Geometry lives in layout.js, where scripts/check-terrain.mjs verifies it.
    this.walls = worldWalls()
    this.bushes = worldBushes()
    this.bounds = { ...BOUNDS }
    this.canopies = []
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
  /**
   * A soft-edged blob stamped into the ground. Hard-edged ellipses, even faint
   * ones, read as flat circles on the grass; a radial falloff reads as light
   * and wear.
   */
  softBlob(x, y, w, h, color, alpha) {
    const img = this.scene.make.image({ x, y, key: 'fx-moonwell', add: false })
    img.setTint(color).setDisplaySize(w, h).setAlpha(alpha)
    this.ground.draw(img)
    img.destroy()
  }

  drawMeadowPatches() {
    ensureSoftTexture(this.scene)
    const rng = new Phaser.Math.RandomDataGenerator(['lunacia-patches'])
    for (let i = 0; i < 46; i++) {
      this.softBlob(
        rng.between(0, WORLD.width), rng.between(0, WORLD.height),
        rng.between(260, 700), rng.between(180, 460),
        rng.pick([FIELD.grassLight, FIELD.grassDeep, FIELD.grassPale]), rng.realInRange(0.18, 0.34),
      )
    }
  }

  /** Worn dirt where the fighting happens, so the centre reads as an arena. */
  drawTrampledCentre() {
    const rng = new Phaser.Math.RandomDataGenerator(['lunacia-ring'])
    this.softBlob(this.cx, this.cy, 980, 720, FIELD.dirt, 0.55)
    // Irregular wear toward the edges, so the patch has no clean outline.
    for (let i = 0; i < 26; i++) {
      const a = rng.realInRange(0, Math.PI * 2)
      const d = rng.realInRange(0.35, 0.8)
      this.softBlob(
        this.cx + Math.cos(a) * 420 * d, this.cy + Math.sin(a) * 300 * d,
        rng.between(160, 320), rng.between(110, 220),
        rng.pick([FIELD.dirt, FIELD.dirtDark]), rng.realInRange(0.18, 0.4),
      )
    }
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
        // Reed, not grass: the water is nearly the colour of its own shadow,
        // so a tuft drawn in the ground's palette disappears into it.
        const dark = rng.frac() < 0.45
        brush.lineStyle(2, dark ? FIELD.hedge : FIELD.hedgeLight, rng.realInRange(0.55, 0.9))
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
        brush.lineStyle(1, FIELD.hedge, 0.6)
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

  /**
   * A hedge ring instead of a glowing line: the field has an edge you can see.
   * Painted clumps in the same style as the bushes, stamped into the ground.
   */
  drawHedgeBorder() {
    const s = this.scene
    const rng = new Phaser.Math.RandomDataGenerator(['lunacia-hedge'])
    const b = this.bounds
    const inset = 40
    const variants = [0, 1, 2, 3].map(i => paintBush(s, `hedge-${i}`, 54 + i * 4, 38 + i * 2, { seed: `hedge-${i}`, flowers: i % 2 }))

    const ring = []
    const step = 82
    for (let x = b.left - inset; x <= b.right + inset; x += step) {
      ring.push({ x: x + rng.between(-10, 10), y: b.top - inset + rng.between(-6, 6) })
      ring.push({ x: x + rng.between(-10, 10), y: b.bottom + inset + rng.between(-6, 6) })
    }
    for (let y = b.top - inset; y <= b.bottom + inset; y += step) {
      ring.push({ x: b.left - inset + rng.between(-6, 6), y: y + rng.between(-10, 10) })
      ring.push({ x: b.right + inset + rng.between(-6, 6), y: y + rng.between(-10, 10) })
    }
    ring.sort((p, q) => p.y - q.y)
    for (const p of ring) {
      const img = s.make.image({ x: p.x, y: p.y, key: rng.pick(variants), add: false })
      img.setScale(rng.realInRange(0.9, 1.15))
      this.ground.draw(img)
      img.destroy()
    }
  }

  /**
   * Blocks are drawn per wall and depth-sorted by their base, so a Ronke can
   * stand behind one and be occluded by it.
   */
  drawWalls() {
    const lift = 16          // fake height, drawn as an offset top face
    const radius = 9

    for (const w of this.walls) {
      const g = this.offList()

      // The bank sits in water, so its shadow spreads and softens rather
      // than sitting hard under it.
      g.fillStyle(0x060b1c, 0.4)
      g.fillRoundedRect(w.left + 4, w.top + 12, w.w + 4, w.h, radius)
      g.fillStyle(0x060b1c, 0.22)
      g.fillRoundedRect(w.left - 3, w.top + 6, w.w + 10, w.h + 10, radius + 4)

      // Wet stone face, below the waterline.
      g.fillStyle(WALL.side, 1)
      g.fillRoundedRect(w.left, w.top - lift + 6, w.w, w.h + lift, radius)

      // The dry top of the bank, lifted, where you would walk.
      g.fillStyle(WALL.face, 1)
      g.fillRoundedRect(w.left, w.top - lift, w.w, w.h, radius)

      // Packed earth along the crown, so the bank reads as built rather than
      // dropped: the one warm note against all that blue.
      g.fillStyle(FIELD.dirt, 0.5)
      g.fillRoundedRect(w.left + 3, w.top - lift + 3, w.w - 6, Math.max(4, w.h * 0.34), radius)
      g.fillStyle(FIELD.dirtDark, 0.28)
      g.fillRoundedRect(w.left + 3, w.top - lift + Math.max(5, w.h * 0.3), w.w - 6, 3, 2)

      // Moonlight on the top and leading edges.
      g.fillStyle(WALL.top, 0.9)
      g.fillRoundedRect(w.left, w.top - lift, w.w, 5, radius)
      g.fillStyle(WALL.top, 0.35)
      g.fillRoundedRect(w.left, w.top - lift, 5, w.h, radius)

      // The waterline itself: a bright band where the bank enters the paddy.
      g.fillStyle(FIELD.stoneEdge, 0.3)
      g.fillRoundedRect(w.left + 2, w.bottom - 7, w.w - 4, 3, 2)
      g.fillStyle(0x060b1c, 0.3)
      g.fillRoundedRect(w.left, w.bottom - 4, w.w, 8, radius)

      // Rim so blocks read against the dark floor.
      g.lineStyle(1, WALL.edge, 0.5)
      g.strokeRoundedRect(w.left, w.top - lift, w.w, w.h, radius)

      // A dark outline around the whole bank, as Ronkes and reeds have.
      g.lineStyle(3, 0x0a1426, 0.9)
      g.strokeRoundedRect(w.left, w.top - lift, w.w, w.h + lift, radius)

      // A tuft or two of reed growing out of the bank where silt collects,
      // never evenly spaced. These were bright meadow moss and were the last
      // green left in the world.
      const tuftRng = new Phaser.Math.RandomDataGenerator([`reed-${w.left}-${w.top}`])
      const clumps = tuftRng.between(1, 2)
      for (let m = 0; m < clumps; m++) {
        const along = tuftRng.realInRange(0.12, 0.88)
        const mx = w.w >= w.h ? w.left + w.w * along : w.left + tuftRng.realInRange(8, w.w - 8)
        const my = w.w >= w.h ? w.top - lift + tuftRng.realInRange(4, w.h * 0.5) : w.top - lift + w.h * along
        const blades = tuftRng.between(4, 6)
        for (let i = 0; i < blades; i++) {
          const lean = tuftRng.realInRange(-9, 9)
          const tall = tuftRng.realInRange(11, 20)
          g.lineStyle(4.5, 0x0c1a16, 0.9)
          g.beginPath()
          g.moveTo(mx + lean * 0.3, my)
          g.lineTo(mx + lean, my - tall)
          g.strokePath()
          g.lineStyle(2.2, FIELD.hedgeLight, 0.95)
          g.beginPath()
          g.moveTo(mx + lean * 0.3, my)
          g.lineTo(mx + lean, my - tall)
          g.strokePath()
        }
      }

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

  /** Drawn above the fighters, so standing in one hides you. */
  drawBushCanopies() {
    this.bushes.forEach((b, i) => {
      const key = paintBush(this.scene, `bush-${i}-${b.rx}x${b.ry}`, b.rx, b.ry, { seed: `ronke-bush-${i}`, shadow: false })
      const image = this.scene.add.image(b.x, b.y, key).setDepth(b.y + b.ry + 40)
      this.canopies.push({ bush: b, image })
    })
  }

  /**
   * The bush you are standing in turns see-through, for you only, so you can
   * still see yourself and what is inside with you. Everyone else's stays solid.
   */
  updateCanopies(player) {
    for (const c of this.canopies) {
      const b = c.bush
      const inside = player?.alive && ((player.x - b.x) / b.rx) ** 2 + ((player.y - b.y) / b.ry) ** 2 <= 1.15
      const target = inside ? 0.42 : 1
      c.image.alpha += (target - c.image.alpha) * 0.2
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
/**
 * The paddy floor: standing water over mud, with the moon on it.
 *
 * It keeps the name the rest of the game calls it by. What it paints is no
 * longer grass — mottled depth, the straight banding a flooded terrace gets
 * from its own ridges, a drift of floating rice, and a few still highlights
 * where the light sits on the surface.
 */
export function makeGrassTexture(scene) {
  if (scene.textures.exists('field-grass')) return

  const size = GRASS_TILE
  const rng = new Phaser.Math.RandomDataGenerator(['moonpetal-paddy'])
  const tex = scene.textures.createCanvas('field-grass', size, size)
  const ctx = tex.getContext()
  const css = (c, a) => `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${a})`
  const wrapped = draw => {
    for (const dx of [0, -size, size]) for (const dy of [0, -size, size]) draw(dx, dy)
  }

  ctx.fillStyle = css(FIELD.grassBase, 1)
  ctx.fillRect(0, 0, size, size)

  // Depth: broad soft pools of darker and lighter water.
  for (let i = 0; i < 58; i++) {
    const x = rng.between(0, size)
    const y = rng.between(0, size)
    const r = rng.between(30, 92)
    const c = rng.pick([FIELD.grassLight, FIELD.grassDeep, FIELD.grassShadow, FIELD.grassPale])
    const a = rng.realInRange(0.07, 0.18)
    wrapped((dx, dy) => {
      const grad = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r)
      grad.addColorStop(0, css(c, a))
      grad.addColorStop(1, css(c, 0))
      ctx.fillStyle = grad
      ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2)
    })
  }

  // The ridges a terrace is built in: long, almost straight, barely there.
  ctx.lineCap = 'round'
  for (let i = 0; i < 9; i++) {
    const y = rng.between(0, size)
    const drift = rng.realInRange(-7, 7)
    ctx.strokeStyle = css(rng.pick([FIELD.grassPale, FIELD.grassShadow]), rng.realInRange(0.08, 0.16))
    ctx.lineWidth = rng.realInRange(5, 13)
    wrapped((dx, dy) => {
      ctx.beginPath()
      ctx.moveTo(dx - 10, y + dy)
      ctx.bezierCurveTo(size * 0.3 + dx, y + dy + drift, size * 0.7 + dx, y + dy - drift, size + 10 + dx, y + dy)
      ctx.stroke()
    })
  }

  // Rice floating on the surface: short pale strokes, lying flat on the water.
  for (let i = 0; i < 150; i++) {
    const x = rng.between(0, size)
    const y = rng.between(0, size)
    const len = rng.between(3, 7)
    const a = rng.realInRange(0, Math.PI)
    ctx.strokeStyle = css(FIELD.bloomWhite, rng.realInRange(0.1, 0.26))
    ctx.lineWidth = 1.4
    wrapped((dx, dy) => {
      ctx.beginPath()
      ctx.moveTo(x + dx, y + dy)
      ctx.lineTo(x + dx + Math.cos(a) * len, y + dy + Math.sin(a) * len * 0.5)
      ctx.stroke()
    })
  }

  // Moonlight sitting still on the water.
  for (let i = 0; i < 26; i++) {
    const x = rng.between(0, size)
    const y = rng.between(0, size)
    const w = rng.between(10, 30)
    ctx.strokeStyle = css(FIELD.stoneTop, rng.realInRange(0.05, 0.13))
    ctx.lineWidth = rng.realInRange(1, 2.4)
    wrapped((dx, dy) => {
      ctx.beginPath()
      ctx.moveTo(x + dx, y + dy)
      ctx.quadraticCurveTo(x + dx + w / 2, y + dy - 2, x + dx + w, y + dy)
      ctx.stroke()
    })
  }

  tex.refresh()
}
