/**
 * Draws a room the client does not own.
 *
 * Every fighter on screen is a sprite following a position the server decided,
 * interpolated between snapshots. Nothing here runs a rule: it reads the view
 * for where things are, and the room's events for what just happened, and turns
 * the two into animation, effects and noise.
 *
 * This is the half of the renderer that used to be tangled up with the rules in
 * Fighter.js. Keeping it apart is what lets the same scene draw a room running
 * on a server a hundred milliseconds away.
 */
import Phaser from 'phaser'
import AxieSprite from '../axie/AxieSprite.js'
import { CLASS_KITS, PARRY } from '../axie/classKits.js'
import { FLAGS, has } from '../sim/constants.js'
import { playPlate, playImpactPlate, playStatusPlate } from '../fx/SkillVfx.js'
import { damageNumber } from '../fx/Juice.js'
import { play as playSfx } from '../fx/Sfx.js'

/** Below this the fighter is standing still as far as the animation cares. */
const RUN_SPEED = 30

export default class RoomView {
  constructor(scene, builds) {
    this.scene = scene
    this.builds = builds
    this.actors = new Map()
    this.shots = new Map()
    this.props = new Map()
    this.you = null

    this.layer = scene.add.container(0, 0)
    this.ground = scene.add.graphics().setDepth(-15)
  }

