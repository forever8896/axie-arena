import Phaser from 'phaser'
import Fighter from '../entities/Fighter.js'
import BotBrain from '../ai/BotBrain.js'
import { PARRY } from '../axie/classKits.js'
import { CONNECT_MS } from '../axie/AxieSprite.js'
import { play as playSfx } from '../fx/Sfx.js'
import { floatLabel } from '../arena/PowerUps.js'
import MoonGate from '../wilds/MoonGate.js'

const KEY = 'lunacy.tutorial.done.v1'

export function tutorialDone() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

/**
 * The playable tutorial: ten short steps in the real arena, each taught by
 * doing it once. Every step names the keys, marks where to go, and waits for
 * the thing itself to happen: a dash is only complete when you have dashed.
 *
 * You cannot go down here. Mistakes cost nothing, and a step that is not
 * clicking offers a hint after a while.
 */
export default class TutorialDirector {
  constructor(scene) {
    this.scene = scene
    this.index = -1
    this.step = null
    this.stepAt = 0
    this.progress = 0
    this.hint = ''
    this.finished = false
    this.celebrateUntil = 0
    this.marker = scene.add.graphics().setDepth(-15)
    this.cx = scene.arena.cx
    this.cy = scene.arena.cy
    this.steps = this.buildSteps()
  }

  get now() {
    return this.scene.time.now
  }

  get player() {
    return this.scene.player
  }

  begin(playerClass) {
    const scene = this.scene
    const p = new Fighter(scene, this.cx, this.cy + 120, {
      axieClass: playerClass, build: scene.builds[playerClass], isPlayer: true, name: 'You',
    })
    p.immortal = true
    p.sprite.playState('appear')
    scene.player = p
    scene.fighters = [p]
    scene.bots = []
    scene.cameras.main.startFollow(p.sprite.root, true, 0.11, 0.11)
    this.next()
  }

  // --- Steps -------------------------------------------------------------

