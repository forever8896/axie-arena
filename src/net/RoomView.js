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
import { CLASS_KITS, PARRY, TELEGRAPH_MS } from '../axie/classKits.js'
import { CLASS_COLORS } from '../axie/palette.js'
import { FLAGS, has } from '../sim/constants.js'
import { playPlate, playImpactPlate, playStatusPlate } from '../fx/SkillVfx.js'
import { damageNumber, impact, dustEmitter } from '../fx/Juice.js'
import { drawFighterStatus, HUD_DEPTH } from '../fx/FighterHud.js'
import { POWERUPS } from '../arena/boonConfig.js'
import { GUARD, LANCE, phasesFor } from '../axie/combatConfig.js'
import { Orb } from '../arena/PowerUps.js'
import { Well } from '../arena/Moonwell.js'
import { money } from '../wilds/config.js'
import { play as playSfx, playVaried } from '../fx/Sfx.js'

/** Below this the fighter is standing still as far as the animation cares. */
const RUN_SPEED = 30

export default class RoomView {
  constructor(scene, builds, currency = 'AXS') {
    this.scene = scene
    this.builds = builds
    this.currency = currency
    this.actors = new Map()
    this.shots = new Map()
    this.zones = new Map()
    this.props = new Map()
    this.echoes = new Map()
    this.taken = new Set()
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
    // The effect helpers, the HUD and the minimap were all written against
    // Fighter, and want an object with a sprite, a position and some state. An
    // actor is exactly that much of a fighter — the part with no rules in it —
    // so all three take it without changes.
    actor = {
      id: f.id, sprite, cls: f.cls, axieClass: f.cls, label: null, lastHp: f.hp, flags: 0,
      statusFx: this.scene.add.graphics().setDepth(9000),
      parryFx: this.scene.add.graphics(),
      aimFx: this.scene.add.graphics(),
      dust: dustEmitter(this.scene, sprite.root),
      hudIcons: {},
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
  render(view, events, delta, self = null, wants = null) {
    if (!view) return
    this.you = view.me?.id ?? null

    const now = this.scene.time.now
    const seen = new Set()
    for (const raw of view.fighters) {
      seen.add(raw.id)
      // Your own body comes from the prediction: the room's word about you is
      // a round trip old, and watching your own Axie lag your hands is the one
      // thing no amount of smoothing forgives.
      const f = self && raw.id === self.id && raw.alive
        ? { ...raw, x: self.x, y: self.y, speed: self.speed }
        : raw
      const actor = this.actor(f)
      actor.sprite.setPosition(f.x, f.y)
      // Facing follows aim, not travel: an Axie backing away still faces you.
      if (!has(f.flags, FLAGS.STUNNED)) actor.sprite.setFacing(Math.cos(f.aim) >= 0 ? 1 : -1)
      actor.sprite.update(delta, f.speed > RUN_SPEED ? f.speed : 0)
      actor.sprite.root.setAlpha(f.alive ? (has(f.flags, FLAGS.HIDDEN) ? 0.45 : 1) : 0.35)
      this.describe(actor, f)
      // A guard is the one thing a player holds rather than presses, and
      // waiting a round trip to see it come up reads as the key not working.
      // Shown from the local key, then corrected by the room like everything
      // else — it changes nothing about who blocks what.
      if (wants?.guard && actor.isPlayer && f.alive) actor.wantsGuard = true
      else if (actor.isPlayer) actor.wantsGuard = false
      if (actor.isPlayer) actor.wantsAim = Boolean(wants?.aiming) && f.alive
      this.drawLabel(actor, f)
      drawFighterStatus(this.scene, actor.statusFx, actor.hudIcons, this.status(actor, f), now)
      this.drawParry(actor, f)
      this.drawAim(actor, f, now)
      actor.flags = f.flags
      actor.lastHp = f.hp
    }

    for (const [id, actor] of this.actors) {
      if (seen.has(id)) continue
      this.forget(actor)
      this.actors.delete(id)
    }

    this.drawShots(view)
    this.drawZones(view)
    this.drawProps(view)
    for (const e of events) this.play(e, view)
  }

  /**
   * Copy the snapshot onto the actor in the shape the HUD, the minimap and the
   * Wilds overlay already read. They were written against Fighter; this is the
   * translation, in one place, rather than a special case in each of them.
   */
  describe(actor, f) {
    actor.alive = f.alive
    actor.hp = f.hp
    actor.maxHp = f.maxHp
    actor.charge = f.charge
    actor.name = f.name
    actor.bot = f.bot
    actor.isPlayer = f.id === this.you
    actor.hidden = has(f.flags, FLAGS.HIDDEN)
    actor.shielded = has(f.flags, FLAGS.SHIELDED)
    actor.specialReady = f.charge >= 1
    actor.wilds = { bounty: f.bounty ?? 0, leaving: Boolean(f.leaving) }
    actor.channel = f.channel
      ? { progress: f.channel.progress, interruptedAt: f.channel.interrupted ? this.scene.time.now : 0 }
      : null
  }

  /** The description fx/FighterHud draws from. */
  status(actor, f) {
    return {
      x: f.x,
      y: f.y,
      isPlayer: actor.isPlayer,
      alive: f.alive,
      hp: f.hp,
      maxHp: f.maxHp,
      shield: f.shield ?? 0,
      stamina: f.stamina,
      charge: f.charge,
      specialReady: actor.specialReady,
      moon: f.moon ?? 0,
      moonReady: (f.moon ?? 0) >= 1,
      colors: actor.colors,
      dash: { ready: (f.ready?.dash ?? 1) >= 1, fill: f.ready?.dash ?? 1 },
      parry: { ready: (f.ready?.parry ?? 1) >= 1, fill: f.ready?.parry ?? 1 },
      buffs: (f.buffs ?? []).flatMap(b => {
        const def = POWERUPS[b.type]
        if (!def?.icon) return []
        return [{ icon: def.icon, color: def.color, fill: b.of ? b.left / b.of : 1 }]
      }),
    }
  }

  /**
   * The name plate over every hunter but you.
   *
   * A person and a stand-in must never be mistaken for each other: the whole
   * point of playing here is that some of these are people. Stand-ins are
   * marked AI and written in the dimmer colour; a person's name is bright and
   * carries a mark of its own, so "is that a real player?" is answered at a
   * glance rather than by watching how it moves.
   */
  drawLabel(actor, f) {
    const mine = f.id === this.you
    if (!f.alive || mine) {
      actor.label.setText('')
      return
    }
    const who = f.bot ? `${f.name}  · AI ·` : `◆ ${f.name}`
    actor.label
      .setText(`${who}\n${money(f.bounty ?? 0, this.currency)}`)
      .setPosition(f.x, f.y - 104)
      .setColor(f.leaving ? '#c9b8ff' : f.bot ? '#b9c4a6' : '#ffd964')
      .setFontStyle(f.bot ? 'normal' : 'bold')
      .setDepth(HUD_DEPTH + 2)
  }

  forget(actor) {
    actor.parryFx.destroy()
    actor.aimFx.destroy()
    actor.dust?.destroy()
    actor.sprite.destroy()
    actor.label.destroy()
    actor.statusFx.destroy()
    Object.values(actor.hudIcons).forEach(i => i.destroy())
  }

  /**
   * Travelling shots: a core and an additive halo in the owner's colour, the
   * same two circles the local game builds. A single pale dot was standing in
   * for every class's projectile, which is why a bug's spit and a reptile's
   * seeker looked identical.
   */
  drawShots(view) {
    const seen = new Set()
    for (const shot of view.shots) {
      seen.add(shot.id)
      let parts = this.shots.get(shot.id)
      if (!parts) {
        const colour = CLASS_COLORS[shot.cls]?.body ?? 0xfff4c2
        const radius = shot.seeking ? 11 : 9
        const core = this.scene.add.circle(shot.x, shot.y, radius, colour).setDepth(shot.y + 4)
        const halo = this.scene.add.circle(shot.x, shot.y, radius * 2.1, colour, 0.28)
          .setDepth(shot.y + 3).setBlendMode(Phaser.BlendModes.ADD)
        parts = { core, halo, colour }
        this.shots.set(shot.id, parts)
      }
      parts.core.setPosition(shot.x, shot.y).setDepth(shot.y + 4)
      parts.halo.setPosition(shot.x, shot.y).setDepth(shot.y + 3)
      parts.at = { x: shot.x, y: shot.y }
    }
    for (const [id, parts] of this.shots) {
      if (seen.has(id)) continue
      // Gone: it hit something or ran out of range. Either way it ends with a
      // small burst where it stopped, as the local one does.
      if (parts.at) impact(this.scene, parts.at.x, parts.at.y, parts.colour, 0.7)
      parts.core.destroy()
      parts.halo.destroy()
      this.shots.delete(id)
    }
  }

  /**
   * Ground that hurts: poison clouds, spreads, waves. These were drawn as
   * nothing at all — the damage arrived from a patch of empty grass.
   */
  drawZones(view) {
    const seen = new Set()
    for (const z of view.zones ?? []) {
      seen.add(z.id)
      let parts = this.zones.get(z.id)
      if (!parts) {
        const colour = CLASS_COLORS[z.cls]?.body ?? 0x9ff0bb
        const fill = this.scene.add.circle(z.x, z.y, z.r, colour, 0.16).setDepth(-18).setScale(0)
        const ring = this.scene.add.circle(z.x, z.y, z.r, colour, 0)
          .setStrokeStyle(2, colour, 0.55).setDepth(-17)
        this.scene.tweens.add({ targets: fill, scaleX: 1, scaleY: 1, duration: 220, ease: 'Back.easeOut' })
        this.scene.tweens.add({
          targets: ring, scaleX: 1.05, scaleY: 1.05,
          duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        })
        parts = { fill, ring }
        this.zones.set(z.id, parts)
      }
      parts.fill.setPosition(z.x, z.y)
      parts.ring.setPosition(z.x, z.y)
    }
    for (const [id, parts] of this.zones) {
      if (seen.has(id)) continue
      this.zones.delete(id)
      this.scene.tweens.add({
        targets: [parts.fill, parts.ring], alpha: 0, duration: 280,
        onComplete: () => { parts.fill.destroy(); parts.ring.destroy() },
      })
    }
  }

  /**
   * Orbs, wells, gates and caches.
   *
   * Built from the same textures the local game builds them from — the Origins
   * status icon inside a bubble, the moonwell glow, the leaf — because a room
   * on a server should look like the game, not like a diagram of it. The ground
   * markings are redrawn each frame; the objects on it persist so they can bob
   * and pulse rather than flicker.
   */
  drawProps(view) {
    const g = this.ground
    const now = this.scene.time.now
    g.clear()

    for (const gate of view.gates) {
      const colour = gate.closing ? 0xff8098 : 0xc9b8ff
      const pulse = gate.closing ? 0.5 + Math.sin(now / 140) * 0.35 : 0.85
      g.fillStyle(colour, 0.14)
      g.fillCircle(gate.x, gate.y, 70)
      g.lineStyle(4, colour, pulse)
      g.strokeCircle(gate.x, gate.y, 70)
      g.lineStyle(2, colour, pulse * 0.6)
      g.strokeCircle(gate.x, gate.y, 70 - 10 - Math.sin(now / 300) * 6)
    }

    if (view.moon) {
      g.fillStyle(0xff5d73, 0.10)
      g.fillCircle(view.moon.x, view.moon.y, view.moon.r)
      g.lineStyle(3, 0xff5d73, 0.35 + Math.sin(now / 400) * 0.15)
      g.strokeCircle(view.moon.x, view.moon.y, view.moon.r)
    }

    const seen = new Set()
    for (const w of view.wells) {
      seen.add(w.id)
      this.prop(w.id, () => this.makeWell(w)).draw(now)
    }
    for (const o of view.orbs) {
      seen.add(o.id)
      this.prop(o.id, () => this.makeOrb(o)).draw(now)
    }
    for (const c of view.caches) {
      seen.add(c.id)
      this.prop(c.id, () => this.makeCache(c)).draw(now)
    }

    for (const [id, prop] of this.props) {
      if (seen.has(id)) continue
      this.props.delete(id)
      // An orb that went because somebody took it gets the collection burst;
      // anything else simply goes.
      prop.remove(this.taken.has(id))
      this.taken.delete(id)
    }
  }

  /**
   * A thing on the ground, made once and kept.
   *
   * Each one is `{ draw(now), remove(taken) }`. The objects behind them are the
   * local game's, and those run rules as well as draw — a Moonwell heals whoever
   * stands in it. Here the room does the healing, so only the drawing half is
   * ever called, and it is called with what it expects.
   */
  prop(id, make) {
    let prop = this.props.get(id)
    if (!prop) {
      prop = make()
      this.props.set(id, prop)
    }
    return prop
  }

  /**
   * An orb, as the local game builds it.
   *
   * Not a copy of one: the same class. Approximating these is what kept the
   * networked game looking thinner than the local one — a coloured circle where
   * the game has a shimmer on the ground, a bubble that pops in, a shine, the
   * Origins icon, a bob and a blink as it runs out. The room decides when it
   * exists and who takes it; the object decides how it looks.
   */
  makeOrb(o) {
    const orb = new Orb(this.scene, o.x, o.y, o.type)
    // The room's word on whether it has formed wins over the object's own
    // clock: this client may have arrived halfway through the shimmer.
    if (o.live) orb.liveAt = this.scene.time.now - 1
    // `object` is the game's own orb, kept reachable so what is on the ground
    // can be inspected rather than inferred.
    return {
      object: orb,
      parts: () => orb.parts,
      draw: now => orb.update(now),
      remove: taken => (taken ? orb.collect() : orb.expire()),
    }
  }

  /** A Moonwell, likewise: the game's own bloom, ring, sprouts and leaf. */
  makeWell(w) {
    const well = new Well(this.scene, w.x, w.y)
    return {
      object: well,
      parts: () => well.parts,
      // Its update both draws and heals; the healing is the room's, so it is
      // handed nobody to heal and only the drawing happens.
      draw: () => well.update([]),
      // Fade it out the way the local one goes, rather than snapping it away.
      remove: () => well.end(),
    }
  }

  /** A bounty someone dropped: a coin of it, glowing, waiting to be taken. */
  makeCacheParts(c) {
    const scene = this.scene
    const glow = scene.add.image(c.x, c.y, 'fx-soft').setTint(0xffd166)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(c.y - 1).setScale(1.1).setAlpha(0.5)
    const coin = scene.add.circle(c.x, c.y - 10, 13, 0xffd166, 1)
      .setStrokeStyle(3, 0xffe9a8, 0.95).setDepth(c.y + 20)
    coin.yOffset = -10
    const text = scene.add.text(c.x, c.y - 34, money(c.amount, this.currency), {
      fontFamily: 'ui-monospace, monospace', fontSize: '12px', color: '#ffe9a8',
      stroke: '#16200f', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(c.y + 21)
    text.yOffset = -34
    return [glow, coin, text]
  }

  makeCache(c) {
    const parts = this.makeCacheParts(c)
    return {
      parts: () => parts,
      draw: now => {
        const bob = Math.sin(now / 260 + c.x) * 3
        for (const part of parts) part.setPosition(c.x, c.y + (part.yOffset ?? 0) + bob)
      },
      remove: () => parts.forEach(part => part.destroy()),
    }
  }

  /**
   * The swing animation, stretched so the clip's impact frame lands with the
   * blow rather than half a second before it.
   */
  swingAnimation(actor, kit, aim, ms) {
    if (!kit?.basic?.anim) return
    actor.sprite.setFacing(Math.cos(aim) >= 0 ? 1 : -1)
    actor.sprite.play(kit.basic.anim, {
      kind: 'attack',
      peakAt: ms,
      // Enough room to stretch across the longest wind-up without the motion
      // becoming a slideshow.
      minSpeed: 0.28,
    })
  }

  /**
   * A blow being wound up: the cone it will sweep, filling as it comes.
   *
   * This is the single most important thing on the screen in the reworked
   * fight. It is the information the whole thing is built on — move out of it,
   * raise a guard into it, or trade with it — and it is drawn for long enough
   * that a player on a real connection can actually act on it.
   */
  windup(actor, e) {
    const scene = this.scene
    const g = scene.add.graphics().setDepth(-19)
    const arc = Phaser.Math.DegToRad(e.arc ?? 100)
    const range = e.range ?? 96
    const colour = e.riposte ? 0xffd964 : actor.colors.rim
    const state = { t: 0 }
    const draw = () => {
      g.clear()
      const x = actor.x
      const y = actor.y
      // The outline is the whole cone; the fill grows to show the time left.
      g.lineStyle(2, colour, 0.5 + state.t * 0.4)
      g.beginPath()
      g.arc(x, y, range, e.aim - arc / 2, e.aim + arc / 2)
      g.strokePath()
      g.fillStyle(colour, 0.10 + state.t * 0.22)
      g.slice(x, y, range * (0.25 + 0.75 * state.t), e.aim - arc / 2, e.aim + arc / 2)
      g.fillPath()
    }
    draw()
    scene.tweens.add({
      targets: state, t: 1, duration: e.ms ?? 560, ease: 'Sine.easeIn',
      onUpdate: draw, onComplete: () => g.destroy(),
    })
  }

  /**
   * The cone a swing sweeps, flashed where it landed.
   *
   * Every basic attack in the local game draws this, and nothing drew it here:
   * a swing was an animation with no reach, so there was no telling what it had
   * covered or why it missed. What you see is exactly the cone the room tested.
   */
  /**
   * The lane a Moonshot went down, shown for long enough to see what it hit and
   * short enough not to clutter the fight.
   */
  lanceFlash(actor, e) {
    const scene = this.scene
    const range = e.range ?? 400
    const half = (e.width ?? 80) / 2
    const x = actor.x
    const y = actor.y - 10
    const colour = actor.colors.rim
    const g = scene.add.graphics().setDepth(y + 4)
    const state = { a: 1, grow: 0 }
    const draw = () => {
      g.clear()
      g.save()
      g.translateCanvas(x, y)
      g.rotateCanvas(e.aim ?? 0)
      const reach = range * state.grow
      g.fillStyle(colour, (e.whiff ? 0.12 : 0.3) * state.a)
      g.fillRect(0, -half, reach, half * 2)
      g.lineStyle(3, e.whiff ? 0x9ecbff : 0xffe9a8, (e.whiff ? 0.4 : 0.9) * state.a)
      g.strokeRect(0, -half, reach, half * 2)
      g.lineStyle(5, 0xffffff, (e.whiff ? 0.3 : 0.85) * state.a)
      g.beginPath(); g.moveTo(0, 0); g.lineTo(reach, 0); g.strokePath()
      g.restore()
    }
    // Thrown out at the speed the rules say it travels, so what you see leave
    // the Axie is what the room resolved.
    scene.tweens.add({
      targets: state, grow: 1, duration: Math.min(150, (range / (e.speed ?? LANCE.speed)) * 1000),
      ease: 'Quad.easeOut', onUpdate: draw,
      onComplete: () => scene.tweens.add({
        targets: state, a: 0, duration: 260, ease: 'Quad.easeIn',
        onUpdate: draw, onComplete: () => g.destroy(),
      }),
    })
    draw()
  }

  zoneFlash(actor, spec, aim) {
    const scene = this.scene
    const arc = Phaser.Math.DegToRad(spec.arc ?? 100)
    const range = spec.range ?? 96
    const g = scene.add.graphics().setDepth(-19)
    const x = actor.x
    const y = actor.y
    const colour = actor.colors.rim
    const state = { a: 1 }
    const draw = () => {
      g.clear()
      g.fillStyle(colour, 0.22 * state.a)
      g.lineStyle(2, 0xffffff, 0.55 * state.a)
      if (arc >= Math.PI * 2) {
        g.fillCircle(x, y, range)
        g.strokeCircle(x, y, range)
      } else {
        g.slice(x, y, range, aim - arc / 2, aim + arc / 2)
        g.fillPath()
        g.beginPath()
        g.arc(x, y, range, aim - arc / 2, aim + arc / 2)
        g.strokePath()
      }
    }
    draw()
    scene.tweens.add({
      targets: state, a: 0, duration: 170, ease: 'Quad.easeIn',
      onUpdate: draw, onComplete: () => g.destroy(),
    })
  }

  /**
   * The parry arc: bright while the window is open, broken and dim while you
   * recover from a whiff.
   *
   * This is the whole visual language of parrying — a rival has to see it to
   * decide not to swing, and you have to see your own opening. It is drawn from
   * the flags in the snapshot, so it appears over everyone who raises one.
   */
  /**
   * A Moonshot being pointed.
   *
   * Everyone sees this, and that is the point: standing still in the open with
   * a line drawn out of you is what you pay for the shot. It fills from the
   * fighter outward as the aim is held, so a rival can tell a Moonshot that is
   * about to go off from one that was only just started.
   */
  drawAim(actor, f, now) {
    const g = actor.aimFx
    g.clear()
    const ult = CLASS_KITS[f.cls]?.ultimate
    // Drawn from the local key the moment it goes down, then from the room —
    // the same reason the guard is, and it matters more here because the whole
    // action is about where you are pointing.
    const aiming = has(f.flags, FLAGS.AIMING) || actor.wantsAim
    if (!f.alive || !aiming || !ult) return

    const held = actor.wantsAim && !has(f.flags, FLAGS.AIMING) ? 0 : (f.aimHeld ?? 0)
    const ready = Math.min(1, held / LANCE.minAimMs)
    const cy = f.y - 10
    const reach = ult.range * (0.35 + 0.65 * ready)
    const half = ult.width / 2

    // The lane it will go down: faint until it can actually be fired. Drawn in
    // the fighter's own frame, so the maths below is a plain rectangle.
    g.setDepth(f.y - 6)
    g.save()
    g.translateCanvas(f.x, cy)
    g.rotateCanvas(f.aim)
    g.fillStyle(actor.colors.rim, 0.07 + 0.11 * ready)
    g.fillRect(0, -half, reach, half * 2)
    g.lineStyle(ready >= 1 ? 2 : 1, ready >= 1 ? 0xffe9a8 : 0x9ecbff, 0.35 + 0.5 * ready)
    g.strokeRect(0, -half, reach, half * 2)
    // The line down the middle, which is what you actually aim with.
    g.lineStyle(ready >= 1 ? 3 : 1.5, ready >= 1 ? 0xffd964 : 0x7ce8ff, 0.5 + 0.45 * ready)
    g.beginPath(); g.moveTo(0, 0); g.lineTo(reach, 0); g.strokePath()
    if (ready >= 1) {
      // Armed: a head on the end so it is unmistakable.
      const pulse = 0.7 + 0.3 * Math.sin(now / 90)
      g.fillStyle(0xffd964, 0.85 * pulse)
      g.fillTriangle(reach, -half * 0.5, reach, half * 0.5, reach + 16, 0)
    }
    g.restore()
  }

  drawParry(actor, f) {
    const g = actor.parryFx
    g.clear()
    const guarding = has(f.flags, FLAGS.GUARDING) || (actor.wantsGuard && !has(f.flags, FLAGS.GUARD_BROKEN))
    const broken = has(f.flags, FLAGS.GUARD_BROKEN)
    const riposte = has(f.flags, FLAGS.RIPOSTE)
    const parrying = has(f.flags, FLAGS.PARRYING)
    const recovering = has(f.flags, FLAGS.PARRY_RECOVER)

    if (f.alive && (guarding || broken || riposte)) {
      const r = 30 + 22
      const half = Phaser.Math.DegToRad(GUARD.arcDeg) / 2
      const cy = f.y - 14
      g.setDepth(f.y + 5)
      if (broken) {
        // Shattered: the opening everyone can see.
        g.lineStyle(3, 0xff8098, 0.8)
        for (let i = 0; i < 5; i++) {
          const a0 = f.aim - half + (i / 5) * half * 2
          g.beginPath(); g.arc(f.x, cy, r + 4, a0, a0 + half / 10); g.strokePath()
        }
      } else if (guarding) {
        // Held: thickness shows what is left in the bar behind it.
        const left = Math.max(0.15, f.stamina ?? 1)
        g.lineStyle(9, 0x1d2b12, 0.35)
        g.beginPath(); g.arc(f.x, cy, r, f.aim - half, f.aim + half); g.strokePath()
        g.lineStyle(3 + 5 * left, 0x7ce8ff, 0.9)
        g.beginPath(); g.arc(f.x, cy, r, f.aim - half, f.aim + half); g.strokePath()
      }
      if (riposte) {
        // Earned: answer now.
        g.lineStyle(3, 0xffd964, 0.9)
        g.beginPath(); g.arc(f.x, cy, r + 9, f.aim - half, f.aim + half); g.strokePath()
      }
      return
    }

    if (!f.alive || (!parrying && !recovering)) return

    const r = 30 + 22
    const half = Phaser.Math.DegToRad(PARRY.arcDeg) / 2
    const cy = f.y - 14
    g.setDepth(f.y + 5)

    if (parrying) {
      g.lineStyle(9, 0x1d2b12, 0.35)
      g.beginPath(); g.arc(f.x, cy, r, f.aim - half, f.aim + half); g.strokePath()
      g.lineStyle(6, 0xffffff, 0.95)
      g.beginPath(); g.arc(f.x, cy, r, f.aim - half, f.aim + half); g.strokePath()
      g.lineStyle(3, actor.colors.rim, 1)
      g.beginPath(); g.arc(f.x, cy, r + 6, f.aim - half, f.aim + half); g.strokePath()
    } else {
      g.lineStyle(3, 0x9aa88a, 0.45)
      for (let i = 0; i < 6; i++) {
        const a0 = f.aim - half + (i / 6) * half * 2
        g.beginPath(); g.arc(f.x, cy, r, a0, a0 + half / 8); g.strokePath()
      }
    }
  }

  /**
   * The wind-up before a special, drawn exactly as the local game draws it:
   * the shape of what is coming, growing over the reaction window.
   *
   * This is not decoration. The telegraph is the information a parry is read
   * from — without it a special arrives out of nowhere, which is what made the
   * networked fights feel arbitrary.
   */
  telegraph(actor, spec, aim, point) {
    if (!spec) return
    const scene = this.scene
    const g = scene.add.graphics().setDepth(-15)
    const colour = actor.colors.rim
    const state = { t: 0 }
    const from = { x: actor.x, y: actor.y }

    const draw = () => {
      g.clear()
      const a = 0.2 + state.t * 0.35
      g.fillStyle(colour, a * 0.45)
      g.lineStyle(3, colour, a + 0.25)

      switch (spec.kind) {
        case 'charge': {
          const len = spec.speed * (spec.duration / 1000)
          g.lineStyle(46 * state.t + 8, colour, a * 0.5)
          g.lineBetween(from.x, from.y, from.x + Math.cos(aim) * len, from.y + Math.sin(aim) * len)
          break
        }
        case 'wave':
          g.slice(from.x, from.y, spec.range,
            aim - Phaser.Math.DegToRad(spec.arc) / 2, aim + Phaser.Math.DegToRad(spec.arc) / 2)
          g.fillPath()
          g.strokePath()
          break
        case 'lob': {
          const d = Math.min(spec.maxRange, Phaser.Math.Distance.Between(from.x, from.y, point?.x ?? from.x, point?.y ?? from.y))
          const lx = from.x + Math.cos(aim) * d
          const ly = from.y + Math.sin(aim) * d
          g.fillCircle(lx, ly, spec.radius * (0.4 + 0.6 * state.t))
          g.strokeCircle(lx, ly, spec.radius)
          break
        }
        case 'spread': {
          const spread = Phaser.Math.DegToRad(spec.spread)
          for (let i = 0; i < spec.count; i++) {
            const ang = aim - spread / 2 + spread * (i / (spec.count - 1))
            g.lineBetween(from.x, from.y,
              from.x + Math.cos(ang) * spec.projectileRange * 0.6 * state.t,
              from.y + Math.sin(ang) * spec.projectileRange * 0.6 * state.t)
          }
          break
        }
        case 'seeker':
          g.lineBetween(from.x, from.y, from.x + Math.cos(aim) * 160 * state.t, from.y + Math.sin(aim) * 160 * state.t)
          g.strokeCircle(from.x, from.y, 40 * state.t + 10)
          break
        case 'radial':
          g.fillCircle(from.x, from.y, spec.radius * state.t)
          g.strokeCircle(from.x, from.y, spec.radius)
          break
      }
    }

    scene.tweens.add({
      targets: state, t: 1, duration: TELEGRAPH_MS, ease: 'Sine.easeIn',
      // The caster is moving while this plays, so it follows them rather than
      // hanging in the air where they started.
      onUpdate: () => { from.x = actor.x; from.y = actor.y; draw() },
      onComplete: () => g.destroy(),
    })
  }

  /**
   * Play your own action the instant you asked for it, rather than when the
   * room's word gets back.
   *
   * Only ever animation: no damage, no charge spent, no bounty moved. If the
   * room disagrees, the worst that happens is an Axie that swung at nothing,
   * which is also what happens when you mistime a swing.
   */
  echo(kind, actor, aim) {
    if (!actor) return
    this.echoes.set(kind, this.scene.time.now)
    const kit = CLASS_KITS[actor.cls]
    if (kind === 'swing' && kit?.basic) {
      const ms = phasesFor(kit).windupMs
      this.swingAnimation(actor, kit, aim, ms)
      this.windup(actor, { aim, ms, range: kit.basic.range, arc: kit.basic.arc })
    } else if (kind === 'dash') {
      actor.sprite.playState('dash', { fit: 300 })
      actor.sprite.dashTrail({ x: Math.cos(aim), y: Math.sin(aim) })
      actor.sprite.flash(0x7ce8ff, 140)
    } else if (kind === 'parry') {
      actor.sprite.play('defense/hit-with-shield', { kind: 'parry', peakAt: PARRY.windowMs, peakFraction: 0.4 })
    }
  }

  /** True if this client already played that action for itself, recently. */
  echoed(kind) {
    const at = this.echoes.get(kind)
    if (at == null) return false
    // Long enough to cover a round trip and the room's own step, short enough
    // that the next press is not swallowed.
    return this.scene.time.now - at < 900
  }

  /** One room event, turned into something you can see or hear. */
  play(e, view) {
    const actor = e.id ? this.actors.get(e.id) : null
    const f = e.id ? view.fighters.find(x => x.id === e.id) : null
    const mine = e.id && e.id === this.you
    const kit = f ? CLASS_KITS[f.cls] : null

    switch (e.t) {
      // The wind-up: a blow is coming, from there, in this long. Everything the
      // reworked fight asks of a player depends on being able to see this.
      case 'windup':
        if (actor && kit?.basic) {
          this.windup(actor, e)
          if (!(mine && this.echoed('swing'))) this.swingAnimation(actor, kit, e.aim, e.ms)
        }
        if (kit?.basic?.sfx) playVaried(this.scene, kit.basic.sfx, 0.22)
        break
      case 'swing-cancel':
        actor?.sprite.flash(0x9aa88a, 90)
        break
      case 'guard-up':
        playSfx(this.scene, 'shield', { volume: 0.3 })
        break
      case 'block':
        if (actor) {
          playStatusPlate(this.scene, actor, 'shield', { size: 1.5 })
          playSfx(this.scene, 'shield', { volume: 0.7 })
          actor.sprite.flash(0xbfe6ff, 110)
        }
        if (e.x != null) impact(this.scene, e.x, e.y - 8, 0x7ce8ff, 0.8)
        break
      case 'guard-break':
        if (actor) {
          actor.sprite.playState('stun', { loop: true, holdMs: 600, kind: 'stagger' })
          actor.sprite.flash(0xff8098, 200)
          playStatusPlate(this.scene, actor, 'debuff_apply', { size: 1.8 })
        }
        playSfx(this.scene, 'stunned', { volume: 0.6 })
        if (mine) this.scene.cameras.main.shake(180, 0.005)
        break

      // Your own swing was already played the moment you clicked; playing the
      // room's copy of it would restart the animation a round trip later. The
      // sound still comes from here, because the room decides whether the swing
      // actually happened.
      // Contact. The animation has been running since the wind-up, so this is
      // the sweep and the noise of it landing, not the start of a swing.
      case 'swing':
        if (actor && kit?.basic) this.zoneFlash(actor, kit.basic, e.aim)
        if (kit?.basic?.sfx) playVaried(this.scene, kit.basic.sfx, 0.4)
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
        const theirs = from ? CLASS_KITS[from.cls] : null
        const vfx = theirs?.basic?.vfx
        const aim = from ? Math.atan2(e.y - from.y, e.x - from.x) : 0
        if (e.x != null && vfx) playImpactPlate(this.scene, vfx, e.x, e.y, aim, { projectile: e.projectile })

        // The rest of what a blow landing looks and sounds like locally: the
        // attacker's hit sound, and a burst of their colour where it connected.
        if (theirs?.hitSfx) playVaried(this.scene, theirs.hitSfx, 0.45)
        if (e.x != null) {
          const power = Phaser.Math.Clamp(0.6 + (e.amount ?? 0) / 260, 0.6, 2.2) * (e.projectile ? 0.7 : 1)
          impact(this.scene, e.x, e.y - 8, this.actors.get(e.by)?.colors.rim ?? 0xffffff, power)
        }
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
        if (kit?.special?.sfx) playSfx(this.scene, kit.special.sfx, { volume: 0.6 })
        break
      case 'dash':
        if (mine && this.echoed('dash')) break
        actor?.sprite.playState('dash', { fit: 300 })
        actor?.sprite.dashTrail(e.dir ?? { x: Math.cos(f?.aim ?? 0), y: Math.sin(f?.aim ?? 0) })
        actor?.sprite.flash(0x7ce8ff, 140)
        break
      case 'parry-raise':
        actor?.sprite.play('defense/hit-with-shield', { kind: 'parry', peakAt: PARRY.windowMs, peakFraction: 0.4 })
        break
      // A parry is a read that paid off, and the local game sells it hard: a
      // clang, a plate, a white flash, an expanding ring between the two of
      // them, the word on screen, and a shake. All of that was missing.
      case 'parry': {
        if (!actor) break
        const attacker = this.actors.get(e.by)
        playStatusPlate(this.scene, actor, 'shield', { size: 1.8 })
        playSfx(this.scene, 'shield', { volume: 0.75 })
        actor.sprite.play('defense/hit-with-shield', { kind: 'stagger', peakAt: 60, peakFraction: 0.6 })
        actor.sprite.flash(0xffffff, 120)

        const mx = attacker ? (actor.x + attacker.x) / 2 : actor.x
        const my = (attacker ? (actor.y + attacker.y) / 2 : actor.y) - 20
        const ring = this.scene.add.circle(mx, my, 10, 0xffffff, 0)
          .setStrokeStyle(5, 0xffffff, 1).setDepth(my + 50)
        this.scene.tweens.add({
          targets: ring, radius: 70, alpha: 0, duration: 260, ease: 'Cubic.easeOut',
          onUpdate: () => ring.setStrokeStyle(5, 0xffffff, ring.alpha),
          onComplete: () => ring.destroy(),
        })

        const label = this.scene.add.text(actor.x, actor.y - 96, 'PARRY', {
          fontFamily: 'Rowdies, ui-sans-serif, system-ui, sans-serif',
          fontSize: '26px', color: '#ffffff', stroke: '#16200f', strokeThickness: 6,
        }).setOrigin(0.5).setDepth(10001)
        this.scene.tweens.add({
          targets: label, y: label.y - 36, alpha: 0, scale: { from: 1.5, to: 1 },
          duration: 720, ease: 'Quad.easeOut', onComplete: () => label.destroy(),
        })

        if (mine || e.by === this.you) this.scene.cameras.main.shake(120, 0.004)
        break
      }

      // A Moonshot going off: the lane it was aimed down, thrown out hard and
      // faded. This is the payoff for standing still to point it, so it is the
      // loudest thing in the room for a moment.
      case 'lance': {
        if (actor) this.lanceFlash(actor, e)
        const ult = CLASS_KITS[actor?.cls]?.ultimate
        if (ult?.sfx) playVaried(this.scene, ult.sfx, 0.85)
        if (ult?.anim) {
          actor.sprite.setFacing(Math.cos(e.aim) >= 0 ? 1 : -1)
          actor.sprite.play(ult.anim, { kind: 'attack' })
        }
        if (mine || e.hits) this.scene.cameras.main.shake(e.hits ? 260 : 140, e.hits ? 0.009 : 0.004)
        break
      }
      case 'lance-miss':
        if (actor) this.lanceFlash(actor, { ...e, width: CLASS_KITS[actor.cls]?.ultimate?.width ?? 80, whiff: true })
        break

      // Pointing one, and giving it up. The line itself is drawn every frame in
      // drawAim; these are just the noises around it.
      case 'aim-start':
        if (actor) actor.sprite.playState('ready')
        break
      case 'aim-cancel':
        if (actor) actor.wantsAim = false
        break
      // The Moonshot coming up. Told the same way the special is, one notch
      // brighter, because it is the rarer of the two.
      case 'moon-ready':
        if (actor) playStatusPlate(this.scene, actor, 'power_gain', { size: 2.1 })
        break

      // The wind-up. It is the whole reason a parry is possible: without it
      // there is nothing to read.
      case 'telegraph':
        if (actor) this.telegraph(actor, CLASS_KITS[actor.cls]?.special, e.aim, e.point)
        break

      // A blow that found nothing still shows where it went, or a miss reads
      // as the game having ignored you.
      case 'miss': {
        const kitOf = CLASS_KITS[f?.cls]?.basic
        if (kitOf?.vfx && e.x != null) {
          playImpactPlate(this.scene, kitOf.vfx, e.x, e.y, e.aim ?? 0, { whiff: true })
        }
        if (mine) this.scene.cameras.main.shake(60, 0.0015)
        break
      }
      case 'parry-whiff':
        actor?.sprite.playState('stun', { fit: PARRY.recoveryMs, holdMs: PARRY.recoveryMs, kind: 'parry' })
        break

      // Beast's Impale: committed movement, sold with a trail and a shake when
      // it lands.
      case 'charge-start':
        if (actor) {
          actor.sprite.dashTrail(e.dir ?? { x: 1, y: 0 })
          actor.sprite.play('action/run', { kind: 'special', fit: e.ms ?? 420, loop: true, holdMs: e.ms ?? 420 })
        }
        break
      // Your special coming ready: the same stance and plate the local game
      // plays, so you know it is up without watching the meter.
      case 'charged':
        if (actor) {
          actor.sprite.playState('ready')
          playStatusPlate(this.scene, actor, 'power_gain', { size: 1.6 })
        }
        break
      case 'slow':
        actor?.sprite.flash(0x7ce8ff, 120)
        break
      case 'stagger':
      case 'stun':
        actor?.sprite.playState('stun', { loop: true, holdMs: e.ms ?? 400, kind: 'stagger' })
        actor?.sprite.flash(0x9a5ad4, 90)
        playSfx(this.scene, 'stunned', { volume: 0.5 })
        break
      case 'poison':
        actor?.sprite.flash(0x9ff0bb, 80)
        if (e.amount) damageNumber(this.scene, actor?.x ?? 0, (actor?.y ?? 0) - 12, String(e.amount), '#9ff0bb', e.amount)
        playSfx(this.scene, 'poison', { volume: 0.45 })
        break
      case 'die':
        actor?.sprite.playState('stun', { loop: true })
        if (e.x != null) impact(this.scene, e.x, e.y - 8, actor?.colors.body ?? 0xffffff, 1.8)
        if (mine) this.scene.cameras.main.flash(220, 90, 10, 30)
        break
      case 'extract':
        if (actor) playStatusPlate(this.scene, actor, 'buff', { size: 2.2 })
        break
      case 'heal':
        if (actor) actor.sprite.flash(0x9dffd8, 90)
        break
      case 'well-open':
        playSfx(this.scene, 'bubble', { volume: 0.4 })
        break
      case 'orb-live':
        playSfx(this.scene, 'bubble', { volume: 0.35 })
        break
      case 'moon':
        // The field itself turns while a Blood Moon is up.
        this.scene.cameras.main.flash(400, 60, 6, 18)
        break
      case 'orb-taken': {
        this.taken.add(e.id)
        const taker = this.actors.get(e.by ?? e.id)
        const def = POWERUPS[e.type]
        if (taker && def) {
          taker.sprite.flash(def.color, 160)
          playStatusPlate(this.scene, taker, def.plate, { size: 1.9 })
        }
        if (def?.sfx) playSfx(this.scene, def.sfx, { volume: 0.5 })
        break
      }
    }
  }

  destroy() {
    for (const actor of this.actors.values()) this.forget(actor)
    for (const parts of this.shots.values()) { parts.core.destroy(); parts.halo.destroy() }
    for (const parts of this.zones.values()) { parts.fill.destroy(); parts.ring.destroy() }
    for (const prop of this.props.values()) prop.remove(false)
    this.actors.clear()
    this.shots.clear()
    this.zones.clear()
    this.props.clear()
    this.ground.destroy()
    this.layer.destroy()
  }
}