  /** The sprite for a fighter, made on first sight. */
  actor(f) {
    let actor = this.actors.get(f.id)
    if (actor) return actor
    const build = this.builds[f.cls] ?? this.builds[Object.keys(this.builds)[0]]
    const sprite = new AxieSprite(this.scene, f.x, f.y, { build, axieClass: f.cls })
    // The effect helpers were written against Fighter, and want an object with
    // a sprite and a position. An actor is exactly that much of a fighter — the
    // part with no rules in it — so it can be passed to them directly.
    actor = {
      id: f.id, sprite, cls: f.cls, label: null, lastHp: f.hp, flags: 0,
      get x() { return this.sprite.x },
      get y() { return this.sprite.y },
      get colors() { return this.sprite.colors },
    }
    actor.label = this.scene.add.text(f.x, f.y - 78, '', {
      fontFamily: 'Rowdies, ui-sans-serif, system-ui, sans-serif',
      fontSize: '13px', color: '#e9f4dc', stroke: '#16200f', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(9000)
    sprite.playState('appear')
    this.actors.set(f.id, actor)
    return actor
  }

  /**
   * One frame. `view` is the interpolated room; `events` is what the authority
   * says happened since the last one.
   */
  render(view, events, delta) {
    if (!view) return
    this.you = view.me?.id ?? null

    const seen = new Set()
    for (const f of view.fighters) {
      seen.add(f.id)
      const actor = this.actor(f)
      actor.sprite.setPosition(f.x, f.y)
      // Facing follows aim, not travel: an Axie backing away still faces you.
      if (!has(f.flags, FLAGS.STUNNED)) actor.sprite.setFacing(Math.cos(f.aim) >= 0 ? 1 : -1)
      actor.sprite.update(delta, f.speed > RUN_SPEED ? f.speed : 0)
      actor.sprite.root.setAlpha(f.alive ? (has(f.flags, FLAGS.HIDDEN) ? 0.45 : 1) : 0.35)
      this.drawLabel(actor, f, view)
      actor.flags = f.flags
      actor.lastHp = f.hp
    }

    for (const [id, actor] of this.actors) {
      if (seen.has(id)) continue
      actor.sprite.destroy()
      actor.label.destroy()
      this.actors.delete(id)
    }

    this.drawShots(view)
    this.drawProps(view)
    for (const e of events) this.play(e, view)
  }

  drawLabel(actor, f, view) {
    const mine = f.id === this.you
    const bounty = f.bounty == null ? '' : f.bounty.toFixed(2)
    const name = mine ? '' : `${f.name}${f.bot ? ' · AI' : ''}`
    actor.label
      .setText(f.alive && !mine ? `${name}\n${bounty}` : '')
      .setPosition(f.x, f.y - 86)
      .setDepth(f.y + 60)
  }

  /** Projectiles: a lit mote each, since the plates are for impacts. */
  drawShots(view) {
    const seen = new Set()
    for (const s of view.shots) {
      seen.add(s.id)
      let dot = this.shots.get(s.id)
      if (!dot) {
        dot = this.scene.add.circle(s.x, s.y, 9, 0xfff4c2, 0.9).setDepth(s.y + 20)
        dot.setStrokeStyle(3, 0xffd166, 0.8)
        this.shots.set(s.id, dot)
      }
      dot.setPosition(s.x, s.y).setDepth(s.y + 20)
    }
    for (const [id, dot] of this.shots) {
      if (seen.has(id)) continue
      dot.destroy()
      this.shots.delete(id)
    }
  }

  /** Orbs, wells, gates and caches: drawn straight from the snapshot. */
  drawProps(view) {
    const g = this.ground
    g.clear()

    for (const w of view.wells) {
      g.fillStyle(0x9dffd8, w.blooming ? 0.12 : 0.22)
      g.fillCircle(w.x, w.y, w.r)
      g.lineStyle(3, 0x9dffd8, w.blooming ? 0.3 : 0.6)
      g.strokeCircle(w.x, w.y, w.r)
    }

    for (const gate of view.gates) {
      const colour = gate.closing ? 0xff8f6b : 0xc9b6ff
      g.lineStyle(4, colour, 0.85)
      g.strokeCircle(gate.x, gate.y, 70)
      g.fillStyle(colour, 0.14)
      g.fillCircle(gate.x, gate.y, 70)
    }

    if (view.moon) {
      g.fillStyle(0xff5d73, 0.10)
      g.fillCircle(view.moon.x, view.moon.y, view.moon.r)
      g.lineStyle(3, 0xff5d73, 0.35)
      g.strokeCircle(view.moon.x, view.moon.y, view.moon.r)
    }

    const seen = new Set()
    for (const o of [...view.orbs, ...view.caches]) {
      seen.add(o.id)
      let prop = this.props.get(o.id)
      if (!prop) {
        const cache = o.amount != null
        prop = this.scene.add.circle(o.x, o.y, cache ? 12 : 14,
          cache ? 0xffd166 : 0xc9f2a0, o.live === false ? 0.35 : 0.95)
        prop.setStrokeStyle(3, cache ? 0xffe9a8 : 0xe8ffd0, 0.9).setDepth(o.y)
        this.scene.tweens.add({ targets: prop, scale: 1.18, yoyo: true, repeat: -1, duration: 620, ease: 'Sine.easeInOut' })
        this.props.set(o.id, prop)
      }
      prop.setPosition(o.x, o.y).setAlpha(o.live === false ? 0.35 : 0.95)
    }
    for (const [id, prop] of this.props) {
      if (seen.has(id)) continue
      prop.destroy()
      this.props.delete(id)
    }
  }

  /** One room event, turned into something you can see or hear. */
  play(e, view) {
    const actor = e.id ? this.actors.get(e.id) : null
    const f = e.id ? view.fighters.find(x => x.id === e.id) : null
    const mine = e.id && e.id === this.you
    const kit = f ? CLASS_KITS[f.cls] : null

    switch (e.t) {
      case 'swing':
        if (actor && kit) {
          actor.sprite.setFacing(Math.cos(e.aim) >= 0 ? 1 : -1)
          actor.sprite.playAttack(null, kit.basic.anim)
        }
        break
      // `id` on a hit is whoever was hit; `by` is whoever swung. The plate
      // belongs to the attacker's kit, so it has to come from their class.
      case 'hit': {
        const hurt = this.actors.get(e.id)
        const from = view.fighters.find(x => x.id === e.by)
        if (hurt) {
          hurt.sprite.playState('hit')
          hurt.sprite.flash(0xffffff, 90)
        }
        const vfx = from ? CLASS_KITS[from.cls]?.basic?.vfx : null
        const aim = from ? Math.atan2(e.y - from.y, e.x - from.x) : 0
        if (e.x != null && vfx) playImpactPlate(this.scene, vfx, e.x, e.y, aim, { projectile: e.projectile })
        if (e.amount > 0) {
          damageNumber(this.scene, e.x, e.y, String(Math.round(e.amount)),
            mine ? '#ff8098' : '#ffe08a', e.amount)
        }
        if (e.blocked > 0) damageNumber(this.scene, e.x + 18, e.y - 30, String(Math.round(e.blocked)), '#7ce8ff', e.blocked * 0.6)
        if (mine || e.by === this.you) this.scene.cameras.main.shake(70, 0.002)
        break
      }
      case 'special':
        if (actor && kit) {
          actor.sprite.setFacing(Math.cos(e.aim) >= 0 ? 1 : -1)
          actor.sprite.play(kit.special.anim, { kind: 'special', peakAt: 140 })
          playPlate(this.scene, actor, kit.special)
        }
        break
      case 'dash':
        actor?.sprite.playState('dash', { fit: 300 })
        actor?.sprite.dashTrail(e.dir ?? { x: Math.cos(f?.aim ?? 0), y: Math.sin(f?.aim ?? 0) })
        break
      case 'parry-raise':
        actor?.sprite.play('defense/hit-with-shield', { kind: 'parry', peakAt: PARRY.windowMs, peakFraction: 0.4 })
        break
      case 'parry':
        if (actor) {
          playStatusPlate(this.scene, actor, 'shield', { size: 1.8 })
          playSfx(this.scene, 'shield', { volume: 0.75 })
          actor.sprite.flash(0xffffff, 120)
        }
        break
      case 'stagger':
      case 'stun':
        actor?.sprite.playState('stun', { loop: true, holdMs: e.ms ?? 400, kind: 'stagger' })
        break
      case 'die':
        actor?.sprite.playState('stun', { loop: true })
        if (mine) this.scene.cameras.main.flash(220, 90, 10, 30)
        break
      case 'extract':
        if (actor) playStatusPlate(this.scene, actor, 'buff', { size: 2.2 })
        break
      case 'heal':
        if (actor) actor.sprite.flash(0x9dffd8, 90)
        break
    }
  }

  destroy() {
    for (const actor of this.actors.values()) {
      actor.sprite.destroy()
      actor.label.destroy()
    }
    for (const dot of this.shots.values()) dot.destroy()
    for (const prop of this.props.values()) prop.destroy()
    this.actors.clear()
    this.shots.clear()
    this.props.clear()
    this.ground.destroy()
    this.layer.destroy()
  }
}
