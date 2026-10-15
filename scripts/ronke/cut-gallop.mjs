/**
 * Horske's run, from the racing game's own sprite sheet.
 *
 * This one animation is not generated and never should be: the Horske racer
 * already ships an eight-frame gallop, drawn by hand, and it is the real
 * article. All this does is re-pack it to the geometry the other Horske sheets
 * use, because a run that is a different size or sits at a different height
 * makes him jump the moment he starts moving.
 *
 * Usage: node scripts/ronke/cut-gallop.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'

const SRC = 'art/ref/horske-gallop.png'
const COLS = 4
const ROWS = 2
const WORK = 'art/work/horske-gallop'
const OUT = 'public/sprites/horske'

// Match whatever the generated sheets settled on, so he is one size throughout.
const idle = JSON.parse(readFileSync(`${OUT}/idle.json`, 'utf8'))
const { frameWidth: fw, frameHeight: fh, originY } = idle
const groundY = Math.round(fh * originY)

rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })

const { width, height } = JSON.parse(execFileSync('magick', [SRC, '-format',
  '{"width":%w,"height":%h}', 'info:'], { encoding: 'utf8' }))
const cw = width / COLS
const ch = height / ROWS
console.log(`${SRC}: ${width}x${height}, ${COLS}x${ROWS} frames of ${cw}x${ch}`)

const frames = []
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const f = `${WORK}/g_${String(frames.length).padStart(2, '0')}.png`
    execFileSync('magick', [SRC, '-crop', `${cw}x${ch}+${c * cw}+${r * ch}`, '+repage',
      // Pixel art: point sampling on the way up, or the hard edges turn to soup.
      '-trim', '+repage', '-filter', 'point', '-resize', `${fw - 12}x${groundY - 8}`,
      '-background', 'none', '-gravity', 'south',
      '-extent', `${fw}x${groundY}`,
      '-background', 'none', '-gravity', 'north', '-extent', `${fw}x${fh}`,
      f])
    frames.push(f)
  }
}

execFileSync('magick', ['montage', ...frames, '-tile', `${frames.length}x1`,
  '-geometry', `${fw}x${fh}+0+0`, '-background', 'none', `${OUT}/run.png`])
writeFileSync(`${OUT}/run.json`, JSON.stringify({
  frameWidth: fw, frameHeight: fh, frames: frames.length,
  columns: frames.length, rows: 1, fps: 14, originY,
}, null, 2) + '\n')
rmSync(WORK, { recursive: true, force: true })
console.log(`${OUT}/run.png  ${frames.length} frames of ${fw}x${fh}, ground at ${groundY}`)
