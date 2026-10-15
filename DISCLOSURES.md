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
| ws ^8.21 | MIT | WebSocket server for the multiplayer rooms; no transitive dependencies |
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

**Removed.** Ronkacy was built as an Axie game and is not one any more. The
mixer dependency, the runtime part assembly, the animation reader written
against it, the Origins Battle Kit (22 effect plates, 6 status icons, 25 battle
sounds) and every Axie texture path are gone from the repository and the build.
The kit's licence covered the Vibeathon and Sky Mavis-approved programs; this is
neither, so none of it ships.

Nothing of Axie's remains in `src/`, `public/` or the dependency tree.

## The character

All three fighters are the author's own IP.

**Ronke** is driven from `ronkebase.png`, the collection's own base art,
composited onto a green field by `scripts/ronke/build-plate.mjs` — the
character is the asset itself, not a likeness generated from a description.

**Horske** is the jockey sprite from the author's own Horske racing game
(`public/horske/ronke-idle.png`). His run is not generated at all: it is that
game's own eight-frame gallop sheet, re-packed to the geometry the other sheets
use by `scripts/ronke/cut-gallop.mjs`.

**Ronka** is the one exception, because no full-body art of her exists
anywhere. She is Ronke's real body edited into her, with her own token art
(`images/tokens/ronka.webp`) given to the model as the reference for who she
is, rather than described in words. The edit is in `build-plate.mjs` and the
result is kept as `art/base/ronka-raw.png`.

## Generated assets

**Menu sounds** (`public/sfx/ui_*.ogg`). Five short interface sounds — hover,
confirm, back, start, denied — generated with the Venice AI audio API
(ElevenLabs Sound Effects v2), trimmed, levelled and transcoded to Ogg Vorbis.
Prompts are in `scripts/audio/generate-music.mjs`.

**Animation** (`public/sprites/`, `art/`). Six sprite sheets per fighter —
idle, run, an attack, a special, hurt and guard — generated with **MiniMax
Hailuo 2.3** image-to-video through fal.ai, each driven from that fighter's own
green-screen plate. Horske's run is the exception noted above: hand-drawn, from
the racing game. The green is keyed out with ffmpeg and the frames packed into strips by
`scripts/ronke/cut-frames.mjs`. The source clips are kept in `art/clips/`.

**Combat sounds** (`public/sfx/ronke_*.ogg`, `ronka_*`, `horske_*` and the
status sounds). Twenty-two effects — punch, impact, the tongue and its landing, hurt, guard, dash, death,
plus poison, stun, shield, heal, power, bubble, damage boost and buff —
generated with **ElevenLabs Sound Effects v2** through fal.ai, trimmed,
loudness-normalised and transcoded to Ogg Vorbis. Prompts are in
`scripts/audio/generate-sfx.mjs`. They replace the 25 Origins Battle Kit sounds
that left with the kit.

**Music** (`public/music/`). Instrumental tracks generated with the **Venice
AI** audio API and kept in the repository: `theme-hunt` (the front end, wired
in `src/fx/Music.js`), `theme-moonlit` (an alternative front-end theme),
`arena` (in a room) and `bloodmoon` (the Blood Moon event). Models: ElevenLabs
Music 2.5 for the themes and the arena loop, Stable Audio 2.5 for the Blood Moon.
The prompts, models and durations are in `scripts/audio/generate-music.mjs`,
which regenerates them from an API key held in the environment (no key is
stored in this repository). Each track was loudness-normalised to -20 LUFS and
transcoded to Ogg Vorbis with ffmpeg. No third-party recordings are involved.

**Ronkacy logo** (`public/brand/`). Original artwork authored as code with AI
assistance (Claude) in `scripts/brand/build-logo.mjs`: Rowdies letter outlines,
a crescent moon, a leaf and sparkles drawn as SVG paths, rendered to PNG with
headless Chromium. It uses no Axie Infinity logo, mark or character art.
