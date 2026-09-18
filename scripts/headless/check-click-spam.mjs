#!/usr/bin/env node
/**
 * Clicking again mid-swing must not restart the swing.
 *
 * The room has always refused an attack from a fighter already swinging. The
 * client did not model the swing at all, so it believed every click was legal
 * and replayed the wind-up animation from the top each time — the attack looked
 * like it was being reset by the player's own hands, while the room quietly
 * ignored every click after the first.
 *
 * Usage: node scripts/headless/check-click-spam.mjs
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

const b = await launch({ width: 900, height: 600 })
try {
  await b.goto(`${PAGE}/?net=glade&cls=beast&name=Spam`)
  await b.waitFor("!!window.__game?.scene.getScene('NetScene')?.scene.isActive()", 90000)
  await b.eval('window.__game.loop.wake(); true')
  await b.waitFor("window.__game.scene.getScene('NetScene').client?.status === 'playing'", 60000)
  await b.waitFor("!!window.__game.scene.getScene('NetScene').client.view()?.me?.alive", 30000)

  const r = JSON.parse(await b.eval(`(async () => {
    const s = window.__game.scene.getScene('NetScene')
    const frame = () => new Promise(r => requestAnimationFrame(r))
    const sprite = () => s.view.actors.get(s.client.you)?.sprite

    // Count every time an attack animation is started on this Axie.
    for (let f = 0; f < 120 && !sprite(); f++) await frame()
    const sp = sprite()
    if (!sp) return JSON.stringify({ error: 'no sprite' })
    let started = 0
    const orig = sp.play.bind(sp)
    sp.play = (clip, opt) => {
      if (opt?.kind === 'attack') started++
      return orig(clip, opt)
    }

    // One click, then a handful more while the first is still winding up.
    s.want('attack')
    const afterFirst = started
    for (let i = 0; i < 6; i++) {
      await frame()
      s.want('attack')
    }
    const duringSwing = started

    // And once the whole swing is over, a click must work again.
    for (let f = 0; f < 120; f++) await frame()
    const beforeSecond = started
    s.want('attack')
    await frame()
    const afterSecond = started
    return JSON.stringify({ afterFirst, duringSwing, beforeSecond, afterSecond })
  })()`))

  check('the first click swings', r.afterFirst === 1, `${r.afterFirst} animations`)
  check('clicks during the swing do not restart it', r.duringSwing === r.afterFirst,
    `${r.duringSwing - r.afterFirst} extra restarts from 6 clicks`)
  check('and a click after it lands swings again', r.afterSecond > r.beforeSecond,
    `${r.afterSecond - r.beforeSecond} animation`)

  const errs = await b.eval('(window.__errors ?? []).length')
  check('nothing threw', errs === 0, `${errs} errors`)
} finally {
  await b.close()
}

console.log(`${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
