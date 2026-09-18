# Reworking the combat: from reflex to reading

A proposal, with the research it comes from and the measurements that would
show whether it worked. Nothing here changes the Endless Wilds: the stake, the
bounty, the Moon Gates, the power-ups and the Moonwells stay exactly as they
are. This is about what happens in the ten seconds when two hunters meet.

## 1. What is wrong with the fight we have

The combat was tuned for a game played alone against bots, and it shows two
problems now that people play it against each other over a network.

**The counterplay windows are shorter than a person's reaction time.** A parry
is a 200ms window ([classKits.js](../src/axie/classKits.js)), chosen from
Street Fighter III's ~167ms and Dark Souls' 200ms. Those are single-player or
rollback-netcode numbers. Simple visual reaction time is about 250ms — roughly
16 frames at 60fps — so a 200ms window is already at the edge of what a person
can do on reaction alone.

**The network makes that window shorter still.** A client draws the room a
tenth of a second in the past (`INTERP_MS`), and the room's answer takes a
round trip to come back. At the 43ms ping we measure to Amsterdam:

```
   43ms round trip
+ 100ms interpolation delay
+  17ms a frame at 60fps
= 160ms of staleness before you have even decided
```

Against a 200ms window that leaves 40ms of actual decision time. At the 180ms
ping we measured before moving the server, there was none: the window had
closed before the swing was drawn. Fast-action games degrade
[past 70-80ms of latency while slower ones tolerate ~100ms][latency] — we are
asking for reflexes the network cannot deliver.

So the fight is decided by who has the better connection, dressed up as skill.

## 2. What the research says to do instead

**Commit earlier, not faster.** Mordhau splits every attack into
[windup, release and recovery][phases], each measured in milliseconds, and once
an attack is committed it cannot be cancelled. The skill is choosing when to
start, and reading what the other player started — decisions taken hundreds of
milliseconds before contact, not reactions inside a 200ms gate. For Honor's Art
of Battle built the same idea around stances, and Chivalry 2 and Elden Ring PvP
took it from there.

**Make hits travel.** Overwatch distinguishes hitscan from projectile weapons,
and the distinction matters over a network: [projectiles are not lag
compensated][projectiles] — they do not exist until your input reaches the
server — while hitscan has to be rewound through a buffer of past positions. A
projectile turns latency into something learnable (lead your target a little
more) instead of something unfair (dying behind cover because the server rewound
you). Hitscan is also where lag compensation stops at a ceiling: Overwatch and
Battlefield 4 give up past 250ms.

**Let space do the work.** Brawl Stars' positional advice is that
[when a projectile takes about a second to arrive you want to be within a dash
of cover][cover]. Travel time is what turns a map into a game: bushes and walls
we already have become the thing you play around, rather than scenery.

## 3. The changes

Each one says what it does, why, and what it does to the latency problem.

### 3.1 Attacks have phases, and commit

| | now | proposed |
| --- | --- | --- |
| wind-up | none (165ms to contact) | 260ms, visible, cannot be cancelled after 120ms |
| contact | instant cone | 120ms release window |
| recovery | cooldown only | 300ms where you cannot act |

You decide to swing before you know what the other player will do, and they
decide to move before they know whether you swung. That is the trade the whole
fight is built on, and it is a decision, not a reaction.

*Latency:* the wind-up is 260ms of warning. Even at 160ms of staleness a player
sees 100ms of it — and, more importantly, the counterplay is to be somewhere
else, which is a decision made continuously rather than in a gate.

### 3.2 The parry becomes a guard you hold, plus a riposte you earn

The 200ms reflex gate goes. In its place:

- **Guard**: held, costs stamina while up, covers the front arc, and reduces
  damage rather than negating it. Holding it is a choice with a cost, not a
  gamble on a frame.
- **Riposte**: landing a guard against a blow opens a 400ms window to answer.
  Generous on purpose — it is a reward for a read that already happened.

*Latency:* nothing here needs a window shorter than 400ms, which clears
160ms of staleness with room to spare.

### 3.3 Most damage travels

Basics keep their reach but gain a short travel time; ranged specials slow down
enough that leading a target is a skill. The exception is the dash-through
attacks, which are already a commitment.

*Latency:* no rewind, no shots behind cover, and the aiming error introduced by
ping is a constant lead the player learns rather than a coin flip.

### 3.4 Stamina

Attacking, dashing and guarding all draw on one bar that refills when you do
none of them. Running it dry leaves you open. This is what turns a fight into a
conversation about spacing: you cannot simply hold every button.

### 3.5 Slower, longer fights

Time to kill goes up. A single mistake — including one caused by a spike in
someone's connection — stops being fatal, and a fight has room for a second
decision.

## 4. How we would know it worked

The point of the simulation is that none of this has to be argued about.

- **Every counterplay window ≥ 350ms.** A check over the kits, failing if any
  window a player must hit is shorter than reaction time plus our own measured
  staleness.
- **Class balance holds.** `scripts/sim-balance.mjs 300` — every class inside
  the noise band, as now.
- **Time to kill rises without fights stalling.** Measured in the same run.
- **A laggy player is not a dead player.** The simulation can run two clients at
  different latencies against each other and report the win rate gap. That is
  the number this whole rework exists to move.

## 5. What is not changing

The Wilds is the game and it stays: your stake buys a bounty, a kill takes the
whole of it, a Moon Gate is how you leave with it, Blood Moons still move the
fight, and the boons are untouched. If this rework works, the same room plays
slower and reads better, and nobody has to learn a new economy to find out.

[latency]: https://en.wikipedia.org/wiki/Lag_(video_games)
[phases]: https://mordhau.fandom.com/wiki/Attack_Phases
[projectiles]: https://overwatch.fandom.com/wiki/Projectile
[cover]: https://brawlstars.vpesports.com/how-to-read-brawl-stars-maps-and-improve-positioning/
