/**
 * The source still every animation is driven from, one per fighter.
 *
 * Nothing here is generated from a description. Ronke is composited straight
 * from the collection's own base art; Horske is the pixel jockey from the
 * racing game; Ronka has no full body anywhere, so she is the one exception —
 * Ronke's real body edited into her, using her own token art as the reference
 * for what she looks like, rather than invented from words.
 *
 * Usage: node scripts/ronke/build-plate.mjs [ronke|horske|ronka]
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, existsSync } from 'node:fs'
import { run, download, dataUri } from './fal.mjs'

const RONKE_SRC = '/home/deepseek/RECOVERED/home/deepseek/RONKE BUSINESS/new-landing/public/ronkebase.png'
/** A green nothing in the art itself can be confused with. */
const GREEN = '#15D84A'

mkdirSync('art/base', { recursive: true })

/** Trim, upscale and drop onto a flat green field at the size video wants. */
function plate(src, out, { height = 880, canvas = '1000x1120' } = {}) {
  execFileSync('magick', [
    src, '-trim', '+repage',
    '-resize', `x${height}`,
    '-background', GREEN, '-alpha', 'remove', '-alpha', 'off',
    '-gravity', 'center', '-extent', canvas,
    out,
  ])
  console.log(execFileSync('magick', [out, '-format', `${out}  %wx%h  bg %[pixel:p{4,4}]\n`, 'info:'], { encoding: 'utf8' }))
}

const who = process.argv[2] ?? 'all'

if (who === 'ronke' || who === 'all') {
  plate(RONKE_SRC, 'art/base/ronke-plate.png')
}

if (who === 'horske' || who === 'all') {
  // The jockey is 288x192 of pixel art: upscaled with point sampling so the
  // pixels stay pixels instead of turning to soup on the way up.
  execFileSync('magick', [
    'art/ref/horske-idle.png', '-trim', '+repage',
    '-filter', 'point', '-resize', 'x760',
    '-background', GREEN, '-alpha', 'remove', '-alpha', 'off',
    '-gravity', 'center', '-extent', '1120x1000',
    'art/base/horske-plate.png',
  ])
  console.log('art/base/horske-plate.png')
}

if (who === 'ronka' || who === 'all') {
  if (existsSync('art/base/ronka-raw.png')) {
    plate('art/base/ronka-raw.png', 'art/base/ronka-plate.png')
  } else {
    console.log('generating Ronka from Ronke\'s body and her own token art…')
    const body = await dataUri('art/base/ronke-plate.png')
    const her = await dataUri('art/ref/ronka.webp')
    const out = await run('fal-ai/nano-banana/edit', {
      prompt: `Redraw the gorilla in the first image as the character in the second image, keeping the first image's exact pose, proportions and crude flat MS-Paint cartoon style with wobbly black outlines.
Change only who he is: she is bright pink instead of blue, with a lighter pink belly, a big pink bow on top of her head, pale blue overalls instead of dark blue, and the same heavy brow and big staring eyes.
Keep the same standing pose, the same fat round belly, the same thin spindly arms and legs, the same flat colours and rough linework. Do NOT make it 3D, polished, shaded or smooth.
Background: completely flat pure chroma key green, nothing else. No text, no watermark.`,
      image_urls: [body, her],
      num_images: 2,
      output_format: 'png',
    }, { label: 'ronka' })
    console.log((await download(out, 'art/base', 'ronka-gen')).join('\n'))
    console.log('pick one, save it as art/base/ronka-raw.png, then run this again')
  }
}
