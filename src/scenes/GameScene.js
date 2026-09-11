import Phaser from 'phaser'
import Fighter from '../entities/Fighter.js'
import BotBrain from '../ai/BotBrain.js'
import { ARENA_PALETTE } from '../axie/palette.js'
import Arena, { WORLD } from '../arena/Arena.js'
import { createFxTextures, ambientMotes } from '../fx/Juice.js'
import { playPlate } from '../fx/SkillVfx.js'


export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' })
  }

  init(data) {
    this.builds = data.builds
    this.playerClass = data.playerClass
  }

  create() {
    // Reached only if the scene is started without data (a stale link, a
    // reload mid-match). Rebuild from scratch rather than throwing.
    if (!this.builds) {
      this.scene.start('BootScene')
      return
    }

    this.freezeUntil = 0
    createFxTextures(this)

    this.arena = new Arena(this)
    this.arenaBounds = this.arena.bounds
    this.arena.draw()

    const available = Object.keys(this.builds)
    const playerClass = available.includes(this.playerClass) ? this.playerClass : available[0]

    this.player = new Fighter(this, WORLD.width / 2, WORLD.height / 2, {
      axieClass: playerClass, build: this.builds[playerClass], isPlayer: true, name: 'you',
    })

    this.bots = available.filter(c => c !== playerClass).map((axieClass, i) => {
      const spot = this.findSpawn()
      const bot = new Fighter(this, spot.x, spot.y, {
        axieClass, build: this.builds[axieClass], name: `${axieClass}-${i + 1}`,
      })
      bot.brain = new BotBrain(bot)
      return bot
    })

    this.fighters = [this.player, ...this.bots]
    this.projectiles = []
    this.zones = []

    ambientMotes(this, { left: 0, top: 0, right: WORLD.width, bottom: WORLD.height })
    this.cameras.main.setBackgroundColor(0x24401c)

    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE,SHIFT')
    this.input.on('pointerdown', p => {
      if (p.leftButtonDown()) this.playerSwing()
      else if (p.rightButtonDown()) this.playerSpecial()
    })
    this.input.keyboard.on('keydown-SPACE', () => this.playerDash())
    this.input.keyboard.on('keydown-SHIFT', () => this.playerDash())
    this.input.keyboard.on('keydown-E', () => this.playerSpecial())
    this.input.keyboard.on('keydown-Q', () => this.playerSpecial())
    this.input.mouse?.disableContextMenu()

    this.buildReticle()

    this.matchOver = false
    this.startedAt = this.time.now
    this.kills = 0

    const cam = this.cameras.main
    cam.setBounds(0, 0, WORLD.width, WORLD.height)
    cam.startFollow(this.player.sprite.root, true, 0.11, 0.11)
    cam.setZoom(1.15)
    // Small dead zone so tiny movements do not drag the whole view.
    cam.setDeadzone(140, 110)

    // Guarded: postFX needs WebGL. Falls back to a clean flat look on canvas.
    if (cam.postFX) {
      // Heavier vignette, far less bloom: a sunlit field blows out otherwise,
      // and the HUD has to stay readable against it.
      // Just enough falloff to seat the HUD; the field should stay sunlit.
      cam.postFX.addVignette(0.5, 0.5, 0.95, 0.2)
      cam.postFX.addBloom(0xffffff, 0.9, 0.9, 0.5, 1.02)
    }

    this.scene.launch('UIScene')
  }

  /** A spawn point clear of cover and clear of everyone already placed. */
  findSpawn() {
    const b = this.arenaBounds
    for (let i = 0; i < 80; i++) {
      const x = Phaser.Math.Between(b.left + 60, b.right - 60)
      const y = Phaser.Math.Between(b.top + 60, b.bottom - 60)
      if (this.arena.wallAt(x, y, 70)) continue
      const clashes = [this.player, ...(this.bots ?? [])]
        .some(f => f && Phaser.Math.Distance.Between(x, y, f.x, f.y) < 320)
      if (!clashes) return { x, y }
    }
    return { x: b.left + 200, y: b.top + 200 }
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
    if (this.matchOver) return
    this.player.swing(this.fighters, this.time.now)
  }

  /** Called by the ability system when a special fires. */
  playSkillVfx(fighter, spec) {
    playPlate(this, fighter, spec)
  }

  playerSpecial() {
    if (this.matchOver) return
    const pointer = this.input.activePointer
    const aimPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
    this.player.special(this.fighters, this.time.now, aimPoint)
  }

  playerDash() {
    if (this.matchOver) return
    this.player.dash(this.player.intent, this.time.now)
  }

  /** A whiff still costs the cooldown, so the swing has to be earned. */
  swingMiss(fighter) {
    if (fighter !== this.player) return
    this.cameras.main.shake(60, 0.0015)
  }

  onFighterDown(fighter, killer) {
    if (this.matchOver) return
    if (killer === this.player && fighter !== this.player) this.kills++

    if (fighter === this.player) {
      this.cameras.main.flash(220, 90, 10, 30)
      return this.endMatch(false)
    }
    if (this.bots.every(b => !b.alive)) this.endMatch(true)
  }

  /** Let the death land before the panel appears, then freeze the arena. */
  endMatch(won) {
    this.matchOver = true
    this.reticle.clear()

    this.time.delayedCall(won ? 700 : 900, () => {
      this.scene.pause()
      this.scene.stop('UIScene')
      this.scene.launch('ResultScene', {
        won,
        axieClass: this.player.axieClass,
        kills: this.kills,
        seconds: Math.round((this.time.now - this.startedAt) / 1000),
        builds: this.builds,
      })
    })
  }

  update(time, delta) {
    // Hit-stop: freeze movement, let tweens and particles keep playing.
    const frozen = time < this.freezeUntil

    if (!frozen) {
      const k = this.keys
      this.player.intent.set(
        this.matchOver ? 0 : (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0),
        this.matchOver ? 0 : (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0),
      )
      if (!this.matchOver) this.updateAim()

      const look = this.matchOver ? 0 : 70
      const cam = this.cameras.main
      cam.followOffset.lerp(
        new Phaser.Math.Vector2(
          -Math.cos(this.player.aim) * look,
          -Math.sin(this.player.aim) * look,
        ), 0.06,
      )

      for (const bot of this.bots) bot.brain.update(time, this.fighters)
      for (const f of this.fighters) f.update(delta)

      for (const p of this.projectiles) p.update(delta, this.fighters)
      for (const z of this.zones) z.update(delta, this.fighters)
      this.projectiles = this.projectiles.filter(p => !p.dead)
      this.zones = this.zones.filter(z => !z.dead)
    }

    if (!this.matchOver) this.drawReticle()

  }
}
