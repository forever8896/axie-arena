# Lunacy — Combat Design

How Lunacy's combat numbers were chosen, and what they are based on.

Lunacy is a free-for-all, top-down arena brawler: six Axie classes, mouse-aimed
abilities, one field. Its closest relatives are **Battlerite** (top-down arena
brawler, every ability aimed, energy-gated power) and **Brawl Stars** (top-down
class brawler, supers charged by landing hits, concealing bushes, a shrinking
Showdown map). League of Legends and Dota inform the deeper systems: crowd
control, balance targets, readability.

---

## 1. What the research says

### Charge power by landing hits, not only by waiting
Battlerite gives Energy for attacking or healing, spent on empowered abilities or
saved for an Ultimate. Brawl Stars charges a Super per landed hit — El Primo
gains 8.4% per punch — and Hypercharge fills from dealing damage. Both reward
aggression and let a player who is winning the exchange reach their strongest
tool mid-fight.

### Counterplay beats invulnerability on offence
Stunlock rejected a teleport for Raigon because it "would require invulnerability
frames, restricting counterplay and creating unfair hit detection." They shipped a
dash that stops on contact instead. Offensive movement should be answerable.

### Power has to look powerful
"A powerful ability needs to look powerful or else it will feel lackluster" —
Stunlock. Getting hit by a big ability should be clearly readable to both sides.

### Dodgeable means beating a 250ms reaction
Controlled measurements put human reaction at roughly 250ms (≈200ms eye to hand,
plus movement). One action-game devlog tuned attack timing to a 215ms reaction
and saw dodge rates rise from 30–40% to 70–80%. A skillshot that lands before a
player can react and move out of it is not a skillshot.

### Crowd control needs limits
League clamps reduced crowd control to a 0.3s floor and lets Tenacity shorten
stuns, slows, roots and silences. Uncapped repeated stuns remove the victim from
the game.

### Hit-stop scales with damage, and is restrained in free-for-alls
Sakurai: "the more damage an attack inflicts, the longer the hitstop period," with
a hard cap. Both attacker and defender freeze for the same time. Projectiles get
comparatively less. In free-for-alls he limits it, because a third player can
walk in and strike during someone else's freeze frames.

### Time-to-kill sets the whole pace
Low TTK favours positioning and punishes mistakes with no window to react. Higher
TTK "gives the person being attacked a greater chance to fight back." Class-based
games sit relatively high so combatants have time to interact.

### Force the engagement
Brawl Stars Showdown starts poison clouds 20 seconds in, closing the map. The gas
deals 20% of max health per second and escalates the longer you stay. Matches end
because the arena makes them end.

### Balance against a target, not against feel
Riot treats a champion as underpowered at ≤49% win rate, and lowers the
overpowered threshold the more a champion is banned (52.5% at five times the
average ban rate). Balance is a measured band around 50%, not a hunch.

---

## 2. Audit of Lunacy before this pass

| Measure | Before | Problem |
| --- | --- | --- |
| Time-to-kill (basics, 5 HP target) | 1.15–3.30s | Fights end before anything else matters |
| Special cooldown | 6–9s, time only | Longer than 2–7 whole fights; no reward for landing hits |
| Bird feather at 150–250u | 277–462ms travel | Not dodgeable after a 250ms reaction |
| Hit-stop | Freezes the entire arena on every hit | Six-way free-for-all stutters constantly |
| Stun | 1.3s, repeatable | Stun-lock possible |
| Beast Impale | Invulnerable while charging | No counterplay |
| Enemy health | Not shown | No way to judge a fight before taking it |
| Engagement pressure | None | Bots and players can stall indefinitely |

---

## 3. Changes

### Health and damage, rescaled for a ~5–6s TTK
Health moves to the thousands and damage to the hundreds — the Brawl Stars
convention, and big numbers read as impact. Every basic was retuned so sustained
basic damage kills a ~3000 HP target in roughly **5–6.5 seconds**. That is long
enough for a dash, a special and a disengage to happen inside one fight.

