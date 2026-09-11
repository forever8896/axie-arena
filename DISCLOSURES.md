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

**Axie Origins Battle Kit — in use.** Six skill VFX plates are vendored from
the revision licensed by Official Rules §5,
`069a59b772e54633d04a3d9d12ecde73b3e4be5d`:

`beast_gore`, `aquatic_slash`, `plant_projectile`, `bird_throw`,
`bug_projectile`, `reptile_projectile`

Each is an additive sprite sheet plus Origins' own `clip.json` timing, under
`public/vfx/`.

**Battle audio — in use.** 19 sounds from the same licensed revision, under
`public/sfx/`: per-class attack and impact sounds plus `poison` and `stunned`.
Transcoded from the kit's WAV originals to mono Ogg Vorbis with ffmpeg (3.5MB
to ~360KB); no other modification. They are pre-rendered PNG frames — no Spine runtime is involved.
The kit is not open source; use is limited to Vibeathon. Its `LICENSE.md` and
`THIRD_PARTY_NOTICES.md` are kept alongside the plates in `public/vfx/`.

**No Spine runtime code is shipped.** `pixi-spine` and equivalents are avoided
deliberately: Official Rules §5 and Esoteric Software's Spine Runtimes License
require each user integrating the runtimes to hold a Spine Editor licence. See
README for what that costs us.

## Generated assets

None.
