import Phaser from 'phaser'
import AxieSprite from '../axie/AxieSprite.js'

/**
 * A small round portrait of each Axie class, for the minimap.
 *
 * Drawn from the real Axie: the class is posed once off-screen, rendered into
 * a texture inside a coloured disc, and thrown away. The map then shows the
 * actual creatures rather than coloured dots.
 */
export function makeMiniPortrait(scene, axieClass, build, size = 44) {
  const key = `mini-${axieClass}`
  if (scene.textures.exists(key)) return key

  const rt = scene.add.renderTexture(0, 0, size, size).setVisible(false)
  const sprite = new AxieSprite(scene, 0, 0, { build, axieClass })
  sprite.root.setVisible(false)
  sprite.update(0, 0)
  sprite.setFacing(1)

  // Fit the Axie inside the disc, sitting a touch low so the face reads.
  const scale = (size * 0.78) / Math.max(sprite.width, sprite.height)
  sprite.root.setScale(scale)
  sprite.root.setVisible(true)
  sprite.shadow.setVisible(false)
  sprite.glow.setVisible(false)
  rt.draw(sprite.root, size / 2, size * 0.62)
  sprite.destroy()

  rt.saveTexture(key)
  rt.setVisible(false)
  return key
}

/** Portraits for every class in `builds`, built once at boot. */
export function makeMiniPortraits(scene, builds) {
  for (const [axieClass, build] of Object.entries(builds)) {
    try {
      makeMiniPortrait(scene, axieClass, build)
    } catch (err) {
      console.warn(`mini portrait failed: ${axieClass}`, err)
    }
  }
}

/** A round chip with the portrait inside, used by the minimap. */
export function drawPortraitChip(g, x, y, r, color, { ring = 2, alpha = 1 } = {}) {
  g.fillStyle(0x16200f, 0.85 * alpha)
  g.fillCircle(x, y, r + ring)
  g.fillStyle(color, alpha)
  g.fillCircle(x, y, r)
  return { x, y, r }
}

export const PORTRAIT_KEY = c => `mini-${c}`

export function hasPortrait(scene, axieClass) {
  return scene.textures.exists(PORTRAIT_KEY(axieClass))
}

export function portraitFrameSize(scene, axieClass) {
  const tex = scene.textures.get(PORTRAIT_KEY(axieClass))
  return tex ? Math.max(tex.source[0].width, tex.source[0].height) : 44
}

export { Phaser }
