#!/usr/bin/env node
/**
 * Are the fighters the same size as each other on the field?
 *
 * Each one is cut to its own frame — Ronke 199px wide, Horske 293 — so drawing
 * them all at scale 1 made Ronka a head taller than Ronke, who is the same
 * species, and Horske enormous. This measures what the game actually draws,
 * not what the sheets contain.
 *
 * Usage: node scripts/headless/check-sizing.mjs
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
    const g = window.__game
    const home = g.scene.getScene('HomeScene')
    const { default: RonkeSprite, FIGHTERS } = await import('/src/ronke/RonkeSprite.js')
    const out = {}
    for (const who of Object.keys(FIGHTERS)) {
      const s = new RonkeSprite(home, -4000, -4000, { cls: who })
      s.playSheet('idle')
      // displayHeight is the drawn size: frame height times the scale applied.
      out[who] = {
        drawn: Math.round(s.sprite.displayHeight),
        width: Math.round(s.sprite.displayWidth),
        scale: Math.round(s.sprite.scaleX * 100) / 100,
      }
      s.destroy()
    }
    return JSON.stringify(out)
  })()`))

  // Measured body heights inside the frames: 177, 210 and 212 at scale 1.
  const body = { ronke: 177, ronka: 210, horske: 212 }
  const drawn = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, body[k] * v.scale]))
  const base = drawn.ronke
  for (const [who, h] of Object.entries(drawn)) {
    const ratio = h / base
    // Same species stand the same height; the mounted one is allowed to be
    // taller, but by a head rather than by half a body.
    const limit = who === 'horske' ? [1.0, 1.2] : [0.92, 1.08]
    check(`${who} stands right next to Ronke`,
      ratio >= limit[0] && ratio <= limit[1],
      `${Math.round(h)}px, ${ratio.toFixed(2)}x Ronke (drawn ${r[who].drawn}px frame at ${r[who].scale})`)
  }

  const errs = await b.eval('(window.__errors ?? []).length')
  check('nothing threw', errs === 0, `${errs} errors`)
} finally {
  await b.close()
}
console.log(`${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
