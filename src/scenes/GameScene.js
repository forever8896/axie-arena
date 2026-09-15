import Phaser from 'phaser'
import Fighter from '../entities/Fighter.js'
import BotBrain from '../ai/BotBrain.js'
import { ARENA_PALETTE } from '../axie/palette.js'
import Arena, { WORLD } from '../arena/Arena.js'
import ClosingField from '../arena/ClosingField.js'
import PowerUps, { POWERUPS } from '../arena/PowerUps.js'
import Moonwells from '../arena/Moonwell.js'
import { createFxTextures, ambientMotes } from '../fx/Juice.js'
import { playPlate, playImpactPlate, playStatusPlate } from '../fx/SkillVfx.js'
import { play as playSfx } from '../fx/Sfx.js'
import { PARRY } from '../axie/classKits.js'
import WildsDirector from '../wilds/WildsDirector.js'
import TutorialDirector from '../tutorial/TutorialDirector.js'


export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' })
  }

  init(data) {
    this.builds = data.builds
    this.playerClass = data.playerClass
    // 'showdown' (last one standing, closing field), 'wilds' (endless room)
    // or 'tutorial' (the guided course).
    this.mode = data.mode ?? 'showdown'
    this.room = data.room ?? null
    this.roomSnapshot = data.snapshot ?? null
  }

  create() {
    // Reached only if the scene is started without data (a stale link, a
    // reload mid-match). Rebuild from scratch rather than throwing.
    if (!this.builds) {
      this.scene.start('BootScene')
      return
    }

    createFxTextures(this)

    this.arena = new Arena(this)
    this.arenaBounds = this.arena.bounds
    this.arena.draw()

    const available = Object.keys(this.builds)
    const playerClass = available.includes(this.playerClass) ? this.playerClass : available[0]

    this.projectiles = []
    this.zones = []
    this.wilds = null
    this.tutorial = null
    this.player = null
    this.bots = []
    this.fighters = []

    if (this.mode === 'wilds') {
      this.wilds = new WildsDirector(this, this.room, this.roomSnapshot ?? {})
      this.wilds.begin(playerClass)
    } else if (this.mode === 'tutorial') {
      this.playerClass = playerClass
      this.tutorial = new TutorialDirector(this)
      this.tutorial.begin(playerClass)
    } else {
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
      // Everyone arrives with the authored entrance.
      this.fighters.forEach(f => f.sprite.playState('appear'))
    }

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
    // Q sits under the left hand next to WASD, so a parry never means letting go of movement.
    this.input.keyboard.on('keydown-Q', () => this.playerParry())
    this.input.keyboard.on('keydown-F', () => this.playerParry())
    // In the Wilds there is no match to lose, only a room to leave.
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.tutorial) this.leaveTutorial()
      else this.wilds?.requestLeave()
    })
    this.input.keyboard.on('keydown-TAB', event => {
      event.preventDefault?.()
      this.tutorial?.skip()
    })
    this.input.mouse?.disableContextMenu()

    this.buildReticle()

    this.matchOver = false
    // Stamped on the first frame, not here. A scene's clock only advances in
    // its own update, so during create() time.now still reads the moment the
    // previous match paused. "Fight again" after sitting on the result screen
    // then started a match that believed it was already that far in: 26s on
    // the result screen opened a match with the field active and 9% closed.
    this.startedAt = null
    this.kills = 0
    // The Wilds never close: Moon Gates and Blood Moons do the field's job.
    this.field = this.mode === 'showdown' ? new ClosingField(this) : null
    this.powerUps = new PowerUps(this)
    this.moonwells = new Moonwells(this)
    // The tutorial hands these out one lesson at a time.
    if (this.tutorial) {
      this.powerUps.enabled = false
      this.moonwells.enabled = false
    }
    // Read by the HUD for its centre-screen callouts.
    this.announcement = null

    const cam = this.cameras.main
    cam.setBounds(0, 0, WORLD.width, WORLD.height)
    if (this.mode === 'showdown') cam.startFollow(this.player.sprite.root, true, 0.11, 0.11)
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

    // Out of the way while a swing plays, so the class's own strike reads.
    const now = this.time.now
    if (now - p.lastAttack < 260) return

    // A marker, not a shape. The old filled wedge was the same silhouette for
    // every class and drowned out the strikes: it is why every attack looked
    // alike. Now it is only the reach edge, plus two short ticks at the sides.
    const ready = p.canAttack(now)
    const color = ready ? p.colors.rim : 0x9aa88a
    const alpha = ready ? 0.55 : 0.2
    const r = p.attackRange
    const a0 = p.aim - p.attackArc / 2
    const a1 = p.aim + p.attackArc / 2

    g.lineStyle(2, color, alpha)
    g.beginPath()
    g.arc(p.x, p.y, r, a0, a1)
    g.strokePath()

    g.lineStyle(2, color, alpha * 0.8)
    for (const a of [a0, a1]) {
      g.lineBetween(
        p.x + Math.cos(a) * (r - 12), p.y + Math.sin(a) * (r - 12),
        p.x + Math.cos(a) * r, p.y + Math.sin(a) * r,
      )
    }
  }

  updateAim() {
    const pointer = this.input.activePointer
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
    this.player.aim = Math.atan2(world.y - this.player.y, world.x - this.player.x)
  }

  playerSwing() {
    if (this.matchOver || this.wilds?.panel || this.tutorial?.finished) return
    this.player.swing(this.fighters, this.time.now)
  }

  /** Called by the ability system when a special fires. */
  playSkillVfx(fighter, spec) {
    playPlate(this, fighter, spec)
  }

  /** Called when a basic lands: on each fighter hit, or at the whiff point. */
  playImpactVfx(fighter, spec, x, y, aim, opts) {
    playImpactPlate(this, spec.vfx, x, y, aim, opts)
  }

  playerSpecial() {
    if (this.matchOver || this.wilds?.panel) return
    const pointer = this.input.activePointer
    const aimPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
    this.player.special(this.fighters, this.time.now, aimPoint)
  }

  playerDash() {
    if (this.matchOver || this.wilds?.panel) return
    this.player.dash(this.player.intent, this.time.now)
  }

  playerParry() {
    if (this.matchOver || this.wilds?.panel) return
    this.player.parry(this.time.now)
  }

  /**
   * A parry landed. Sold hard — freeze, clang, flash, a word on screen — because
   * it is a read that paid off, and the attacker needs to know what hit them.
   */
  onParry(defender, attacker) {
    defender.freeze(PARRY.freezeMs)
    attacker.freeze(PARRY.freezeMs)

    playSfx(this, 'shield', { volume: 0.75 })
    playStatusPlate(this, defender, 'shield', { size: 1.8 })
    defender.sprite.play('defense/hit-with-shield', { kind: 'stagger', peakAt: 60, peakFraction: 0.6 })
    defender.sprite.flash(0xffffff, 120)

    const mx = (defender.x + attacker.x) / 2
    const my = (defender.y + attacker.y) / 2 - 20
    const ring = this.add.circle(mx, my, 10, 0xffffff, 0).setStrokeStyle(5, 0xffffff, 1).setDepth(my + 50)
    this.tweens.add({
      targets: ring, radius: 70, alpha: 0, duration: 260, ease: 'Cubic.easeOut',
      onUpdate: () => ring.setStrokeStyle(5, 0xffffff, ring.alpha),
      onComplete: () => ring.destroy(),
    })

    const label = this.add.text(defender.x, defender.y - 96, 'PARRY', {
      fontFamily: 'Rowdies, ui-sans-serif, system-ui, sans-serif',
      fontSize: '26px', color: '#ffffff', stroke: '#16200f', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(10001)
    this.tweens.add({
      targets: label, y: label.y - 36, alpha: 0, scale: { from: 1.5, to: 1 },
      duration: 720, ease: 'Quad.easeOut', onComplete: () => label.destroy(),
    })

    if (defender === this.player || attacker === this.player) this.cameras.main.shake(120, 0.004)
  }

  leaveTutorial() {
    this.scene.stop('UIScene')
    this.scene.start('HomeScene', { builds: this.builds })
  }

  /** A Moonwell started to bloom. Worth a callout: it is somewhere to be. */
  onMoonwell(well) {
    this.announce('A MOONWELL BLOOMS', '#9dffd8', well)
  }

  onPowerUp(fighter, type) {
    if (fighter === this.player) return
    const def = POWERUPS[type]
    const p = this.player
    // A rival powering up nearby is information you can act on.
    if (def && p?.alive && Phaser.Math.Distance.Between(fighter.x, fighter.y, p.x, p.y) < 650) {
      this.announce(`${fighter.axieClass.toUpperCase()} TOOK ${def.name}`, `#${def.color.toString(16).padStart(6, '0')}`)
    }
  }

  announce(text, color, at = null) {
    this.announcement = { text, color, at, until: this.time.now + 2200 }
  }

  /** A whiff still costs the cooldown, so the swing has to be earned. */
  swingMiss(fighter) {
    if (fighter !== this.player) return
    this.cameras.main.shake(60, 0.0015)
  }

  onFighterDown(fighter, killer) {
    if (this.wilds) return this.wilds.onDown(fighter, killer)
    if (this.tutorial) return
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
    if (won) this.player.sprite.playState('victory')

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
    if (this.startedAt === null) {
      this.startedAt = time
      if (this.field) this.field.startedAt = time
    }
    // Hit-stop is per fighter now (Fighter.freeze), so the loop always runs.
    {
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
      if (!this.matchOver) this.field?.update(this.fighters)
      this.powerUps.update(this.fighters)
      this.moonwells.update(this.fighters)
      this.wilds?.update()
      this.tutorial?.update(delta)
      this.arena.updateCanopies(this.player)

      for (const p of this.projectiles) p.update(delta, this.fighters)
      for (const z of this.zones) z.update(delta, this.fighters)
      this.projectiles = this.projectiles.filter(p => !p.dead)
      this.zones = this.zones.filter(z => !z.dead)
    }

    if (!this.matchOver && this.player?.alive) this.drawReticle()
    else this.reticle.clear()

  }
}
