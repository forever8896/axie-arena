import Phaser from 'phaser'
import Fighter from '../entities/Fighter.js'
import BotBrain from '../ai/BotBrain.js'

const ARENA = { width: 1600, height: 1200 }
const BOT_TINTS = [0x6fd08c, 0x6fb7d0, 0xd0a86f, 0xb98fd0, 0xd06f8f]

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' })
  }

  create() {
    this.arenaBounds = {
      left: 40, top: 40,
      right: ARENA.width - 40,
      bottom: ARENA.height - 40,
    }

    this.drawArena()

    this.player = new Fighter(this, ARENA.width / 2, ARENA.height / 2, {
      tint: 0xf2f2f7, isPlayer: true, name: 'you',
    })

    this.bots = []
    for (let i = 0; i < 5; i++) {
      const bot = new Fighter(
        this,
        Phaser.Math.Between(this.arenaBounds.left, this.arenaBounds.right),
        Phaser.Math.Between(this.arenaBounds.top, this.arenaBounds.bottom),
        { tint: BOT_TINTS[i % BOT_TINTS.length], name: `bot-${i + 1}` },
      )
      bot.brain = new BotBrain(bot)
      this.bots.push(bot)
    }

    this.fighters = [this.player, ...this.bots]

    this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE')
    this.input.keyboard.on('keydown-SPACE', () => this.playerAttack())

    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height)
    this.cameras.main.startFollow(this.player.sprite.root, true, 0.12, 0.12)

    this.hud = this.add.text(16, 16, '', {
      fontFamily: 'ui-monospace, monospace', fontSize: '15px', color: '#e6e6ef',
    }).setScrollFactor(0).setDepth(100)

    this.add.text(16, this.scale.height - 30, 'WASD move · SPACE attack', {
      fontFamily: 'ui-monospace, monospace', fontSize: '13px', color: '#8a8a9e',
    }).setScrollFactor(0).setDepth(100)
  }

  drawArena() {
    const g = this.add.graphics()
    g.fillStyle(0x1a1a24, 1).fillRect(0, 0, ARENA.width, ARENA.height)
    g.lineStyle(1, 0x2a2a38, 1)
    for (let x = 0; x <= ARENA.width; x += 80) g.lineBetween(x, 0, x, ARENA.height)
    for (let y = 0; y <= ARENA.height; y += 80) g.lineBetween(0, y, ARENA.width, y)
    g.lineStyle(3, 0x3a3a4c, 1).strokeRect(24, 24, ARENA.width - 48, ARENA.height - 48)
    g.setDepth(-10)
  }

  playerAttack() {
    const now = this.time.now
    if (!this.player.canAttack(now)) return
    for (const bot of this.bots) {
      if (this.player.attack(bot, now)) return
    }
    // Whiff: still spend the cooldown so timing matters.
    this.player.lastAttack = now
    this.player.sprite.flash(0xcfcfe0, 60)
  }

  update(time, delta) {
    const k = this.keys
    this.player.intent.set(
      (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0),
      (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0),
    )

    for (const bot of this.bots) bot.brain.update(time, this.fighters)
    for (const f of this.fighters) f.update(delta)

    const alive = this.bots.filter(b => b.alive).length
    this.hud.setText([
      `HP    ${'#'.repeat(Math.max(0, this.player.hp))}${'.'.repeat(this.maxLost())}`,
      `BOTS  ${alive} alive`,
    ])
  }

  maxLost() {
    return Math.max(0, this.player.maxHp - Math.max(0, this.player.hp))
  }
}
