import Phaser from 'phaser'
import { WORLD } from '../arena/Arena.js'
import { FIELD } from '../axie/palette.js'
import { PORTRAIT_KEY } from '../fx/MiniPortrait.js'
import WildsHud from '../wilds/WildsHud.js'
import TutorialHud from '../tutorial/TutorialHud.js'

const MINIMAP = { size: 186, pad: 22 }

const MONO = 'ui-monospace, monospace'
const hex = v => `#${v.toString(16).padStart(6, '0')}`

/**
 * HUD lives in its own scene so camera zoom, shake and post-processing on the
 * game camera never touch it. Reads game state; never writes it.
 */
export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' })
  }

  create(data) {
    // The room being drawn: run by this page (GameScene) or by a server
    // (NetScene). Both present the same surface to read, which is the point.
    this.game_ = this.scene.get(data?.host ?? 'GameScene')

    // Scene instances are reused across matches. Anything built lazily in
    // update() must be forgotten here, or a restarted match reuses objects
    // destroyed with the previous one.
    this.fieldText = null
    this.announceText = null
    this.mmRoot = null
    this.mmDots = null

    this.hintPlate = this.add.graphics().setDepth(-1)

    this.status = this.add.text(this.scale.width - 34, MINIMAP.size + 34, '', {
      fontFamily: MONO, fontSize: '15px', color: '#f4f8e8',
    }).setOrigin(1, 0).setDepth(500)

    this.statusSub = this.add.text(this.scale.width - 34, MINIMAP.size + 56, 'RIVALS REMAIN', {
      fontFamily: MONO, fontSize: '11px', color: '#b9c4a6',
    }).setOrigin(1, 0).setDepth(500)

    this.hint = this.add.text(34, this.scale.height - 40,
      'WASD  MOVE     MOUSE  AIM     LEFT  ATTACK     RIGHT / E  SPECIAL     Q  PARRY     SPACE  DASH     M  MUTE', {
        fontFamily: MONO, fontSize: '12px', color: '#b9c4a6',
      })

    this.buildMinimap()

    this.wildsHud = this.game_.wilds ? new WildsHud(this) : null
    this.tutorialHud = this.game_.tutorial ? new TutorialHud(this) : null

    this.layoutHintPlate()
    this.scale.on('resize', this.layout, this)
  }

  layoutHintPlate() {
    if (!this.hintPlate || !this.hint) return
    this.hintPlate.clear()
    this.hintPlate.fillStyle(0x16200f, 0.6)
    this.hintPlate.fillRoundedRect(18, this.hint.y - 10, this.hint.width + 32, 32, 10)
  }

  /**
   * Top-right map, drawn from the arena itself: the baked ground, the real
   * bushes and the real walls, so what you glance at matches what you are
   * standing in. Everything that moves is drawn over it each frame — Axies as
   * little portraits of themselves, power-ups as their own icons.
   */
  buildMinimap() {
    const game = this.game_
    if (!game?.arena?.ground) return

    this.mmScale = MINIMAP.size / Math.max(WORLD.width, WORLD.height)
    this.mmW = WORLD.width * this.mmScale
    this.mmH = WORLD.height * this.mmScale
    this.mmRoot = this.add.container(0, 0).setDepth(500)

    const frame = this.add.graphics()
    frame.fillStyle(0x16200f, 0.92)
    frame.fillRoundedRect(-5, -5, this.mmW + 10, this.mmH + 10, 12)

    // One snapshot of the ground, plus the canopies and blocks over it.
    const terrain = this.add.renderTexture(0, 0, this.mmW, this.mmH).setOrigin(0)
    // The field's grass is a tiled sprite, not part of the baked ground, so
    // the map starts with the same tile before the ground layer goes over it.
    if (this.textures.exists('field-grass')) {
      const tile = this.make.tileSprite({ x: 0, y: 0, width: this.mmW, height: this.mmH, key: 'field-grass', add: false })
        .setOrigin(0).setTileScale(this.mmScale)
      terrain.draw(tile)
      tile.destroy()
    } else {
      terrain.fill(FIELD.grassBase)
    }

    // Draw the arena's own ground texture in, shrunk. Saving it under a key
    // and removing the old one broke the render texture it belongs to.
    const ground = game.arena.ground
    const scale = { x: ground.scaleX, y: ground.scaleY }
    ground.setScale(this.mmScale)
    terrain.draw(ground, 0, 0)
    ground.setScale(scale.x, scale.y)
    for (const c of game.arena.canopies ?? []) {
      const img = this.make.image({ key: c.image.texture.key, add: false })
      img.setScale(this.mmScale).setPosition(c.bush.x * this.mmScale, c.bush.y * this.mmScale)
      terrain.draw(img)
      img.destroy()
    }
    const blocks = this.make.graphics({ add: false })
    for (const w of game.arena.walls) {
      blocks.fillStyle(0x3a2a18, 0.9)
      blocks.fillRoundedRect(w.left * this.mmScale - 1, w.top * this.mmScale - 1, w.w * this.mmScale + 2, w.h * this.mmScale + 2, 2)
      blocks.fillStyle(FIELD.stoneFace, 1)
      blocks.fillRoundedRect(w.left * this.mmScale, w.top * this.mmScale, w.w * this.mmScale, w.h * this.mmScale, 2)
      blocks.fillStyle(FIELD.stoneTop, 0.8)
      blocks.fillRoundedRect(w.left * this.mmScale, w.top * this.mmScale, w.w * this.mmScale, Math.max(1, w.h * this.mmScale * 0.35), 2)
    }
    terrain.draw(blocks)
    blocks.destroy()

    // Rounded corners, and a rim so it sits on the field rather than in it.
    const mask = this.make.graphics({ add: false })
    mask.fillStyle(0xffffff).fillRoundedRect(0, 0, this.mmW, this.mmH, 9)
    terrain.setMask(mask.createGeometryMask())
    this.mmMaskShape = mask

    const rim = this.add.graphics()
    rim.lineStyle(2, 0xf0e4bb, 0.9).strokeRoundedRect(0, 0, this.mmW, this.mmH, 9)

    this.mmViewport = this.add.graphics()
    this.mmDots = this.add.graphics()
    this.mmIcons = new Map()
    this.mmRoot.add([frame, terrain, this.mmViewport, this.mmDots, rim])
    this.layoutMinimap()
  }

  layoutMinimap() {
    if (!this.mmRoot) return
    const x = this.scale.width - this.mmW - MINIMAP.pad
    const y = MINIMAP.pad
    this.mmRoot.setPosition(x, y)
    // A geometry mask works in screen space, so it follows the container.
    this.mmMaskShape?.setPosition(x, y)
  }

  /** An image inside the map, reused between frames. */
  mmIcon(id, key, size) {
    let img = this.mmIcons.get(id)
    if (!img) {
      if (!this.textures.exists(key)) return null
      img = this.add.image(0, 0, key)
      this.mmRoot.add(img)
      this.mmIcons.set(id, img)
    }
    if (img.texture.key !== key) img.setTexture(key)
    img.setScale(size / Math.max(img.frame.width, img.frame.height)).setVisible(true)
    return img
  }

  drawMinimap() {
    const game = this.game_
    if (!this.mmDots || !game?.player) return
    const s = this.mmScale
    const cam = game.cameras.main
    const now = game.time.now
    const pulse = 0.6 + Math.sin(now / 180) * 0.4
    const unused = new Set(this.mmIcons.keys())
    const place = (id, key, size, x, y, opts = {}) => {
      const img = this.mmIcon(id, key, size)
      if (!img) return null
      unused.delete(id)
      img.setPosition(x * s, y * s).setAlpha(opts.alpha ?? 1).setDepth(opts.depth ?? 1)
      return img
    }

    this.mmViewport.clear()
    this.mmViewport.lineStyle(1, 0xfdf6e3, 0.5)
    this.mmViewport.strokeRect(cam.worldView.x * s, cam.worldView.y * s, cam.worldView.width * s, cam.worldView.height * s)

    this.mmDots.clear()

    if (game.field?.active) {
      this.mmDots.lineStyle(1.5, 0xd9c2ff, 0.9)
      this.mmDots.strokeCircle(game.field.cx * s, game.field.cy * s, game.field.radius * s)
    }

    for (const w of game.moonwells?.wells ?? []) {
      if (w.dead) continue
      this.mmDots.fillStyle(0x9dffd8, w.blooming ? 0.3 * pulse : 0.5)
      this.mmDots.fillCircle(w.x * s, w.y * s, Math.max(5, w.radius * s))
      place(w, 'icon-buff_leaf', 13, w.x, w.y, { alpha: w.blooming ? pulse : 1 })
    }
    for (const o of game.powerUps?.orbs ?? []) {
      if (o.dead) continue
      this.mmDots.fillStyle(o.def.color, o.live ? 0.55 : 0.25 * pulse)
      this.mmDots.fillCircle(o.x * s, o.y * s, 8)
      place(o, `icon-${o.def.icon}`, 13, o.x, o.y, { alpha: o.live ? 1 : pulse })
    }
    for (const c of game.wilds?.caches ?? []) {
      place(c, 'icon-power_energy_master', 12, c.x, c.y, { alpha: pulse })
    }
    for (const gate of game.wilds?.gates ?? []) {
      if (!gate.open) continue
      this.mmDots.fillStyle(gate.closing ? 0xff8098 : 0xc9b8ff, gate.closing ? pulse : 0.8)
      this.mmDots.fillCircle(gate.x * s, gate.y * s, 9)
      place(gate, 'brand-mark', 14, gate.x, gate.y, { alpha: gate.closing ? pulse : 1 })
    }
    if (game.wilds?.hotspot) {
      const h = game.wilds.hotspot
      this.mmDots.lineStyle(2, 0xff8098, pulse)
      this.mmDots.strokeCircle(h.x * s, h.y * s, h.radius * s)
    }
    if (game.tutorial?.goal) {
      const goal = game.tutorial.goal
      this.mmDots.fillStyle(0xffd964, pulse)
      this.mmDots.fillCircle(goal.x * s, goal.y * s, 5)
    }

    // Everyone on the field, as themselves.
    for (const f of game.fighters ?? []) {
      if (!f.alive || (f.hidden && !f.isPlayer)) continue
      this.mmDots.fillStyle(0x16200f, 0.85)
      this.mmDots.fillCircle(f.x * s, f.y * s, f.isPlayer ? 11 : 9.5)
      this.mmDots.fillStyle(f.isPlayer ? 0xfff8d8 : f.colors.body, f.isPlayer ? 1 : 0.9)
      this.mmDots.fillCircle(f.x * s, f.y * s, f.isPlayer ? 9.5 : 8)
      const portrait = place(f, PORTRAIT_KEY(f.axieClass), f.isPlayer ? 20 : 17, f.x, f.y, { depth: f.isPlayer ? 3 : 2 })
      if (!portrait) {
        this.mmDots.fillStyle(f.colors.rim, 1)
        this.mmDots.fillCircle(f.x * s, f.y * s, 4)
      }
      if (f.isPlayer) {
        this.mmDots.lineStyle(2, 0xffd964, 0.9)
        this.mmDots.strokeCircle(f.x * s, f.y * s, 11 + Math.sin(now / 300) * 1.2)
      }
    }

    for (const id of unused) this.mmIcons.get(id).setVisible(false)
  }

  /** Centre-screen callouts: a gate opening, a Blood Moon, a rival powering up. */
  drawAnnouncement() {
    const a = this.game_.announcement
    const now = this.game_.time.now
    if (!this.announceText) {
      this.announceText = this.add.text(this.scale.width / 2, 60, '', {
        fontFamily: 'Rowdies, ui-sans-serif, system-ui, sans-serif', fontSize: '16px', color: '#ffffff',
        stroke: '#16200f', strokeThickness: 5,
      }).setOrigin(0.5).setDepth(600)
    }
    if (!a || now > a.until) {
      this.announceText.setVisible(false)
      return
    }
    const fade = Math.min(1, (a.until - now) / 400)
    this.announceText.setVisible(true).setX(this.scale.width / 2).setText(a.text).setColor(a.color).setAlpha(fade)
  }

  layout(size) {
    this.status?.setPosition(size.width - 34, MINIMAP.size + 34)
    this.statusSub?.setPosition(size.width - 34, MINIMAP.size + 56)
    this.hint?.setY(size.height - 40)
    this.layoutHintPlate()
    this.layoutMinimap()
  }

  update() {
    const player = this.game_?.player
    if (!player) return

    if (!this.mmRoot) this.buildMinimap()
    this.drawMinimap()

    const field = this.game_.field
    if (field) {
      if (!this.fieldText) {
        this.fieldText = this.add.text(this.scale.width / 2, 30, '', {
          fontFamily: 'Rowdies, ui-sans-serif, system-ui, sans-serif',
          fontSize: '18px', color: '#f4f8e8',
        }).setOrigin(0.5).setDepth(600)
        this.fieldText.setShadow(0, 2, 'rgba(22,32,15,0.8)', 4, false, true)
      }
      this.fieldText.setX(this.scale.width / 2)
      if (!field.active) {
        this.fieldText.setText(`THE WILDS CLOSE IN ${field.secondsUntil}`).setColor('#f4f8e8')
      } else if (field.progress < 1) {
        this.fieldText.setText('THE WILDS ARE CLOSING').setColor('#d9c2ff')
      } else {
        this.fieldText.setText('')
      }
      if (field.outside(player.x, player.y) && field.active) {
        this.fieldText.setText('GET BACK INSIDE').setColor('#ff8098')
      }
    }

    this.drawAnnouncement()
    this.wildsHud?.update(player)
    this.tutorialHud?.update(player)

    if (!this.wildsHud && !this.tutorialHud) {
      const alive = this.game_.bots.filter(b => b.alive).length
      this.status.setText(String(alive).padStart(2, '0'))
    }
  }
}
