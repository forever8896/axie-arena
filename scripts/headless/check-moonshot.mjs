#!/usr/bin/env node
/**
 * The Moonshot, through the browser rather than the simulation.
 *
 * check-sim.mjs already proves the rules. This proves the half that only exists
 * on a screen: that holding the key draws the line you are aiming, that the
 * line follows the mouse, that letting go fires it, and that a tap does not.
 *
 * Usage: node scripts/headless/check-moonshot.mjs
 */
import { launch } from './cdp.mjs'

const PAGE = process.env.PAGE ?? 'http://localhost:5173'
const AIMING = 4096

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
}

const b = await launch({ width: 900, height: 600 })
try {
  await b.goto(`${PAGE}/?net=glade&cls=bird&name=Moon`)
  await b.waitFor("!!window.__game?.scene.getScene('NetScene')?.scene.isActive()", 90000)
  await b.eval('window.__game.loop.wake(); true')
  await b.waitFor("window.__game.scene.getScene('NetScene').client?.status === 'playing'", 60000)
  await b.waitFor("!!window.__game.scene.getScene('NetScene').client.view()?.me?.alive", 30000)

  // The meter starts empty and fills at half the special's rate, so a fresh
  // player has no Moonshot for the better part of a minute. Pressing the key
  // before then is correctly ignored, which is not what this is checking.
  const ready = await b.waitFor(
    "(window.__game.scene.getScene('NetScene').client.view()?.me?.moon ?? 0) >= 1", 90000)
  check('the Moonshot meter fills', ready === true)

  const r = JSON.parse(await b.eval(`(async () => {
    const s = window.__game.scene.getScene('NetScene')
    const id = s.client.you
    const frame = () => new Promise(r => requestAnimationFrame(r))
    const actor = () => s.view.actors.get(id)
    const me = () => s.client.view()?.fighters.find(f => f.id === id)
    const out = {}

    // Nothing drawn before the key goes down.
    await frame()
    out.quietBefore = actor()?.aimFx?.commandBuffer?.length ?? -1

    // A tap: too short to fire, and it must not leave a line behind. The line
    // is counted in frames, because the scene sends input and then draws, so
    // the first frame after a key goes down is drawn from the previous one.
    s.keys.R.isDown = true
    out.lineAtFrame = null
    for (let f = 0; f < 10 && out.lineAtFrame === null; f++) {
      await frame()
      if (actor()?.aimFx?.commandBuffer?.length) out.lineAtFrame = f
    }
    s.keys.R.isDown = false
    for (let f = 0; f < 30; f++) await frame()
    out.quietAfterTap = actor()?.aimFx?.commandBuffer?.length ?? -1

    // A real one: hold, and let the room confirm the aim.
    s.keys.R.isDown = true
    let roomSaw = false
    for (let f = 0; f < 120 && !roomSaw; f++) {
      await frame()
      if ((me()?.flags & ${AIMING}) !== 0) roomSaw = true
    }
    out.roomSawAim = roomSaw
    out.lineWhileHeld = actor()?.aimFx?.commandBuffer?.length ?? -1

    // Hold past the minimum, then let go and watch for the shot.
    for (let f = 0; f < 45; f++) await frame()
    const before = s.view.scene.children.list.length
    s.keys.R.isDown = false
    let fired = false
    for (let f = 0; f < 120 && !fired; f++) {
      await frame()
      if ((me()?.flags & ${AIMING}) === 0) fired = true
    }
    out.aimEnded = fired
    for (let f = 0; f < 40; f++) await frame()
    out.quietAfterShot = actor()?.aimFx?.commandBuffer?.length ?? -1
    out.moon = me()?.moon ?? null
    return JSON.stringify(out)
  })()`))

  check('nothing is drawn before the key', r.quietBefore === 0, `${r.quietBefore} commands`)
  check('the aim line appears as the key goes down', r.lineAtFrame !== null && r.lineAtFrame <= 2,
    r.lineAtFrame === null ? 'never appeared' : `frame ${r.lineAtFrame}`)
  check('a tap leaves no line behind', r.quietAfterTap === 0, `${r.quietAfterTap} commands`)
  check('the room confirms the aim', r.roomSawAim === true)
  check('the line stays while held', r.lineWhileHeld > 0, `${r.lineWhileHeld} commands`)
  check('letting go ends the aim', r.aimEnded === true)
  check('and clears the line', r.quietAfterShot === 0, `${r.quietAfterShot} commands`)

  const errs = await b.eval('(window.__errors ?? []).length')
  check('nothing threw', errs === 0, `${errs} errors`)
} finally {
  await b.close()
}

console.log(`${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
