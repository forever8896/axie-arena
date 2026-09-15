#!/usr/bin/env node
/**
 * Builds the Lunacy logo as self-contained SVG: no font dependency, so it
 * renders the same in the game, on GitHub and in a submission page.
 *
 * Letters are Rowdies Bold — the font the Axie brand kit names — converted to
 * outlines (SIL Open Font License 1.1, see OFL.txt beside this file). The "C"
 * is a crescent moon with a sprouting leaf: Lunacia, and the name's pun.
 *
 * Usage: node scripts/brand/build-logo.mjs
 * Writes public/brand/lunacy-logo.svg, lunacy-mark.svg, and PNG exports
 * rendered by headless Chromium.
 */
import opentype from 'opentype.js'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../../public/brand')
mkdirSync(out, { recursive: true })

const buf = readFileSync(join(here, 'Rowdies-Bold.ttf'))
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))

const INK = '#1d2b12'
const SIZE = 230
const OUTLINE = 30

/** Each letter bounces: its own tilt and lift, along a gentle arch. */
const LETTERS = [
  { ch: 'L', rot: -7, lift: 10 },
  { ch: 'U', rot: 4, lift: 24 },
  { ch: 'N', rot: -3, lift: 32 },
  { ch: 'A', rot: 5, lift: 30 },
  { ch: 'MOON', rot: -8, lift: 24 },
  { ch: 'Y', rot: 7, lift: 8 },
]

const fx = n => +n.toFixed(2)

function glyph(ch, x) {
  const g = font.charToGlyph(ch)
  const path = g.getPath(x, 0, SIZE)
  const bb = path.getBoundingBox()
  return { d: path.toPathData(2), width: g.advanceWidth * SIZE / font.unitsPerEm, bb }
}

/**
 * A crescent as one closed path: the outer arc of circle A, back along the
 * inside of circle B, which bites out of it.
 */
function crescent(R, bx, by, r) {
  const d = Math.hypot(bx, by)
  const a = (R * R - r * r + d * d) / (2 * d)
  const h = Math.sqrt(R * R - a * a)
  const mx = (a * bx) / d
  const my = (a * by) / d
  const p1 = [mx + (h * by) / d, my - (h * bx) / d]
  const p2 = [mx - (h * by) / d, my + (h * bx) / d]
  return `M${fx(p1[0])} ${fx(p1[1])} A${R} ${R} 0 1 0 ${fx(p2[0])} ${fx(p2[1])} A${r} ${r} 0 0 1 ${fx(p1[0])} ${fx(p1[1])}Z`
}

const MOON_R = 102
const moonPath = crescent(MOON_R, 62, -14, 86)
const LEAF = 'M0 0 C 10 -34, 44 -58, 84 -54 C 78 -18, 44 6, 0 0 Z'
const LEAF_VEIN = 'M6 -3 C 30 -18, 52 -34, 72 -48'
const star = (x, y, s) =>
  `M${x} ${y - s} Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} ` +
  `Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s}Z`

const defs = `
  <defs>
    <linearGradient id="face" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffdf2"/>
      <stop offset="0.55" stop-color="#fff3c4"/>
      <stop offset="1" stop-color="#ffd978"/>
    </linearGradient>
    <linearGradient id="side" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5f9330"/>
      <stop offset="1" stop-color="#3a5f1c"/>
    </linearGradient>
    <radialGradient id="moon" cx="0.35" cy="0.35" r="0.8">
      <stop offset="0" stop-color="#fff2a8"/>
      <stop offset="0.5" stop-color="#ffc93a"/>
      <stop offset="1" stop-color="#f19a00"/>
    </radialGradient>
    <linearGradient id="leaf" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#4f9a2a"/>
      <stop offset="1" stop-color="#a6e05a"/>
    </linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.75"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>`

/** The four stacked layers that make a letter chunky: drop, extrusion, outline, face. */
function stack(d, { face = 'url(#face)', side = 'url(#side)' } = {}) {
  return `
      <path d="${d}" transform="translate(10 22)" fill="${INK}" stroke="${INK}" stroke-width="${OUTLINE}" stroke-linejoin="round" opacity="0.28"/>
      <path d="${d}" transform="translate(0 14)" fill="${side}" stroke="${INK}" stroke-width="${OUTLINE}" stroke-linejoin="round"/>
      <path d="${d}" fill="${face}" stroke="${INK}" stroke-width="${OUTLINE}" stroke-linejoin="round"/>
      <path d="${d}" fill="${face}"/>
      <path d="${d}" fill="url(#gloss)"/>`
}

