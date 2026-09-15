import {
  initAxieMixer,
  getAxieSpineFromCombo,
  getAxieColorPartShift,
  getVariantAttachmentPath,
  genesStuff,
} from '@axieinfinity/mixer'
import AxieRig from './AxieRig.js'

// Loaded as URLs rather than imported as modules: several MB of JSON has no
// business sitting inside the JS bundle.
import genesUrl from '@axieinfinity/mixer/dist/data/axie-2d-v3-stuff-genes.json?url'
import samplesUrl from '@axieinfinity/mixer/dist/data/axie-2d-v3-stuff-samples.json?url'
import variantsUrl from '@axieinfinity/mixer/dist/data/axie-2d-v3-stuff-variant.json?url'
// The full set, not the lite one: the lite file carries 17 clips and none of
// the class attacks (horn-gore, tail-smash, mouth-bite, tail-multi-slap,
// cast-high, cast-multi, tail-roll) that make each class move differently.
import animationsUrl from '@axieinfinity/mixer/dist/data/axie-2d-v3-stuff-animations.json?url'

export const AXIE_CDN = 'https://axiecdn.axieinfinity.com/mixer-stuffs/v6/'

/** Skeleton units to screen pixels. Tuned against the arena camera. */
export const AXIE_SCALE = 0.125

let ready = false

export async function initMixer() {
  if (ready) return
  const [genes, samples, variants, animations] = await Promise.all(
    [genesUrl, samplesUrl, variantsUrl, animationsUrl].map(u => fetch(u).then(r => r.json())),
  )
  initAxieMixer(genes, samples, variants, animations)
  ready = true
}

/**
 * Builds one Axie of a class: its skeleton with all 46 authored clips, and the
 * CDN texture for every attachment it can show — including the alternate faces
 * (angry, shut, bite, open…) that attack clips swap in.
 *
 * Posed by AxieRig, our own reader of the animation data. No Spine runtime
 * ships; see AxieRig for why that matters under Official Rules section 5.
 */
export function buildAxie(axieClass, partSet = '02') {
  if (!ready) throw new Error('initMixer() must finish before buildAxie()')

  const part = `${axieClass}-${partSet}`
  const variantIndex = genesStuff.axieSkinColors.findIndex(c => c.key === part)
  if (variantIndex < 0) throw new Error(`no colour variant for ${part}`)

  const combo = new Map([
    ['body', 'body-normal'],
    ['body-class', axieClass],
    ['eyes', part], ['ears', part], ['ear', part],
    ['horn', part], ['mouth', part], ['back', part], ['tail', part],
  ])

  const res = getAxieSpineFromCombo(combo, variantIndex, false)
  if (res.error) throw new Error(`mixer: ${res.error}`)

  const skeleton = res.skeletonDataAsset
  const shift = getAxieColorPartShift(res.variant)

  // slot/attachment -> CDN path, for every attachment rather than only the
  // ones visible at rest.
  const textures = {}
  const skin = skeleton.skins[0].attachments
  for (const slot in skin) {
    for (const name in skin[slot]) {
      const att = skin[slot][name]
      if (!att.path || !att.width || slot === 'shadow' || slot === 'ball') continue
      textures[`${slot}/${name}`] = getVariantAttachmentPath(slot, att.path, res.variant, shift)
    }
  }

  return {
    axieClass,
    variant: res.variant,
    skeleton,
    textures,
    scale: AXIE_SCALE,
    bounds: restBounds(skeleton),
  }
}

/**
 * Where the Axie sits at rest, so a sprite can centre it horizontally and stand
 * it on its feet rather than on the skeleton's origin.
 */
function restBounds(skeleton) {
  const rig = new AxieRig(skeleton)
  rig.pose()
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of rig.parts()) {
    if (p.slot === 'shadow' || p.slot === 'ball' || Math.abs(p.width) < 1) continue
    const hw = Math.abs(p.width) / 2
    const hh = Math.abs(p.height) / 2
    minX = Math.min(minX, p.x - hw)
    maxX = Math.max(maxX, p.x + hw)
    minY = Math.min(minY, p.y - hh)
    maxY = Math.max(maxY, p.y + hh)
  }
  return { cx: (minX + maxX) / 2, bottom: maxY, width: maxX - minX, height: maxY - minY }
}

export const CLASS_PART_SETS = {
  beast: '02', aquatic: '02', plant: '02', bird: '02', bug: '02', reptile: '02',
}
