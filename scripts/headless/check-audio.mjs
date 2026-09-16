/**
 * Verifies the soundtrack in a real browser: the tracks decode, the right one
 * plays in each place, a Blood Moon takes the music over and gives it back,
 * looping hands over to a fresh copy rather than stacking, and M silences
 * everything. Needs the dev server running.
 * Usage: node scripts/headless/check-audio.mjs
 */
import { launch } from './cdp.mjs'
const b = await launch({ width: 900, height: 600 })
try {
  await b.goto('http://localhost:5173/')
  await b.waitFor("!!window.__game?.scene.getScene('HomeScene')?.scene.isActive()", 90000)
  const out = await b.eval(`(async () => {
    const g = window.__game
    const music = window.__music ?? await import('/src/fx/Music.js')
    const sfx = await import('/src/fx/Sfx.js')
    const { ROOMS } = await import('/src/wilds/config.js')
    const results = []
    const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail })
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const until = async (fn, ms = 20000) => { const t = performance.now(); while (!fn() && performance.now() - t < ms) await sleep(100); return fn() }

    check('every track decoded', music.musicReady() && music.TRACKS.every(t => g.cache.audio.exists('music-' + t)),
      music.TRACKS.filter(t => g.cache.audio.exists('music-' + t)).join(','))

    // The browser blocks audio until the page is touched; the game unlocks it.
    g.sound.unlock?.()
    await until(() => !g.sound.locked, 5000)
    music.play('theme')
    check('the front end plays the theme', await until(() => music.currentTrack() === 'theme', 5000), music.currentTrack())

    // A room plays the arena loop.
    const builds = g.scene.getScene('HomeScene').builds
    ;['HomeScene', 'MenuScene', 'LobbyScene'].forEach(k => g.scene.stop(k))
    g.scene.start('GameScene', { builds, playerClass: 'beast', mode: 'wilds', room: ROOMS[1], snapshot: { hunters: 4, topBounty: 0.5 } })
    await until(() => g.scene.getScene('GameScene').wilds?.gates)
    const s = g.scene.getScene('GameScene')
    check('a room plays the arena loop', await until(() => music.currentTrack() === 'arena', 5000), music.currentTrack())

    // A Blood Moon takes it over, and hands it back when it ends.
    s.wilds.nextBloodMoon = s.time.now
    check('a Blood Moon takes the music over', await until(() => music.currentTrack() === 'bloodmoon', 8000), music.currentTrack())
    s.wilds.bloodMoon.until = s.time.now
    check('and gives it back when it passes', await until(() => music.currentTrack() === 'arena', 8000), music.currentTrack())

    // Asking for the same track again must not stack a second copy.
    await until(() => music.debugVoices().length === 1, 6000)
    music.play('arena'); music.play('arena')
    await sleep(400)
    const voices = music.debugVoices()
    check('asking for the playing track changes nothing', voices.length === 1 && voices[0].id === 'arena',
      JSON.stringify(voices))

    // Looping: near the end the track hands over to a fresh copy of itself,
    // both playing at once for the crossfade, and never falls silent.
    const playing = g.sound.sounds.find(x => x.key === 'music-arena' && x.isPlaying)
    playing.setSeek(Math.max(0, playing.duration - 2.2))
    const stacked = await until(() => music.debugVoices().length === 2, 8000)
    const overlap = music.debugVoices()
    const settled = await until(() => music.debugVoices().length === 1, 10000)
    const loudThrough = overlap.length === 2 && overlap.some(v => v.gain > 0.2)
    check('a track crossfades into itself to loop',
      stacked && settled && loudThrough && music.currentTrack() === 'arena',
      JSON.stringify(overlap))

    // Mute silences music and effects together, and is remembered.
    const wasMuted = music.audio.muted
    if (wasMuted) music.toggleMute()
    music.toggleMute()
    const quiet = await until(() => g.sound.sounds.filter(x => x.key.startsWith('music-') && x.isPlaying).every(x => x.volume < 0.02), 4000)
    check('M silences the music', quiet && music.audio.muted, 'muted ' + music.audio.muted)
    check('M silences the effects too', music.sfxVolume(0.5) === 0, music.sfxVolume(0.5))
    check('the setting is remembered', JSON.parse(localStorage.getItem('lunacy.audio.v1')).muted === true, localStorage.getItem('lunacy.audio.v1'))
    music.toggleMute()
    const backUp = await until(() => music.debugVoices().some(v => v.volume > 0.05), 5000)
    check('unmuting brings it back', backUp && music.sfxVolume(0.5) > 0, JSON.stringify(music.debugVoices()))

    // Menu sounds exist and play through the same mix.
    const uiKeys = ['ui_hover', 'ui_select', 'ui_back', 'ui_start', 'ui_deny']
    check('menu sounds are loaded', uiKeys.every(k => g.cache.audio.exists('sfx-' + k)),
      uiKeys.filter(k => g.cache.audio.exists('sfx-' + k)).join(','))
    const ui = await import('/src/fx/UiSound.js')
    const home = g.scene.getScene('HomeScene')
    const playingBefore = g.sound.sounds.filter(x => x.key === 'sfx-ui_hover' && x.isPlaying).length
    ui.uiSound(home, 'hover')
    await sleep(120)
    check('a hover tick plays', g.sound.sounds.filter(x => x.key === 'sfx-ui_hover' && x.isPlaying).length > playingBefore, '')

    // Effects are mixed under the master level rather than at their own volume.
    check('effects go through the master mix', music.sfxVolume(1) === music.audio.sfx, music.sfxVolume(1))
    return results
  })()`)
  let pass = 0
  for (const r of out) {
    if (r.pass) pass++
    console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + '  (' + r.detail + ')')
  }
  console.log(pass + '/' + out.length + ' passed')
  if (b.logs.length) console.log('logs:', JSON.stringify(b.logs.slice(0, 6)))
  process.exitCode = pass === out.length ? 0 : 1
} finally { b.close() }
