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

## Axie assets

**In use.** Axie bodies are composed with `@axieinfinity/mixer` (MIT) via
`exportAvatarLayers`, and their textures are fetched at runtime from the
official Axie CDN (`axiecdn.axieinfinity.com/mixer-stuffs/v6/`). No Axie art is
copied into or redistributed from this repository.

Axie characters and art are Sky Mavis / Axie Infinity IP, used here for an Axie
Vibeathon entry.

**Axie Origins Battle Kit — in use.** Sixteen effect plates are vendored from
the revision licensed by Official Rules §5,
`069a59b772e54633d04a3d9d12ecde73b3e4be5d`:

- Specials: `beast_gore`, `aquatic_slash`, `plant_projectile`, `bird_throw`,
  `bug_projectile`, `reptile_projectile`
- Basics: `beast_bite`, `aquatic_gore`, `plant_bite`, `bird_bite`, `bug_bite`,
  `reptile_slash`
- Statuses: `stunned`, `poison_apply`, `debuff_apply`, `power_gain`

**Modified:** each atlas is downscaled (to 50% for attacks, 40% for statuses) on
an exact frame grid, and the geometry in its `clip.json` is scaled to match;
frame timing is unchanged. 14.3MB of source atlases ship as 6.7MB. This is done
by `scripts/vendor-origins-vfx.mjs`, which pulls from the pinned revision and
records the source and scale factor inside each `clip.json`. They are
pre-rendered PNG frames — no Spine runtime is involved. The kit's `LICENSE.md`
and `THIRD_PARTY_NOTICES.md` are kept alongside them in `public/vfx/`.

**Battle audio — in use.** 19 sounds from the same licensed revision, under
`public/sfx/`: per-class attack and impact sounds plus `poison` and `stunned`.
Transcoded from the kit's WAV originals to mono Ogg Vorbis with ffmpeg (3.5MB
to ~360KB); no other modification. They are pre-rendered PNG frames — no Spine runtime is involved.
The kit is not open source; use is limited to Vibeathon. Its `LICENSE.md` and
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
README for what that costs us.

## Generated assets

None.
