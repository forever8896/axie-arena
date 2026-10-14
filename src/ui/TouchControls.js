import Phaser from 'phaser'

/**
 * Thumbs instead of a keyboard.
 *
 * Two floating sticks rather than fixed pads: on a phone you cannot see where
 * your thumb is, so the stick appears wherever it lands and measures from
 * there. A fixed pad means hunting for a circle you cannot feel.
 *
 * The left half moves. The right half aims, and lets go to swing — the same
 * shape Brawl Stars uses, because a separate fire button costs a thumb nobody
 * has spare. The three buttons sit above the right stick's usual home and are
 * tested before the stick, so pressing one never also drags an aim.
 *
 * It reports intent only. What the game does with it is the game's business,
 * which is what lets the same object drive the single-player scene and the
 * networked one.
 */

const STICK_RADIUS = 72
const DEAD_ZONE = 0.16
/** Below this the release is a tap, not an aimed throw. */
const AIM_MIN = 14

/**
 * How much of each edge the phone's own furniture covers.
 *
 * The page draws under the notch and the home indicator, so the bottom-right
 * corner — where these buttons want to live — is exactly where a thumb cannot
 * reach reliably. Read from CSS, which is the only thing that knows.
 */
export function safeArea() {
  const css = getComputedStyle(document.documentElement)
  const px = name => parseFloat(css.getPropertyValue(name)) || 0
  return {
    top: px('--safe-top'),
    right: px('--safe-right'),
    bottom: px('--safe-bottom'),
    left: px('--safe-left'),
  }
}

/** Touch is offered when the device has it, or when a touch actually happens. */
export function touchLikely(scene) {
  const d = scene.sys.game.device.input
  return Boolean(d.touch) || navigator.maxTouchPoints > 0
}

export default class TouchControls {
  constructor(scene, { onSwing, onSpecial, onDash, onParry, onGuard } = {}) {
    this.scene = scene
    this.on = { onSwing, onSpecial, onDash, onParry, onGuard }

    this.move = new Phaser.Math.Vector2(0, 0)
    this.aim = null
    this.guarding = false
    this.enabled = false

    // Three fingers at once: move, aim, and a button.
    scene.input.addPointer(2)

    this.g = scene.add.graphics().setScrollFactor(0).setDepth(9500)
    this.labels = []
    this.sticks = { move: null, aim: null }
    this.buttons = []
    this.buildButtons()

    scene.input.on('pointerdown', this.down, this)
    scene.input.on('pointermove', this.drag, this)
    scene.input.on('pointerup', this.up, this)
    scene.input.on('pointerupoutside', this.up, this)
    scene.events.once('shutdown', () => this.destroy())
  }

  /** Shown only once a touch has actually happened, so a mouse never sees it. */
  show() {
    if (this.enabled) return
    this.enabled = true
    this.labels.forEach(l => l.setVisible(true))
  }

