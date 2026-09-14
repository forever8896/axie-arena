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
