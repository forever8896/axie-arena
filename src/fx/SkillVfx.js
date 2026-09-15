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
      // A trimmed, faster cut around the plate's own peak frame, for basics
      // that fire far more often than a full 1s plate could play.
      if (!scene.anims.exists(`${key}-quick`)) {
        const peak = clip.peakFrame ?? Math.floor(clip.frames * 0.4)
        scene.anims.create({
          key: `${key}-quick`,
          frames: scene.anims.generateFrameNumbers(key, {
            start: Math.max(0, peak - 4),
            end: Math.min(clip.frames - 1, peak + 8),
          }),
          frameRate: clip.fps * 1.6,
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

/** Basic attack plate: the quick cut, sized to the basic's reach. */
export function playBasicPlate(scene, fighter, spec) {
  const clip = plates[spec.vfx]
  if (!clip) return null
  // Sized well past the reach: at 1.15x the plates read as a small flash.
  const reach = Phaser.Math.Clamp(spec.range * 1.7, 140, 260)
  return placeOnAttacker(scene, fighter, spec.vfx, clip, reach, `vfx-${spec.vfx}-quick`)
}

/**
 * Status plate drawn over a fighter, riding along with it. Loops until
 * `durationMs` when given, otherwise plays once.
 */
export function playStatusPlate(scene, fighter, id, { durationMs, size = 1.5 } = {}) {
  const clip = plates[id]
  if (!clip || !fighter?.sprite?.root?.active) return null

  // Anchor the effect's own target point onto the fighter's body.
  const ax = (clip.anchor?.x ?? clip.crop.w / 2) / clip.atlas.frameW
  const ay = (clip.anchor?.y ?? clip.crop.h / 2) / clip.atlas.frameH
  const scale = (fighter.sprite.width * size) / clip.crop.w
  const key = `vfx-${id}`

  const sprite = scene.add.sprite(0, -fighter.sprite.height * 0.45, key)
    .setOrigin(ax, ay)
    .setScale(scale)
    .setBlendMode(Phaser.BlendModes.ADD)
  fighter.sprite.root.add(sprite)

  if (durationMs) {
    sprite.play({ key, repeat: -1 })
    scene.time.delayedCall(durationMs, () => sprite.active && sprite.destroy())
  } else {
    sprite.play(key)
    sprite.once('animationcomplete', () => sprite.destroy())
  }
  return sprite
}

export const STATUS_PLATES = ['stunned', 'poison_apply', 'debuff_apply', 'power_gain']

function placeOnAttacker(scene, fighter, id, clip, reach, animKey) {
  const span = Math.abs(clip.attackerInCrop.x - clip.anchor.x) || clip.crop.w * 0.6
  const ax = clip.attackerInCrop.x / clip.atlas.frameW
  const ay = clip.attackerInCrop.y / clip.atlas.frameH
  const flip = fighter.sprite.facing > 0
  const sprite = scene.add.sprite(fighter.x, fighter.y - 10, `vfx-${id}`)
    .setOrigin(flip ? 1 - ax : ax, ay)
    .setFlipX(flip)
    .setScale(reach / span)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(fighter.y + 6)
  sprite.play(animKey)
  sprite.once('animationcomplete', () => sprite.destroy())
  return sprite
}