  buildButtons() {
    const defs = [
      { id: 'special', text: 'RICE', tint: 0x9ff0bb },
      { id: 'dash', text: 'DASH', tint: 0x7ce8ff },
      { id: 'parry', text: 'GUARD', tint: 0xffd964 },
    ]
    for (const def of defs) {
      const label = this.scene.add.text(0, 0, def.text, {
        fontFamily: 'ui-monospace, monospace', fontSize: '12px', color: '#f2f7e4',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(9501).setVisible(false)
      this.labels.push(label)
      this.buttons.push({ ...def, label, x: 0, y: 0, r: 38, held: false })
    }
    this.layout()
  }

  layout() {
    const { width, height } = this.scene.scale
    // Sized and placed off the screen rather than fixed: a phone in landscape
    // is 390px tall, and buttons measured down from a desktop's height ended up
    // under the minimap.
    const r = Phaser.Math.Clamp(Math.min(width, height) * 0.1, 28, 40)
    const safe = safeArea()
    const x = width - (r + 24) - safe.right
    const y = height - (r + 26) - safe.bottom
    // An arc under the right thumb: the one held most often is nearest.
    this.buttons[2].x = x; this.buttons[2].y = y                           // guard
    this.buttons[0].x = x - r * 2.0; this.buttons[0].y = y - r * 0.85      // rice
    this.buttons[1].x = x; this.buttons[1].y = y - r * 2.2                 // dash
    this.buttons.forEach(b => {
      b.r = r
      b.label.setPosition(b.x, b.y).setFontSize(Math.round(r * 0.32))
    })
  }

  buttonAt(x, y) {
    return this.buttons.find(b => Phaser.Math.Distance.Between(x, y, b.x, b.y) <= b.r + 6)
  }

  down(pointer) {
    if (!pointer.wasTouch) return
    this.show()
    const b = this.buttonAt(pointer.x, pointer.y)
    if (b) {
      b.held = pointer.id
      if (b.id === 'special') this.on.onSpecial?.()
      else if (b.id === 'dash') this.on.onDash?.()
      else if (b.id === 'parry') {
        this.on.onParry?.()
        this.guarding = true
      }
      return
    }
    const side = pointer.x < this.scene.scale.width / 2 ? 'move' : 'aim'
    if (this.sticks[side]) return
    this.sticks[side] = { id: pointer.id, ox: pointer.x, oy: pointer.y, x: pointer.x, y: pointer.y }
  }

  drag(pointer) {
    for (const side of ['move', 'aim']) {
      const s = this.sticks[side]
      if (s && s.id === pointer.id) { s.x = pointer.x; s.y = pointer.y }
    }
  }

  up(pointer) {
    const b = this.buttons.find(x => x.held === pointer.id)
    if (b) {
      b.held = false
      if (b.id === 'parry') this.guarding = false
      return
    }
    const aim = this.sticks.aim
    if (aim && aim.id === pointer.id) {
      const dx = aim.x - aim.ox
      const dy = aim.y - aim.oy
      // A drag is an aimed swing; a tap swings wherever he already faces.
      if (Math.hypot(dx, dy) >= AIM_MIN) this.aim = Math.atan2(dy, dx)
      this.on.onSwing?.()
      this.sticks.aim = null
      return
    }
    if (this.sticks.move && this.sticks.move.id === pointer.id) this.sticks.move = null
  }

  /** Called every frame: updates intent and draws the sticks. */
  update() {
    const s = this.sticks.move
    if (s) {
      const dx = s.x - s.ox
      const dy = s.y - s.oy
      const len = Math.hypot(dx, dy)
      const push = Math.min(1, len / STICK_RADIUS)
      if (push > DEAD_ZONE) this.move.set((dx / len) * push, (dy / len) * push)
      else this.move.set(0, 0)
    } else {
      this.move.set(0, 0)
    }

    const a = this.sticks.aim
    if (a) {
      const dx = a.x - a.ox
      const dy = a.y - a.oy
      if (Math.hypot(dx, dy) >= AIM_MIN) this.aim = Math.atan2(dy, dx)
    }
    this.draw()
  }

  draw() {
    const g = this.g
    g.clear()
    if (!this.enabled) return

    for (const b of this.buttons) {
      g.fillStyle(0x16200f, b.held ? 0.85 : 0.5).fillCircle(b.x, b.y, b.r)
      g.lineStyle(2, b.tint, b.held ? 1 : 0.7).strokeCircle(b.x, b.y, b.r)
    }
    for (const side of ['move', 'aim']) {
      const s = this.sticks[side]
      if (!s) continue
      const tint = side === 'move' ? 0xf2f7e4 : 0xffd964
      g.lineStyle(2, tint, 0.45).strokeCircle(s.ox, s.oy, STICK_RADIUS)
      const dx = s.x - s.ox
      const dy = s.y - s.oy
      const len = Math.min(STICK_RADIUS, Math.hypot(dx, dy)) || 0
      const ang = Math.atan2(dy, dx)
      g.fillStyle(tint, 0.6)
      g.fillCircle(s.ox + Math.cos(ang) * len, s.oy + Math.sin(ang) * len, 26)
    }
  }

  destroy() {
    this.scene.input.off('pointerdown', this.down, this)
    this.scene.input.off('pointermove', this.drag, this)
    this.scene.input.off('pointerup', this.up, this)
    this.scene.input.off('pointerupoutside', this.up, this)
    this.g.destroy()
    this.labels.forEach(l => l.destroy())
  }
}
