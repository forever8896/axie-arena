import Phaser from 'phaser'
/**
 * A small round portrait of Ronke, for the minimap.
 *
 * It used to pose a real Ronke off-screen and render it into a texture, which
 * was the only way to show the actual creature when the creature was assembled
 * from parts at runtime. There is one Ronke now and he already exists as a
 * sheet, so the portrait is simply his first idle frame inside a coloured disc.
 */
export function makeMiniPortrait(scene, cls, build, size = 44) {
  const key = `mini-${cls}`
  if (scene.textures.exists(key)) return key
  if (!scene.textures.exists('ronke-idle')) return null

  const rt = scene.add.renderTexture(0, 0, size, size).setVisible(false)
  const face = scene.add.image(0, 0, 'ronke-idle', 0).setVisible(false)
  // Fit him inside the disc, sitting a touch low so the face reads.
  const scale = (size * 0.78) / Math.max(face.width, face.height)
  face.setScale(scale).setVisible(true)
  rt.draw(face, size / 2, size * 0.58)
  face.destroy()

  rt.saveTexture(key)
  rt.setVisible(false)
  return key
}

/** Portraits for every class in `builds`, built once at boot. */
export function makeMiniPortraits(scene, builds) {
  for (const [cls, build] of Object.entries(builds)) {
    try {
      makeMiniPortrait(scene, cls, build)
    } catch (err) {
      console.warn(`mini portrait failed: ${cls}`, err)
    }
  }
}

/** A round chip with the portrait inside, used by the minimap. */
export function drawPortraitChip(g, x, y, r, color, { ring = 2, alpha = 1 } = {}) {
  g.fillStyle(0x101936, 0.85 * alpha)
  g.fillCircle(x, y, r + ring)
  g.fillStyle(color, alpha)
  g.fillCircle(x, y, r)
  return { x, y, r }
}

export const PORTRAIT_KEY = c => `mini-${c}`

export function hasPortrait(scene, cls) {
  return scene.textures.exists(PORTRAIT_KEY(cls))
}

export function portraitFrameSize(scene, cls) {
  const tex = scene.textures.get(PORTRAIT_KEY(cls))
  return tex ? Math.max(tex.source[0].width, tex.source[0].height) : 44
}

export { Phaser }
