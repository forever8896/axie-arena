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
import Prediction from '../net/predict.js'
import { createFxTextures, ambientMotes } from '../fx/Juice.js'
import { play as playMusic } from '../fx/Music.js'
import { POWERUPS } from '../arena/boonConfig.js'
import { wallet } from '../wilds/Wallet.js'
import { available, wsUrl } from '../net/regions.js'

export default class NetScene extends Phaser.Scene {
  constructor() {
    super({ key: 'NetScene' })
  }

  init(data) {
    this.builds = data.builds
    this.playerClass = data.playerClass ?? 'beast'
    this.roomId = data.roomId ?? 'glade'
    this.regionId = data.regionId ?? null
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
    this.predict = new Prediction()
    this.lastSnapT = -1
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

    this.client = this.connection()
    this.client.on('bye', why => this.onBye(why))
    this.client.on('close', () => this.onClose())
    this.status = 'connecting'
    this.join()

    this.events.once('shutdown', () => this.teardown())
  }

  /**
   * A development build can be pointed at another room server, which is how the
   * feel of a real connection gets measured: the page served from here, the room
   * running where it actually runs. Never in a built game, where a socket that
   * a link can redirect is a way to lie to a player about who they are playing
   * with.
   */
  connection() {
    const override = import.meta.env.DEV ? new URLSearchParams(location.search).get('server') : null
    // Each region is its own set of rooms, so the room the lobby showed only
    // exists on the server the lobby was listing.
    const region = available().find(r => r.id === this.regionId)
    const url = override ?? (region ? wsUrl(region) : null)
    return new RoomClient({ name: this.playerName, ...(url ? { url } : {}) })
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
        // A version refusal means this page is older than the room. That is
        // fixable by the person reading it, so it says how rather than showing
        // them the word "version".
        this.hud.banner.setText(err.message === 'version'
          ? 'Lunacy was updated — reload the page to play'
          : `could not join: ${err.message}`)
      })
  }

  /** Walk back in after falling: a fresh stake, the same room. */
  rejoin() {
    forgetToken(this.roomId)
    this.status = 'connecting'
    this.staked = false
    this.client.close()
    this.client = this.connection()
    this.client.on('bye', why => this.onBye(why))
    this.client.on('close', () => this.onClose())
    this.view.destroy()
    this.view = new RoomView(this, this.builds)
    this.predict = new Prediction()
    this.lastSnapT = -1
    this.scene.stop('UIScene')
    this.join()
  }

  bindInput() {
    this.keys = this.input.keyboard.addKeys('W,A,S,D,Q,F,R,SPACE,SHIFT')
    this.input.on('pointerdown', p => {
      if (p.leftButtonDown()) this.want('attack')
      else if (p.rightButtonDown()) this.want('special')
    })
    this.input.keyboard.on('keydown-SPACE', () => this.want('dash'))
    this.input.keyboard.on('keydown-SHIFT', () => this.want('dash'))
    this.input.keyboard.on('keydown-E', () => this.want('special'))
    // The guard is held rather than pressed: it is a state you maintain, and
    // the decision is whether to spend stamina on it, not whether you can hit a
    // 200ms window.
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

    // Your own Axie is drawn where this client has worked out it is, not where
    // the room said it was a round trip ago. Everyone else is interpolated,
    // because the room's word is all there is about them.
    const events = client.drainEvents()
    this.reconcile(view, client)
    this.predict.settle(delta)
    this.view.render(view, events, delta, this.predict.fighter ? {
      id: client.you, x: this.predict.x, y: this.predict.y, speed: this.predict.speed,
    } : null, { guard: this.holdingGuard, aiming: this.holdingAim })

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
      // The camera and the reach marker follow the predicted body, or they
      // would lag behind the Axie the player is actually steering.
      const here = this.predict.fighter ? { ...me, x: this.predict.x, y: this.predict.y } : me
      this.follow(here, delta)
      this.drawReticle(here)
      this.sendInput(here, delta)
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

  /**
   * An action the player asked for: queued for the room, and — when this
   * client's own copy of the rules says it is allowed — shown immediately.
   *
   * Waiting a round trip to see your own Axie move is what made this feel
   * broken. The room still decides what the swing did; this only decides that
   * you swung, which you did, because you pressed the button.
   */
  want(action) {
    if (!this.client || this.status !== 'playing') return
    this.client.act(action)
    if (!this.predict.allows(action)) return
    const actor = this.view.actors.get(this.client.you)
    if (action === 'attack') this.view.echo('swing', actor, this.aim ?? 0)
    else if (action === 'dash') this.view.echo('dash', actor, this.aim ?? 0)
    else if (action === 'parry') this.view.echo('parry', actor, this.aim ?? 0)
  }

  /**
   * What the player wants, at the room's own rate. Every input sent is also
   * run through the prediction, so the two stay in step.
   */
  sendInput(me, delta) {
    const k = this.keys
    const pointer = this.input.activePointer
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
    this.aim = Math.atan2(world.y - me.y, world.x - me.x)
    // Remembered for the renderer, so the guard appears under the hand that
    // raised it rather than after a round trip.
    const guard = k.Q.isDown || k.F.isDown
    this.holdingGuard = guard && this.predict.allows('guard')
    // A Moonshot is aimed, not fired: the key is held while you point it, and
    // it goes off when you let go. Both edges are read off this one level.
    const aiming = k.R.isDown
    this.holdingAim = aiming && (this.aimingNow || this.predict.allows('moon'))
    // Pressing it before the meter is full did nothing whatsoever — no line, no
    // sound, no refusal — which is the same thing a broken key looks like.
    if (aiming && !this.holdingAim && !this.refusedAim) {
      this.refusedAim = true
      this.view.refuse(this.client.you)
    } else if (!aiming) {
      this.refusedAim = false
    }
    this.aimingNow = this.holdingAim
    const sent = this.client.pump({
      move: {
        x: (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0),
        y: (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0),
      },
      aim: this.aim,
      point: { x: world.x, y: world.y },
      guard,
      aiming: this.holdingAim,
    }, delta)
    for (const input of sent) this.predict.step(input, input.seq)
  }

  /** Line the prediction back up with the room, every time it speaks. */
  reconcile(view, client) {
    const latest = client.buffer.at(-1)
    const snap = latest?.fighters.find(f => f.id === client.you)
    if (!snap) return
    if (!this.predict.fighter) this.predict.begin(snap, this.time.now)
    // Once per snapshot: reconciling against one already answered would rewind
    // the same correction every frame and fight the player's own input.
    if (latest.t === this.lastSnapT) return
    this.lastSnapT = latest.t
    this.predict.reconcile(snap, client.acked)
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
    const ping = Math.round(this.client.latency)
    this.hud.link.setText(`MULTIPLAYER · ${this.status.toUpperCase()} · ${ping}ms · PREDICTED`)
      .setColor(live ? (ping > 250 ? '#ffc22e' : '#7f8c6a') : '#ffc22e')
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
    this.scene.start('LobbyScene', { builds: this.builds, playerClass: this.playerClass, net: true, regionId: this.regionId })
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
