#!/usr/bin/env node
/**
 * A held guard has to appear under the hand that raised it.
 *
 * The room is the authority on who blocks what, and it always was — but the
 * arc was drawn only from the snapshot flag, so on a real connection it came
 * up a round trip after the key went down. A guard you hold and do not see is
 * indistinguishable from a guard that does not work, which is exactly what it
 * was reported as.
 *
 * This holds the key and times two things: when the arc appears on screen, and
 * when the room confirms it. The first must be within a couple of frames; the
 * second is allowed to be as late as the network is.
 *
 * Usage: node scripts/headless/check-guard-feel.mjs
 */
import { launch } from './cdp.mjs'

const PAGE = process.env.PAGE ?? 'http://localhost:5173'
const GUARDING = 256

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
}

const b = await launch({ width: 900, height: 600 })
try {
  await b.goto(`${PAGE}/?net=glade&cls=beast&name=Guard`)
  await b.waitFor("!!window.__game?.scene.getScene('NetScene')?.scene.isActive()", 90000)
  await b.eval('window.__game.loop.wake(); true')
  await b.waitFor("window.__game.scene.getScene('NetScene').client?.status === 'playing'", 60000)
  await b.waitFor("!!window.__game.scene.getScene('NetScene').view.actors.size", 30000)
  await b.waitFor("!!window.__game.scene.getScene('NetScene').client.view()?.me?.alive", 30000)

  // Hold the key the way a hand does — down, and staying down — then watch the
  // screen and the room separately. A headless page only runs frames while
  // something awaits them, so the loop drives them rather than scheduling a
  // chain and walking away.
  const r = JSON.parse(await b.eval(`(async () => {
    const s = window.__game.scene.getScene('NetScene')
    const id = s.client.you
    let arcAt = null, roomAt = null
    s.keys.Q.isDown = true
    for (let f = 0; f < 240; f++) {
      await new Promise(r => requestAnimationFrame(r))
      const actor = s.view.actors.get(id)
      if (arcAt === null && actor?.wantsGuard && actor?.parryFx?.commandBuffer?.length) arcAt = f
      const me = s.client.view()?.me
      if (roomAt === null && me && (me.flags & ${GUARDING})) roomAt = f
      if (arcAt !== null && roomAt !== null) break
    }
    s.keys.Q.isDown = false
    return JSON.stringify({ arcAt, roomAt })
  })()`))
  const arc = r.arcAt
  const room = r.roomAt

  // Counted in frames, not milliseconds: a headless page paces frames however
  // it likes, and what matters is how many of them a player stares at an
  // unraised guard.
  check('the arc appears within a frame of the key', arc !== null && arc <= 2,
    arc === null ? 'never appeared' : `frame ${arc}`)
  check('the room agrees the guard is up', room !== null,
    room === null ? 'room never confirmed' : `frame ${room}`)
  check('the screen does not wait for the room',
    arc !== null && room !== null && arc <= room,
    arc !== null && room !== null ? `screen frame ${arc}, room frame ${room}` : '')

  // Letting go has to put it away again, or a held guard becomes a stuck one.
  const down = await b.eval(`(() => {
    const s = window.__game.scene.getScene('NetScene')
    return !!s.view.actors.get(s.client.you)?.parryFx?.commandBuffer?.length
  })()`)
  const upRaw = await b.eval(`(async () => {
    for (let f = 0; f < 60; f++) await new Promise(r => requestAnimationFrame(r))
    const s = window.__game.scene.getScene('NetScene')
    const a = s.view.actors.get(s.client.you)
    return JSON.stringify({ drawn: !!a?.parryFx?.commandBuffer?.length, wants: !!a?.wantsGuard })
  })()`)
  const up = JSON.parse(upRaw)
  check('releasing the key drops the guard', !up.wants && !up.drawn,
    `was ${down ? 'up' : 'down'}, now ${up.drawn ? 'still drawn' : 'clear'}`)

  const errs = await b.eval(`(window.__errors ?? []).length`)
  check('nothing threw', errs === 0, `${errs} errors`)
} finally {
  await b.close()
}

console.log(`${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
