import Phaser from 'phaser'

/**
 * What a blow looks like when it lands.
 *
 * This file used to play the Origins Battle Kit's plates — twenty-two authored
 * effect animations, one per ability, anchored by their own capture rig. The kit
 * left with the licence, and for a while every punch landed with a sound, a
 * number and nothing to look at.
 *
 * What replaces it is four generated sheets rather than twenty-two authored
 * ones, so the mapping is coarse on purpose: a hit is a hit, rice is rice, and
 * the good news and the bad news have a colour each. The exported names and
 * signatures are unchanged, because a dozen call sites across the fighter, the
 * room view and the arena already speak this language and none of them should
 * have to care which pipeline drew the picture.
 */

export const FX_SHEETS = ['fx_impact', 'fx_rice', 'fx_heal', 'fx_power']

/** Which sheet answers which name the game already uses. */
const SHEET_FOR = {
  heal: 'fx_heal',
  shield: 'fx_power',
  power_gain: 'fx_power',
  power_awaken: 'fx_power',
  buff_apply: 'fx_heal',
  dmg_boost: 'fx_power',
  shield_boost: 'fx_power',
  stunned: 'fx_impact',
  poison_apply: 'fx_rice',
  debuff_apply: 'fx_rice',
}

/** A tint per name, so one burst can carry several meanings. */
const TINT_FOR = {
  poison_apply: 0x9ff0bb,
  debuff_apply: 0xd7b0ff,
  stunned: 0xffe08a,
  shield: 0x7ce8ff,
  shield_boost: 0x7ce8ff,
}

const sheetFor = id => SHEET_FOR[id] ?? (String(id).includes('rice') ? 'fx_rice' : 'fx_impact')

/** Registered once per scene, the same way the fighter's own animations are. */
export function registerEffects(scene) {
  for (const name of FX_SHEETS) {
    if (scene.anims.exists(name)) continue
    const meta = scene.cache.json.get(`sprites-${name}`)
    if (!meta) continue
    scene.anims.create({
      key: name,
      frames: scene.anims.generateFrameNumbers(name, { start: 0, end: meta.frames - 1 }),
      frameRate: meta.fps,
      repeat: 0,
    })
  }
}

/**
 * One burst, played once and thrown away.
 *
 * The generated clips hold their shape rather than shrinking away, so the fade
 * is done here: the sheet gives the shape and the tween gives the ending.
 */
function burst(scene, sheet, x, y, { size = 1, depth, tint, flip = false } = {}) {
  if (!scene?.anims?.exists(sheet)) return null
  const s = scene.add.sprite(x, y, sheet, 0)
  s.setDepth(depth ?? y + 8).setScale(size).setFlipX(flip)
  if (tint) s.setTint(tint)
  s.play(sheet)
  scene.tweens.add({
    targets: s, alpha: 0, duration: 180, delay: 120, ease: 'Quad.easeIn',
    onComplete: () => s.destroy(),
  })
  s.once('animationcomplete', () => { if (s.active) s.destroy() })
  return s
}

/** Nothing is pre-loaded per ability any more; the sheets come up with the boot. */
export async function loadSkillPlates(ids, scene, onOne) {
  ids?.forEach(() => onOne?.())
}

export async function loadIcons() {}

export function hasPlate(id) {
  return Boolean(SHEET_FOR[id]) || id === 'rice'
}

/**
 * An ability's effect, thrown out in front of the attacker.
 *
 * The kit's plates were anchored by a capture rig that knew where the attacker
 * and defender stood. There is no rig now, so the burst is simply placed along
 * the aim at the ability's own reach.
 */
export function playPlate(scene, fighter, spec) {
  if (!fighter?.sprite?.root?.active) return null
  const reach = Phaser.Math.Clamp(spec?.range ?? spec?.radius ?? spec?.projectileRange ?? 150, 90, 300)
  const aim = fighter.aim ?? 0
  const rice = spec?.kind === 'lob' || spec?.zoneDuration
  return burst(scene, rice ? 'fx_rice' : 'fx_impact',
    fighter.x + Math.cos(aim) * reach * 0.6,
    fighter.y - 10 + Math.sin(aim) * reach * 0.6,
    { size: rice ? 1.1 : 0.9, flip: Math.cos(aim) < 0 })
}

/** The basic's own swing effect, close in. */
export function playBasicPlate(scene, fighter, spec) {
  return playPlate(scene, fighter, spec)
}

/** Where a blow actually landed. */
export function playImpactPlate(scene, id, x, y, aim, { size = 118, whiff = false } = {}) {
  const s = burst(scene, sheetFor(id), x, y, {
    size: (size / 150) * (whiff ? 0.6 : 1),
    tint: TINT_FOR[id],
    flip: Math.cos(aim ?? 0) < 0,
  })
  if (s && whiff) s.setAlpha(0.5)
  return s
}

/** Something that happened to a fighter rather than between two. */
export function playStatusPlate(scene, fighter, id, { durationMs, size = 1.5 } = {}) {
  if (!fighter?.sprite?.root?.active) return null
  return burst(scene, sheetFor(id), fighter.x, fighter.y - 34, {
    size: size * 0.55,
    tint: TINT_FOR[id],
    depth: (fighter.y ?? 0) + 40,
  })
}

/** Kept so the boot can still name what it wants; they all resolve to a sheet. */
export const STATUS_PLATES = ['stunned', 'poison_apply', 'debuff_apply', 'power_gain', 'shield']
