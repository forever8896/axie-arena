/**
 * Cut every clip against one shared crop box.
 *
 * Trimming each animation to its own content is what makes a sprite hop: the
 * punch's box is wider than the idle's, so the body lands somewhere else in the
 * frame and the fighter twitches sideways the moment he swings. Measuring all
 * of them first and cropping them all the same way costs one extra pass and
 * removes the whole class of problem.
 *
 * Usage: node scripts/ronke/cut-all.mjs
 */
import { execFileSync } from 'node:child_process'

/** Each clip with the window worth keeping and the rate it should play at. */
const CLIPS = [
  { name: 'idle', fps: 14, from: 1.0, to: 2.8 },
  { name: 'run', fps: 18, from: 1.0, to: 2.2 },
  { name: 'punch', fps: 22, from: 0.6, to: 2.2 },
  { name: 'vomit', fps: 20, from: 1.0, to: 3.4 },
  { name: 'hurt', fps: 22, from: 0.4, to: 1.7 },
  { name: 'guard', fps: 14, from: 0.8, to: 2.4 },
]

const cut = (c, extra = []) => execFileSync('node', [
  'scripts/ronke/cut-frames.mjs', c.name,
  '--fps', String(c.fps), '--from', String(c.from), '--to', String(c.to), ...extra,
], { encoding: 'utf8' })

console.log('measuring…')
let box = null
const boxes = {}
for (const c of CLIPS) {
  const m = cut(c, ['--measure']).match(/BOX (\d+),(\d+),(\d+),(\d+)/)
  if (!m) throw new Error(`${c.name}: nothing measured`)
  const [x0, y0, x1, y1] = m.slice(1).map(Number)
  console.log(`  ${c.name.padEnd(6)} ${x0},${y0} → ${x1},${y1}`)
  boxes[c.name] = { x0, y0, x1, y1 }
  box = box ? {
    x0: Math.min(box.x0, x0), y0: Math.min(box.y0, y0),
    x1: Math.max(box.x1, x1), y1: Math.max(box.y1, y1),
  } : { x0, y0, x1, y1 }
}
const shared = `${box.x0},${box.y0},${box.x1},${box.y1}`
// The ground line, taken from the idle: where he stands when he is doing
// nothing is where he stands, whatever the rice does afterwards.
const idle = boxes.idle
const originY = (idle.y1 - box.y0) / (box.y1 - box.y0)
console.log(`shared box ${shared}  (${box.x1 - box.x0}x${box.y1 - box.y0})`)
console.log(`ground line at ${(originY * 100).toFixed(1)}% of frame height\n`)

for (const c of CLIPS) {
  process.stdout.write(cut(c, ['--box', shared, '--originy', String(originY)]))
}
