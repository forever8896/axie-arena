import Phaser from 'phaser'
import Fighter from '../entities/Fighter.js'
import BotBrain from '../ai/BotBrain.js'
import { ARENA_PALETTE } from '../axie/palette.js'
import { createFxTextures, ambientMotes } from '../fx/Juice.js'

const ARENA = { width: 1700, height: 1300 }

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' })
  }

  init(data) {
    this.builds = data.builds
    this.playerClass = data.playerClass
  }

  create() {
    this.freezeUntil = 0
    this.arenaBounds = {
      left: 90, top: 110,
      right: ARENA.width - 90,
      bottom: ARENA.height - 90,
    }

    createFxTextures(this)
    this.drawArena()

    const available = Object.keys(this.builds)
    const playerClass = available.includes(this.playerClass) ? this.playerClass : available[0]

    this.player = new Fighter(this, ARENA.width / 2, ARENA.height / 2, {
      axieClass: playerClass, build: this.builds[playerClass], isPlayer: true, name: 'you',
    })

    this.bots = available.filter(c => c !== playerClass).map((axieClass, i) => {
      const bot = new Fighter(
        this,
        Phaser.Math.Between(this.arenaBounds.left, this.arenaBounds.right),
        Phaser.Math.Between(this.arenaBounds.top, this.arenaBounds.bottom),
        { axieClass, build: this.builds[axieClass], name: `${axieClass}-${i + 1}` },
      )
      bot.brain = new BotBrain(bot)
      return bot
    })

    this.fighters = [this.player, ...this.bots]

    ambientMotes(this, { left: 0, top: 0, right: ARENA.width, bottom: ARENA.height })

    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE,SHIFT')
    this.input.on('pointerdown', p => { if (p.leftButtonDown()) this.playerSwing() })
    this.input.keyboard.on('keydown-SPACE', () => this.playerDash())
    this.input.keyboard.on('keydown-SHIFT', () => this.playerDash())
    this.input.mouse?.disableContextMenu()

    this.buildReticle()

    const cam = this.cameras.main
    cam.setBounds(0, 0, ARENA.width, ARENA.height)
    cam.startFollow(this.player.sprite.root, true, 0.09, 0.09)
    cam.setZoom(1.15)

    // Guarded: postFX needs WebGL. Falls back to a clean flat look on canvas.
    if (cam.postFX) {
      cam.postFX.addVignette(0.5, 0.5, 0.78, 0.42)
      cam.postFX.addBloom(0xffffff, 1, 1, 1.05, 1.15)
    }

    this.scene.launch('UIScene')
  }

  drawArena() {
    const P = ARENA_PALETTE
    const g = this.add.graphics().setDepth(-100)

    g.fillStyle(P.deep, 1).fillRect(-400, -400, ARENA.width + 800, ARENA.height + 800)

    // A lit pool in the middle of the floor: concentric rings, brightest inside.
    const cx = ARENA.width / 2
    const cy = ARENA.height / 2
    const maxR = Math.max(ARENA.width, ARENA.height) * 0.62
    for (let i = 14; i >= 0; i--) {
      const t = i / 14
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(P.floorLit),
        Phaser.Display.Color.ValueToColor(P.deep),
        14, i,
      )
      g.fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b), 1)
      g.fillEllipse(cx, cy, maxR * 2 * t + 260, maxR * 1.5 * t + 200)
    }

    // Floor grid, fading out toward the edges.
    const gl = this.add.graphics().setDepth(-98)
    for (let x = 0; x <= ARENA.width; x += 100) {
      const fade = 1 - Math.abs(x - cx) / (ARENA.width * 0.7)
      gl.lineStyle(1, P.ring, Math.max(0.04, fade * 0.22))
      gl.lineBetween(x, 0, x, ARENA.height)
    }
    for (let y = 0; y <= ARENA.height; y += 100) {
      const fade = 1 - Math.abs(y - cy) / (ARENA.height * 0.7)
      gl.lineStyle(1, P.ring, Math.max(0.04, fade * 0.22))
      gl.lineBetween(0, y, ARENA.width, y)
    }

    // Arena boundary: a glowing double ring.
    const ring = this.add.graphics().setDepth(-96)
    ring.lineStyle(6, P.glow, 0.16)
    ring.strokeRoundedRect(56, 76, ARENA.width - 112, ARENA.height - 152, 90)
    ring.lineStyle(2, P.glow, 0.5)
    ring.strokeRoundedRect(62, 82, ARENA.width - 124, ARENA.height - 164, 86)

    // Centre mark.
    const mark = this.add.graphics().setDepth(-97)
    mark.lineStyle(2, P.glow, 0.14).strokeCircle(cx, cy, 150)
    mark.lineStyle(1, P.glow, 0.1).strokeCircle(cx, cy, 230)

    this.tweens.add({
      targets: ring, alpha: { from: 0.75, to: 1 },
      duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
  }

  buildReticle() {
    // Shows exactly where the swing lands: the cone, not a crosshair.
    // Ground level: under the fighters, above the arena floor.
    this.reticle = this.add.graphics().setDepth(-20)
  }

  drawReticle() {
    const p = this.player
    const g = this.reticle
    g.clear()
    if (!p.alive) return

    const ready = p.canAttack(this.time.now)
    const color = ready ? p.colors.rim : 0x5b5470
    const alpha = ready ? 0.5 : 0.22

    g.fillStyle(color, alpha * 0.22)
    g.slice(p.x, p.y, p.attackRange, p.aim - p.attackArc / 2, p.aim + p.attackArc / 2)
    g.fillPath()

    g.lineStyle(2, color, alpha)
    g.beginPath()
    g.arc(p.x, p.y, p.attackRange, p.aim - p.attackArc / 2, p.aim + p.attackArc / 2)
    g.strokePath()
  }

  updateAim() {
    const pointer = this.input.activePointer
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
    this.player.aim = Math.atan2(world.y - this.player.y, world.x - this.player.x)
  }

  playerSwing() {
    this.player.swing(this.bots, this.time.now)
  }

  playerDash() {
    this.player.dash(this.player.intent, this.time.now)
  }

  /** A whiff still costs the cooldown, so the swing has to be earned. */
  swingMiss(fighter) {
    if (fighter !== this.player) return
    this.cameras.main.shake(60, 0.0015)
  }

  onFighterDown(fighter) {
    if (fighter === this.player) {
      this.cameras.main.flash(220, 90, 10, 30)
    }
  }

  update(time, delta) {
    // Hit-stop: freeze movement, let tweens and particles keep playing.
    const frozen = time < this.freezeUntil

    if (!frozen) {
      const k = this.keys
      this.player.intent.set(
        (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0),
        (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0),
      )
      this.updateAim()

      for (const bot of this.bots) bot.brain.update(time, this.fighters)
      for (const f of this.fighters) f.update(delta)
    }

    this.drawReticle()

  }
}
