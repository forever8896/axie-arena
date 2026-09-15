# Lunacy

**Six Axies. One field. Last one standing.**

A browser arena brawler for **Axie Vibeathon 2026** (theme: Axie Core).

Six Axie classes, each with its own basic attack and special, fighting over a
Lunacia meadow. Named for Lunacia, minus a letter.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

## Checks

```bash
node scripts/headless/check-flow.mjs      # full loop in headless Chromium (dev server running)
node scripts/vendor-origins-vfx.mjs       # re-vendor and downscale Origins effect plates
# balance: open http://localhost:5173/?sim=120 in a browser
```

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| `Space` | Attack (short range, has a cooldown — whiffs cost you the cooldown too) |

## Where things are

```
src/
  main.js               Phaser bootstrap
  scenes/BootScene.js   builds the Axies, loads their textures
  scenes/GameScene.js   arena, input, the update loop
  scenes/UIScene.js     HUD, isolated from camera zoom and shake
  entities/Fighter.js   one combatant; player and bots share it
  ai/BotBrain.js        wander → chase → strike → backoff
  axie/AxieFactory.js   mixer setup and layer export
  axie/AxieSprite.js    assembles and animates the layers
  fx/Juice.js           impact, dust, motes, damage numbers, hit-stop
```

**`AxieSprite` is the seam.** Gameplay never draws anything itself — it calls
`setPosition`, `setFacing`, `update`, `flash`, `playAttack`.

## Rendering approach: real Axie art and animation, no Spine runtime

Axie bodies come from `@axieinfinity/mixer`, which outputs Spine skeleton data
with all 46 authored clips embedded. Playing that normally means shipping
`pixi-spine` — Spine runtime code, which Vibeathon Official Rules §5 says needs
a separate licence from Esoteric Software.

Instead, `src/axie/AxieRig.js` reads the animation data directly and poses each
body part every frame. It supports exactly what these skeletons use, measured
across all 46 clips: region attachments; rotate, translate and scale timelines
with linear, stepped or bezier easing; face swaps; the `normal`, `noScale` and
`noRotationOrReflection` transform modes; and single-bone leg IK.

It is verified against the mixer: at rest, every part lands exactly where
`exportAvatarLayers` puts it with IK disabled, and within one screen pixel with
IK on (the flat export ignores IK; a real render applies it).

38 of the 46 clips carry motion. Each class uses its own:

| Class | Basic | Special |
| --- | --- | --- |
| Beast | horn-gore | sprint into horn-gore |
| Aquatic | tail-multi-slap | tail-thrash |
| Plant | mouth-bite | cast-high |
| Bird | normal-attack | cast-multi |
| Bug | multi-attack | shrimp (somersault) |
| Reptile | tail-smash | tail-roll |

Shared: idle with random flourishes, run (cadence follows speed), a hit
reaction, dash hop, dizzy stun, wind-up during a special's telegraph, entrance,
victory flip. Attack clips are sped up so their impact lands at 165ms, the hit
timing the combat was balanced on.

The three `hit-by-normal` clips are empty in mixed skeletons; hits use
`hit-by-ranged-attack`, the one hit clip with motion.

Skill effects are the real Origins plates, processed by
`scripts/vendor-origins-vfx.mjs` (see DISCLOSURES.md).

## Status

**The core loop is complete**: choose an Axie, fight, win or lose, play again.

Working: a Lunacia grass field with cover, foliage and a minimap, Origins
battle audio, real Axie bodies for six classes, per-part procedural animation,
class select, six distinct kits (per-class basic and special), Origins skill
VFX, projectiles, ground zones, poison / slow / stun, mouse aim, dash with
invulnerability, bot AI that uses specials, hit-stop, damage numbers, HUD,
win and lose states, restart.

Not yet: audio, mobile controls, networked play.

Body attack animation is hand-made rather than the authored Origins clips —
see the rendering section above.

## Known issues

- Axie textures load from the official CDN at runtime, so first load needs a
  connection and currently takes several seconds. If the CDN cannot be reached
  the boot screen says so rather than hanging.
- Desktop only so far: no touch controls.
- Audio needs a click before a browser will allow it; the class-select screen
  provides that, so the first match is never silent.

## Disclosures

See [DISCLOSURES.md](./DISCLOSURES.md).
