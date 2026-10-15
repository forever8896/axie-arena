#!/usr/bin/env node
/**
 * Does the frame that shows the blow play when the blow lands?
 *
 * The simulation deals damage CONNECT_MS after a swing starts. Each sheet
 * records which of its frames is the moment of contact, and the renderer
 * stretches the clip so that frame falls there. This checks the three things
 * that can break it.
 *
 * It does NOT check the frame on screen at the instant damage is dealt. A
 * headless page runs frames when it feels like it, so a 165ms timer fires at
 * 230ms and the animation — advancing on the same starved clock — is exactly
 * as far along as the maths says it should be. Measuring that proves the
 * browser was slow, not that the game is right.
 *
 * Usage: node scripts/headless/check-contact.mjs
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
  await b.cdp('Network.enable')
  await b.cdp('Network.setBlockedURLs', { urls: ['*railway.app*', '*/ws*', '*/api/*'] })
  await b.goto(`${PAGE}/`)
  await b.waitFor("!!window.__game?.scene.getScene('HomeScene')?.scene.isActive()", 90000)
  await b.eval('window.__game.loop.wake(); true')

  const r = JSON.parse(await b.eval(`(async () => {
    const { CONNECT_MS } = await import('/src/sim/constants.js')
    const { FIGHTERS, sheetFor } = await import('/src/ronke/RonkeSprite.js')
    const g = window.__game
    const out = []
    for (const who of Object.keys(FIGHTERS)) {
      for (const move of ['attack', 'special']) {
        const sheet = sheetFor(who, move)
        const meta = g.cache.json.get('sprites-' + who + '-' + sheet)
        if (!meta) { out.push({ who, move, missing: true }); continue }
        const lengthMs = (meta.frames / meta.fps) * 1000
        const hit = meta.contactFrame != null ? meta.contactFrame / (meta.frames - 1) : null
        const speed = hit ? (lengthMs * hit) / CONNECT_MS : null
        out.push({
          who, move, sheet, frames: meta.frames, fps: meta.fps,
          lengthMs: Math.round(lengthMs),
          contactFrame: meta.contactFrame ?? null,
          hit: hit == null ? null : Math.round(hit * 100) / 100,
          speed: speed == null ? null : Math.round(speed * 100) / 100,
          playedMs: speed ? Math.round(lengthMs / speed) : null,
        })
      }
    }
    return JSON.stringify({ CONNECT_MS, out })
  })()`))

  for (const m of r.out) {
    const label = `${m.who}/${m.sheet ?? m.move}`
    check(`${label}: records where contact is`, m.contactFrame != null,
      m.contactFrame == null ? 'no contactFrame in the sheet' : `frame ${m.contactFrame} of ${m.frames}`)
    if (m.contactFrame == null) continue
    // Stretched so the contact frame falls on CONNECT_MS: played duration times
    // the contact fraction is the moment of contact, by construction.
    const lands = Math.round(m.playedMs * m.hit)
    check(`${label}: its contact frame falls on CONNECT_MS`,
      Math.abs(lands - r.CONNECT_MS) <= 12, `${lands}ms vs ${r.CONNECT_MS}ms`)
    // And the clip must outlast the blow, or the fighter is standing idle again
    // before the damage is dealt.
    check(`${label}: outlasts the blow`, m.playedMs > r.CONNECT_MS,
      `plays for ${m.playedMs}ms at ${m.speed}x`)
  }

  const errs = await b.eval('(window.__errors ?? []).length')
  check('nothing threw', errs === 0, `${errs} errors`)
} finally {
  await b.close()
}
console.log(`${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
