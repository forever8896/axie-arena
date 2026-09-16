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
import { createFxTextures, ambientMotes } from '../fx/Juice.js'
import { play as playMusic } from '../fx/Music.js'
import { money } from '../wilds/config.js'

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
    this.client.connect({ room: this.roomId, cls: this.playerClass, resume: resumeToken(this.roomId) })
      .then(msg => {
        this.status = 'playing'
        rememberToken(this.roomId, msg.token)
        this.pingTimer = this.time.addEvent({ delay: 2000, loop: true, callback: () => this.client.ping() })
      })
      .catch(err => {
        this.status = 'failed'
        this.hud.banner.setText(`could not join: ${err.message}`)
      })

    this.events.once('shutdown', () => this.teardown())
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
    this.input.keyboard.on('keydown-ESC', () => this.leave())
    this.input.mouse?.disableContextMenu()
  }

  /**
   * Deliberately plain for now: the real HUD reads a Fighter, and pointing it at
   * a snapshot is its own piece of work. This says what a networked room needs
   * to say and nothing more.
   */
  buildHud() {
    const text = (y, size, colour) => this.add.text(16, y, '', {
      fontFamily: 'Rowdies, ui-sans-serif, system-ui, sans-serif',
      fontSize: `${size}px`, color: colour, stroke: '#16200f', strokeThickness: 4,
    }).setScrollFactor(0).setDepth(20000)

    this.hud = {
      bounty: text(14, 22, '#ffd166'),
      room: text(44, 14, '#cfe6b8'),
      banner: text(74, 16, '#ff9db1'),
      link: this.add.text(this.scale.width - 16, 14, '', {
        fontFamily: 'ui-monospace, monospace', fontSize: '12px', color: '#9fb08c',
      }).setOrigin(1, 0).setScrollFactor(0).setDepth(20000),
    }
  }

  update(time, delta) {
    const client = this.client
    if (!client) return

    client.advance(delta)
    const view = client.view()
    this.view.render(view, client.drainEvents(), delta)

    const me = view?.me
    if (me) {
      // The camera follows the drawn position rather than a sprite, because the
      // sprite is only ever a picture of where the room said we were.
      this.follow(me, delta)
      this.drawReticle(me)
      this.sendInput(me)
    }
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

  updateHud(view) {
    const me = view?.me
    const room = this.client.room
    if (me && room) {
      this.hud.bounty.setText(`BOUNTY ${money(me.bounty ?? 0, room.currency)} ${room.currency}`)
      this.hud.room.setText(`${room.name} · ${view.fighters.filter(f => f.alive).length} hunters · reach a Moon Gate to cash out`)
    }
    this.hud.link.setText(`${this.status} · ${Math.round(this.client.latency)}ms`)
    if (this.status === 'dropped') {
      this.hud.banner.setText('connection lost — your Axie is still in the room for a few seconds')
    }
  }

  leave() {
    this.client?.leave()
  }

  onBye() {
    forgetToken(this.roomId)
    this.backToLobby()
  }

  onClose() {
    if (this.status === 'playing') this.status = 'dropped'
  }

  backToLobby() {
    this.teardown()
    this.scene.start('HomeScene', { builds: this.builds })
  }

  teardown() {
    this.pingTimer?.remove()
    this.client?.close()
    this.client = null
    this.view?.destroy()
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
