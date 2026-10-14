/**
 * The fighter's animation clips, one image-to-video call each.
 *
 * Every clip starts from the same still (art/base/ronke-stance.png), which is
 * what keeps the character the same Ronke across all of them — the model is
 * given the look rather than asked to invent it. Each prompt pins the camera
 * and the green field, because anything that moves the background or lights it
 * differently is a frame that will not key out cleanly later.
 *
 * Clips cost about $0.19 each, so this takes the list it is given rather than
 * regenerating everything:
 *   node scripts/ronke/make-animations.mjs idle run punch
 */
import { run, download, dataUri } from './fal.mjs'

const MODEL = 'fal-ai/minimax/hailuo-2.3-fast/standard/image-to-video'

/** Held still in every prompt, so the clips differ only in what the body does. */
const HOLD = `The camera is locked off and completely static — no pan, no zoom, no shake.
The background stays a flat, even, pure chroma key green at all times, unchanged and unlit.
The character stays fully inside the frame, feet never leaving the bottom edge, nothing cropped.
Keep the character's design exactly as it is: deep blue gorilla, red scarf, blue overalls with the RON label.
Bold flat cartoon game art, crisp dark outline, even lighting, no new scenery, no text.`

const CLIPS = {
  idle: `The gorilla holds its fighting stance and breathes, shoulders rising and settling, fists bobbing slightly, weight shifting a little from foot to foot. A small, calm, looping idle. ${HOLD}`,
  run: `The gorilla runs in place towards the right, legs cycling in a full run, arms pumping, body leaning into the run. A clean looping run cycle. ${HOLD}`,
  punch: `The gorilla throws one heavy straight punch with its right fist: it winds up, drives the fist forward fully extended, then pulls back to the fighting stance. One clear single punch. ${HOLD}`,
  slam: `The gorilla raises both arms high overhead, then slams both fists down hard onto the ground in front of it, then rises back to its stance. One heavy ground slam. ${HOLD}`,
  hurt: `The gorilla is struck and recoils backwards, head snapping back, arms flinching up, then recovers to its fighting stance. One short hit reaction. ${HOLD}`,
  guard: `The gorilla raises both forearms in front of its face and body into a tight blocking guard, braced and holding, shifting its weight slightly. ${HOLD}`,
}

const wanted = process.argv.slice(2).filter(a => CLIPS[a])
if (!wanted.length) {
  console.error(`Pick clips: ${Object.keys(CLIPS).join(' ')}`)
  process.exit(1)
}

const image = await dataUri(new URL('../../art/base/ronke-stance.png', import.meta.url).pathname)
console.log(`${wanted.length} clip(s), about $${(wanted.length * 0.19).toFixed(2)}\n`)

const results = await Promise.all(wanted.map(async name => {
  try {
    const out = await run(MODEL, { prompt: CLIPS[name], image_url: image, prompt_optimizer: false },
      { label: name, timeoutMs: 900000 })
    return `${name}: ${(await download(out, 'art/clips', name)).join(', ')}`
  } catch (err) {
    return `${name}: FAILED ${err.message.slice(0, 200)}`
  }
}))
console.log('\n' + results.join('\n'))