  buildSteps() {
    const P = () => this.player
    const at = (dx, dy) => ({ x: this.cx + dx, y: this.cy + dy })

    return [
      {
        id: 'move', title: 'MOVE', keys: ['W', 'A', 'S', 'D'],
        text: 'Walk into the glowing ring.',
        hint: 'W is up, S is down, A and D are left and right.',
        enter: () => { this.goal = { ...at(-200, -60), r: 46 } },
        done: () => this.inGoal(P()),
      },
      {
        id: 'attack', title: 'ATTACK', keys: ['MOUSE', 'LEFT CLICK'],
        text: 'Aim at the dummy with the mouse and left-click to hit it 3 times.\nThe flash on the ground is exactly where your hit lands.',
        hint: 'Get close: the curved line in front of you is your reach.',
        enter: () => {
          this.dummy = this.spawnDummy(at(40, -60))
          this.goal = { x: this.dummy.x, y: this.dummy.y, r: 0, follow: this.dummy }
          this.counter = 0
          this.watchHits(this.dummy, () => this.counter++)
        },
        done: () => this.counter >= 3,
        progress: () => this.counter / 3,
      },
      {
        id: 'dash', title: 'DASH', keys: ['SPACE'],
        text: 'Move toward the ring and press Space to dash into it.\nA dash is quick and briefly untouchable.',
        hint: 'Hold a direction with WASD, then tap Space.',
        enter: () => { this.goal = { ...at(-150, 150), r: 50 }; this.dashFrom = P().lastDash },
        done: () => P().lastDash !== this.dashFrom && this.inGoal(P()),
      },
      {
        id: 'special', title: 'SPECIAL', keys: ['LEFT CLICK', 'E'],
        text: 'Landing hits charges your special (the bar under your health).\nHit the dummy until it is full, then press E or right-click.',
        hint: 'Specials only charge from hits that land. Stay close to the dummy.',
        enter: () => {
          P().charge = 0.5
          this.goal = { x: this.dummy.x, y: this.dummy.y, r: 0, follow: this.dummy }
          this.specialFrom = P().lastSpecial
        },
        done: () => P().lastSpecial !== this.specialFrom && this.now - P().lastSpecial > 450,
        progress: () => Math.min(1, P().charge),
      },
      {
        id: 'parry', title: 'PARRY', keys: ['Q'],
        text: 'Your sparring partner will swing at you.\nPress Q as the white ring closes to parry and stagger it.',
        hint: 'Face your partner. Press Q when the ring touches it, not before.',
        enter: () => {
          this.retire(this.dummy)
          this.partner = this.spawnPartner(at(90, 30))
          this.goal = { x: this.partner.x, y: this.partner.y, r: 0, follow: this.partner }
          this.parries = 0
          const tryParry = P().tryParry.bind(P())
          P().tryParry = attacker => {
            const ok = tryParry(attacker)
            if (ok) this.parries++
            return ok
          }
        },
        done: () => this.parries >= 2,
        progress: () => this.parries / 2,
        exit: () => { this.retire(this.partner); this.partner = null },
      },
      {
        id: 'powerup', title: 'POWER-UPS', keys: [],
        text: 'Orbs appear around the field. Walk over this one to take Fury:\n30% more damage for a few seconds.',
        hint: 'The orb forms for a moment before it can be taken.',
        enter: () => {
          const scene = this.scene
          scene.powerUps.bag = ['fury']
          this.orb = scene.powerUps.spawn(scene.fighters, at(-120, -110))
          this.goal = { x: this.orb.x, y: this.orb.y, r: 40 }
        },
        done: () => Boolean(P().buff('fury')),
      },
      {
        id: 'heal', title: 'MOONWELLS', keys: [],
        text: 'You are hurt. Stand inside the Moonwell until you are healed.\nA hit from a rival pauses the healing.',
        hint: 'Wait for it to bloom, then stay inside the ring.',
        enter: () => {
          P().hp = Math.round(P().maxHp * 0.45)
          this.well = this.scene.moonwells.spawn(this.scene.fighters, at(140, -90))
          this.goal = { x: this.well.x, y: this.well.y, r: 60 }
        },
        done: () => P().hp >= P().maxHp * 0.8,
        progress: () => Phaser.Math.Clamp((P().hp / P().maxHp - 0.45) / 0.35, 0, 1),
      },
      {
        id: 'hide', title: 'BUSHES', keys: [],
        text: 'Step into a bush. Rivals cannot see you inside unless they are close,\nand the bush you are in turns see-through for you.',
        hint: 'Follow the arrow to the nearest bush.',
        enter: () => {
          const b = this.nearestBush()
          this.goal = { x: b.x, y: b.y, r: 0 }
        },
        done: () => this.scene.arena.inBush(P().x, P().y),
      },
      {
        id: 'fight', title: 'YOUR FIRST FIGHT', keys: ['ALL OF IT'],
        text: 'A real rival has arrived, and it fights back.\nUse everything: attack, dash, parry, special. Knock it out.',
        hint: 'Hit, then step back. Parry when it lines up a swing.',
        enter: () => {
          const scene = this.scene
          const classes = Object.keys(scene.builds).filter(c => c !== P().axieClass)
          const cls = Phaser.Utils.Array.GetRandom(classes)
          const spot = this.clearSpotNear(P(), 260)
          const rival = new Fighter(scene, spot.x, spot.y, {
            axieClass: cls, build: scene.builds[cls], name: 'Rival',
          })
          // A gentler rival: slower to strike and to parry, and it starts hurt.
          rival.brain = new BotBrain(rival, { parryReadChance: 0.15, parryReadRate: 0.1, parryReactChance: 0.2 })
          rival.hp = Math.round(rival.maxHp * 0.55)
          rival.attackCooldown *= 1.5
          rival.sprite.playState('appear')
          scene.bots.push(rival)
          scene.fighters.push(rival)
          this.rival = rival
          this.label(rival, 'RIVAL')
          this.goal = { x: rival.x, y: rival.y, r: 0, follow: rival }
          P().hp = P().maxHp
        },
        done: () => !this.rival.alive,
      },
      {
        id: 'gate', title: 'MOON GATES', keys: [],
        text: 'In the Endless Wilds you keep what you carry out.\nStand in the Moon Gate for 3 seconds to leave. A hit restarts it.',
        hint: 'Stay inside the ring until the bar fills.',
        enter: () => {
          this.gate = new MoonGate(this.scene, at(-60, 20))
          this.gate.openGate()
          this.goal = { x: this.gate.x, y: this.gate.y, r: 0 }
          this.channel = 0
        },
        done: () => this.channel >= 1,
        progress: () => this.channel,
      },
    ]
  }

  next() {
    this.step?.exit?.()
    this.index++
    if (this.index >= this.steps.length) return this.finish()
    this.step = this.steps[this.index]
    this.stepAt = this.now
    this.hint = ''
    this.goal = null
    this.step.enter()
  }

  /** Jump over the current step (Tab). */
  skip() {
    if (this.finished || this.celebrateUntil > this.now) return
    if (this.step?.id === 'fight' && this.rival?.alive) this.retire(this.rival)
    this.next()
  }

