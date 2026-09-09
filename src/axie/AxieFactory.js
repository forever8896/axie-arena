import {
  initAxieMixer,
  getAxieSpineFromCombo,
  getAxieColorPartShift,
  getVariantAttachmentPath,
  exportAvatarLayers,
  genesStuff,
} from '@axieinfinity/mixer'

// Loaded as URLs rather than imported as modules: ~6.7MB of JSON has no
// business sitting inside the JS bundle.
import genesUrl from '@axieinfinity/mixer/dist/data/axie-2d-v3-stuff-genes.json?url'
import samplesUrl from '@axieinfinity/mixer/dist/data/axie-2d-v3-stuff-samples.json?url'
import variantsUrl from '@axieinfinity/mixer/dist/data/axie-2d-v3-stuff-variant.json?url'
import animationsUrl from '@axieinfinity/mixer/dist/data/axie-2d-v3-stuff-animations_lite.json?url'

export const AXIE_CDN = 'https://axiecdn.axieinfinity.com/mixer-stuffs/v6/'

/** Render scale for the exported layers. Tuned against the arena camera. */
const LAYER_SCALE = 0.125
const CANVAS = 460

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
 * Builds one Axie of a class as flat positioned layers.
 *
 * Deliberately uses exportAvatarLayers rather than the Spine skeleton: it
 * returns plain images, so no Spine runtime ships. See README.
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

  const res = getAxieSpineFromCombo(combo, variantIndex, true)
  if (res.error) throw new Error(`mixer: ${res.error}`)

  const layers = exportLayers(res)
  return { axieClass, variant: res.variant, layers, scale: LAYER_SCALE }
}

function exportLayers(res) {
  const shift = getAxieColorPartShift(res.variant)
  const sizes = attachmentSizes(res.skeletonDataAsset, res.variant, shift)

  return exportAvatarLayers(
    res.skeletonDataAsset, res.combo, res.variant, shift, getVariantAttachmentPath,
    { width: CANVAS, height: CANVAS, offsetX: 0, offsetY: 0, scale: LAYER_SCALE },
  ).map(l => {
    const size = sizes[l.imagePath]
    return {
      ...l,
      part: classify(l.imagePath),
      w: (size?.w ?? 0) * LAYER_SCALE,
      h: (size?.h ?? 0) * LAYER_SCALE,
    }
  })
}

/**
 * Layer positions are in the skeleton's coordinate space, but the CDN serves
 * textures at a smaller size (~1.57x). Carrying the attachment's own width and
 * height means each image is drawn at the size its position was computed for,
 * with no scale factor to guess at.
 */
function attachmentSizes(skeleton, variantKey, partColorShift) {
  const sizes = {}
  const skinAttachments = skeleton.skins[0].attachments
  for (const slotName in skinAttachments) {
    for (const attachmentName in skinAttachments[slotName]) {
      const attachment = skinAttachments[slotName][attachmentName]
      if (!attachment.path || !attachment.width) continue
      const path = getVariantAttachmentPath(slotName, attachment.path, variantKey, partColorShift)
      sizes[path] = { w: attachment.width, h: attachment.height }
    }
  }
  return sizes
}

/**
 * exportAvatarLayers returns paths, not slot names — but the path says which
 * body part it is, which is all the animation needs.
 */
function classify(imagePath) {
  if (imagePath.includes('leg-front')) return 'legFront'
  if (imagePath.includes('leg-back')) return 'legBack'
  if (imagePath.includes('tail')) return 'tail'
  if (imagePath.includes('ear-left')) return 'earLeft'
  if (imagePath.includes('ear-right')) return 'earRight'
  if (imagePath.includes('horn')) return 'horn'
  if (imagePath.includes('eyes')) return 'eyes'
  if (imagePath.includes('mouth')) return 'mouth'
  if (imagePath.includes('/back/') || imagePath.endsWith('back.png')) return 'back'
  return 'body'
}

export const CLASS_PART_SETS = {
  beast: '02', aquatic: '02', plant: '02', bird: '02', bug: '02', reptile: '02',
}
