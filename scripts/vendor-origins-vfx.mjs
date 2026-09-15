#!/usr/bin/env node
/**
 * Vendors Axie Origins Battle Kit effect plates into public/vfx/, downscaled.
 *
 * Source is pinned to the kit revision licensed by Vibeathon Official Rules
 * section 5. Plates are recorded at ~960x540 per frame but drawn on screen at
 * a third of that or less, so each atlas is shrunk on an exact frame grid and
 * every geometric value in its clip.json is scaled to match. Frame timing is
 * untouched, and because SkillVfx sizes a plate from the ratio of its own
 * geometry, it renders at the same on-screen size as the full-resolution file.
 *
 * Also vendors the status icons that power-ups are drawn with, and battle
 * sounds transcoded from WAV to mono Ogg Vorbis.
 *
 * Needs ffmpeg. Usage: node scripts/vendor-origins-vfx.mjs [id ...]
 * With ids, only those plates, icons and sounds are fetched.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, statSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SHA = '069a59b772e54633d04a3d9d12ecde73b3e4be5d'
const RAW = `https://raw.githubusercontent.com/axieinfinity/axie-origins-asset-kit/${SHA}`

/** id -> downscale factor. Specials and basics draw larger than statuses. */
const PLATES = {
  // Specials
  beast_gore: 0.5, aquatic_slash: 0.5, plant_projectile: 0.5,
  bird_throw: 0.5, bug_projectile: 0.5, reptile_projectile: 0.5,
  // Basics: each class's own strike, distinct from its special
  beast_bite: 0.5, aquatic_gore: 0.5, plant_bite: 0.5,
  bird_bite: 0.5, bug_bite: 0.5, reptile_slash: 0.5,
  // Statuses, drawn small over a fighter
  stunned: 0.4, poison_apply: 0.4, debuff_apply: 0.4, power_gain: 0.4,
  // Parry: the shield flash on a successful block
  shield: 0.4,
  // Power-ups and the Moonwell
  heal: 0.4, dmg_boost: 0.4, shield_boost: 0.4, power_awaken: 0.4, buff_apply: 0.4,
}

/** Status icons, tiny PNGs used as-is: power-up orbs and HUD buff slots. */
const ICONS = ['buff_dmg_boost', 'buff_shield_boost', 'buff_summerbreeze', 'power_energy_master', 'buff_leaf', 'buff_mushroom']

/** sound id -> path in the kit. Some only exist in the Unity audio folder. */
const SOUNDS = {
  heal: 'web-vfx/public/sfx/heal.wav',
  power_awaken: 'web-vfx/public/sfx/power_awaken.wav',
  bubble: 'web-vfx/public/sfx/bubble.wav',
  damage_boost: 'Assets/OriginsKit/Audio/damage_boost.wav',
  buff: 'Assets/OriginsKit/Audio/buff.wav',
}

const only = new Set(process.argv.slice(2))
const wanted = id => !only.size || only.has(id)

const GEOMETRY = ['x', 'y', 'w', 'h']
const scalePoint = (o, s) => {
  if (!o || typeof o !== 'object') return o
  for (const k of GEOMETRY) if (typeof o[k] === 'number') o[k] = +(o[k] * s).toFixed(3)
  return o
}

const work = join(tmpdir(), 'lunacy-vfx')
mkdirSync(work, { recursive: true })
let before = 0
let after = 0

for (const [id, s] of Object.entries(PLATES)) {
  if (!wanted(id)) continue
  const src = join(work, `${id}.png`)
  const clip = JSON.parse(execFileSync('curl', ['-sf', `${RAW}/web-vfx/public/vfx/${id}/clip.json`]).toString())
  execFileSync('curl', ['-sf', `${RAW}/web-vfx/public/vfx/${id}/atlas.png`, '-o', src])

  const { cols, rows, frameW, frameH } = clip.atlas
  // Whole-pixel frames, so the grid still divides exactly.
  const fw = Math.round(frameW * s)
  const fh = Math.round(frameH * s)
  const k = fw / frameW

  const outDir = join('public', 'vfx', id)
  mkdirSync(outDir, { recursive: true })
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src,
    '-vf', `scale=${cols * fw}:${rows * fh}:flags=lanczos`, join(outDir, 'atlas.png')])

  clip.atlas.frameW = fw
  clip.atlas.frameH = fh
  scalePoint(clip.crop, k)
  scalePoint(clip.anchor, k)
  scalePoint(clip.attackerInCrop, k)
  scalePoint(clip.captureAttacker, k)
  scalePoint(clip.captureDefender, k)
  clip.vendored = { from: `axie-origins-asset-kit@${SHA}`, downscale: +k.toFixed(4) }
  writeFileSync(join(outDir, 'clip.json'), JSON.stringify(clip, null, 2))

  const b = statSync(src).size
  const a = statSync(join(outDir, 'atlas.png')).size
  before += b
  after += a
  console.log(`${id.padEnd(20)} ${(b / 1024).toFixed(0).padStart(5)}K -> ${(a / 1024).toFixed(0).padStart(4)}K  (${frameW}x${frameH} -> ${fw}x${fh})`)
}

mkdirSync(join('public', 'vfx', 'icons'), { recursive: true })
for (const id of ICONS.filter(wanted)) {
  execFileSync('curl', ['-sf', `${RAW}/Assets/OriginsKit/Textures/StatusIcons/${id}.png`, '-o', join('public', 'vfx', 'icons', `${id}.png`)])
  console.log(`icon ${id}`)
}

for (const [id, path] of Object.entries(SOUNDS)) {
  if (!wanted(id)) continue
  const src = join(work, `${id}.wav`)
  execFileSync('curl', ['-sf', `${RAW}/${path}`, '-o', src])
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src,
    '-ac', '1', '-ar', '48000', '-c:a', 'libvorbis', '-q:a', '3', join('public', 'sfx', `${id}.ogg`)])
  console.log(`sound ${id.padEnd(14)} ${(statSync(src).size / 1024).toFixed(0)}K -> ${(statSync(join('public', 'sfx', `${id}.ogg`)).size / 1024).toFixed(0)}K`)
}

for (const f of ['LICENSE.md', 'Third%20Party%20Notices.md']) {
  const name = f === 'LICENSE.md' ? 'LICENSE.md' : 'THIRD_PARTY_NOTICES.md'
  execFileSync('curl', ['-sf', `${RAW}/${f}`, '-o', join('public', 'vfx', name)])
}

console.log(`\ntotal ${(before / 1024 / 1024).toFixed(1)}MB -> ${(after / 1024 / 1024).toFixed(1)}MB`)
