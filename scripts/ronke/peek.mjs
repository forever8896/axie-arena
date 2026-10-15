/**
 * A contact sheet of a whole clip, with the timestamps on it.
 *
 * Written after sampling a clip at a fixed rate and reading only its first two
 * seconds — then calling the animation missing when it was simply later in the
 * file. The generated clips all idle for a while before they do the thing, so
 * a sheet that does not span the entire duration is worse than no sheet: it
 * answers confidently and wrongly.
 *
 * Usage: node scripts/ronke/peek.mjs punch [columns]
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const who = process.argv[2]
const name = process.argv[3]
const cols = Number(process.argv[4]) || 12
if (!who || !name) {
  console.error('Usage: node scripts/ronke/peek.mjs <fighter> <clip> [columns]')
  process.exit(1)
}
const src = `art/clips/${who}/${name}.mp4`
const out = `art/work/peek/${who}-${name}-sheet.png`
mkdirSync('art/work/peek', { recursive: true })

const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
  '-of', 'csv=p=0', src], { encoding: 'utf8' }).trim())
const rows = 2
const shots = cols * rows
// Spread across the whole clip rather than a fixed frame rate, so the sheet
// always spans the file however long it is.
const every = duration / shots

execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src,
  '-vf', `fps=${(1 / every).toFixed(4)},scale=140:-1,drawtext=text='%{eif\\:t*${(1 / every).toFixed(4)}*${every.toFixed(3)}\\:d}',tile=${cols}x${rows}`,
  '-frames:v', '1', out])
console.log(`${out}  ${duration.toFixed(1)}s over ${shots} frames, one every ${every.toFixed(2)}s`)