| Class | HP | Basic | Sustained DPS | TTK vs 3000 |
| --- | ---: | --- | ---: | ---: |
| Beast | 3400 | 400 every 720ms | 556 | 5.4s |
| Aquatic | 2800 | 2 × 125 every 460ms | 543 | 5.5s |
| Plant | 3800 | 330 every 600ms | 550 | 5.5s |
| Bird | 2200 | 180 every 320ms, long reach | 563 | 5.3s |
| Bug | 2800 | 220 every 540ms + poison | ~520 | 5.8s |
| Reptile | 3200 | 300 every 660ms, 205° arc | 455 | 6.6s |

Reptile trades DPS for the widest arc; bird trades health for reach.

### Specials charge from landing hits
Each basic that connects adds charge (Brawl Stars model); a slow passive trickle
fills the rest so a kited player is never locked out. Roughly **four to five
landed basics** ready a special, which lands inside one fight.

### Telegraphs sized to the 250ms reaction window
Specials wind up with a visible ground telegraph before they fire. Projectiles
were slowed so that, from the telegraph at typical engagement range, a target
that reacts at 250ms still has time to sidestep.

### Local, damage-scaled hit-stop
Hit-stop now freezes only the attacker and the victim, never the arena. Duration
scales with damage and is capped; projectile hits get half.

### Crowd control immunity
After a stun ends, the target is immune to further stuns for 1.5s (the Battlerite
approach), so a stun is a punish rather than a lockdown.

### Impale loses its invulnerability
Beast still charges through rivals, but can be hit while doing it.

### Overhead health bars
Every Axie shows its health, so a player can see a fight is winnable before
taking it.

### The Wilds close in
From 30 seconds, the safe field shrinks toward the centre. Outside it, damage
starts low and escalates, so the match always ends.

---

## 4. Measured balance

Balance is checked with a headless simulation, following the shape of Riot's
framework: judge by measured win rate against a band, not by feel.

**Run it:** start the dev server and open `http://localhost:5173/?sim=120`.
It plays bot-only free-for-alls with update-only stepping, rotates which class
takes the centre spawn, and reports win rate, average placement, match length,
and the noise level for that sample size.

**Reading it:** a fair class wins 1 in 6 (16.7%). At 90 matches one standard
deviation is about ±3.9 points; the report only flags a class beyond two.
Bots chase in straight lines and ignore foliage, which flatters long reach, so
treat results as a check for gross imbalance rather than human-vs-human truth.
That said, a match is you against five bots, so bot balance is the experience.

### History

**Harness bugs, found before any class change was trusted.** The first three
runs were invalid. Game time was restarted from `performance.now()` each match,
which put a new match's clock behind the scene's existing one and stalled it:
the closing field never activated in five of every six matches. A second edge
then had the field born fully closed after each yield, producing 8-second
matches. The harness now uses one monotonic clock, re-stamps the field start,
and throws if the field never activates or a match ends under 15 seconds.

**Pacing, from research rather than from the invalid runs.** The field's 280u
floor could never force an end, so it now closes fully; it starts at 20s,
matching Showdown's gas. Bot aggro rose from 320u to 480u for a 2400u field.

| Run | Matches | Draws | Avg length | Beast | Aquatic | Plant | Bird | Bug | Reptile |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 90 | 0 | 76.8s | 26.7% | 18.9% | 7.8% | **32.2%** | 6.7% | 7.8% |
| Pass 1 | 90 | 0 | 76.7s | **35.6%** | 7.8% | 13.3% | 16.7% | 11.1% | 15.6% |

**Pass 1.** Bird (+15.6pt) lost 150 HP and 25 basic damage; its reach is its
identity, so reach stayed. Beast lost 40 basic damage. Plant — slowest and
shortest reach, so it was kited — gained 15 speed, 12 reach and 40 zone tick
damage. Reptile, which placed well but rarely closed out, gained 40 damage.
Bug gained 30 bite, 30 poison per tick and 10 speed.

