/**
 * End-to-end check of the whole loop, including animation, in headless
 * Chromium: home, class select, a match, victory, fight again, and a basic
 * attack after the restart; then the Endless Wilds path: home, class select,
 * lobby, a room, a fall, re-entry and back to the lobby. Needs the dev server.
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

    // The Endless Wilds, through the same doors a player uses.
    ;['GameScene', 'UIScene', 'ResultScene'].forEach(k => g.scene.stop(k))
    g.scene.start('HomeScene', { builds: r.result.builds })
    await until(() => g.scene.getScene('HomeScene').scene.isActive())
    g.scene.getScene('HomeScene').start('wilds')
    await until(() => g.scene.getScene('MenuScene').scene.isActive() && g.scene.getScene('MenuScene').mode === 'wilds')
    g.scene.getScene('MenuScene').choose('reptile')
    log.push('wilds -> lobby: ' + (await until(() => g.scene.getScene('LobbyScene').scene.isActive() && g.scene.getScene('LobbyScene').roomViews) && active()))
    g.scene.getScene('LobbyScene').enter(1)
    await until(() => g.scene.getScene('UIScene').wildsHud && g.scene.getScene('GameScene').player?.alive)
    s = g.scene.getScene('GameScene')
    log.push('room: ' + s.wilds.room.name + ' | hunters ' + s.bots.filter(b => b.alive).length + ' | ' + active())
    s.player.invulnerableUntil = 0; s.player.spawnShieldUntil = 0
    s.player.takeDamage(1e6, s.bots.find(b => b.alive))
    await until(() => g.scene.getScene('UIScene').wildsHud.panelRoot)
    log.push('fell: panel ' + s.wilds.panel?.kind + ', scene still running ' + s.sys.isActive())
    g.scene.getScene('UIScene').wildsHud.primary()
    log.push('re-enter: ' + (await until(() => s.player.alive) && 'alive, bounty ' + s.player.wilds.bounty.toFixed(2)))
    s.wilds.requestLeave(); s.wilds.forfeit(); s.wilds.toLobby()
    log.push('back to lobby: ' + (await until(() => g.scene.getScene('LobbyScene').scene.isActive()) && active()))
    return log
  })()`)
  console.log(out.join('\n'))
} finally { console.log('logs:', JSON.stringify(b.logs.slice(0, 6))); b.close() }
