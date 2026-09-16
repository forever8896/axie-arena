#!/usr/bin/env node
/**
 * The networked game has to look like the game.
 *
 * Every effect the local game fires on an event, the networked one fires on the
 * same event: the class's attack sound, the impact plate and burst, the damage
 * number, the flash, the stun and poison noises, the power-up's colour. This
 * feeds the renderer each event in turn and counts what came out, because
 * "the effects are missing" is otherwise only noticed by playing it.
 *
 * Usage: node scripts/headless/check-net-fx.mjs
 */
import { launch } from './cdp.mjs'

const PAGE = process.env.PAGE ?? 'http://localhost:5173'
let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
}

const b = await launch({ width: 1100, height: 700 })
try {
  await b.goto(`${PAGE}/?net=glade&cls=beast&name=Fx`)
  await b.waitFor("!!window.__game?.scene.getScene('NetScene')?.scene.isActive()", 90000)
  await b.eval('window.__game.loop.wake(); true')
  await b.waitFor("window.__game.scene.getScene('NetScene').client?.status === 'playing'", 60000)
  await b.waitFor("window.__game.scene.getScene('NetScene').view.actors.size > 1", 30000)

  // Count what each event produces: sounds asked for, particle bursts made,
  // sprites (the Origins plates) added, and text (the damage numbers).
  const out = await b.eval(`(async () => {
    const scene = window.__game.scene.getScene('NetScene')
    const view = scene.client.view()
    const me = scene.client.you
    const them = view.fighters.find(f => f.id !== me)
    const tally = {}
    let sounds = 0

    // Every sound the game plays goes through the scene's sound manager.
    const realPlay = scene.sound.play.bind(scene.sound)
    scene.sound.play = (...a) => { sounds++; return realPlay(...a) }

    // Count what gets made, not what is on screen a moment later: bursts and
    // plates clean themselves up, and a display-list headcount taken after one
    // expired reads as fewer effects rather than more.
    const made = { particles: 0, sprites: 0, texts: 0, ghosts: 0 }
    const realParticles = scene.add.particles.bind(scene.add)
    const realSprite = scene.add.sprite.bind(scene.add)
    const realText = scene.add.text.bind(scene.add)
    scene.add.particles = (...a) => { made.particles++; return realParticles(...a) }
    scene.add.sprite = (...a) => { made.sprites++; return realSprite(...a) }
    scene.add.text = (...a) => { made.texts++; return realText(...a) }
    // A dash trail is containers of images, not particles or sprites.
    const realContainer = scene.add.container.bind(scene.add)
    scene.add.container = (...a) => { made.ghosts++; return realContainer(...a) }

    const fire = async (label, event) => {
      const before = { ...made }
      const soundsBefore = sounds
      scene.view.play(event, view)
      await new Promise(r => setTimeout(r, 200))
      tally[label] = {
        particles: made.particles - before.particles,
        sprites: made.sprites - before.sprites,
        texts: made.texts - before.texts,
        ghosts: made.ghosts - before.ghosts,
        sounds: sounds - soundsBefore,
      }
    }

    await fire('swing', { t: 'swing', id: me, aim: 0, index: 0 })
    await fire('hit', { t: 'hit', id: them.id, by: me, amount: 320, blocked: 0, projectile: false, x: them.x, y: them.y })
    await fire('special', { t: 'special', id: me, kind: 'charge', aim: 0, point: { x: them.x, y: them.y } })
    await fire('dash', { t: 'dash', id: them.id, dir: { x: 1, y: 0 } })
    await fire('stun', { t: 'stagger', id: them.id, ms: 400 })
    await fire('poison', { t: 'poison', id: them.id, amount: 40 })
    await fire('die', { t: 'die', id: them.id, by: me, x: them.x, y: them.y })
    return JSON.stringify(tally)
  })()`).then(JSON.parse)

  for (const [event, got] of Object.entries(out)) {
    console.log(`      ${event.padEnd(8)} ${got.sounds} sounds, ${got.particles} bursts, ${got.sprites} plates, ${got.texts} numbers, ${got.ghosts} ghosts`)
  }

  check('a swing is heard', out.swing.sounds > 0, `${out.swing.sounds} sounds`)
  check('a blow bursts, plays a plate and counts the damage',
    out.hit.particles > 0 && out.hit.sprites > 0 && out.hit.texts > 0,
    `${out.hit.particles} bursts, ${out.hit.sprites} plates, ${out.hit.texts} numbers`)
  check('and is heard', out.hit.sounds > 0, `${out.hit.sounds} sounds`)
  check('a special plays its plate and sound', out.special.sprites > 0 && out.special.sounds > 0,
    `${out.special.sprites} plates, ${out.special.sounds} sounds`)
  check('a dash leaves a trail', out.dash.ghosts > 0, `${out.dash.ghosts} afterimages`)
  check('a stun is heard', out.stun.sounds > 0, `${out.stun.sounds} sounds`)
  check('poison ticks are seen and heard', out.poison.sounds > 0 && out.poison.texts > 0,
    `${out.poison.sounds} sounds, ${out.poison.texts} numbers`)
  check('a death bursts', out.die.particles > 0, `${out.die.particles} bursts`)

  // The props on the ground are the game's own, not stand-ins for them.
  const props = await b.eval(`(() => {
    const s = window.__game.scene.getScene('NetScene')
    const keys = [...s.view.props.values()].flat().map(o => o.texture?.key).filter(Boolean)
    return JSON.stringify({ props: s.view.props.size, keys: [...new Set(keys)] })
  })()`).then(JSON.parse)
  check('orbs, wells and caches use the game’s own art',
    props.keys.some(k => /icon-|fx-soft|fx-moonwell/.test(k)),
    props.props ? props.keys.join(', ') : 'nothing on the ground yet')
} catch (err) {
  fail++
  console.log(`FAIL ${err.message}`)
} finally {
  b.close()
}

console.log(`\n${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
