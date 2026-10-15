/**
 * What is actually in a packed sheet, frame by frame, with the clock on it.
 *
 * Looking at a sheet tells you what was drawn. It does not tell you when each
 * frame plays, and that is where these have been going wrong: a sheet whose
 * first third is the fighter standing still spends that third of its runtime
 * doing nothing, and the game then has to rush the rest to make contact land
 * on time.
 *
 * Each frame is labelled with its index and the millisecond it plays at, so a
 * window can be judged against the timing the game actually gives it.
 *
 * Usage: node scripts/ronke/inspect.mjs ronka heart
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'

const who = process.argv[2]
const move = process.argv[3]
if (!who || !move) {
  console.error('Usage: node scripts/ronke/inspect.mjs <fighter> <move>')
  process.exit(1)
}

const dir = `public/sprites/${who}`
const meta = JSON.parse(readFileSync(`${dir}/${move}.json`, 'utf8'))
const { frameWidth: fw, frameHeight: fh, frames, columns, fps } = meta
const work = `art/work/inspect-${who}-${move}`
rmSync(work, { recursive: true, force: true })
mkdirSync(work, { recursive: true })

const per = 1000 / fps
console.log(`${who}/${move}: ${frames} frames at ${fps}fps = ${Math.round(frames * per)}ms of sheet`)

const files = []
for (let i = 0; i < frames; i++) {
  const col = i % columns
  const row = Math.floor(i / columns)
  const f = `${work}/f_${String(i).padStart(2, '0')}.png`
  execFileSync('magick', [`${dir}/${move}.png`,
    '-crop', `${fw}x${fh}+${col * fw}+${row * fh}`, '+repage',
    // Flattened onto a flat ground so transparency does not read as content.
    '-background', '#2b2f3a', '-alpha', 'remove', '-alpha', 'off',
    '-resize', '150x',
    '-gravity', 'north', '-splice', '0x16', '-background', '#11131a',
    '-fill', '#ffd964', '-pointsize', '13', '-annotate', '+4+13',
    `${i}  ${Math.round(i * per)}ms`,
    f])
  files.push(f)
}

const cols = Math.min(10, frames)
execFileSync('magick', ['montage', ...files, '-tile', `${cols}x`, '-geometry', '+2+2',
  '-background', '#11131a', `art/work/peek/${who}-${move}-frames.png`])
rmSync(work, { recursive: true, force: true })
console.log(`art/work/peek/${who}-${move}-frames.png`)
