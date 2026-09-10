import Phaser from 'phaser'

/**
 * Origins skill effects.
 *
 * Each plate is an additive sprite sheet recorded from the Origins Unity
 * prefabs, with a clip.json carrying Origins' own frame timing and anchors. No
 * Spine runtime is involved — these are plain PNG frames.
 *
 * Vendored from the kit revision licensed by Official Rules section 5. See
 * public/vfx/LICENSE.md and THIRD_PARTY_NOTICES.md.
 */

const BASE = `${import.meta.env.BASE_URL}vfx/`
const plates = {}

export async function loadSkillPlates(ids, scene, onOne) {
  await Promise.all(ids.map(async id => {
    try {
      const clip = await fetch(`${BASE}${id}/clip.json`).then(r => r.json())
      const img = await loadImage(`${BASE}${id}/atlas.png`)
      const key = `vfx-${id}`

      if (!scene.textures.exists(key)) {
        scene.textures.addSpriteSheet(key, img, {
          frameWidth: clip.atlas.frameW,
          frameHeight: clip.atlas.frameH,
        })
      }
      if (!scene.anims.exists(key)) {
        scene.anims.create({
          key,
          frames: scene.anims.generateFrameNumbers(key, { start: 0, end: clip.frames - 1 }),
          frameRate: clip.fps,
          hideOnComplete: true,
        })
      }
      plates[id] = clip
    } catch (err) {
      console.warn(`skill plate failed: ${id}`, err)
    }
    onOne?.()
  }))
}

export function hasPlate(id) {
  return Boolean(plates[id])
}

/**
 * Plays a plate anchored to the attacker.
 *
 * The capture rig places the attacker off to the right and the defender to the
 * left, a fixed distance apart in crop space. Scaling that distance to the
 * ability's own reach makes the effect land where the damage does.
 */
export function playPlate(scene, fighter, spec) {
  const clip = plates[spec.vfx]
  if (!clip) return null

  const reach = Phaser.Math.Clamp(
    spec.range ?? spec.projectileRange ?? spec.maxRange ?? spec.radius ?? 170,
    130, 340,
  )
  const span = Math.abs(clip.attackerInCrop.x - clip.anchor.x) || 393
  const scale = reach / span

  const key = `vfx-${spec.vfx}`
  const ax = clip.attackerInCrop.x / clip.atlas.frameW
  const ay = clip.attackerInCrop.y / clip.atlas.frameH
  const flip = fighter.sprite.facing > 0

  const sprite = scene.add.sprite(fighter.x, fighter.y - 10, key)
    // Flipping mirrors the artwork but not the origin, so mirror the origin too.
    .setOrigin(flip ? 1 - ax : ax, ay)
    .setFlipX(flip)
    .setScale(scale)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(fighter.y + 6)

  sprite.play(key)
  sprite.once('animationcomplete', () => sprite.destroy())
  return sprite
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`could not load ${src}`))
    img.src = src
  })
}
