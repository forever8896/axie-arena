#!/usr/bin/env node
/**
 * A screenshot of a networked room, from two browsers at once.
 *
 * Proof by picture: the same room, the same moment, drawn twice by two clients
 * that agree because neither of them is deciding anything.
 *
 * Needs `npm start` and `npm run dev` running.
 *
 * Usage: node scripts/brand/shoot-net.mjs [outDir]
 */
import { launch } from '../headless/cdp.mjs'

const out = process.argv[2] ?? '/tmp'
const PAGE = process.env.PAGE ?? 'http://localhost:5173'

async function player(name, cls) {
  const b = await launch({ width: 1200, height: 675 })
  await b.goto(`${PAGE}/?net=glade&cls=${cls}&name=${name}`)
  await b.waitFor("!!window.__game?.scene.getScene('NetScene')?.scene.isActive()", 90000)
  await b.eval('window.__game.loop.wake(); true')
  await b.waitFor("window.__game.scene.getScene('NetScene').client?.status === 'playing'", 60000)
  await b.waitFor("!!window.__game.scene.getScene('NetScene').view.actors.size", 30000)
  return b
}

const a = await player('Ayla', 'beast')
const b = await player('Bram', 'plant')
try {
  // Walk them toward each other so both frames hold the same meeting.
  await a.eval(`(async () => {
    const s = window.__game.scene.getScene('NetScene')
    const them = s.client.view().fighters.find(f => f.id !== s.client.you && !f.bot)
    const me = s.client.view().me
    if (!them) return 'alone'
    const end = Date.now() + 2500
    while (Date.now() < end) {
      const v = s.client.view()
      const t = v.fighters.find(f => f.id === them.id)
      if (!t || !v.me) break
      s.keys.D.isDown = t.x > v.me.x
      s.keys.A.isDown = t.x < v.me.x
      s.keys.S.isDown = t.y > v.me.y
      s.keys.W.isDown = t.y < v.me.y
      await new Promise(r => setTimeout(r, 50))
    }
    for (const k of ['W', 'A', 'S', 'D']) s.keys[k].isDown = false
    s.client.act('attack')
    return 'met'
  })()`)
  await new Promise(r => setTimeout(r, 400))
  console.log('saved', await a.screenshot(`${out}/net-a.png`))
  console.log('saved', await b.screenshot(`${out}/net-b.png`))
} finally {
  a.close()
  b.close()
}
