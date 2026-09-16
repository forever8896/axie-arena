import Phaser from 'phaser'
import Fighter from '../entities/Fighter.js'
import BotBrain from '../ai/BotBrain.js'
import { WORLD } from '../arena/Arena.js'
import { findOpenSpot, floatLabel } from '../arena/PowerUps.js'
import { CLASS_KITS } from '../axie/classKits.js'
import { play as playSfx } from '../fx/Sfx.js'
import { play as playMusic } from '../fx/Music.js'
import MoonGate from './MoonGate.js'
import { HUD_DEPTH } from '../entities/Fighter.js'
import { WILDS, hunterName, money } from './config.js'
import { wallet } from './Wallet.js'

const pick = list => list[Math.floor(Math.random() * list.length)]

/**
 * Runs a room of the Endless Wilds: who is in it, what everyone carries, how
 * they leave. There is no end to a room: hunters arrive, fight, extract or
 * fall, and others take their places.
 *
 * Money is conserved and checked. Every bounty that enters the room is either
 * still carried, lying in a dropped cache, or has left through a Moon Gate;
 * the only other flow is the entry fee (see `ledger`).
 */
export default class WildsDirector {
  constructor(scene, room, { hunters, topBounty } = {}) {
    this.scene = scene
    this.room = room
    this.entry = room.free ? room.stake : room.stake * (1 - WILDS.feeRate)
    this.ledger = { created: 0, fees: 0, extracted: 0 }
    this.events = []
    this.caches = []
    this.panel = null
    this.playerClass = null
    this.target = hunters ?? Phaser.Math.Between(...room.hunters)
    this.retargetAt = 0
    this.lastJoin = -Infinity
    this.startTopBounty = topBounty
    this.bloodMoon = null
    this.nextBloodMoon = null
    this.glow = scene.add.graphics().setDepth(-14)
    this.channelFx = scene.add.graphics()
  }

  get now() {
    return this.scene.time.now
  }

  get currency() {
    return this.room.currency
  }

  /** Builds the room as you find it: hunters already mid-hunt, and you. */
  begin(playerClass) {
    this.playerClass = playerClass
    const scene = this.scene
    scene.bots = []
    scene.fighters = []

    this.gates = this.gateSites().map(site => new MoonGate(scene, site))
    Phaser.Utils.Array.Shuffle([...this.gates]).slice(0, WILDS.gatesOpen).forEach(g => g.openGate())
    this.nextGateMove = this.now + WILDS.gateRotateMs

    // Veterans: hunters who got here first, some already carrying kills.
    const multipliers = [1, 1, 1, 1.6, 2, 2.5, 3.2]
    for (let i = 0; i < this.target; i++) {
      const bounty = this.entry * pick(multipliers)
      this.spawnHunter({ bounty, quiet: true })
    }
    if (this.startTopBounty) {
      const top = scene.bots.reduce((a, b) => (b.wilds.bounty > a.wilds.bounty ? b : a), scene.bots[0])
      if (top) {
        this.ledger.created += this.startTopBounty - top.wilds.bounty
        top.wilds.bounty = this.startTopBounty
      }
    }
    if (!this.enterPlayer()) {
      // The lobby checks the balance first; this only guards a stale link.
      this.toLobby()
      return
    }
    this.nextBloodMoon = this.now + 45000
    this.log(`You entered ${this.room.name}`, '#fff8d8')
  }

  /** Four candidate gate sites, one per quadrant, clear of cover. */
  gateSites() {
    const arena = this.scene.arena
    const b = this.scene.arenaBounds
    const spots = [[0.2, 0.22], [0.8, 0.22], [0.2, 0.8], [0.8, 0.8]]
    return spots.map(([fx, fy]) => {
      for (let i = 0; i < 60; i++) {
        const x = Phaser.Math.Linear(b.left, b.right, fx) + Phaser.Math.Between(-120, 120)
        const y = Phaser.Math.Linear(b.top, b.bottom, fy) + Phaser.Math.Between(-100, 100)
        if (!arena.wallAt(x, y, WILDS.gateRadius + 30) && !arena.inBush(x, y)) return { x, y }
      }
      return { x: Phaser.Math.Linear(b.left, b.right, fx), y: Phaser.Math.Linear(b.top, b.bottom, fy) }
    })
  }

