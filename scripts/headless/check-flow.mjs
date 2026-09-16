/**
 * End-to-end check of the whole loop in headless Chromium: home, class select,
 * the Endless Wilds lobby, a room, a fall, re-entry, back to the lobby, and
 * the tutorial from the same home screen. Needs the dev server running.
 *
 * Usage: npm run dev, then node scripts/headless/check-flow.mjs
 */
import { launch } from './cdp.mjs'
const b = await launch({ width: 1100, height: 700 })
try {
  await b.goto('http://localhost:5173/')
  await b.waitFor("!!window.__game?.scene.getScene('HomeScene')?.scene.isActive()", 90000)
  const out = await b.eval(`(async () => {
    const g = window.__game
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const active = () => g.scene.scenes.filter(x => x.scene.isActive()).map(x => x.scene.key).join('+')
    const until = async (fn, ms = 60000) => { const w = performance.now(); while (!fn() && performance.now() - w < ms) await sleep(100); return fn() }
    const log = []

    g.scene.getScene('HomeScene').start()
    log.push('home->PLAY: ' + (await until(() => g.scene.getScene('MenuScene').scene.isActive()) && active()))
    const menu = g.scene.getScene('MenuScene')
    const builds = menu.builds
    log.push('menu mode: ' + menu.mode)
    await sleep(4000)   // let the cards cycle through basic and special previews
    log.push('menu cards playing: ' + menu.cards.map(c => c.sprite.rig.playing?.split('/').pop()).join(','))

    menu.choose('reptile')
    log.push('class select -> lobby: ' + (await until(() => g.scene.getScene('LobbyScene').scene.isActive() && g.scene.getScene('LobbyScene').roomViews) && active()))

    g.scene.getScene('LobbyScene').enter(1)
    await until(() => g.scene.getScene('UIScene').wildsHud && g.scene.getScene('GameScene').player?.alive)
    const s = g.scene.getScene('GameScene')
    log.push('room: ' + s.wilds.room.name + ' | hunters ' + s.bots.filter(x => x.alive).length + ' | ' + active())
    // The map is built from the arena itself, with a portrait per Axie.
    const ui = g.scene.getScene('UIScene')
    log.push('minimap: layers ' + ui.mmRoot.length + ' | portrait ' + g.textures.exists('mini-' + s.player.axieClass) + ' | icons ' + ui.mmIcons.size)

    s.player.invulnerableUntil = 0; s.player.spawnShieldUntil = 0
    s.player.takeDamage(1e6, s.bots.find(x => x.alive))
    await until(() => ui.wildsHud.panelRoot)
    log.push('fell: panel ' + s.wilds.panel?.kind + ', room still running ' + s.sys.isActive())

    ui.wildsHud.primary()
    log.push('re-enter: ' + (await until(() => s.player.alive) && 'alive, bounty ' + s.player.wilds.bounty.toFixed(2)))
    // A basic must still animate after re-entering.
    const bot = s.bots.find(x => x.alive)
    s.bots.forEach(x => { x.brain = { update() {} } })
    s.updateAim = () => {}
    s.player.pos.set(bot.x - 80, bot.y)
    s.player.aim = 0
    s.player.spawnShieldUntil = 0
    s.player.lastAttack = -1e9
    s.player.swing(s.fighters, s.time.now)
    await until(() => s.player.sprite.action?.clip === s.player.kit.basic.anim)
    log.push('basic clip: ' + s.player.sprite.rig.playing)

    s.wilds.requestLeave(); s.wilds.forfeit(); s.wilds.toLobby()
    log.push('back to lobby: ' + (await until(() => g.scene.getScene('LobbyScene').scene.isActive()) && active()))

    // The tutorial, from the same home screen.
    ;['GameScene', 'UIScene', 'LobbyScene'].forEach(k => g.scene.stop(k))
    g.scene.start('HomeScene', { builds })
    await until(() => g.scene.getScene('HomeScene').scene.isActive())
    g.scene.getScene('HomeScene').start('tutorial')
    await until(() => g.scene.getScene('MenuScene').scene.isActive() && g.scene.getScene('MenuScene').mode === 'tutorial')
    g.scene.getScene('MenuScene').choose('plant')
    await until(() => g.scene.getScene('GameScene').tutorial?.step && g.scene.getScene('UIScene').tutorialHud)
    log.push('tutorial: step ' + g.scene.getScene('GameScene').tutorial.step.id + ' | ' + active())
    return log
  })()`)
  console.log(out.join('\n'))
} finally { console.log('logs:', JSON.stringify(b.logs.slice(0, 6))); b.close() }
