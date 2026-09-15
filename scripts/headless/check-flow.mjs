/**
 * End-to-end check of the whole loop, including animation, in headless
 * Chromium: home, class select, a match, victory, fight again, and a basic
 * attack after the restart. Needs the dev server running.
 *
 * Usage: npm run dev, then node scripts/headless/check-flow.mjs
 */
import { launch } from './cdp.mjs'
const b = await launch({ width: 1100, height: 700 })
try {
  await b.goto('http://localhost:5173/')
  await b.waitFor("window.__game?.scene.getScene('HomeScene')?.scene.isActive()", 90000)
  const out = await b.eval(`(async () => {
    const g = window.__game
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const active = () => g.scene.scenes.filter(x => x.scene.isActive()).map(x => x.scene.key).join('+')
    const until = async (fn, ms = 60000) => { const w = performance.now(); while (!fn() && performance.now() - w < ms) await sleep(100); return fn() }
    const log = []

    g.scene.getScene('HomeScene').start()
    log.push('home->PLAY: ' + (await until(() => g.scene.getScene('MenuScene').scene.isActive()) && active()))
    const menu = g.scene.getScene('MenuScene')
    await sleep(4000)   // let cards cycle through basic and special previews
    log.push('menu cards playing: ' + menu.cards.map(c => c.sprite.rig.playing?.split('/').pop()).join(','))

    menu.choose('bug')
    log.push('pick bug: ' + (await until(() => g.scene.getScene('GameScene').player?.axieClass === 'bug') && active()))
    let s = g.scene.getScene('GameScene')
    s.bots.forEach(bot => { bot.invulnerableUntil = 0; bot.dashUntil = 0; bot.takeDamage(1e6, s.player) })
    log.push('win: ' + (await until(() => g.scene.getScene('ResultScene').scene.isActive()) && active()) + ' | player clip: ' + s.player.sprite.rig.playing)

    const r = g.scene.getScene('ResultScene')
    r.scene.stop('GameScene'); r.scene.stop('UIScene'); r.scene.stop()
    r.scene.start('GameScene', { builds: r.result.builds, playerClass: 'bug' })
    await until(() => g.scene.getScene('GameScene').player?.alive)
    s = g.scene.getScene('GameScene')
    // After "Fight again", attacks must still animate.
    const bot = s.bots[0]
    s.bots.forEach(x => x.brain = { update() {} })
    s.updateAim = () => {}
    s.player.pos.set(1200, 900); bot.pos.set(1110, 900); s.player.aim = Math.PI
    const t0 = s.time.now; await until(() => s.time.now - t0 > 1800)
    s.player.lastAttack = -1e9
    s.player.swing(s.fighters, s.time.now)
    await until(() => s.player.sprite.action?.clip === s.player.kit.basic.anim)
    log.push('fight again, basic clip: ' + s.player.sprite.rig.playing)
    return log
  })()`)
  console.log(out.join('\n'))
} finally { console.log('logs:', JSON.stringify(b.logs.slice(0, 6))); b.close() }
