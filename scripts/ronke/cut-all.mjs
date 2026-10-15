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

/** Each fighter's clips: the window worth keeping and the rate to play it at.
 *
 * Every window here was wrong once. The generated clips stand around before
 * they act — the punch waits more than two seconds — so a window picked from
 * the start of a file is a sheet of a man doing nothing. Use peek.mjs, which
 * spans the whole clip, before changing any of these.
 */
const FIGHTERS = {
  ronke: [
    { name: 'idle', fps: 14, from: 1.0, to: 2.8 },
    { name: 'run', fps: 18, from: 1.0, to: 2.2 },
    // The generated clip stands around for two seconds before it swings; the
    // window is the swing itself, or the sheet is mostly a man standing still.
    { name: 'punch', fps: 24, from: 2.35, to: 3.05 },
    { name: 'vomit', fps: 20, from: 0.25, to: 2.1 },
    { name: 'hurt', fps: 22, from: 0.95, to: 1.85 },
    { name: 'guard', fps: 16, from: 0.5, to: 1.9 },
  ],
  ronka: [
    { name: 'idle', fps: 14, from: 1.0, to: 2.8 },
    { name: 'run', fps: 18, from: 1.0, to: 2.2 },
    { name: 'bite', fps: 24, from: 0.5, to: 1.5 },
    { name: 'heart', fps: 20, from: 0.5, to: 2.1 },
    { name: 'hurt', fps: 22, from: 0.8, to: 1.8 },
    { name: 'guard', fps: 16, from: 0.6, to: 1.9 },
  ],
  horske: [
    { name: 'idle', fps: 14, from: 1.0, to: 2.8 },
    { name: 'charge', fps: 22, from: 0.7, to: 2.1 },
    { name: 'trample', fps: 22, from: 0.6, to: 1.9 },
    { name: 'hurt', fps: 22, from: 0.6, to: 1.6 },
    { name: 'guard', fps: 16, from: 0.6, to: 1.9 },
  ],
}

const who = process.argv[2]
const CLIPS = FIGHTERS[who]
if (!CLIPS) {
  console.error(`Usage: node scripts/ronke/cut-all.mjs <${Object.keys(FIGHTERS).join('|')}>`)
  process.exit(1)
}

const cut = (c, extra = []) => execFileSync('node', [
  'scripts/ronke/cut-frames.mjs', who, c.name,
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
