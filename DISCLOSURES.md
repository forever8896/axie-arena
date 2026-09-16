# Disclosures

Maintained continuously, not written at submission time.

## AI use

Material AI use: **Claude Opus 5 via Claude Code** is used for implementation,
review, and research throughout. Code is reviewed and run before commit. Entry
is individual; the AI is a tool, not a contributor.

## Pre-existing work

Project structure is informed by the author's own earlier hackathon project,
[forever8896/dot-arena](https://github.com/forever8896/dot-arena) (own work).
No code copied verbatim so far.

## Dependencies

| Package | Licence | Use |
| --- | --- | --- |
| phaser ^3.90 | MIT | game engine |
| vite ^6 | MIT | dev server, build |
| @axieinfinity/mixer ^1.4.9 | MIT | builds Axie bodies from part combos |
| opentype.js 1.3.4 (dev only) | MIT | converts the logo lettering to vector outlines at build time; not shipped |

| Font | Licence | Use |
| --- | --- | --- |
| Rowdies (Google Fonts) | SIL Open Font License 1.1 | in-game text; logo lettering, converted to outlines. `scripts/brand/Rowdies-Bold.ttf` with its `OFL.txt` |

## Organizer confirmations

Asked in the Vibeathon Discord and answered by **Jaatster (Sky Mavis and Axie
Limited team)** on 2026-09-16: "yes to all three. no issues".

1. **Multiplayer may ship in Round 1** as long as no wallet connection is
   required to play.
2. **Assets may be generated from the Axie art** — attack animations and the
   like — rather than being limited to the files in the resource kits.
3. **Rendering Axies without any Spine runtime**, using our own reader of the
   mixer's animation JSON, is fine under Official Rules §5.

## Axie assets

**In use.** Axie bodies are composed with `@axieinfinity/mixer` (MIT) via
`exportAvatarLayers`, and their textures are fetched at runtime from the
official Axie CDN (`axiecdn.axieinfinity.com/mixer-stuffs/v6/`). No Axie art is
copied into or redistributed from this repository.

Axie characters and art are Sky Mavis / Axie Infinity IP, used here for an Axie
Vibeathon entry.

**Axie Origins Battle Kit — in use.** Twenty-two effect plates are vendored
from the revision licensed by Official Rules §5,
`069a59b772e54633d04a3d9d12ecde73b3e4be5d`:

- Specials: `beast_gore`, `aquatic_slash`, `plant_projectile`, `bird_throw`,
  `bug_projectile`, `reptile_projectile`
- Basics: `beast_bite`, `aquatic_gore`, `plant_bite`, `bird_bite`, `bug_bite`,
  `reptile_slash`
- Statuses: `stunned`, `poison_apply`, `debuff_apply`, `power_gain`, `shield`
- Power-ups and Moonwells: `heal`, `dmg_boost`, `shield_boost`, `power_awaken`,
  `buff_apply`

Six status icons from the same revision, used unmodified in `public/vfx/icons/`:
`buff_dmg_boost`, `buff_shield_boost`, `buff_summerbreeze`,
`power_energy_master`, `buff_leaf`, `buff_mushroom`.

**Modified:** each atlas is downscaled (to 50% for attacks, 40% for statuses) on
an exact frame grid, and the geometry in its `clip.json` is scaled to match;
frame timing is unchanged. About 26MB of source atlases ship as about 11.5MB. This is done
by `scripts/vendor-origins-vfx.mjs`, which pulls from the pinned revision and
records the source and scale factor inside each `clip.json`. They are
pre-rendered PNG frames — no Spine runtime is involved. The kit's `LICENSE.md`
and `THIRD_PARTY_NOTICES.md` are kept alongside them in `public/vfx/`.

**Battle audio — in use.** 25 sounds from the same licensed revision, under
`public/sfx/`: per-class attack and impact sounds, `poison`, `stunned`,
`shield`, `heal`, `power_awaken`, `bubble`, `damage_boost` and `buff`.
Transcoded from the kit's WAV originals to mono Ogg Vorbis with ffmpeg (about
520KB in total); no other modification. The kit is not open source; use is limited to Vibeathon. Its `LICENSE.md` and
`THIRD_PARTY_NOTICES.md` are kept alongside the plates in `public/vfx/`.

**Axie animation.** Bodies are animated with the 46 authored clips the mixer
embeds in every skeleton it builds (horn-gore, tail-smash, cast-fly, run, idle,
hit reactions, victory…). They are read by `src/axie/AxieRig.js`, a small solver
written for this project. It interprets the animation data itself; it is not,
and does not include, Esoteric Software's Spine runtime. Its rest pose matches
the mixer's own `exportAvatarLayers` output exactly with leg IK disabled, and to
under one screen pixel with it enabled.

**No Spine runtime code is shipped.** `pixi-spine` and equivalents are avoided
deliberately: Official Rules §5 and Esoteric Software's Spine Runtimes License
require each user integrating the runtimes to hold a Spine Editor licence. See
README for what that costs us. Confirmed acceptable by the Axie team on
2026-09-16 (see Organizer confirmations above).

## Generated assets

**Menu sounds** (`public/sfx/ui_*.ogg`). Five short interface sounds — hover,
confirm, back, start, denied — generated with the Venice AI audio API
(ElevenLabs Sound Effects v2), trimmed, levelled and transcoded to Ogg Vorbis.
Prompts are in `scripts/audio/generate-music.mjs`.

**Music** (`public/music/`). Instrumental tracks generated with the **Venice
AI** audio API and kept in the repository: `theme-hunt` (the front end, wired
in `src/fx/Music.js`), `theme-moonlit` (an alternative front-end theme),
`arena` (in a room) and `bloodmoon` (the Blood Moon event). Models: ElevenLabs
Music 2.5 for the themes and the arena loop, Stable Audio 2.5 for the Blood Moon.
The prompts, models and durations are in `scripts/audio/generate-music.mjs`,
which regenerates them from an API key held in the environment (no key is
stored in this repository). Each track was loudness-normalised to -20 LUFS and
transcoded to Ogg Vorbis with ffmpeg. No third-party recordings are involved.

**Lunacy logo** (`public/brand/`). Original artwork authored as code with AI
assistance (Claude) in `scripts/brand/build-logo.mjs`: Rowdies letter outlines,
a crescent moon, a leaf and sparkles drawn as SVG paths, rendered to PNG with
headless Chromium. It uses no Axie Infinity logo, mark or character art.
