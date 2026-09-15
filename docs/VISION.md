<p align="center"><img src="../public/brand/lunacy-logo.png" alt="Lunacy" width="520"></p>

# Lunacy — Product Vision

**Today:** a browser arena brawler where six Axie classes fight on a closing
meadow. It needs no wallet and no account, and every number in it is measured.
**Next:** *the Endless Wilds* — an arena that never closes. Drop in at any hour,
fight whoever is there, and leave when you choose, with what you earned.

This document covers:

1. What exists now.
2. Why an always-on arena is the right next step.
3. How staked play could work, tested against a model instead of assumed.
4. What has to be true before real value touches the game.

---

## 1. Where Lunacy is today (Round 1)

- **Real Axies, really animated.** Bodies come from the official mixer. Every
  class uses its own authored attack clips, played by our own reader of the
  animation data, with no Spine runtime (README).
- **Combat from research.** Time-to-kill, telegraphs, hit-stop, parry,
  power-ups and healing wells each cite the games they were learned from
  (docs/DESIGN.md).
- **Balance by measurement.** A headless simulation runs hundreds of bot
  matches per change. Every class sits inside the statistical noise band.
- **Verified in a real browser.** Three headless suites run the full loop,
  17 parry rules and 22 power-up and healing rules.
- **Wallet-free by design,** as Round 1 requires.

---

## 2. The Endless Wilds: an arena that never closes

### The problem it solves

A match-based game needs a full lobby before anyone plays. At launch, and at
3am in any timezone, that wait is where new players leave. A persistent
drop-in arena has no lobby at all: the moment you press play, you are in.

### How it plays

| Today (Showdown) | The Endless Wilds |
| --- | --- |
| Six fighters, one match, last one standing | Rooms of about 12, always running; join and leave any time |
| The closing field forces fights | **Moon cycles** force fights: every couple of minutes a Blood Moon moves a hotspot where Moonwells and power-ups cluster |
| Win by surviving | Win by what you carry out: kills build your **bounty**, shown as a glow above your head |
| Match ends | You end it: reach a **Moon Gate** and channel for a few seconds to extract; damage interrupts the channel |
| — | Spawn shield and a spawn-safe edge, so nobody is farmed the moment they arrive |
| — | Disconnecting leaves your Axie in the world for a few seconds, so nobody escapes a lost fight by closing the tab |

**The lobby shows who is there** before you join: rooms, how many people are
in each, the top bounty, and how many seats bots are filling. Showdown stays as
its own mode; the closing field is good design for a match, just not for a
world.

Extraction is borrowed on purpose. Extraction games such as Hunt: Showdown
and Dark and Darker are built on exactly this tension: *leave now with what
you have, or push for more and risk it all.* It turns every kill into a
decision instead of a number.

### Bots fill the quiet hours

Bots already play every class, parry, chase, heal and race for power-ups
(src/ai/BotBrain.js). In the Wilds they keep a room alive until people arrive,
then step out as humans fill their seats. Bots are **always labelled as bots**.

---

## 3. Stakes: designing the money before spending any

The starting proposal: *pay 1 AXS to join, earn 0.6 AXS per kill; bots fill
empty rooms and still pay out.*

Rather than argue for or against it, we modelled it
(`node scripts/economy/model.mjs`, seeded and reproducible).

**How the model works:**

- 2,000 players with a spread of skill each play 40 lives at 1 AXS, in rooms of 12.
- Fights are won on a skill-weighted coin flip. `k = 0.6` means luck matters a
  lot, as in a six-way brawl; `k = 1.2` means skill dominates.
- A player cashes out after a kill 30% of the time.

It compares rules; it does not forecast revenue.

### What the model says (k = 0.6)

