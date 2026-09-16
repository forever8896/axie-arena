/**
 * A room on a server, played from this browser.
 *
 * The scene owns three things and no rules: the connection, the camera, and the
 * player's hands. Every frame it reads what the player wants and sends it, then
 * draws whatever the room last said was true — so a fight here and the same
 * fight on somebody else's screen are the same fight, because neither screen is
 * deciding it.
 *
 * Its local-only sibling GameScene still runs the rules in the page for the
 * tutorial, where there is nobody else to agree with.
 */
import Phaser from 'phaser'
import Arena, { WORLD } from '../arena/Arena.js'
import RoomClient from '../net/client.js'
import RoomView from '../net/RoomView.js'
import NetWilds from '../net/NetWilds.js'
import { createFxTextures, ambientMotes } from '../fx/Juice.js'
import { play as playMusic } from '../fx/Music.js'
import { POWERUPS } from '../arena/boonConfig.js'
import { wallet } from '../wilds/Wallet.js'

export default class NetScene extends Phaser.Scene {
  constructor() {
    super({ key: 'NetScene' })
  }

  init(data) {
    this.builds = data.builds
    this.playerClass = data.playerClass ?? 'beast'
    this.roomId = data.roomId ?? 'glade'
    this.playerName = data.name ?? 'You'
  }

  create() {
    if (!this.builds) {
      this.scene.start('BootScene')
      return
    }

    playMusic('arena')
    createFxTextures(this)

    this.arena = new Arena(this)
    this.arena.draw()
    ambientMotes(this, { left: 0, top: 0, right: WORLD.width, bottom: WORLD.height })
    this.cameras.main.setBackgroundColor(0x24401c)

    this.view = new RoomView(this, this.builds)
    this.reticle = this.add.graphics().setDepth(-20)

    // The surface UIScene and WildsHud read. They were written against the
    // local game; a networked room fills the same shapes from snapshots, so
    // the multiplayer game gets the real HUD rather than a lesser copy.
    this.fighters = []
    this.bots = []
    this.player = null
    this.wilds = null
    this.tutorial = null
    this.field = null
    this.powerUps = { orbs: [] }
    this.moonwells = { wells: [] }
    this.announcement = null
    this.arenaBounds = this.arena.bounds

    const cam = this.cameras.main
    cam.setBounds(0, 0, WORLD.width, WORLD.height)
    cam.setZoom(1.15)
    cam.setDeadzone(140, 110)
    if (cam.postFX) {
      cam.postFX.addVignette(0.5, 0.5, 0.95, 0.2)
      cam.postFX.addBloom(0xffffff, 0.9, 0.9, 0.5, 1.02)
    }

    this.buildHud()
    this.bindInput()

    this.client = new RoomClient({ name: this.playerName })
    this.client.on('bye', why => this.onBye(why))
    this.client.on('close', () => this.onClose())
    this.status = 'connecting'
    this.join()

    this.events.once('shutdown', () => this.teardown())
  }

  /**
   * Take a seat. The HUD only exists once the room has said which one is ours,
   * because until then there is no room to draw and nothing to say about it.
   */
  join() {
    this.client.connect({ room: this.roomId, cls: this.playerClass, resume: resumeToken(this.roomId) })
      .then(msg => {
        this.status = 'playing'
        rememberToken(this.roomId, msg.token)
        this.view.currency = msg.room.currency
        this.wilds = new NetWilds(this, msg.room)
        if (!this.staked) {
          wallet.enter(msg.room)
          this.staked = true
        }
        this.scene.launch('UIScene', { host: 'NetScene' })
        this.pingTimer?.remove()
        this.pingTimer = this.time.addEvent({ delay: 2000, loop: true, callback: () => this.client.ping() })
      })
      .catch(err => {
        this.status = 'failed'
        this.hud.banner.setText(`could not join: ${err.message}`)
      })
  }

  /** Walk back in after falling: a fresh stake, the same room. */
  rejoin() {
    forgetToken(this.roomId)
    this.status = 'connecting'
    this.staked = false
    this.client.close()
    this.client = new RoomClient({ name: this.playerName })
    this.client.on('bye', why => this.onBye(why))
    this.client.on('close', () => this.onClose())
    this.view.destroy()
    this.view = new RoomView(this, this.builds)
    this.scene.stop('UIScene')
    this.join()
  }

  bindInput() {
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE,SHIFT')
    this.input.on('pointerdown', p => {
      if (p.leftButtonDown()) this.client?.act('attack')
      else if (p.rightButtonDown()) this.client?.act('special')
    })
    this.input.keyboard.on('keydown-SPACE', () => this.client?.act('dash'))
    this.input.keyboard.on('keydown-SHIFT', () => this.client?.act('dash'))
    this.input.keyboard.on('keydown-E', () => this.client?.act('special'))
    this.input.keyboard.on('keydown-Q', () => this.client?.act('parry'))
    this.input.keyboard.on('keydown-F', () => this.client?.act('parry'))
    this.input.keyboard.on('keydown-ESC', () => this.wilds?.requestLeave() ?? this.backToLobby())
    // A panel is waiting for an answer; Enter takes the one it recommends.
    this.input.keyboard.on('keydown-ENTER', () => {
      const ui = this.scene.get('UIScene')
      ui?.wildsHud?.primary?.()
    })
    this.input.mouse?.disableContextMenu()
  }