  finish() {
    this.finished = true
    this.step = null
    this.goal = null
    try { localStorage.setItem(KEY, '1') } catch { /* not persisted */ }
    playSfx(this.scene, 'power_awaken', { volume: 0.7 })
    if (this.player?.alive) this.player.sprite.playState('victory')
  }

  // --- Frame -------------------------------------------------------------

  update(delta) {
    const now = this.now
    const p = this.player
    this.gate?.update(now)
    this.updatePartner(now)
    this.updateDummy(now)
    if (this.gate && this.step?.id === 'gate') this.updateGate(delta)
    if (this.goal?.follow?.alive) { this.goal.x = this.goal.follow.x; this.goal.y = this.goal.follow.y }
    this.drawMarker(now)
    this.drawLabels()

    if (this.finished || !this.step || !p?.alive) return
    if (now < this.celebrateUntil) return
    if (this.celebrateUntil && now >= this.celebrateUntil) {
      this.celebrateUntil = 0
      this.next()
      return
    }
    this.progress = this.step.progress?.() ?? 0
    if (now - this.stepAt > 12000 && !this.hint) this.hint = this.step.hint
    if (this.step.done()) {
      this.celebrateUntil = now + 1100
      this.progress = 1
      playSfx(this.scene, 'power_gain', { volume: 0.55 })
      floatLabel(this.scene, p.x, p.y - 110, rewardWord(this.index), 0xffd964)
    }
  }

  inGoal(f) {
    return this.goal && Phaser.Math.Distance.Between(f.x, f.y, this.goal.x, this.goal.y) <= this.goal.r
  }

