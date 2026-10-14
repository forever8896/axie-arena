/**
 * The Ronke fighter's base pose: one character, full body, on a flat green
 * field so ffmpeg can cut it out later.
 *
 * Everything downstream is driven from this one image, so it is worth getting
 * right before any video is paid for: image-to-video keeps whatever the still
 * gives it, including a cropped foot or a background that will not key out.
 *
 * Usage: set -a; . ~/.config/ronkacy/env; set +a; node scripts/ronke/make-character.mjs
 */
import { run, download, dataUri } from './fal.mjs'

const ref = await dataUri(new URL('../../art/ref/ronke-hero.png', import.meta.url).pathname)

const prompt = `Full body game character sprite of this exact blue gorilla character, standing in a side-on fighting stance facing right, fists raised, knees bent, ready to brawl.
Keep the character identical: deep blue fur, lighter blue face and chest, grey muzzle, red scarf, blue denim overalls with a white RON label, brown leather straps.
The ENTIRE body must be inside the frame from the top of the head to below the feet, with clear empty margin on all four sides. Nothing cropped.
Background: a completely flat, pure, vivid chroma key green screen — the bright saturated green used in film compositing — filling every pixel behind the character. No scenery, no ground, no gradient, no shadow cast on the background.
Absolutely no text, no caption, no colour swatch, no hex code, no watermark, no border anywhere in the image.
Clean bold cartoon game art, even lighting, crisp dark outline so the figure separates cleanly from the green.`

console.log('generating the base pose…')
const out = await run('fal-ai/nano-banana/edit', {
  prompt,
  image_urls: [ref],
  num_images: 2,
  output_format: 'png',
}, { label: 'base pose' })

const saved = await download(out, 'art/base', 'ronke-stance')
console.log(saved.join('\n'))
