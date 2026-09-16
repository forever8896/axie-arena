/**
 * Origins battle audio.
 *
 * Vendored from the kit revision licensed by Official Rules section 5 and
 * transcoded from WAV to Ogg Vorbis (3.5MB down to ~360KB). See
 * public/vfx/LICENSE.md for the terms these ship under.
 */

import { sfxVolume } from './Music.js'

const BASE = `${import.meta.env.BASE_URL}sfx/`
let ready = false

export const SFX = [
  'beast_bite_attack', 'aquatic_slash_attack', 'plant_bite_attack',
  'bird_bite_attack', 'bug_bite_attack', 'reptile_slash_attack',
  'beast_gore_attack', 'plant_projectile_attack', 'bird_throw_attack',
  'bug_projectile_attack', 'reptile_projectile_attack',
  'beast_projectile_hit', 'aquatic_projectile_hit', 'plant_projectile_hit',
  'bird_throw_hit', 'bug_projectile_hit', 'reptile_projectile_hit',
  'poison', 'stunned', 'shield',
  'heal', 'power_awaken', 'bubble', 'damage_boost', 'buff',
  // Menu: hover tick, confirm, back, start, denied.
  'ui_hover', 'ui_select', 'ui_back', 'ui_start', 'ui_deny',
]

/**
 * Decoded directly rather than through Phaser's loader, which is built for a
 * scene's preload phase and stalls when queued into afterwards.
 */
export async function loadSfx(scene, onOne) {
  if (ready) return
  const entries = []

  await Promise.all(SFX.map(async id => {
    try {
      const data = await fetch(`${BASE}${id}.ogg`).then(r => r.arrayBuffer())
      entries.push({ key: `sfx-${id}`, data })
    } catch (err) {
      console.warn(`sfx failed: ${id}`, err)
    }
    onOne?.()
  }))

  if (!entries.length || !scene.sound?.decodeAudio) return
  await new Promise(resolve => {
    scene.sound.once('decodedall', resolve)
    scene.sound.decodeAudio(entries)
    // Never hang boot on audio; a silent game still plays.
    setTimeout(resolve, 4000)
  })
  ready = true
}

/**
 * Safe to call before audio is ready, or when the browser has blocked it.
 * Every effect goes through the master level in Music.js, so effects and music
 * are mixed against each other rather than each picking its own loudness.
 */
export function play(scene, id, { volume = 0.5, rate = 1, detune = 0 } = {}) {
  const key = `sfx-${id}`
  if (!scene.cache?.audio?.exists(key)) return
  const level = sfxVolume(volume)
  if (level <= 0) return
  try {
    scene.sound.play(key, { volume: level, rate, detune })
  } catch {
    // Audio context not unlocked yet; silence is an acceptable outcome.
  }
}

/** Slight pitch variation so a repeated basic attack does not machine-gun. */
export function playVaried(scene, id, volume = 0.5) {
  play(scene, id, { volume, detune: (Math.random() * 2 - 1) * 180 })
}