  /**
   * A point `dist` away with open ground all the way to it, so a newcomer
   * arrives in view rather than behind a wall.
   */
  clearSpotNear(f, dist) {
    const arena = this.scene.arena
    const b = arena.bounds
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      const x = f.x + Math.cos(a) * dist
      const y = f.y + Math.sin(a) * dist
      if (x < b.left + 60 || x > b.right - 60 || y < b.top + 60 || y > b.bottom - 60) continue
      let clear = true
      for (let k = 1; k <= 10 && clear; k++) {
        const px = f.x + Math.cos(a) * dist * (k / 10)
        const py = f.y + Math.sin(a) * dist * (k / 10)
        if (arena.wallAt(px, py, 40) || arena.inBush(px, py)) clear = false
      }
      if (clear) return { x, y }
    }
    return { x: this.cx, y: this.cy }
  }

  nearestBush() {
    const p = this.player
    return this.scene.arena.bushes.reduce((best, b) =>
      (Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) < Phaser.Math.Distance.Between(p.x, p.y, best.x, best.y) ? b : best))
  }

  // --- Training partners ---------------------------------------------------

  /** A dummy: stands still, never fights back, and never runs out of health. */
  spawnDummy({ x, y }) {
    const scene = this.scene
    const cls = this.player.axieClass === 'plant' ? 'aquatic' : 'plant'
    const d = new Fighter(scene, x, y, { axieClass: cls, build: scene.builds[cls], name: 'Dummy' })
    d.brain = { update() {} }
    d.immortal = true
    d.isDummy = true
    d.lastHurtAt = -Infinity
    d.sprite.playState('appear')
    this.label(d, 'TRAINING DUMMY')
    scene.bots.push(d)
    scene.fighters.push(d)
    return d
  }

  watchHits(target, onHit) {
    const take = target.takeDamage.bind(target)
    target.takeDamage = (amount, from, ...rest) => {
      const before = target.hp
      take(amount, from, ...rest)
      if (from === this.player && target.hp < before) onHit()
    }
  }

  updateDummy(now) {
    const d = this.dummy
    if (!d?.alive) return
    d.vel.set(0, 0)
    if (now - d.lastHurtAt > 1600 && d.hp < d.maxHp) d.hp = Math.min(d.maxHp, d.hp + d.maxHp * 0.02)
  }

  /**
   * A sparring partner that swings on a steady rhythm, with a closing ring
   * that shows exactly when to parry: the ring meets the partner as the blow
   * lands, and a parry raised in the last 200ms before that catches it.
   */
  spawnPartner({ x, y }) {
    const scene = this.scene
    const cls = this.player.axieClass === 'reptile' ? 'beast' : 'reptile'
    const f = new Fighter(scene, x, y, { axieClass: cls, build: scene.builds[cls], name: 'Partner' })
    f.brain = { update() {} }
    f.immortal = true
    f.sprite.playState('appear')
    f.ringFx = scene.add.graphics()
    f.nextSwing = this.now + 2200
    this.label(f, 'SPARRING PARTNER')
    scene.bots.push(f)
    scene.fighters.push(f)
    return f
  }

  updatePartner(now) {
    const f = this.partner
    if (!f?.alive) return
    const p = this.player
    f.hp = f.maxHp
    // Keep to arm's length, facing you.
    const d = Phaser.Math.Distance.Between(f.x, f.y, p.x, p.y)
    f.aim = Math.atan2(p.y - f.y, p.x - f.x)
    if (d > f.attackRange * 0.75) f.intent.set(p.x - f.x, p.y - f.y).normalize().scale(0.8)
    else f.intent.set(0, 0)

    const lead = 900
    const impactAt = f.nextSwing + CONNECT_MS
    const g = f.ringFx
    g.clear()
    if (now > f.nextSwing - lead && now < impactAt + 120) {
      const t = Phaser.Math.Clamp((impactAt - now) / (lead + CONNECT_MS), 0, 1)
      const inWindow = impactAt - now <= PARRY.windowMs && impactAt - now >= -PARRY.graceMs
      g.setDepth(f.y + 70)
      g.lineStyle(inWindow ? 6 : 4, inWindow ? 0xffd964 : 0xffffff, 0.95)
      g.strokeCircle(f.x, f.y - 26, 38 + t * 110)
      g.lineStyle(2, 0xffffff, 0.5)
      g.strokeCircle(f.x, f.y - 26, 38)
    }
    if (now >= f.nextSwing && !f.stunned) {
      if (d <= f.attackRange * 1.05) {
        const before = p.hp
        f.lastAttack = -1e9
        f.swing(this.scene.fighters, now)
        this.scene.time.delayedCall(CONNECT_MS + 40, () => {
          if (this.step?.id !== 'parry') return
          if (p.hp < before) this.hint = p.lastParry > now - 1000 ? 'Too early: wait until the ring is gold.' : 'Too late: press Q as the ring closes.'
        })
      }
      f.nextSwing = now + 2400
    }
  }

  retire(f) {
    if (!f?.alive) return
    f.ringFx?.destroy()
    f.immortal = false
    f.vanish()
  }

  updateGate(delta) {
    const p = this.player
    if (!p?.alive) return
    if (this.gate.contains(p)) {
      if (p.lastHurtAt > this.now - 100) this.channel = 0
      this.channel = Math.min(1, this.channel + delta / 3000)
    } else {
      this.channel = 0
    }
  }

  /** Names over the training partners, so it is clear what each one is for. */
  label(f, text) {
    f.nameplate = this.scene.add.text(f.x, f.y - 84, text, {
      fontFamily: 'Rowdies, ui-sans-serif, system-ui, sans-serif', fontSize: '13px', color: '#fff8d8',
      stroke: '#16200f', strokeThickness: 4,
    }).setOrigin(0.5, 1)
  }

  drawLabels() {
    for (const f of this.scene.fighters) {
      if (f.alive && f.nameplate) f.nameplate.setPosition(f.x, f.y - 84).setDepth(f.y + 62)
    }
  }

  drawMarker(now) {
    const g = this.marker
    g.clear()
    if (!this.goal || this.finished) return
    const t = now / 1000
    const { x, y, r } = this.goal
    if (r > 0) {
      g.fillStyle(0xffd964, 0.16).fillCircle(x, y, r)
      g.lineStyle(4, 0xffd964, 0.9).strokeCircle(x, y, r + Math.sin(t * 5) * 4)
    }
    // A bouncing chevron over the objective.
    // Above a labelled fighter's name, not on top of it.
    const lift = this.goal.follow ? 128 : (r > 0 ? r + 28 : 98)
    const cy = y - lift + Math.sin(t * 6) * 6
    g.fillStyle(0x1d2b12, 0.9).fillTriangle(x - 17, cy - 12, x + 17, cy - 12, x, cy + 12)
    g.fillStyle(0xffd964, 1).fillTriangle(x - 12, cy - 9, x + 12, cy - 9, x, cy + 8)
    g.setDepth(y + 200)
  }
}

function rewardWord(i) {
  return ['NICE!', 'GREAT HITS!', 'SWIFT!', 'BOOM!', 'PARRIED!', 'POWERED UP!', 'HEALED!', 'HIDDEN!', 'VICTORY!', 'SAFE HOME!'][i] ?? 'NICE!'
}