| Rule | Returned to players | Operator keeps | Players ahead after 40 lives | Weakest quarter ahead | Strongest quarter ahead |
| --- | --- | --- | --- | --- | --- |
| **Proposed:** 1 in, 0.6 per kill, stake back if you leave | 69% | 31% | 17% | 0% | 60% |
| Same, skill-matched rooms | 69% | 31% | 3% | 3% | 6% |
| 10% cut: 0.9 per kill | 92% | 8% | 38% | 0% | 94% |
| **Bounty:** 10% entry fee, killer takes the victim's whole bounty | 90% | 10% | 34% | 2% | 83% |
| **Bounty, skill-matched rooms** | 90% | 10% | 35% | **37%** | 34% |

Four findings:

1. **The proposed split keeps about 31% of everything staked.** The 0.4 of each
   death goes to the operator, and the effective rate lands at 31% because
   stakes come back to players who leave alive. For comparison, Skillz, a major
   skill-based cash-competition platform, takes about 10% of entry
   fees ([Inc.](https://www.inc.com/will-yakowicz/skillz-cash-prize-video-game-platform.html)).
   At a 31% cut almost nobody stays ahead, and players who reliably lose
   money leave.
2. **Without matchmaking, the weakest players fund the strongest under every
   rule.** No payout rule fixes that; matching does. In skill-matched rooms at
   a 10% cut, over a third of the weakest quarter comes out ahead, about the
   same as the strongest quarter. At a 31% cut, matching only spreads the loss
   evenly.
3. **A flat per-kill payout rewards hit-and-run.** Taking one kill and leaving
   at once is the safest play. A bounty you must carry to a Moon Gate makes
   staying a real choice, and makes the leader everyone's target.
4. **Bots that pay out cannot work.** If a bot kill pays 0.6 AXS and dying to a
   bot costs the 1 AXS stake, anyone who beats bots 63% of the time profits.
   At two fights a minute, a strong player winning 75% nets
   +24 AXS an hour. An aim-assisted script winning 95% nets +62 AXS an hour,
   about 1,500 AXS a day per account, all paid by the treasury. That is no
   hypothetical risk: on-chain analysis has found around 40% of web3 gaming
   accounts to be bots
   ([CryptoSlate](https://cryptoslate.com/study-discovers-40-of-web3-gaming-accounts-are-bots-using-on-chain-data/)).
   The reverse, bots that *collect* players' stakes, means the operator
   profits from its own bots beating its customers. That is the house-banked
   gambling the model must never become.

### The recommended design

- **Stakes buy a bounty, not a ticket.** Enter with 1 AXS. At most 10% is the
  fee; the rest is your bounty, visible over your head. A kill absorbs the
  victim's bounty. Extract at a Moon Gate to cash out.
- **Stake tiers and skill-matched rooms.** Tiers such as 0.1, 1 and 5 AXS, each
  split by rating, so a new player's first stake is not a donation.
- **Bots never touch money.** Staked rooms are humans only and open when enough
  people are waiting; the lobby shows the count. Bot-filled rooms stay free.
- **Bot-filled play still earns — from a fixed pool.** Free rooms feed a
  seasonal leaderboard with a **capped prize pool**. This is the model Axie
  Origins moved to: Season 13 put 80,000 AXS into leaderboard rewards
  ([Invezz](https://invezz.com/news/2025/05/14/axs-eyes-80-surge-as-axie-infinitys-origins-season-13-kicks-off-with-massive-rewards/)).
  A fixed pool cannot be farmed for more than it holds, and ranking rewards
  skill, not hours of scripted grinding.
- **No emissions, ever.** Payouts come from what players stake and from fixed
  pools, never from minting rewards. Axie's own history is the lesson: when
  SLP was minted about four times faster than breeding burned it, SLP fell
  over 99% from its 2021 peak. Sky Mavis cut daily SLP issuance by 56% and
  moved Origins toward capped seasonal AXS rewards
  ([Decrypt](https://decrypt.co/92190/axie-infinity-making-big-changes-to-fix-its-ailing-play-to-earn-nft-economy),
  [Naavik](https://naavik.co/deep-dives/axie-infinity-part-2/)).
- **Balance before money.** A class winning 25% instead of 16.7% is a game
  flaw in a free mode, but a transfer of money from other players in a staked
  one. The balance simulation and live win-rate monitoring become a
  requirement for staked play, not a nice-to-have.

### How value would move

- **Deposits and withdrawals** happen on Ronin, into an audited escrow contract.
- **Fights settle off-chain,** on a server-authoritative ledger. Nothing
  on-chain happens per kill, so there is no gas or latency mid-fight.
- **Withdrawals are batched,** with identity checks where the law requires them.

---

## 4. What has to be true first

Real value is the last step, not the next one.

| Gate | Why | What satisfies it |
| --- | --- | --- |
| **Law** | Paid-entry skill contests are legal in many places but not all. Skillz blocks cash play in Arkansas, Connecticut, Delaware, Louisiana and South Dakota ([Skillz legal](https://www.skillz.com/legal/)), and rules vary widely outside the US. Crypto payouts add identity-check and anti-money-laundering duties. | A written legal opinion per launch market; geofencing; 18+; deposit and loss limits, cool-offs and self-exclusion |
| **Sky Mavis** | The Origins kit is licensed for Axie Vibeathon and Sky Mavis-approved programs only. AXS integration and brand use in a commercial mode need their agreement. | A written agreement before any staked or commercial release |
| **Fair play** | Money makes cheating profitable. | Server-authoritative combat, input validation, bot and multi-account detection, replayable fight logs for disputes |
| **Proof it is fun for free** | Retention has to come from the game, not the payout. | Target thresholds from free rooms, e.g. healthy day-1 and day-7 retention and 6+ humans per room at peak |
| **The competition** | Vibeathon entries must not require purchase, wallet or token. | Every Vibeathon build stays wallet-free; staking is roadmap only |

---

## 5. Axie Core: your Axie, your identity, not your power

- **Bring your own Axie.** Read-only Axie data drives the official mixer, so
  players fight as the Axie they own, with its real parts and colours.
- **Class sets the kit; parts are cosmetic.** Stats come from the class so a
  purchase never buys a win, which matters twice over when stakes are real.
- **Lunacia on the field.** Moonwells, Origins status effects and icons, and
  the meadow itself stay rooted in the Axie world.

---

## 6. Architecture path

| Today | Endless Wilds |
| --- | --- |
| Game logic runs in the browser; the balance simulation already runs it without rendering | The combat simulation moves into a shared module, run by an authoritative server at a fixed tick |
| Bots run in the browser | Bots run server-side and fill seats per room |
| One match | Rooms scale with demand; the lobby lists live rooms and counts |
| Headless checks per rule | The same checks run against the server simulation in CI |

The fixed-step simulation and deterministic test harness built for balance and
parry verification are exactly the foundation a server needs.

---

## 7. Roadmap

| Phase | When | Delivers | Money |
| --- | --- | --- | --- |
| **Round 1** | by Sep 21, 2026 | Showdown: six classes, parry, power-ups, Moonwells, balance simulation | None |
| **Round 2** | Oct 4–31, 2026 | Endless Wilds prototype (drop-in rooms with bots, Moon Gate extraction, bounty as score); bring your own Axie; live approved mixer | None |
| **Online beta** | after the Vibeathon, with Sky Mavis approval | Authoritative multiplayer, free rooms, seasonal leaderboard with a fixed pool | Fixed-pool rewards only |
| **Staked rooms** | only once every gate in section 4 is met | Bounty stakes, tiers, skill-matched rooms | Player stakes, 10% fee at most |

---

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| Rooms feel empty | Bots fill seats and hand them to humans; the lobby consolidates people into fewer, fuller rooms |
| Weaker players lose steadily | Skill-matched rooms and tiers (modelled above); free rooms stay first-class |
| Botting and multi-accounting | Bots and free rooms carry no per-kill value; staked rooms need verified humans |
| A class dominates | Balance simulation on every change, live win-rate monitoring, a 2σ band as the release gate |
| Regulatory change | Market-by-market opinions; staking is a separable layer the game never depends on |
| Reward economy collapses | No emissions; payouts only from stakes and fixed pools |
