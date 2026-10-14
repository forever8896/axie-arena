#!/usr/bin/env node
/**
 * Ronke's combat sounds, from ElevenLabs Sound Effects.
 *
 * The twenty-five sounds this replaces came from the Origins Battle Kit and
 * left with it. They were also named for a roster that no longer exists —
 * beast_bite_attack, reptile_slash_attack — where there is now one fighter who
 * punches, licks, blocks and takes it.
 *
 * The same route the menu sounds took, driven through fal so it shares the one
 * key: generate, trim, level, transcode to Ogg Vorbis.
 *
 * Costs real credit, so it takes the ids it is given:
 *   set -a; . ~/.config/ronkacy/env; set +a
 *   node scripts/audio/generate-sfx.mjs            # everything missing
 *   node scripts/audio/generate-sfx.mjs ronke_punch
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, existsSync, writeFileSync, rmSync } from 'node:fs'
import { run } from '../ronke/fal.mjs'

// The unversioned endpoint still asks ElevenLabs for eleven_text_to_sound_v0,
// which they now refuse with a 422, and it ignores a model_id passed in. The
// versioned one pins a model they still accept.
const MODEL = 'fal-ai/elevenlabs/sound-effects/v2'
const OUT = 'public/sfx'
const TMP = 'art/work/sfx'

/**
 * Each sound: what it is for, and how long it may run.
 *
 * Short is the whole art here. A game sound that outlasts the action it
 * describes turns into mud the moment two of them overlap, and in a room of
 * seven fighters they always overlap.
 */
export const SOUNDS = {
  ronke_punch: { s: 0.9, text: 'A heavy cartoon fist swing through the air, short whoosh, no impact. Dry, punchy, no music, no reverb tail.' },
  ronke_punch_hit: { s: 0.8, text: 'A heavy comedic punch landing on a soft fat belly. Deep thud with a slight boing. Dry, no music.' },
  ronke_lick: { s: 1.0, text: 'A long wet tongue whipping out fast through the air. Slimy stretchy whoosh. Cartoon, dry, no music.' },
  ronke_lick_hit: { s: 0.8, text: 'A wet sloppy tongue slap landing on a face. Comedic splat, short. Dry, no music.' },
  ronke_hurt: { s: 0.8, text: 'A short, dumb, surprised grunt from a big cartoon ape taking a hit. Low oof. Dry, no music.' },
  ronke_guard: { s: 0.7, text: 'A blocked blow landing on raised forearms. Dull muffled thud, no ring. Dry, no music.' },
  ronke_dash: { s: 0.6, text: 'A short quick comedic whoosh of a heavy body lunging sideways. Dry, no music.' },
  ronke_die: { s: 1.4, text: 'A big cartoon ape flopping to the ground, deflating with a sad descending wheeze. Dry, no music.' },
  poison: { s: 1.0, text: 'Thick green slime bubbling and hissing, sickly. Short, dry, no music.' },
  stunned: { s: 1.0, text: 'Cartoon dizzy stars twinkling after a knock on the head, woozy wobble. Dry, no music.' },
  shield: { s: 0.9, text: 'A bubble shield popping into existence around someone, soft magical whump. Dry, no music.' },
  heal: { s: 1.1, text: 'A warm gentle restorative chime, soft rising shimmer. Dry, no music.' },
  power_awaken: { s: 1.3, text: 'A surge of power charging up and snapping ready, rising whoosh into a bright pop. Dry, no music.' },
  bubble: { s: 0.7, text: 'A single round bubble forming and popping. Soft and wet. Dry, no music.' },
  damage_boost: { s: 1.0, text: 'An aggressive power-up stinger, low growl rising into a sharp bright hit. Dry, no music.' },
  buff: { s: 0.9, text: 'A soft positive magical sparkle settling over someone. Short, dry, no music.' },
}

const wanted = process.argv.slice(2).filter(a => SOUNDS[a])
const ids = wanted.length ? wanted : Object.keys(SOUNDS).filter(id => !existsSync(`${OUT}/${id}.ogg`))
if (!ids.length) {
  console.log('nothing to generate')
  process.exit(0)
}
mkdirSync(OUT, { recursive: true })
mkdirSync(TMP, { recursive: true })
console.log(`${ids.length} sound(s)\n`)

for (const id of ids) {
  const spec = SOUNDS[id]
  try {
    const out = await run(MODEL, {
      text: spec.text,
      duration_seconds: spec.s,
      prompt_influence: 0.6,
    }, { label: id, timeoutMs: 300000 })
    const url = out?.audio?.url ?? out?.audio_url?.url ?? out?.url
    if (!url) throw new Error(`no audio in ${JSON.stringify(out).slice(0, 200)}`)
    const raw = `${TMP}/${id}.mp3`
    writeFileSync(raw, Buffer.from(await (await fetch(url)).arrayBuffer()))
    // Trimmed of leading silence, levelled, and cut to Ogg the way the menu
    // sounds were, so everything in public/sfx behaves the same at playback.
    const encode = trim => execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw,
      '-af', [
        trim && 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02',
        'loudnorm=I=-18:TP=-1.5:LRA=11',
      ].filter(Boolean).join(','),
      '-c:a', 'libvorbis', '-q:a', '4', '-ac', '1', `${OUT}/${id}.ogg`])
    encode(true)
    // A quiet generation can be silent enough that the trim takes all of it,
    // leaving an Ogg the browser refuses to decode. Checked rather than
    // assumed, because a sound that fails to decode is only noticed at runtime.
    const seconds = Number(execFileSync('ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${OUT}/${id}.ogg`],
      { encoding: 'utf8' }).trim())
    if (!(seconds > 0.12)) {
      console.log(`  ${id}: trimmed to nothing, keeping it untrimmed`)
      encode(false)
    }
    console.log(`  ${id}.ogg`)
  } catch (err) {
    console.log(`  ${id}: FAILED ${err.message.slice(0, 160)}`)
  }
}
rmSync(TMP, { recursive: true, force: true })