Result: bird, reptile and plant landed in the band. Beast rose to +18.9pt,
about five sigma, because the basic nerf missed the source and its main rival
had been pulled back.

**Pass 2.** Beast: Impale 700 → 520, health 3400 → 3150. Aquatic, which fell
without being touched as everyone else moved: two-hit basic 125 → 140.

| Pass 2 | 120 | 0 | 79.7s | 12.5% | 12.5% | 10.8% | **35.0%** | 12.5% | 16.7% |
| Pass 3 | 120 | 0 | 75.8s | 25.0% | 15.0% | 10.0% | 21.7% | **4.2%** | 24.2% |

**Pass 2 result.** Beast fell from 35.6% to 12.5% and five of six classes landed
inside two sigma. Bird jumped from 16.7% to 35.0% without being touched.

That was the most useful result of the exercise: **beast was bird's only real
counter.** Impale is the one tool that closes the gap through bird's reach, so
weakening it freed bird. Pass 1's "bird is balanced" had really been "beast was
suppressing bird". These classes form a rock-paper-scissors web; they are not
six independent dials.

**Pass 3.** Bird was the fastest class *and* had the longest reach, which made it
uncatchable by anything chasing it. It keeps both titles by smaller margins:
speed 265 → 255, reach 152 → 138, health 2050 → 1900. Result: bird 21.7%,
inside the band.

**A mechanical bug the data exposed.** Bug stayed last through two buffs, which
looked wrong for a numbers problem. It was not one. Bug bites every 540ms and
poison ticked 900ms after each application, and every bite reset that timer —
so **poison dealt no damage at all while bug was actually fighting.** Reapplying
now refreshes remaining ticks without pushing back a scheduled one. Verified by
running the shipped `applyPoison`/`tickPoison` against a fake clock on bug's real
bite rhythm: 0 damage over 4.5s before the fix, 480 after.

Poison had been raised 90 → 120 in pass 1 to compensate for damage that was
never landing; with the mechanic fixed that would overshoot, so it is back at 90.

**Beast (+8.3pt) and reptile (+7.5pt)** sit just past two sigma in pass 3. That is
close enough to noise that neither was changed; a longer run should decide.

**Not yet measured:** the poison fix. The next simulation run is the first one
where bug fights as designed.

---

## 5. Parry

### What the research says

**The counter is the soul of an arena brawler.** In Battlerite most champions
had a short defensive stance that punished anyone who attacked into it.
"Attacking into it results in punishment, not attacking gives the enemy free
time, and baiting it allows punishing the cooldown" — every high-level fight
was a counter mind-game first and a damage race second.

**A parry must be tight enough to feel like a parry.** "If you attempt a parry
a full second too early and it still counts, that no longer feels like a parry,
it just feels like a counter." Windows in shipped games: Street Fighter III ~10
frames (~167ms), Dark Souls 6 frames at 30fps (200ms, criticised as too hard),
Sekiro half a second (deliberately generous, and it shrinks if spammed).

**Missing one has to cost something.** Street Fighter III locks out another
parry for 23 frames (383ms) after an attempt. Blocking is low-risk, low-reward;
parrying is high-risk, high-reward.

**Landing one has to pay.** For Honor guarantees a ~600ms punish after a heavy
parry. Steel Carnelian refills resources on a parry. ULTRAKILL freezes the
whole game for a moment so the player feels it.

**Not everything should be parryable.** "If everything in a game is reliably
parriable, the space-and-time elements of a combat system start to break down.
Positioning no longer matters." Parry should sit alongside dodging, not replace
it.

### The design

