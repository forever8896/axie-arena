/**
 * Video in, sprite sheet out.
 *
 * dot-arena did this by hand: key the green with ffmpeg, eyeball the PNGs, pick
 * the good range. The eyeballing stays — a generated clip always has a dead
 * moment at one end — but everything around it is done here, because a hundred
 * loose PNGs per animation is a lot of files for a game to load.
 *
 * The green is sampled from the clip rather than assumed: the generator does not
 * return the exact green it was asked for, and keying the wrong one silently
 * eats the character's own colours.
 *
 * Usage:
 *   node scripts/ronke/cut-frames.mjs idle --fps 20
 *   node scripts/ronke/cut-frames.mjs punch --fps 24 --from 0.4 --to 2.0
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, readdirSync, writeFileSync } from 'node:fs'

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28 })

const who = process.argv[2]
const name = process.argv[3]
if (!who || !name) {
  console.error('Usage: node scripts/ronke/cut-frames.mjs <fighter> <clip> [--fps 20] [--from s] [--to s] [--height 220]')
  process.exit(1)
}
const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i > 0 ? Number(process.argv[i + 1]) : fallback
}
const fps = arg('--fps', 20)
const height = arg('--height', 220)
const from = arg('--from', null)
const to = arg('--to', null)
/**
 * A crop box shared with the other clips, as x0,y0,x1,y1.
 *
 * Without one each animation is trimmed to its own content, so the fighter
 * changes size and jumps sideways the moment he stops punching. cut-all.mjs
 * measures every clip first and passes the union here.
 */
const boxArg = (() => {
  const i = process.argv.indexOf('--box')
  if (i < 0) return null
  const [x0, y0, x1, y1] = process.argv[i + 1].split(',').map(Number)
  return { x0, y0, x1, y1 }
})()
/** Measure and print the box, then stop — the first pass of cut-all.mjs. */
const measureOnly = process.argv.includes('--measure')
/**
 * Where his feet sit inside the shared box, as a fraction of its height.
 *
 * The box has to hold the widest moment of every animation — the rice lands
 * well below where he stands — so its bottom edge is not the ground. Anchoring
 * a sprite to the bottom of the frame would float him above his own shadow, so
 * the ground line is measured once from the idle and carried into every sheet.
 */
const originY = arg('--originy', 1)

const src = `art/clips/${who}/${name}.mp4`
const work = `art/work/${who}-${name}`
rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })

// What the clip actually is, rather than what was ordered.
const probe = JSON.parse(sh('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'stream=width,height,r_frame_rate,nb_frames', '-show_entries', 'format=duration',
  '-of', 'json', src]))
const st = probe.streams[0]
console.log(`${who}/${name}: ${st.width}x${st.height} ${st.r_frame_rate} ${Number(probe.format.duration).toFixed(1)}s`)

// The key colour, read out of the top-left corner of the first frame.
sh('ffmpeg', ['-v', 'error', '-y', '-i', src, '-frames:v', '1', `${work}/probe.png`])
const rgb = sh('magick', [`${work}/probe.png`, '-format', '%[pixel:p{6,6}]', 'info:'])
const [r, g, b] = (rgb.match(/\d+/g) ?? []).map(Number)
const hex = `0x${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
console.log(`  keying ${hex} (sampled, not assumed)`)

// Key it, kill the green fringe the key leaves behind, and thin to the frame
// rate the game will actually play.
const trim = [...(from != null ? ['-ss', String(from)] : []), ...(to != null ? ['-to', String(to)] : [])]
sh('ffmpeg', ['-v', 'error', '-y', ...trim, '-i', src,
  '-vf', `fps=${fps},colorkey=${hex}:0.26:0.10,despill=type=green:mix=0.6:expand=0.3,format=rgba`,
  `${work}/f_%04d.png`])
const frames = readdirSync(work).filter(f => /^f_\d+\.png$/.test(f)).sort()
if (!frames.length) throw new Error('no frames came out')

// One box that holds the character in every frame, so he does not jitter or
// change size between frames once they are packed.
let box = boxArg
for (const f of boxArg ? [] : frames) {
  const t = sh('magick', [`${work}/${f}`, '-alpha', 'extract', '-format', '%@', 'info:']).trim()
  const m = t.match(/(\d+)x(\d+)\+(\d+)\+(\d+)/)
  if (!m) continue
  const [w, h, x, y] = m.slice(1).map(Number)
  box = box
    ? { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x + w), y1: Math.max(box.y1, y + h) }
    : { x0: x, y0: y, x1: x + w, y1: y + h }
}
if (!boxArg) {
  const pad = 6
  box = {
    x0: Math.max(0, box.x0 - pad), y0: Math.max(0, box.y0 - pad),
    x1: Math.min(st.width, box.x1 + pad), y1: Math.min(st.height, box.y1 + pad),
  }
}
if (measureOnly) {
  console.log(`BOX ${box.x0},${box.y0},${box.x1},${box.y1}`)
  process.exit(0)
}
const cw = box.x1 - box.x0
const ch = box.y1 - box.y0
const scale = height / ch
const fw = Math.round(cw * scale)
console.log(`  ${frames.length} frames, trimmed to ${cw}x${ch} → ${fw}x${height}`)

// Packed into one strip: a single texture the game loads once.
const cols = Math.min(frames.length, 10)
const rows = Math.ceil(frames.length / cols)
mkdirSync(`public/sprites/${who}`, { recursive: true })
sh('ffmpeg', ['-v', 'error', '-y', '-framerate', String(fps), '-i', `${work}/f_%04d.png`,
  '-vf', `crop=${cw}:${ch}:${box.x0}:${box.y0},scale=${fw}:${height}:flags=lanczos,tile=${cols}x${rows}`,
  '-frames:v', '1', `public/sprites/${who}/${name}.png`])

writeFileSync(`public/sprites/${who}/${name}.json`, JSON.stringify({
  frameWidth: fw, frameHeight: height, frames: frames.length, columns: cols, rows, fps,
  originY: Math.round(originY * 1000) / 1000,
}, null, 2) + '\n')
console.log(`  public/sprites/${who}/${name}.png  (${cols}x${rows} grid, ${fps}fps)`)
