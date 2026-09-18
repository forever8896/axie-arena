/**
 * What is drawn above an Axie: health, the shield, and the row of icons for
 * dash, parry, special and any power-up, each filling as it comes back.
 *
 * It used to live in a panel in the top-left corner, which is nowhere near
 * where anyone is looking during a fight.
 *
 * Extracted from Fighter so a fighter the client owns and a fighter the server
 * owns are drawn by the same code. It takes a plain description of a fighter
 * rather than a Fighter, so either side can describe itself: the local game
 * from its own object, the networked one from a snapshot.
 *
 * `status` is:
 *   { x, y, isPlayer, alive, hp, maxHp, shield, shielded, charge, specialReady,
 *     dash: {fill, ready}, parry: {fill, ready}, colors,
 *     buffs: [{ icon, color, fill }] }
 */
import Phaser from 'phaser'

export const HUD_DEPTH = 9500

const clamp01 = v => Phaser.Math.Clamp(v, 0, 1)

/** Draws into `g`, reusing images from `icons` between frames. */
export function drawFighterStatus(scene, g, icons, status, now) {
  g.clear()
  if (!status?.alive) {
    for (const icon of Object.values(icons)) icon.setVisible(false)
    return
  }

  const w = status.isPlayer ? 76 : 56
  const h = status.isPlayer ? 9 : 7
  const x = status.x - w / 2
  // Stacked clear of the name plate a room hangs above each hunter.
  const y = status.y - (status.isPlayer ? 88 : 96)
  const frac = clamp01(status.hp / status.maxHp)

  g.fillStyle(0x16200f, 0.85).fillRoundedRect(x - 3, y - 3, w + 6, h + 6, 5)
  g.fillStyle(0x3a4a2a, 1).fillRoundedRect(x, y, w, h, 3)
  const color = status.isPlayer ? 0x7ce85a : frac > 0.35 ? 0xffd964 : 0xff6b6b
  g.fillStyle(color, 1).fillRoundedRect(x, y, Math.max(3, w * frac), h, 3)
  // A lighter top edge, so the bar reads as a bar and not a flat block.
  g.fillStyle(0xffffff, 0.25).fillRoundedRect(x + 1, y + 1, Math.max(2, w * frac - 2), Math.max(1, h * 0.35), 2)

  // The bar a fight is played against: everything you can spend comes from it,
  // and an empty one is how a fight is lost. Under the health, so the two read
  // as one block.
  if (status.stamina != null && status.stamina < 0.999) {
    const sw = w
    const sy = y + h + 3
    g.fillStyle(0x16200f, 0.85).fillRoundedRect(x - 3, sy - 2, sw + 6, 7, 3)
    g.fillStyle(0x2c3a22, 1).fillRoundedRect(x, sy, sw, 4, 2)
    g.fillStyle(status.stamina < 0.2 ? 0xff8098 : 0xffd964, 1)
      .fillRoundedRect(x, sy, Math.max(2, sw * clamp01(status.stamina)), 4, 2)
  }

  if (status.shield > 0) {
    const sf = Math.min(1, status.shield / status.maxHp)
    g.fillStyle(0x16200f, 0.85).fillRoundedRect(x - 3, y - 9, w + 6, 6, 3)
    g.fillStyle(0x7ce8ff, 1).fillRoundedRect(x, y - 8, w * sf, 4, 2)
  }
  g.setDepth(HUD_DEPTH)

  if (status.isPlayer) drawReadyIcons(scene, g, icons, status, now, y - 24)
  else if (status.specialReady) {
    // A rival with its special up is worth knowing about.
    g.fillStyle(0x16200f, 0.85).fillCircle(x + w + 9, y + h / 2, 7)
    g.fillStyle(0xffd964, 0.6 + Math.sin(now / 160) * 0.35).fillCircle(x + w + 9, y + h / 2, 5)
  }
}

function drawReadyIcons(scene, g, icons, status, now, y) {
  const slots = [
    { key: 'buff_feather', ready: status.dash.ready, fill: status.dash.fill, tint: 0x7ce8ff },
    { key: 'power_advance_shielding', ready: status.parry.ready, fill: status.parry.fill, tint: 0xffffff },
    { key: 'buff_rage', ready: status.specialReady, fill: clamp01(status.charge), tint: status.colors.body },
    ...status.buffs.map(b => ({ key: b.icon, ready: true, fill: b.fill, tint: b.color, timed: true })),
  ]

  const gap = 30
  const startX = status.x - ((slots.length - 1) * gap) / 2
  const seen = new Set()
  slots.forEach((slot, i) => {
    const x = startX + i * gap
    const bob = slot.ready && !slot.timed ? Math.sin(now / 220 + i) * 1.5 : 0
    const iy = y + bob
    seen.add(slot.key)

    g.fillStyle(0x16200f, slot.ready ? 0.9 : 0.75).fillCircle(x, iy, 14)
    // The sweep: how much of it has come back.
    if (slot.fill < 1 || slot.timed) {
      g.lineStyle(3, slot.timed ? slot.tint : 0x9aa88a, 0.9)
      g.beginPath()
      g.arc(x, iy, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(slot.fill))
      g.strokePath()
    } else {
      g.lineStyle(3, slot.tint, 0.55 + Math.sin(now / 180 + i) * 0.35)
      g.strokeCircle(x, iy, 12)
    }

    let icon = icons[slot.key]
    const key = `icon-${slot.key}`
    if (!icon) {
      if (!scene.textures.exists(key)) return
      icon = icons[slot.key] = scene.add.image(0, 0, key)
      icon.setScale(19 / Math.max(icon.frame.width, icon.frame.height))
    }
    icon.setVisible(true).setPosition(x, iy).setDepth(HUD_DEPTH + 1)
      .setAlpha(slot.ready ? 1 : 0.45)
      .setTint(slot.ready ? 0xffffff : 0x8fa07c)
  })

  for (const [key, icon] of Object.entries(icons)) {
    if (!seen.has(key)) icon.setVisible(false)
  }
}
