/**
 * Arena geometry, as plain data so it can be verified without the engine
 * (scripts/check-terrain.mjs).
 *
 * Rule: two pieces of cover either join solidly or leave a gap an Axie fits
 * through with room to spare. The first layout had corners 24–47px apart and
 * walls 17–20px from the border: they read as passages, and an Axie 60px
 * wide stuck in them.
 */

export const WORLD = { width: 2400, height: 1800 }
export const BOUNDS = { left: 70, top: 96, right: WORLD.width - 70, bottom: WORLD.height - 70 }

/** Fighter body radius; passages are sized against it. */
export const BODY_RADIUS = 30
/** Narrowest opening allowed between two pieces of cover, or cover and edge. */
export const MIN_GAP = 100

/**
 * Mirrors a quadrant on both axes so no spawn corner is safer than another.
 * A piece on an axis is mirrored once, not stacked on itself.
 */
function mirrored(quadrant) {
  const out = []
  const key = w => `${w.x},${w.y},${w.w ?? w.rx},${w.h ?? w.ry}`
  const seen = new Set()
  for (const w of quadrant) {
    for (const m of [{ ...w }, { ...w, x: -w.x }, { ...w, y: -w.y }, { ...w, x: -w.x, y: -w.y }]) {
      if (seen.has(key(m))) continue
      seen.add(key(m))
      out.push(m)
    }
  }
  return out
}

/** Centre-relative cover. */
export const WALLS = mirrored([
  { x: 0, y: 250, w: 220, h: 46 },
  { x: 300, y: 0, w: 46, h: 200 },
  // An open corner: a clear diagonal passage between these two.
  { x: 540, y: 400, w: 240, h: 46 },
  { x: 760, y: 190, w: 46, h: 220 },
  // A zigzag joined solidly to the wall above: down, then along.
  { x: 430, y: 520, w: 46, h: 240 },
  { x: 300, y: 660, w: 240, h: 46 },
  // Near the edges, kept a full passage away from the border.
  { x: 900, y: 680, w: 240, h: 46 },
  { x: 995, y: 430, w: 46, h: 240 },
])

/** Soft cover: you can stand in it, and you are harder to see and to target. */
export const BUSHES = mirrored([
  { x: 180, y: 470, rx: 130, ry: 84 },
  { x: 650, y: 90, rx: 112, ry: 74 },
  { x: 720, y: 600, rx: 120, ry: 80 },
  { x: 560, y: 820, rx: 120, ry: 70 },
])

/** World-space rectangles for every wall. */
export function worldWalls() {
  const cx = WORLD.width / 2
  const cy = WORLD.height / 2
  return WALLS.map(w => ({
    x: cx + w.x, y: cy + w.y, w: w.w, h: w.h,
    left: cx + w.x - w.w / 2, right: cx + w.x + w.w / 2,
    top: cy + w.y - w.h / 2, bottom: cy + w.y + w.h / 2,
  }))
}

export function worldBushes() {
  const cx = WORLD.width / 2
  const cy = WORLD.height / 2
  return BUSHES.map(b => ({ x: cx + b.x, y: cy + b.y, rx: b.rx, ry: b.ry }))
}