  /** Somewhere nobody is standing: the farther from every rival, the better. */
  safeSpawn() {
    const fighters = this.scene.fighters.filter(f => f.alive)
    return findOpenSpot(this.scene, {
      clearance: 60, lifetimeMs: 0, fighters: [],
      score: (x, y) => {
        const d = Math.min(900, ...fighters.map(f => Phaser.Math.Distance.Between(x, y, f.x, f.y)))
        return d + this.gates.some(g => g.open && Phaser.Math.Distance.Between(x, y, g.x, g.y) < 200) * -500
      },
    }) ?? { x: WORLD.width / 2, y: WORLD.height / 2 }
  }

  spawnHunter({ bounty = this.entry, quiet = false, axieClass } = {}) {
    const scene = this.scene
    const classes = Object.keys(scene.builds)
    const cls = axieClass ?? pick(classes)
    const spot = this.safeSpawn()
    const taken = new Set(scene.fighters.map(f => f.name))
    const bot = new Fighter(scene, spot.x, spot.y, { axieClass: cls, build: scene.builds[cls], name: hunterName(taken) })
    bot.brain = new BotBrain(bot)
    bot.wilds = {
      bounty,
      kills: 0,
      joinedAt: this.now,
      // Each stand-in has its own idea of enough, and of how long it will stay.
      goal: this.entry * Phaser.Math.FloatBetween(2.2, 4.5),
      patience: Phaser.Math.Between(60000, 180000),
      leaving: false,
    }
    // Veterans paid their fee before you arrived; only new arrivals count one here.
    this.ledger.created += bounty
    if (!quiet && !this.room.free) this.ledger.fees += this.room.stake * WILDS.feeRate
    this.shield(bot)
    bot.sprite.playState('appear')
    scene.bots.push(bot)
    scene.fighters.push(bot)
    this.lastJoin = this.now
    if (!quiet) this.log(`${bot.name} joined as ${CLASS_KITS[cls].title}`, '#b9c4a6')
    return bot
  }

  /** Pays for a life and puts you in. False if the wallet cannot cover it. */
  enterPlayer() {
    const scene = this.scene
    const bounty = wallet.enter(this.room)
    if (bounty === null) return false
    if (!this.room.free) this.ledger.fees += this.room.stake * WILDS.feeRate
    this.ledger.created += bounty

    const old = scene.player
    if (old) scene.fighters = scene.fighters.filter(f => f !== old)
    const spot = this.safeSpawn()
    const p = new Fighter(scene, spot.x, spot.y, {
      axieClass: this.playerClass, build: scene.builds[this.playerClass], isPlayer: true, name: 'You',
    })
    p.wilds = { bounty, kills: 0, joinedAt: this.now, stake: this.room.stake }
    this.shield(p)
    p.sprite.playState('appear')
    scene.player = p
    scene.fighters.push(p)
    scene.cameras.main.startFollow(p.sprite.root, true, 0.11, 0.11)
    this.panel = null
    return true
  }

  shield(f) {
    f.spawnShieldUntil = this.now + WILDS.spawnShieldMs
    f.invulnerableUntil = Math.max(f.invulnerableUntil, f.spawnShieldUntil)
  }

  // --- Leaving the Wilds -------------------------------------------------

  /** Called by GameScene for every fall. The killer takes the whole bounty. */
  onDown(fighter, killer) {
    const w = fighter.wilds
    if (!w) return
    const lost = w.bounty
    w.bounty = 0
    const taker = [killer, fighter.lastHitBy].find(k => k && k !== fighter && k.alive && k.wilds)

    if (taker) {
      taker.wilds.bounty += lost
      taker.wilds.kills++
      const label = money(lost, this.currency)
      this.log(`${taker.name} took ${fighter.name === 'You' ? 'your' : `${fighter.name}'s`} ${label}`,
        taker.isPlayer ? '#ffd964' : fighter.isPlayer ? '#ff8098' : '#e8f0d6')
      if (taker.isPlayer) floatLabel(this.scene, taker.x, taker.y - 110, `+${label}`, 0xffd964)
    } else if (lost > 0) {
      this.dropCache(fighter.x, fighter.y, lost)
      this.log(`${fighter.name} fell; ${money(lost, this.currency)} lies on the ground`, '#ffd964')
    }

    if (fighter.isPlayer) {
      wallet.died(this.room, lost)
      this.panel = { kind: 'fell', lost, killer: taker?.name ?? null }
      // Watch the fighter who took it, while you decide.
      if (taker?.sprite?.root?.active) this.scene.cameras.main.startFollow(taker.sprite.root, true, 0.05, 0.05)
      else this.scene.cameras.main.stopFollow()
    }
  }

