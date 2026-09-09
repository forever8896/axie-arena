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
  main.js              Phaser bootstrap
  scenes/GameScene.js  arena, input, HUD, the update loop
  entities/Fighter.js  one combatant; player and bots share it
  ai/BotBrain.js       wander → chase → strike → backoff
  axie/AxieSprite.js   the rendering seam (see below)
```

**`AxieSprite` is the seam.** Gameplay never draws anything itself — it calls
`setPosition`, `setFacing`, `update`, `flash`. Today those drive ellipses. Next
they drive layered Axie art. Swapping the visuals touches one file.

## Rendering approach: no Spine runtime

Official Axie bodies come from `@axieinfinity/mixer`, which outputs Spine
skeleton data. Rendering that normally means shipping `pixi-spine` — Spine
runtime code, which the Vibeathon Official Rules §5 say requires a separate
licence from Esoteric Software that the Origins kit does not grant.

So this project uses the mixer's `exportAvatarLayers`, which returns flat
positioned image layers and needs no runtime. Motion is procedural — bob,
squash, lean — driven from `AxieSprite`. Costs us the 46 prebuilt skeletal
clips; keeps us unambiguously clear of §5.

## Status

Working: movement with acceleration and knockback, bot AI, melee with cooldown,
damage, death, HUD, camera follow, arena bounds.

Not yet: Axie art, win/lose condition, restart, instructions screen, audio,
mobile controls, networked play.

## Disclosures

See [DISCLOSURES.md](./DISCLOSURES.md).
