/**
 * The soundtrack.
 *
 * Three instrumental beds (see scripts/audio/generate-music.mjs): a theme for
 * the front end, an arena loop for a room, and a tense bed while a Blood Moon
 * is up. Each is crossfaded into itself a couple of seconds before it ends, so
 * a track that was never written with a loop point still runs continuously.
 *
 * Everything here lives on the game rather than a scene: the music has to
 * survive every scene change, and a fade started in one scene must finish
 * after that scene is gone.
 */

const BASE = `${import.meta.env.BASE_URL}music/`
export const TRACKS = ['theme', 'arena', 'bloodmoon']

const SETTINGS_KEY = 'lunacy.audio.v1'
const CROSSFADE_MS = 2600
const FADE_IN_MS = 900
const FADE_OUT_MS = 700

/** Master levels. Effects sit above the music; both scale with `muted`. */
export const audio = load()

function load() {
  const base = { music: 0.55, sfx: 0.9, muted: false }
  try {
    return { ...base, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }
  } catch {
    return base
  }
}

export function saveAudio() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(audio))
  } catch {
    // Not persisted; the session still works.
  }
}

export function toggleMute() {
  audio.muted = !audio.muted
  saveAudio()
  return audio.muted
}

/** SFX volume after the master level, for src/fx/Sfx.js. */
export function sfxVolume(v) {
  return audio.muted ? 0 : v * audio.sfx
}

let game = null
let ready = false
const voices = []      // { id, sound, gain, target, fading }
let wanted = null

export async function loadMusic(onOne) {
  if (ready) return
  const entries = []
  await Promise.all(TRACKS.map(async id => {
    try {
      const data = await fetch(`${BASE}${id}.ogg`).then(r => r.arrayBuffer())
      entries.push({ key: `music-${id}`, data })
    } catch (err) {
      console.warn(`music failed: ${id}`, err)
    }
    onOne?.()
  }))
  if (!entries.length || !game?.sound?.decodeAudio) return
  await new Promise(resolve => {
    game.sound.once('decodedall', resolve)
    game.sound.decodeAudio(entries)
    setTimeout(resolve, 6000)
  })
  ready = true
  if (wanted) play(wanted)
}

/** Called once at boot: the mixer runs off the game loop, not a scene. */
export function attachMusic(g) {
  if (game) return
  game = g
  g.events.on('poststep', (time, delta) => step(delta))
  // M silences everything, anywhere in the game, and is remembered.
  window.addEventListener('keydown', e => {
    if (e.key === 'm' || e.key === 'M') toggleMute()
  })
  // A browser will not start audio until the page is touched.
  g.sound.once('unlocked', () => { if (wanted) play(wanted) })
}

/** Fades to `id`. Calling it again with the same track does nothing. */
export function play(id) {
  wanted = id
  if (!game || !ready || !id) return
  const top = voices[voices.length - 1]
  if (top && top.id === id && !top.retiring) return

  for (const v of voices) retire(v)
  start(id, 0)
}

export function stopMusic() {
  wanted = null
  for (const v of voices) retire(v)
}

function start(id, seek = 0) {
  const key = `music-${id}`
  if (!game.cache.audio.exists(key)) return null
  let sound
  try {
    sound = game.sound.add(key, { volume: 0 })
    sound.play({ seek })
  } catch {
    return null   // audio context not unlocked yet; the unlock handler retries
  }
  const voice = { id, sound, gain: 0, target: 1, retiring: false, looped: false }
  voices.push(voice)
  return voice
}

function retire(voice) {
  voice.retiring = true
  voice.target = 0
}

function step(delta) {
  if (!voices.length) return
  const master = audio.muted ? 0 : audio.music
  for (const v of [...voices]) {
    const rate = delta / (v.retiring ? FADE_OUT_MS : FADE_IN_MS)
    v.gain += Math.sign(v.target - v.gain) * Math.min(rate, Math.abs(v.target - v.gain))
    v.sound.setVolume(v.gain * master)

    if (v.retiring && v.gain <= 0.001) {
      v.sound.stop()
      v.sound.destroy()
      voices.splice(voices.indexOf(v), 1)
      continue
    }
    // Hand over to a fresh copy before this one runs out.
    if (!v.retiring && !v.looped && v.sound.duration) {
      const left = (v.sound.duration - v.sound.seek) * 1000
      if (left <= CROSSFADE_MS) {
        v.looped = true
        retire(v)
        start(v.id, 0)
      }
    }
  }
}

/** The mixer's own state, for checks: one entry per voice. */
export function debugVoices() {
  return voices.map(v => ({
    id: v.id, gain: +v.gain.toFixed(3), retiring: v.retiring, looped: v.looped,
    volume: +(v.sound.isPlaying ? v.sound.volume : 0).toFixed(3),
    seek: +(v.sound.seek ?? 0).toFixed(2), duration: +(v.sound.duration ?? 0).toFixed(2),
  }))
}

/** What is actually playing, for tests. */
export function currentTrack() {
  const top = voices.filter(v => !v.retiring).pop()
  return top?.id ?? null
}

export function musicReady() {
  return ready
}
