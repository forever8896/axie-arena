/**
 * Grabs a 1920x1080 gameplay frame for the project thumbnail.
 *
 * Drives the real build in headless Chromium: home, class select, into an
 * Endless Wilds room, then holds the frame at the moment a special connects.
 *
 * Usage: node scripts/brand/shoot-thumbnail.mjs [url] [out.png]
 */
import { launch } from '../headless/cdp.mjs'

const url = process.argv[2] ?? 'http://localhost:5173/'
const out = process.argv[3] ?? 'public/brand/thumbnail.png'

// 16:9, and small enough that the camera still has world left to scroll: at
// 1920 the arena barely exceeds the viewport, so the view clamps at the edge.
const b = await launch({ width: 1600, height: 900 })
try {
  await b.goto(url)
  await b.waitFor("!!window.__game?.scene.getScene('HomeScene')?.scene.isActive()", 120000)
  const log = await b.eval(`(async () => {
    const g = window.__game
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const until = async (fn, ms = 60000) => { const w = performance.now(); while (!fn() && performance.now() - w < ms) await sleep(100); return fn() }
    const out = []

    g.scene.getScene('HomeScene').start()
    await until(() => g.scene.getScene('MenuScene').scene.isActive())
    g.scene.getScene('MenuScene').choose('beast')
    await until(() => g.scene.getScene('LobbyScene').scene.isActive() && g.scene.getScene('LobbyScene').roomViews)
    g.scene.getScene('LobbyScene').enter(1)
    await until(() => g.scene.getScene('GameScene').player?.alive)
    const s = g.scene.getScene('GameScene')
    await sleep(3000)

    // Stand the player in the thick of it: pull the nearest hunters close, so
    // the frame shows a fight rather than an empty meadow.
    const me = s.player
    me.invulnerableUntil = 1e12

    // Walk to the middle of the arena rather than teleporting: hunters spawn on
    // the safe edge, where the camera clamps against the world bounds and the
    // player sits in a corner of the frame. Walking also respects the walls.
    const bounds = s.cameras.main.getBounds()
    const cx = bounds.centerX
    const cy = bounds.centerY
    const walked = performance.now()
    while (Math.hypot(cx - me.x, cy - me.y) > 90 && performance.now() - walked < 20000) {
      const d = new Phaser.Math.Vector2(cx - me.x, cy - me.y).normalize()
      me.intent.set(d.x, d.y)
      await sleep(50)
    }
    me.intent.set(0, 0)
    out.push('walked to ' + Math.round(me.x) + ',' + Math.round(me.y))
    await sleep(600)
    const others = s.bots.filter(x => x.alive)
      .sort((a, c) => Phaser.Math.Distance.Between(me.x, me.y, a.x, a.y) - Phaser.Math.Distance.Between(me.x, me.y, c.x, c.y))
      .slice(0, 4)
    // A fan in front of the player, spread far enough apart that the name and
    // bounty over each Axie stays readable.
    const fan = [{ a: -0.72, r: 250 }, { a: -0.24, r: 185 }, { a: 0.26, r: 200 }, { a: 0.74, r: 265 }]
    others.forEach((o, i) => {
      const { a, r } = fan[i % fan.length]
      o.pos.set(me.x + Math.cos(a) * r, me.y + Math.sin(a) * r)
      o.sprite.setPosition(o.x, o.y)
      o.aim = a + Math.PI
      o.wilds && (o.wilds.bounty = 1.6 + i * 0.8)
    })
    // Let the camera catch up to the player's new spot before the swing.
    await sleep(900)

    // Charged, aimed at the nearest, then fired: the plates land on the target.
    me.charge = 1
    const target = others[1] ?? others[0]
    me.aim = Math.atan2(target.y - me.y, target.x - me.x)
    me.special(s.bots.filter(x => x.alive), s.time.now, { x: target.x, y: target.y })
    out.push('special fired at ' + target.axieClass)
    await sleep(220)
    out.push('hunters in frame: ' + s.bots.filter(x => x.alive).length)
    return out.join(' | ')
  })()`)
  console.log(log)
  console.log('saved', await b.screenshot(out))
} finally {
  b.close()
}