  /**
   * UIScene draws the room itself. What is left here is what only a networked
   * game has to say: whether the connection is up, and how far away the room is.
   */
  buildHud() {
    this.hud = {
      banner: this.add.text(16, 74, '', {
        fontFamily: 'Rowdies, ui-sans-serif, system-ui, sans-serif',
        fontSize: '16px', color: '#ff9db1', stroke: '#16200f', strokeThickness: 4,
      }).setScrollFactor(0).setDepth(20000),
      // Top left: the only corner the Wilds HUD leaves empty, and clear of the
      // controls strip along the bottom.
      link: this.add.text(16, 16, '', {
        fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#7f8c6a',
      }).setScrollFactor(0).setDepth(20000),
    }
  }

  update(time, delta) {
    const client = this.client
    if (!client) return

    client.advance(delta)
    const view = client.view()
    if (!view) return

    const events = client.drainEvents()
    this.view.render(view, events, delta)

    // The shapes the HUD reads, refreshed from this frame's snapshot.
    this.fighters = [...this.view.actors.values()]
    this.player = this.fighters.find(f => f.isPlayer) ?? null
    this.bots = this.fighters.filter(f => !f.isPlayer)
    this.powerUps.orbs = (view.orbs ?? []).map(o => ({
      ...o, def: POWERUPS[o.type] ?? POWERUPS.fury, dead: false,
    }))
    this.moonwells.wells = (view.wells ?? []).map(w => ({ ...w, radius: w.r, dead: false }))
    if (this.wilds) {
      this.wilds.sync(view, this.view.actors)
      if (this.player?.alive) this.wilds.remember(this.player.wilds.bounty)
      for (const e of events) this.wilds.handle(e, view, client.you)
    }

    const me = view.me
    if (me) {
      // The camera follows the drawn position rather than a sprite, because the
      // sprite is only ever a picture of where the room said we were.
      this.follow(me, delta)
      this.drawReticle(me)
      this.sendInput(me)
    } else {
      this.reticle.clear()
    }
    this.arena.updateCanopies(this.player ?? me)
    this.updateHud(view)
  }

  follow(me, delta) {
    const cam = this.cameras.main
    const look = 70
    const wantX = me.x - cam.width / (2 * cam.zoom) + Math.cos(this.aim ?? 0) * look
    const wantY = me.y - cam.height / (2 * cam.zoom) + Math.sin(this.aim ?? 0) * look
    const t = Math.min(1, delta / 120)
    cam.scrollX += (wantX - cam.scrollX) * t
    cam.scrollY += (wantY - cam.scrollY) * t
  }

  sendInput(me) {
    const k = this.keys
    const pointer = this.input.activePointer
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
    this.aim = Math.atan2(world.y - me.y, world.x - me.x)
    this.client.sendInput({
      move: {
        x: (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0),
        y: (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0),
      },
      aim: this.aim,
      point: { x: world.x, y: world.y },
    })
  }

  /** The reach of your next swing, drawn where the room thinks you are. */
  drawReticle(me) {
    const g = this.reticle
    g.clear()
    if (!me.alive) return
    const colour = 0xd8e8c0
    g.lineStyle(2, colour, 0.4)
    g.beginPath()
    g.arc(me.x, me.y, 150, (this.aim ?? 0) - 0.5, (this.aim ?? 0) + 0.5)
    g.strokePath()
  }

  updateHud() {
    const live = this.status === 'playing'
    this.hud.link.setText(`MULTIPLAYER · ${this.status.toUpperCase()} · ${Math.round(this.client.latency)}ms`)
      .setColor(live ? '#7f8c6a' : '#ffc22e')
    this.hud.banner.setText(this.status === 'dropped'
      ? 'CONNECTION LOST — your Axie stays in the room for a few seconds'
      : '')
  }

  /** Centre-screen callouts, read by UIScene exactly as the local game's are. */
  announce(text, color, at = null) {
    this.announcement = { text, color, at, until: this.time.now + 2200 }
  }

  onBye() {
    forgetToken(this.roomId)
    // A goodbye answers a leave the player already chose; the panel that asked
    // stays up to report what it cost them, and takes them out of the room.
    if (!this.wilds?.panel) this.backToLobby()
  }

  onClose() {
    if (this.status === 'playing') this.status = 'dropped'
  }

  backToLobby() {
    this.teardown()
    this.scene.stop('UIScene')
    this.scene.start('LobbyScene', { builds: this.builds, playerClass: this.playerClass, net: true })
  }

  teardown() {
    this.pingTimer?.remove()
    this.client?.close()
    this.client = null
    this.view?.destroy()
    this.fighters = []
    this.player = null
  }
}

// --- Coming back to a room you were dropped from ----------------------------

const key = roomId => `lunacy.room.${roomId}`

function rememberToken(roomId, token) {
  try {
    sessionStorage.setItem(key(roomId), token)
  } catch {
    // Private windows and blocked storage: a resume is a convenience, not a
    // requirement, so losing it costs the player nothing but the walk back.
  }
}

function resumeToken(roomId) {
  try {
    return sessionStorage.getItem(key(roomId))
  } catch {
    return null
  }
}

function forgetToken(roomId) {
  try {
    sessionStorage.removeItem(key(roomId))
  } catch {
    // Nothing to forget.
  }
}