  extract(f) {
    const amount = f.wilds.bounty
    f.wilds.bounty = 0
    f.channel = null
    this.ledger.extracted += amount
    const scene = this.scene

    // A column of moonlight takes them.
    const beam = scene.add.rectangle(f.x, f.y - 200, 70, 420, 0xefe8ff, 0.8)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(f.y + 80)
    scene.tweens.add({ targets: beam, scaleX: 0, alpha: 0, duration: 700, ease: 'Cubic.easeIn', onComplete: () => beam.destroy() })
    f.vanish()

    if (f.isPlayer) {
      wallet.extract(this.room, amount)
      playSfx(scene, 'power_awaken', { volume: 0.7 })
      this.panel = { kind: 'extracted', amount }
      this.log(`You extracted ${money(amount, this.currency)}`, '#ffd964')
    } else {
      this.log(`${f.name} extracted ${money(amount, this.currency)}`, '#c9b8ff')
    }
  }

  /** Esc: leave without a gate. The bounty stays in the Wilds for others. */
  forfeit() {
    const p = this.scene.player
    if (!p?.alive) return
    const amount = p.wilds.bounty
    p.wilds.bounty = 0
    if (amount > 0) this.dropCache(p.x, p.y, amount)
    wallet.died(this.room, amount)
    p.vanish()
    this.log(`You left; ${money(amount, this.currency)} dropped`, '#ff8098')
    this.panel = { kind: 'left', lost: amount }
  }

  /** Esc: ask before leaving mid-hunt; from a panel, go back to the lobby. */
  requestLeave() {
    const p = this.scene.player
    if (this.panel?.kind === 'leave') this.panel = null
    else if (!this.panel && p?.alive) this.panel = { kind: 'leave', bounty: p.wilds.bounty }
    else if (this.panel) this.toLobby()
  }

  reenter() {
    if (this.scene.player?.alive) return false
    return this.enterPlayer()
  }

  toLobby() {
    const scene = this.scene
    scene.scene.stop('UIScene')
    scene.scene.start('LobbyScene', { builds: scene.builds, playerClass: this.playerClass })
  }

