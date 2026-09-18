#!/usr/bin/env node
/**
 * The same actions in both games, and what each one draws.
 *
 * Not a list of effects I remembered to port — a swing and a parry performed in
 * the local game and in a networked room, with every object each one creates
 * counted and compared. Anything the local game draws and the networked one
 * does not is a hole, and this is the only way to find them that does not rely
 * on my memory of what the local game does.
 *
 * Needs `npm start` and `npm run dev`.
 *
 * Usage: node scripts/headless/check-net-parity.mjs
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

/**
 * What an action actually draws.
 *
 * Counting objects as they are created misses everything drawn into a graphics
 * object that already exists — which is exactly how both games draw the parry
 * arc. So this counts new objects AND the draw commands sitting in each
 * fighter's own graphics, and watches for long enough that a round trip and a
 * couple of headless frames both fit inside the window.
 */
const MEASURE = (scene, act, fighters) => `(async () => {
  const s = window.__game.scene.getScene('${scene}')
  const made = { graphics: 0, sprite: 0, image: 0, text: 0, particles: 0, container: 0, circle: 0 }
  const real = {}
  for (const kind of Object.keys(made)) {
    real[kind] = s.add[kind].bind(s.add)
    s.add[kind] = (...a) => { made[kind]++; return real[kind](...a) }
  }
  let arc = 0
  // Every animation seen during the window, not the last one: a room full of
  // fighters is always doing something, and the last thing that happened is
  // usually somebody else being staggered.
  const acting = new Set()
  ${act}
  const end = Date.now() + 3000
  while (Date.now() < end) {
    await new Promise(r => requestAnimationFrame(r))
    for (const f of ${fighters}) {
      if (f?.parryFx?.commandBuffer?.length) arc = Math.max(arc, f.parryFx.commandBuffer.length)
      const kind = f?.sprite?.action?.kind
      if (kind && kind !== 'locomotion') acting.add(kind)
    }
  }
  for (const kind of Object.keys(made)) s.add[kind] = real[kind]
  return JSON.stringify({ ...made, arc, acting: [...acting] })
})()`

/** The local game, dropped straight into a Wilds room. */
const LOCAL_START = `(() => {
  const g = window.__game
  g.scene.start('GameScene', {
    builds: g.scene.getScene('HomeScene').builds,
    playerClass: 'beast', mode: 'wilds',
    room: { id: 'glade', name: 'Dewdrop Glade', stake: 0.1, currency: 'AXS', blurb: '', hunters: [4, 6] },
    snapshot: { hunters: 5, topBounty: 0.4 },
  })
  return true
})()`

async function measure(name, { url, boot, scene, ready, settle, swing, parry, fighters }) {
  const b = await launch({ width: 1100, height: 700 })
  try {
    await b.goto(url)
    await b.waitFor(`!!window.__game?.scene.getScene('${boot}')?.scene.isActive()`, 90000)
    await b.eval('window.__game.loop.wake(); true')
    if (settle) await b.eval(settle)
    await b.waitFor(`!!window.__game.scene.getScene('${scene}')?.scene.isActive()`, 60000)
    await b.waitFor(ready, 60000)
    await new Promise(r => setTimeout(r, 2500))
    const out = {
      swing: JSON.parse(await b.eval(MEASURE(scene, swing, fighters))),
      parry: JSON.parse(await b.eval(MEASURE(scene, parry, fighters))),
    }
    console.log(`      ${name.padEnd(12)} swing ${JSON.stringify(out.swing)}`)
    console.log(`      ${''.padEnd(12)} parry ${JSON.stringify(out.parry)}`)
    return out
  } finally {
    b.close()
  }
}

try {
  const local = await measure('local', {
    url: `${PAGE}/`, boot: 'HomeScene', scene: 'GameScene', settle: LOCAL_START,
    ready: "!!window.__game.scene.getScene('GameScene').player",
    swing: "s.playerSwing()",
    parry: "s.playerParry()",
    fighters: "s.fighters",
  })

  const net = await measure('networked', {
    url: `${PAGE}/?net=glade&cls=beast&name=Parity`, boot: 'NetScene', scene: 'NetScene',
    ready: "window.__game.scene.getScene('NetScene').client?.status === 'playing'",
    // Through the same door a player uses, so the echo and the room's own
    // answer are both included.
    swing: "s.want('attack')",
    parry: "s.want('parry')",
    fighters: "[...s.view.actors.values()]",
  })

  check('a swing sweeps a cone in both games', local.swing.graphics > 0 && net.swing.graphics > 0,
    `local ${local.swing.graphics}, networked ${net.swing.graphics}`)
  check('and animates the attack in both',
    local.swing.acting.includes('attack') && net.swing.acting.includes('attack'),
    `local [${local.swing.acting}], networked [${net.swing.acting}]`)
  check('a parry draws its arc in both games', local.parry.arc > 0 && net.parry.arc > 0,
    `local ${local.parry.arc} commands, networked ${net.parry.arc}`)
} catch (err) {
  fail++
  console.log(`FAIL ${err.message}`)
}

console.log(`\n${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
