/**
 * The source still every animation is driven from.
 *
 * The first version of this generated a character that merely resembled Ronke,
 * and it showed: a polished mascot gorilla instead of the crude, round-bellied,
 * spindly-limbed thing the collection actually is. So nothing is generated here
 * any more. The real asset is composited onto a flat green field at the size
 * image-to-video wants, and the model is handed the character rather than a
 * description of him.
 *
 * Usage: node scripts/ronke/build-plate.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const SRC = '/home/deepseek/RECOVERED/home/deepseek/RONKE BUSINESS/new-landing/public/ronkebase.png'
/** A green nothing in the art itself can be confused with. */
const GREEN = '#15D84A'
const OUT = 'art/base/ronke-plate.png'

mkdirSync('art/base', { recursive: true })
execFileSync('magick', [
  SRC,
  '-trim', '+repage',
  // Upscaled from 175x226: flat art with hard edges, so the filter matters less
  // than keeping the silhouette clean for the key later.
  '-resize', 'x880',
  '-background', GREEN, '-alpha', 'remove', '-alpha', 'off',
  '-gravity', 'center', '-extent', '1000x1120',
  OUT,
])
console.log(execFileSync('magick', [OUT, '-format', `${OUT}  %wx%h  bg %[pixel:p{4,4}]\n`, 'info:'], { encoding: 'utf8' }))