  dropCache(x, y, amount) {
    const scene = this.scene
    const coin = scene.add.circle(x, y - 18, 16, 0xffc93a, 1).setStrokeStyle(4, 0x1d2b12, 1).setDepth(y + 20)
    const glow = scene.add.image(x, y - 18, 'fx-soft').setTint(0xffd964).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.4).setDepth(y + 19)
    const text = scene.add.text(x, y - 46, money(amount, this.currency), {
      fontFamily: 'Rowdies, ui-sans-serif, system-ui, sans-serif', fontSize: '14px', color: '#ffd964',
      stroke: '#16200f', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(y + 21)
    this.caches.push({ x, y, amount, parts: [coin, glow, text], bornAt: this.now })
  }

  // --- Frame -------------------------------------------------------------

  update() {
    const now = this.now
    const scene = this.scene

    this.updateGates(now)
    this.updatePopulation(now)
    this.updateBloodMoon(now)

    for (const f of scene.fighters) {
      if (!f.alive || !f.wilds) continue
      if (f.spawnShieldUntil && now >= f.spawnShieldUntil) f.spawnShieldUntil = 0
      if (f.brain) this.decide(f, now)
      this.updateChannel(f, now)
      this.collectCaches(f)
    }

    this.pruneFallen(now)
    this.draw(now)
  }

  /** A stand-in decides when it has had enough. */
  decide(bot, now) {
    const w = bot.wilds
    if (w.leaving) return
    const hurt = bot.hp / bot.maxHp < 0.35
    if (w.bounty >= w.goal ||
        (now - w.joinedAt > w.patience && w.bounty >= this.entry) ||
        (hurt && w.bounty >= this.entry * 1.8)) {
      w.leaving = true
    }
  }

  /** Where a bot is heading instead of fighting, if anywhere. Used by BotBrain. */
  botGoal(bot) {
    const w = bot.wilds
    if (!w) return null
    if (w.leaving) {
      const gate = this.nearestGate(bot, { usable: true })
      if (gate) return { x: gate.x, y: gate.y, stop: 18 }
    }
    let best = null
    let bestD = 600
    for (const c of this.caches) {
      const d = Phaser.Math.Distance.Between(bot.x, bot.y, c.x, c.y)
      if (d < bestD) { best = { x: c.x, y: c.y, stop: 0 }; bestD = d }
    }
    return best
  }

  nearestGate(f, { usable = false } = {}) {
    let best = null
    let bestD = Infinity
    for (const g of this.gates) {
      if (!g.open) continue
      const d = Phaser.Math.Distance.Between(f.x, f.y, g.x, g.y)
      // A gate that will close before you could reach it and channel is no gate.
      if (usable && g.closing && g.closingAt - this.now < d / Math.max(1, f.speed) * 1000 + WILDS.extractMs + 500) continue
      if (d < bestD) { best = g; bestD = d }
    }
    return best
  }

  updateChannel(f, now) {
    const gate = this.gates.find(g => g.contains(f))
    if (!gate) {
      f.channel = null
      return
    }
    if (!f.channel || f.channel.gate !== gate) f.channel = { gate, startedAt: now }
    // Taking a hit, or throwing one, starts the channel over.
    const since = f.channel.startedAt
    if (f.lastHurtAt > since || f.lastAttack > since || f.lastSpecial > since) {
      f.channel.startedAt = now
      f.channel.interruptedAt = now
    }
    f.channel.progress = Phaser.Math.Clamp((now - f.channel.startedAt) / WILDS.extractMs, 0, 1)
    if (f.channel.progress >= 1) this.extract(f)
  }

  collectCaches(f) {
    for (const c of this.caches) {
      if (c.taken) continue
      if (Phaser.Math.Distance.Between(f.x, f.y, c.x, c.y) > f.bodyRadius + 24) continue
      c.taken = true
      f.wilds.bounty += c.amount
      c.parts.forEach(p => p.destroy())
      if (f.isPlayer) floatLabel(this.scene, f.x, f.y - 110, `+${money(c.amount, this.currency)}`, 0xffd964)
      this.log(`${f.name} picked up ${money(c.amount, this.currency)}`, '#ffd964')
    }
    this.caches = this.caches.filter(c => !c.taken)
  }

  updateGates(now) {
    for (const g of this.gates) g.update(now)
    if (now >= this.nextGateMove) {
      this.nextGateMove = now + WILDS.gateRotateMs
      const open = this.gates.filter(g => g.open && !g.closing)
      const closed = this.gates.filter(g => !g.open)
      if (open.length && closed.length) {
        const going = pick(open)
        going.closingAt = now + WILDS.gateWarnMs
        going.replacement = pick(closed)
        this.log('A Moon Gate is closing', '#ff8098')
      }
    }
    for (const g of this.gates) {
      if (g.closing && now >= g.closingAt) {
        g.closeGate()
        g.replacement?.openGate()
        g.replacement = null
        this.scene.announce('A NEW MOON GATE OPENS', '#c9b8ff')
      }
    }
  }

  updatePopulation(now) {
    const scene = this.scene
    if (now >= this.retargetAt) {
      this.retargetAt = now + Phaser.Math.Between(...WILDS.retargetMs)
      this.target = Phaser.Math.Between(...this.room.hunters)
    }
    const staying = scene.bots.filter(b => b.alive && !b.wilds.leaving)
    const present = scene.fighters.filter(f => f.alive).length
    if (staying.length < this.target && present < WILDS.maxHunters && now - this.lastJoin > WILDS.joinGapMs) {
      this.spawnHunter()
    } else if (staying.length > this.target + 1) {
      pick(staying).wilds.leaving = true
    }
  }

  updateBloodMoon(now) {
    const scene = this.scene
    if (this.bloodMoon && now >= this.bloodMoon.until) {
      this.bloodMoon.parts.forEach(p => scene.tweens.add({ targets: p, alpha: 0, duration: 800, onComplete: () => p.destroy() }))
      this.bloodMoon = null
      playMusic('arena')
    }
    if (!this.bloodMoon && now >= this.nextBloodMoon) {
      this.nextBloodMoon = now + WILDS.bloodMoonEvery
      const spot = findOpenSpot(scene, { clearance: 160, lifetimeMs: 0, fighters: [] })
      if (!spot) return
      const R = WILDS.bloodMoonRadius
      const ring = scene.add.circle(spot.x, spot.y, R, 0xff5c72, 0.08).setStrokeStyle(5, 0xff8098, 0.8).setDepth(-15)
      this.bloodMoon = { x: spot.x, y: spot.y, radius: R, until: now + WILDS.bloodMoonMs, parts: [ring] }
      // The hotspot is worth the fight: healing and power where everyone can see it.
      scene.moonwells.spawn(scene.fighters, { x: spot.x, y: spot.y })
      for (const a of [0, Math.PI]) {
        scene.powerUps.spawn(scene.fighters, { x: spot.x + Math.cos(a) * 170, y: spot.y + Math.sin(a) * 60 })
      }
      playMusic('bloodmoon')
      scene.announce('BLOOD MOON RISES', '#ff8098')
      this.log('Blood Moon: healing and power-ups gather', '#ff8098')
    }
  }

  /** The hotspot bots drift toward while it lasts. */
  get hotspot() {
    return this.bloodMoon
  }

  /** Fallen and departed fighters leave the arrays once their fade has played. */
  pruneFallen(now) {
    const scene = this.scene
    for (const f of scene.fighters) if (!f.alive && !f.goneAt) f.goneAt = now
    const keep = f => f.alive || now - f.goneAt < 1500 || f === scene.player
    scene.fighters = scene.fighters.filter(keep)
    scene.bots = scene.bots.filter(keep)
  }

  // --- Drawing -----------------------------------------------------------

  draw(now) {
    const g = this.glow
    g.clear()
    const c = this.channelFx
    c.clear()
    c.setDepth(9500)
    const t = now / 1000

    for (const f of this.scene.fighters) {
      if (!f.alive || !f.wilds) continue
      // Bigger bounties glow brighter: the leader is everyone's target.
      const heat = Math.log2(Math.max(1, f.wilds.bounty / this.entry))
      if (heat > 0.5) {
        const r = f.bodyRadius + 14 + heat * 6
        g.fillStyle(0xffd964, Math.min(0.28, 0.08 * heat) * (0.8 + Math.sin(t * 4) * 0.2))
        g.fillEllipse(f.x, f.y + 4, r * 2.4, r * 1.1)
      }
      if (f.spawnShieldUntil > now) {
        c.lineStyle(3, 0xffffff, 0.5 + Math.sin(t * 12) * 0.3)
        c.strokeCircle(f.x, f.y - 26, f.bodyRadius + 18)
      }
      if (f.channel) {
        const a0 = -Math.PI / 2
        c.lineStyle(7, 0x16200f, 0.6)
        c.strokeCircle(f.x, f.y - 26, f.bodyRadius + 26)
        c.lineStyle(5, 0xefe8ff, 1)
        c.beginPath()
        c.arc(f.x, f.y - 26, f.bodyRadius + 26, a0, a0 + Math.PI * 2 * (f.channel.progress ?? 0))
        c.strokePath()
      }
    }

    for (const cache of this.caches) {
      cache.parts[0].y = cache.y - 18 + Math.sin(t * 3 + cache.x) * 4
    }

    // Name and bounty over every hunter. Stand-ins are marked as AI.
    for (const f of this.scene.fighters) {
      // Your own bounty is already the biggest thing on screen; no plate.
      if (!f.alive || !f.wilds || f.isPlayer) continue
      if (!f.nameplate) {
        f.nameplate = this.scene.add.text(0, 0, '', {
          fontFamily: 'Rowdies, ui-sans-serif, system-ui, sans-serif', fontSize: '13px', color: '#fff8d8',
          stroke: '#16200f', strokeThickness: 4, align: 'center',
        }).setOrigin(0.5, 1)
      }
      const label = `${f.name} · AI\n${money(f.wilds.bounty, this.currency)}`
      if (f.nameplate.text !== label) f.nameplate.setText(label)
      f.nameplate.setPosition(f.x, f.y - 104).setDepth(HUD_DEPTH + 2)
        .setColor(f.wilds.leaving ? '#c9b8ff' : '#fff8d8')
    }
  }

  log(text, color = '#e8f0d6') {
    this.events.unshift({ text, color, at: this.now })
    this.events.length = Math.min(this.events.length, 6)
  }

  /** Money in the room right now, for the conservation check. */
  get inPlay() {
    return this.scene.fighters.reduce((s, f) => s + (f.alive && f.wilds ? f.wilds.bounty : 0), 0)
  }

  get cached() {
    return this.caches.reduce((s, c) => s + c.amount, 0)
  }

  /** Zero when no value has been created or destroyed. */
  get imbalance() {
    return this.ledger.created - this.ledger.extracted - this.inPlay - this.cached
  }

  topHunters(n = 3) {
    return this.scene.fighters
      .filter(f => f.alive && f.wilds)
      .sort((a, b) => b.wilds.bounty - a.wilds.bounty)
      .slice(0, n)
  }
}
