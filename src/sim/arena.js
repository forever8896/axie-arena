import { WORLD, BOUNDS, worldWalls, worldBushes } from '../arena/layout.js'
import { clamp, distance } from './math.js'

/**
 * The field as the simulation sees it: blocks to walk around and bushes to
 * hide in. The drawing of it lives in src/arena/Arena.js; this is the part the
 * server has to agree with the client about.
 */
export default class SimArena {
  constructor() {
    this.walls = worldWalls()
    this.bushes = worldBushes()
    this.bounds = { ...BOUNDS }
    this.cx = WORLD.width / 2
    this.cy = WORLD.height / 2
  }

  wallAt(x, y, pad = 0) {
    return this.walls.some(w =>
      x > w.left - pad && x < w.right + pad && y > w.top - pad && y < w.bottom + pad)
  }

  inBush(x, y) {
    return this.bushes.some(b => ((x - b.x) / b.rx) ** 2 + ((y - b.y) / b.ry) ** 2 <= 1)
  }

  clampToBounds(pos) {
    pos.x = clamp(pos.x, this.bounds.left, this.bounds.right)
    pos.y = clamp(pos.y, this.bounds.top, this.bounds.bottom)
  }

  /**
   * Pushes a circle out of any block it overlaps, along whichever axis needs
   * the smaller correction, so sliding along a wall feels natural.
   */
  resolveCircle(pos, radius) {
    if (!Number.isFinite(radius) || radius <= 0) return

    for (const w of this.walls) {
      const nearestX = clamp(pos.x, w.left, w.right)
      const nearestY = clamp(pos.y, w.top, w.bottom)
      const dx = pos.x - nearestX
      const dy = pos.y - nearestY
      if (dx * dx + dy * dy >= radius * radius) continue

      if (dx === 0 && dy === 0) {
        // Centre inside the block: eject the short way out.
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

  /** Free ground, away from cover and from everyone listed. */
  openSpot(rng, { clearance = 60, away = [], minAway = 160, score } = {}) {
    let best = null
    let bestScore = -Infinity
    for (let i = 0; i < 40; i++) {
      const x = rng.float(this.bounds.left + clearance, this.bounds.right - clearance)
      const y = rng.float(this.bounds.top + clearance, this.bounds.bottom - clearance)
      if (this.wallAt(x, y, clearance) || this.inBush(x, y)) continue
      let s = rng.float(0, 60)
      for (const f of away) {
        if (distance(x, y, f.x, f.y) < minAway) s -= 400
      }
      if (score) s += score(x, y)
      if (s > bestScore) {
        bestScore = s
        best = { x, y }
      }
    }
    return best ?? { x: this.cx, y: this.cy }
  }
}

export { WORLD, BOUNDS }