function moonGroup() {
  return `
      <g transform="translate(-14 -6) rotate(-10)">${stack(moonPath, { face: 'url(#moon)', side: '#b86a00' })}
        <circle cx="-44" cy="30" r="11" fill="#f5a300" opacity="0.45"/>
        <circle cx="-22" cy="58" r="7" fill="#f5a300" opacity="0.4"/>
      </g>
      <g transform="translate(6 -104) rotate(-30)">
        <path d="${LEAF}" transform="translate(0 8)" fill="#2f5516" stroke="${INK}" stroke-width="16" stroke-linejoin="round"/>
        <path d="${LEAF}" fill="url(#leaf)" stroke="${INK}" stroke-width="16" stroke-linejoin="round"/>
        <path d="${LEAF}" fill="url(#leaf)"/>
        <path d="${LEAF_VEIN}" fill="none" stroke="#2f5516" stroke-width="5" stroke-linecap="round" opacity="0.7"/>
      </g>`
}

function buildWordmark() {
  let x = 0
  const parts = []
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  const pad = 70

  for (const L of LETTERS) {
    if (L.ch === 'MOON') {
      const w = MOON_R * 1.62
      const cx = x + w / 2 + 26
      const cy = -SIZE * 0.36 - L.lift
      parts.push(`<g transform="translate(${fx(cx)} ${fx(cy)}) rotate(${L.rot})">${moonGroup()}</g>`)
      minX = Math.min(minX, cx - MOON_R - pad); maxX = Math.max(maxX, cx + MOON_R + pad)
      minY = Math.min(minY, cy - MOON_R - 140); maxY = Math.max(maxY, cy + MOON_R + pad)
      x += w + 10
      continue
    }
    const g = glyph(L.ch, x)
    const cx = x + g.width / 2
    const cy = -SIZE * 0.36
    // Rotate about the letter's own centre, then lift it.
    parts.push(
      `<g transform="translate(0 ${-L.lift}) rotate(${L.rot} ${fx(cx)} ${fx(cy)})">${stack(g.d)}</g>`,
    )
    minX = Math.min(minX, g.bb.x1 - pad); maxX = Math.max(maxX, g.bb.x2 + pad)
    minY = Math.min(minY, g.bb.y1 - L.lift - pad); maxY = Math.max(maxY, g.bb.y2 - L.lift + pad)
    x += g.width - 6
  }

  const sparkles = [
    star(minX + 70, minY + 60, 20), star(maxX - 40, minY + 90, 16), star(maxX - 90, maxY - 40, 12),
  ].map(d => `<path d="${d}" fill="#fff8d8" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`).join('')

  const w = maxX - minX
  const h = maxY - minY
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fx(minX)} ${fx(minY)} ${fx(w)} ${fx(h)}" width="${Math.round(w)}" height="${Math.round(h)}">
  <title>Lunacy</title>${defs}
  ${parts.join('\n  ')}
  ${sparkles}
</svg>
`
}

function buildMark() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-190 -272 390 390" width="512" height="512">
  <title>Lunacy</title>${defs}
  <g transform="translate(6 -40)">${moonGroup()}</g>
</svg>
`
}

const logo = buildWordmark()
const mark = buildMark()
writeFileSync(join(out, 'lunacy-logo.svg'), logo)
writeFileSync(join(out, 'lunacy-mark.svg'), mark)

// PNG exports, rendered by the same Chromium the headless checks use.
function render(svgFile, pngFile, w, h, background = '00000000') {
  const page = join(tmpdir(), 'lunacy-logo-render.html')
  writeFileSync(page, `<style>html,body{margin:0;background:transparent}img{width:${w}px;height:${h}px;display:block}</style><img src="file://${svgFile}">`)
  execFileSync('/usr/bin/chromium', [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', `--default-background-color=${background}`,
    `--window-size=${w},${h}`, `--screenshot=${pngFile}`, `file://${page}`,
  ], { stdio: 'ignore' })
}
const [, , , vw, vh] = logo.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/)
const lw = 1200
const lh = Math.round((lw * vh) / vw)
render(join(out, 'lunacy-logo.svg'), join(out, 'lunacy-logo.png'), lw, lh)
render(join(out, 'lunacy-mark.svg'), join(out, 'lunacy-mark.png'), 512, 512)
console.log(`logo ${lw}x${lh}, mark 512x512 -> ${out}`)
