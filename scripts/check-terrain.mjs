#!/usr/bin/env node
/**
 * Verifies the arena layout without a browser.
 *
 * 1. Every pair of walls either overlaps (one solid piece) or is at least
 *    MIN_GAP apart, and every wall is either against the border or MIN_GAP
 *    from it. Anything in between looks like a passage and traps an Axie.
 * 2. A flood fill over the floor, at an Axie's body radius, reaches every
 *    open cell from the centre: no pocket an Axie can be spawned into or
 *    knocked into and never leave.
 *
 * Usage: node scripts/check-terrain.mjs
 */
import { worldWalls, worldBushes, BOUNDS, MIN_GAP, BODY_RADIUS, WORLD } from '../src/arena/layout.js'

const walls = worldWalls()
const failures = []

const gapBetween = (a, b) => {
  const gx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right))
  const gy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom))
  return Math.hypot(gx, gy)
}
const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

for (let i = 0; i < walls.length; i++) {
  for (let j = i + 1; j < walls.length; j++) {
    const a = walls[i]
    const b = walls[j]
    if (a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom) {
      failures.push(`walls ${i} and ${j} are the same wall twice`)
      continue
    }
    const gap = gapBetween(a, b)
    if (!overlaps(a, b) && gap < MIN_GAP) failures.push(`walls ${i} and ${j}: ${gap.toFixed(0)}px apart (min ${MIN_GAP})`)
  }
}

for (const [i, w] of walls.entries()) {
  const edges = { left: w.left - BOUNDS.left, right: BOUNDS.right - w.right, top: w.top - BOUNDS.top, bottom: BOUNDS.bottom - w.bottom }
  for (const [side, d] of Object.entries(edges)) {
    if (d > 0 && d < MIN_GAP) failures.push(`wall ${i}: ${d.toFixed(0)}px from the ${side} border (min ${MIN_GAP})`)
  }
}

// Flood fill. A cell is open if an Axie centred there overlaps no wall.
const CELL = 10
const cols = Math.floor((BOUNDS.right - BOUNDS.left) / CELL) + 1
const rows = Math.floor((BOUNDS.bottom - BOUNDS.top) / CELL) + 1
const open = new Uint8Array(cols * rows)
const blocked = (x, y) => walls.some(w => {
  const nx = Math.max(w.left, Math.min(x, w.right))
  const ny = Math.max(w.top, Math.min(y, w.bottom))
  return (x - nx) ** 2 + (y - ny) ** 2 < BODY_RADIUS ** 2
})
let openCount = 0
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    if (!blocked(BOUNDS.left + c * CELL, BOUNDS.top + r * CELL)) { open[r * cols + c] = 1; openCount++ }
  }
}
const seen = new Uint8Array(cols * rows)
const start = Math.round((WORLD.height / 2 - BOUNDS.top) / CELL) * cols + Math.round((WORLD.width / 2 - BOUNDS.left) / CELL)
const queue = [start]
seen[start] = 1
let reached = 0
while (queue.length) {
  const i = queue.pop()
  reached++
  const r = Math.floor(i / cols)
  const c = i % cols
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nr = r + dr
    const nc = c + dc
    if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue
    const n = nr * cols + nc
    if (open[n] && !seen[n]) { seen[n] = 1; queue.push(n) }
  }
}
if (!open[start]) failures.push('the centre is blocked')
if (reached < openCount) failures.push(`${openCount - reached} open cells (${((openCount - reached) * CELL * CELL / 1e4).toFixed(1)} m²) cannot be reached from the centre`)

for (const [i, b] of worldBushes().entries()) {
  if (walls.some(w => w.left < b.x + b.rx * 0.5 && b.x - b.rx * 0.5 < w.right && w.top < b.y + b.ry * 0.5 && b.y - b.ry * 0.5 < w.bottom)) {
    failures.push(`bush ${i} sits on a wall`)
  }
}

console.log(`${walls.length} walls, ${worldBushes().length} bushes, ${reached}/${openCount} open cells reachable`)
if (failures.length) {
  failures.forEach(f => console.log('FAIL ' + f))
  process.exitCode = 1
} else {
  console.log('PASS every gap is solid or at least ' + MIN_GAP + 'px, and all open floor is connected')
}