| Rule | Value | From |
| --- | --- | --- |
| Active window | 200ms | between SF3 and Dark Souls; Sekiro's 500ms reads as a counter |
| Whiff recovery | 380ms, planted at 40% speed, no attack / dash / special | SF3's 23-frame lockout |
| Cooldown | 1.4s | anti-spam, Sekiro's decaying window |
| Success: attacker | staggered 650ms, attack cut off, a charge stopped dead | For Honor's ~600ms punish |
| Success: defender | +35% special charge, no recovery, 140ms freeze, clang, flash | Steel Carnelian refill, ULTRAKILL freeze |
| Coverage | front 200° only | positioning must matter |
| Parryable | basics, Impale, Tail Sweep | melee-range blows |
| Not parryable | Undertow, projectiles, spore zones, poison, the closing field | dodge those |

**The decision it creates.** A basic lands 165ms after the swing starts, faster
than the ~250ms reaction benchmark, so parrying a basic is a *read*. That is the
point: swing into a raised parry and eat a stagger; hold off and hand over free
time; or bait it out and punish the 380ms recovery. Specials telegraph for
260ms, so they can be parried on reaction — watching the ground marker pays.

**Undertow goes through a parry.** Water is not a blow you can meet. That
gives aquatic a role, the answer to a rival turtling behind parries, and it was
needed: with Undertow parryable, aquatic won 3.3% of 120 matches (−13.3pt, well
past the 2σ flag), because a parried two-hit basic loses both hits.

**Bots play the same game.** They read a rival bot's lunge (in reach, attack
ready) and parry it about half the time, gamble at a lower rate against the
player whose intent they cannot see, and raise a parry timed to land when a
telegraphed special arrives. An attacker notices a raised parry only after a
human-like 110–190ms, then holds off, and hovers just outside reach to punish
a whiff. While committed, a bot keeps facing the rival it parried.

The first version gambled constantly and saw parries instantly: 1% of 4,868
attempts succeeded, so parrying was noise. A diagnostic of each miss found
bots parrying blind, plus 52 of 115 misses landing *0ms* after the window
closed, where the blow and the deadline fall on the same frame. With reads,
reaction timing and one frame (17ms) of grace, success rose to 75% — about 18
parries per match — and the class spread held:

| Class | Win rate | vs fair (16.7%) |
| --- | --- | --- |
| aquatic | 20.0% | +3.3pt |
| bug | 19.2% | +2.5pt |
| beast | 17.5% | +0.8pt |
| reptile | 16.7% | +0.0pt |
| plant | 15.0% | −1.7pt |
| bird | 11.7% | −5.0pt |

120 matches, noise ±3.4pt at 1σ, nothing past 2σ; average 59.8s. Getting there
took two passes after Undertow: bug's unparryable stunning seeker left it at
25.8% (basic 250 → 225), and plant, now blocked on every chomp, got 330 → 355.

Verified in real matches by `scripts/headless/check-parry.mjs`, 17 checks: a
front parry blocks and staggers, refunds charge and leaves no recovery; a blow
from behind lands; a whiff recovers, slows and blocks action, then clears; the
cooldown holds; feathers pass through; Impale is parried on reaction and the
beast stopped; a bot holds off a raised parry and punishes its recovery. The checks step the
scene in exact 60fps increments rather than sampling the live loop: headless
Chromium renders WebGL in software at a few fps, and a 200ms window read at
130ms frame boundaries made them flaky.

### Two engine-level fixes found while verifying it

**One gameplay clock.** Combat mixes deadlines on `scene.time.now` (parry
windows, stuns, cooldowns) with timers that advance on frame delta (a blow
connecting, a telegraph). Phaser's default delta smoothing caps that delta at
one 60fps frame for the first 120 frames after the game starts or regains focus,
and clamps any frame over 200ms, while `time.now` keeps real time. Measured in
one session at ~7.6fps: a 1000ms timer fired at 7,833ms of `time.now` with
smoothing on, and at 1,017–1,067ms with it off. Below 60fps that would let a
correctly timed parry expire before the blow it was meant to catch. Smoothing is
now off.

**No hidden frame on the first hit.** Scheduling a basic's first hit with a
zero-delay timer deferred it to the next frame, adding a frame to the 165ms
connect the balance was measured on. It now starts immediately.
