# Axie Arena

A browser arena prototype for **Axie Vibeathon 2026** (theme: Axie Core).

Greybox stage — plain shapes standing in for Axies while the core loop is built.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
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

## Rendering approach: real Axie art, no Spine runtime

Axie bodies come from `@axieinfinity/mixer`, which outputs Spine skeleton data.
Rendering that normally means shipping `pixi-spine` — Spine runtime code, which
Vibeathon Official Rules §5 says requires a separate licence from Esoteric
Software that the Origins kit does not grant.

So this uses the mixer's `exportAvatarLayers` instead: it returns flat
positioned image layers, which are plain PNGs served from the official Axie
CDN. No runtime ships.

Two details that matter if you touch this code:

- Layer positions are in the skeleton's coordinate space, but the CDN serves
  textures roughly 1.57x smaller. `AxieFactory` carries each attachment's own
  width and height through so every image is drawn at the size its position was
  computed for. Do not substitute the texture's own dimensions.
- The mixer's art faces **left**. Facing right flips the rig.

Motion is procedural, per part: the body bobs and squashes, legs alternate,
ears and tail lag behind, and the Axie blinks. It costs us the 46 prebuilt
skeletal clips and keeps us unambiguously clear of §5.

## Status

Working: real Axie bodies for six classes, per-part procedural animation,
movement with acceleration and knockback, bot AI, melee with wind-up and
lunge, hit-stop, impact effects, damage numbers, death, HUD, camera follow.

Not yet: win/lose condition, restart, instructions screen, audio, mobile
controls, networked play.

## Known issues

- Axie textures load from the official CDN at runtime, so first load needs a
  connection and currently takes several seconds. If the CDN cannot be reached
  the boot screen says so rather than hanging.
- No win or lose state yet — losing all HP fades you out and the match
  continues.

## Disclosures

See [DISCLOSURES.md](./DISCLOSURES.md).
