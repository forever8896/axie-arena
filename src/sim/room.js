import SimArena from './arena.js'
import SimFighter from './fighter.js'
import SimBrain from './bots.js'
import { useBasic, useSpecial, resolveSwing, SimProjectile, SimZone } from './abilities.js'
import { Rng, Vec2, clamp, distance, lerp } from './math.js'
import { POWERUPS, POWERUP_RULES, MOONWELL, CLOSE } from '../arena/boonConfig.js'
import { WILDS, hunterName } from '../wilds/config.js'

/**
 * A room of the game, as the authority sees it.
 *
 * It owns the clock, the randomness and every rule: who is in the room, what
 * they are carrying, where the gates are, and what happened this tick. Clients
 * send inputs and draw what comes back; they decide nothing.
 *
 * Runs anywhere — a Node server, a test, or the page itself, which is how the
 * single-player modes use it.
 */
export default class SimRoom {
  constructor({ mode = 'wilds', room = null, seed = Date.now(), classes = [] } = {}) {
    this.mode = mode
    this.room = room
    this.rng = new Rng(seed)
    this.arena = new SimArena()
    this.classes = classes.length ? classes : ['beast', 'aquatic', 'plant', 'bird', 'bug', 'reptile']

    this.now = 0
    this.tickCount = 0
    this.fighters = []
    this.projectiles = []
    this.zones = []
    this.orbs = []
    this.wells = []
    this.gates = []
    this.caches = []
    this.timers = []
    this.events = []
    this.ids = 0

    this.bloodMoon = null
    this.nextBloodMoon = 45000
    this.nextOrbAt = POWERUP_RULES.firstAt
    this.nextWellAt = MOONWELL.firstAt
    this.orbBag = []
    this.target = room ? this.rng.int(...room.hunters) : 0
    this.retargetAt = 0
    this.lastJoin = -Infinity
    this.ledger = { created: 0, fees: 0, extracted: 0 }
    this.entry = room ? (room.free ? room.stake : room.stake * (1 - WILDS.feeRate)) : 0

    this.field = mode === 'showdown' ? new SimField(this) : null
    this.over = false
  }

  nextId(prefix = 'f') {
    return `${prefix}${++this.ids}`
  }

  event(e) {
    this.events.push(e)
  }

  /** Runs `fn` after `ms` of simulated time. */
  after(ms, fn) {
    this.timers.push({ at: this.now + ms, fn })
  }

  // --- Population ---------------------------------------------------------

  addFighter({ axieClass, isPlayer = false, name, x, y, bot = false, bounty = null, brainOptions }) {
    const cls = axieClass ?? this.rng.pick(this.classes)
    const spot = x == null ? this.safeSpawn() : { x, y }
    const f = new SimFighter(this, {
      id: this.nextId(isPlayer ? 'u' : 'b'), axieClass: cls, isPlayer, name: name ?? cls, x: spot.x, y: spot.y,
    })
    if (bot) f.brain = new SimBrain(f, brainOptions)
    if (this.room) {
      f.wilds = {
        bounty: bounty ?? this.entry,
        kills: 0,
        joinedAt: this.now,
        goal: this.entry * this.rng.float(2.2, 4.5),
        patience: this.rng.int(60000, 180000),
        leaving: false,
      }
      this.ledger.created += f.wilds.bounty
      f.spawnShieldUntil = this.now + WILDS.spawnShieldMs
      f.invulnerableUntil = Math.max(f.invulnerableUntil, f.spawnShieldUntil)
    }
    this.fighters.push(f)
    this.event({ t: 'join', id: f.id, cls, name: f.name, bot, x: spot.x, y: spot.y })
    return f
  }

  remove(f) {
    this.fighters = this.fighters.filter(x => x !== f)
  }

  safeSpawn() {
    const alive = this.fighters.filter(f => f.alive)
    return this.arena.openSpot(this.rng, {
      clearance: 60,
      score: (x, y) => Math.min(900, ...alive.map(f => distance(x, y, f.x, f.y)), 900),
    })
  }

  // --- Input --------------------------------------------------------------

  useBasic(f) {
    return useBasic(f, this.fighters, this.now)
  }

  /** A swing has reached its contact frame: resolve what it hits. */
  strike(fighter, swing) {
    resolveSwing(fighter, swing)
  }

  useSpecial(f, aimPoint) {
    return useSpecial(f, this.fighters, this.now, aimPoint)
  }

  addProjectile(opts) {
    const p = new SimProjectile(this, opts)
    this.projectiles.push(p)
    this.event({ t: 'shot', id: p.id, cls: opts.owner.axieClass, x: p.pos.x, y: p.pos.y, a: p.angle, seeking: p.seeking })
    return p
  }

  addZone(opts) {
    const z = new SimZone(this, opts)
    this.zones.push(z)
    return z
  }

  /**
   * One player's intent for this tick. Inputs are applied where they arrive;
   * the simulation never trusts a position from a client.
   */
  applyInput(f, input) {
    if (!f?.alive || !input) return
    if (input.aim != null) f.aim = input.aim
    if (input.move) {
      f.intent.set(clamp(input.move.x, -1, 1), clamp(input.move.y, -1, 1))
    }
    // Held first: raising a guard and swinging are mutually exclusive, and the
    // swing wins, so a player who asks for both gets the attack.
    if (input.guard && !input.attack) f.hold(this.now)
    if (input.attack) this.useBasic(f)
    if (input.special) this.useSpecial(f, input.point ?? { x: f.x + Math.cos(f.aim) * 200, y: f.y + Math.sin(f.aim) * 200 })
    if (input.dash) f.dash(f.intent, this.now)
    if (input.parry) f.parry(this.now)
  }

  // --- Frame --------------------------------------------------------------

  step(dt) {
    this.now += dt
    this.tickCount++

    // Timers first: a blow scheduled for this moment lands this tick.
    if (this.timers.length) {
      const due = this.timers.filter(t => t.at <= this.now)
      if (due.length) {
        this.timers = this.timers.filter(t => t.at > this.now)
        for (const t of due) t.fn()
      }
    }

    for (const f of this.fighters) f.brain?.update(this.now, this.fighters)
    for (const f of this.fighters) f.update(dt)
    for (const p of this.projectiles) p.update(dt, this.fighters)
    for (const z of this.zones) z.update(dt, this.fighters)
    this.projectiles = this.projectiles.filter(p => !p.dead)
    this.zones = this.zones.filter(z => !z.dead)

    this.field?.update(dt)
    this.updateOrbs()
    this.updateWells()
    if (this.room) this.updateWilds()
    this.prune()
  }

  prune() {
    const now = this.now
    for (const f of this.fighters) if (!f.alive && !f.goneAt) f.goneAt = now
    this.fighters = this.fighters.filter(f => f.alive || now - f.goneAt < 1500)
  }

  /** Everything a client needs to draw the room this tick. */
  snapshot() {
    return {
      t: Math.round(this.now),
      tick: this.tickCount,
      fighters: this.fighters.map(f => f.snapshot()),
      shots: this.projectiles.map(p => p.snapshot()),
      zones: this.zones.map(z => z.snapshot()),
      orbs: this.orbs.filter(o => !o.dead).map(o => ({ id: o.id, x: Math.round(o.x), y: Math.round(o.y), type: o.type, live: o.live })),
      wells: this.wells.filter(w => !w.dead).map(w => ({ id: w.id, x: Math.round(w.x), y: Math.round(w.y), r: Math.round(w.radius), blooming: w.blooming })),
      gates: this.gates.filter(g => g.open).map(g => ({ id: g.id, x: Math.round(g.x), y: Math.round(g.y), closing: g.closing })),
      caches: this.caches.map(c => ({ id: c.id, x: Math.round(c.x), y: Math.round(c.y), amount: Math.round(c.amount * 1000) / 1000 })),
      moon: this.bloodMoon ? { x: Math.round(this.bloodMoon.x), y: Math.round(this.bloodMoon.y), r: this.bloodMoon.radius } : null,
      field: this.field ? { r: Math.round(this.field.radius), active: this.field.active, until: this.field.secondsUntil } : null,
    }
  }

  /** Events since the last call, for effects and sounds. */
  drainEvents() {
    const out = this.events
    this.events = []
    return out
  }

  // --- Power-ups ----------------------------------------------------------

  updateOrbs() {
    if (this.now >= this.nextOrbAt) {
      this.nextOrbAt = this.now + POWERUP_RULES.every
      if (this.orbs.filter(o => !o.dead).length < POWERUP_RULES.maxOnField) this.spawnOrb()
    }
    for (const orb of this.orbs) {
      if (orb.dead) continue
      if (!orb.live && this.now >= orb.liveAt) {
        orb.live = true
        this.event({ t: 'orb-live', id: orb.id })
      }
      if (!orb.live) continue
      if (this.now >= orb.expiresAt) {
        orb.dead = true
        this.event({ t: 'orb-gone', id: orb.id })
        continue
      }
      for (const f of this.fighters) {
        if (!f.alive) continue
        if (distance(f.x, f.y, orb.x, orb.y) > f.bodyRadius + POWERUP_RULES.pickupRadius) continue
        const def = POWERUPS[orb.type]
        f.applyPowerUp(orb.type, def)
        orb.dead = true
        this.event({ t: 'orb-taken', id: orb.id, by: f.id, type: orb.type, x: f.x, y: f.y })
        break
      }
    }
    this.orbs = this.orbs.filter(o => !o.dead)
  }

  spawnOrb(at) {
    if (!this.orbBag.length) this.orbBag = this.rng.shuffle(Object.keys(POWERUPS))
    const type = this.orbBag.pop()
    const spot = at ?? this.arena.openSpot(this.rng, {
      clearance: 60, away: this.fighters.filter(f => f.alive), minAway: 160,
      score: (x, y) => this.orbs.some(o => !o.dead && distance(x, y, o.x, o.y) < 380) ? -1000 : 0,
    })
    const orb = {
      id: this.nextId('o'), type, x: spot.x, y: spot.y, live: false, dead: false,
      liveAt: this.now + POWERUP_RULES.warnMs,
      expiresAt: this.now + POWERUP_RULES.warnMs + POWERUP_RULES.lifetimeMs,
    }
    this.orbs.push(orb)
    this.event({ t: 'orb', id: orb.id, type, x: orb.x, y: orb.y })
    return orb
  }

  // --- Moonwells ----------------------------------------------------------

  updateWells() {
    if (this.now >= this.nextWellAt && !this.wells.some(w => !w.dead)) {
      this.nextWellAt = this.now + MOONWELL.every + this.rng.int(-MOONWELL.jitter, MOONWELL.jitter)
      this.spawnWell()
    }
    for (const w of this.wells) {
      if (w.dead) continue
      if (this.now < w.activeAt) continue
      if (!w.started) {
        w.started = true
        this.event({ t: 'well-open', id: w.id })
      }
      if (this.now >= w.nextTick) {
        w.nextTick = this.now + MOONWELL.tickMs
        for (const f of this.fighters) {
          if (!f.alive || f.hp >= f.maxHp) continue
          if (distance(f.x, f.y, w.x, w.y) > w.radius) continue
          if (this.now - f.lastHurtAt < MOONWELL.hurtLockoutMs) continue
          const want = f.maxHp * MOONWELL.healFracPerSec * MOONWELL.tickMs / 1000
          const amount = Math.min(want, w.poolLeft, f.maxHp - f.hp)
          if (amount <= 0) continue
          f.heal(amount)
          w.poolLeft -= amount
          this.healed = (this.healed ?? 0) + amount
          this.event({ t: 'heal', id: f.id, amount: Math.round(amount) })
        }
      }
      if (this.now >= w.activeUntil || w.poolLeft <= 1) {
        w.dead = true
        w.ending = true
        this.event({ t: 'well-gone', id: w.id })
      }
    }
    this.wells = this.wells.filter(w => !w.dead)
  }

  spawnWell(at) {
    const alive = this.fighters.filter(f => f.alive)
    const spot = at ?? this.arena.openSpot(this.rng, {
      clearance: MOONWELL.radius,
      // Near someone on their own, away from the crowd.
      score: (x, y) => {
        const d = alive.map(f => distance(x, y, f.x, f.y)).sort((a, b) => a - b)
        if (!d.length) return 0
        return -Math.abs(d[0] - 380) * 0.3 + Math.min(d[1] ?? 900, 900) * 0.4
      },
    })
    const well = {
      id: this.nextId('w'), x: spot.x, y: spot.y, poolLeft: MOONWELL.pool,
      activeAt: this.now + MOONWELL.bloomMs,
      activeUntil: this.now + MOONWELL.bloomMs + MOONWELL.activeMs,
      nextTick: this.now + MOONWELL.bloomMs,
      dead: false, ending: false, started: false,
      get blooming() { return false },
    }
    Object.defineProperty(well, 'blooming', { get: () => this.now < well.activeAt })
    Object.defineProperty(well, 'radius', {
      get: () => MOONWELL.radius * (0.55 + 0.45 * well.poolLeft / MOONWELL.pool),
    })
    this.wells.push(well)
    this.event({ t: 'well', id: well.id, x: well.x, y: well.y })
    return well
  }

  get hotspot() {
    return this.bloodMoon
  }

  // --- The Wilds ----------------------------------------------------------

  /** Opens the room: gates, the hunters already in it, and the first cycle. */
  openWilds({ hunters, topBounty } = {}) {
    this.gates = this.gateSites().map((site, i) => ({
      id: `g${i}`, x: site.x, y: site.y, open: false, closingAt: 0, replacement: null,
      get closing() { return this.open && this.closingAt > 0 },
    }))
    for (const g of this.rng.shuffle([...this.gates]).slice(0, WILDS.gatesOpen)) g.open = true
    this.nextGateMove = this.now + WILDS.gateRotateMs

    const veterans = hunters ?? this.target
    const multipliers = [1, 1, 1, 1.6, 2, 2.5, 3.2]
    for (let i = 0; i < veterans; i++) {
      this.addFighter({ bot: true, name: hunterName(new Set(this.fighters.map(f => f.name))), bounty: this.entry * this.rng.pick(multipliers) })
    }
    if (topBounty && this.fighters.length) {
      const top = this.fighters.reduce((a, b) => (b.wilds.bounty > a.wilds.bounty ? b : a))
      this.ledger.created += topBounty - top.wilds.bounty
      top.wilds.bounty = topBounty
    }
    this.nextBloodMoon = this.now + 45000
  }

  /** Four candidate gate sites, one per quadrant, clear of cover. */
  gateSites() {
    const b = this.arena.bounds
    return [[0.2, 0.22], [0.8, 0.22], [0.2, 0.8], [0.8, 0.8]].map(([fx, fy]) => {
      for (let i = 0; i < 60; i++) {
        const x = lerp(b.left, b.right, fx) + this.rng.int(-120, 120)
        const y = lerp(b.top, b.bottom, fy) + this.rng.int(-100, 100)
        if (!this.arena.wallAt(x, y, WILDS.gateRadius + 30) && !this.arena.inBush(x, y)) return { x, y }
      }
      return { x: lerp(b.left, b.right, fx), y: lerp(b.top, b.bottom, fy) }
    })
  }

  /** A player pays a stake and joins. Returns the fighter. */
  joinPlayer({ axieClass, name = 'You' }) {
    const f = this.addFighter({ axieClass, isPlayer: true, name })
    if (this.room && !this.room.free) this.ledger.fees += this.room.stake * WILDS.feeRate
    return f
  }

  updateWilds() {
    const now = this.now
    this.updateGates(now)
    this.updatePopulation(now)
    this.updateBloodMoon(now)

    for (const f of this.fighters) {
      if (!f.alive || !f.wilds) continue
      if (f.brain) this.decide(f, now)
      this.updateChannel(f, now)
      this.collectCaches(f)
    }
  }

  /** A stand-in decides when it has had enough. */
  decide(bot, now) {
    const w = bot.wilds
    if (w.leaving) return
    const hurt = bot.hp / bot.maxHp < 0.35
    if (w.bounty >= w.goal ||
        (now - w.joinedAt > w.patience && w.bounty >= this.entry) ||
        (hurt && w.bounty >= this.entry * 1.8)) {
      w.leaving = true
      this.event({ t: 'leaving', id: bot.id })
    }
  }

  /** Where a bot is heading instead of fighting, if anywhere. */
  botGoal(bot) {
    const w = bot.wilds
    if (!w) return null
    if (w.leaving) {
      const gate = this.nearestGate(bot, true)
      if (gate) return { x: gate.x, y: gate.y, stop: 18 }
    }
    let best = null
    let bestD = 600
    for (const c of this.caches) {
      const d = distance(bot.x, bot.y, c.x, c.y)
      if (d < bestD) { best = { x: c.x, y: c.y, stop: 0 }; bestD = d }
    }
    return best
  }

  nearestGate(f, usable = false) {
    let best = null
    let bestD = Infinity
    for (const g of this.gates) {
      if (!g.open) continue
      const d = distance(f.x, f.y, g.x, g.y)
      if (usable && g.closing && g.closingAt - this.now < (d / Math.max(1, f.speed)) * 1000 + WILDS.extractMs + 500) continue
      if (d < bestD) { bestD = d; best = g }
    }
    return best
  }

  updateGates(now) {
    if (now >= this.nextGateMove) {
      this.nextGateMove = now + WILDS.gateRotateMs
      const open = this.gates.filter(g => g.open && !g.closing)
      const closed = this.gates.filter(g => !g.open)
      if (open.length && closed.length) {
        const going = this.rng.pick(open)
        going.closingAt = now + WILDS.gateWarnMs
        going.replacement = this.rng.pick(closed)
        this.event({ t: 'gate-closing', id: going.id })
      }
    }
    for (const g of this.gates) {
      if (g.closing && now >= g.closingAt) {
        g.open = false
        g.closingAt = 0
        if (g.replacement) {
          g.replacement.open = true
          this.event({ t: 'gate-open', id: g.replacement.id })
        }
        g.replacement = null
      }
    }
  }

  updatePopulation(now) {
    if (now >= this.retargetAt) {
      this.retargetAt = now + this.rng.int(...WILDS.retargetMs)
      this.target = this.rng.int(...this.room.hunters)
    }
    const staying = this.fighters.filter(f => f.alive && f.brain && !f.wilds.leaving)
    const present = this.fighters.filter(f => f.alive).length
    if (staying.length < this.target && present < WILDS.maxHunters && now - this.lastJoin > WILDS.joinGapMs) {
      this.lastJoin = now
      const f = this.addFighter({ bot: true, name: hunterName(new Set(this.fighters.map(x => x.name))) })
      if (!this.room.free) this.ledger.fees += this.room.stake * WILDS.feeRate
    } else if (staying.length > this.target + 1) {
      this.rng.pick(staying).wilds.leaving = true
    }
  }

  updateBloodMoon(now) {
    if (this.bloodMoon && now >= this.bloodMoon.until) {
      this.bloodMoon = null
      this.event({ t: 'moon-end' })
    }
    if (!this.bloodMoon && now >= this.nextBloodMoon) {
      this.nextBloodMoon = now + WILDS.bloodMoonEvery
      const spot = this.arena.openSpot(this.rng, { clearance: 160 })
      this.bloodMoon = { x: spot.x, y: spot.y, radius: WILDS.bloodMoonRadius, until: now + WILDS.bloodMoonMs }
      this.spawnWell({ x: spot.x, y: spot.y })
      for (const a of [0, Math.PI]) {
        this.spawnOrb({ x: spot.x + Math.cos(a) * 170, y: spot.y + Math.sin(a) * 60 })
      }
      this.event({ t: 'moon', x: spot.x, y: spot.y, r: WILDS.bloodMoonRadius })
    }
  }

  /** Standing in an open gate cashes out; a hit or your own blow restarts it. */
  updateChannel(f, now) {
    const gate = this.gates.find(g => g.open && distance(f.x, f.y, g.x, g.y) <= WILDS.gateRadius)
    if (!gate) {
      f.channel = null
      return
    }
    if (!f.channel || f.channel.gate !== gate) f.channel = { gate, startedAt: now }
    const since = f.channel.startedAt
    if (f.lastHurtAt > since || f.lastAttack > since || f.lastSpecial > since) {
      f.channel.startedAt = now
      f.channel.interruptedAt = now
    }
    f.channel.progress = clamp((now - f.channel.startedAt) / WILDS.extractMs, 0, 1)
    if (f.channel.progress >= 1) this.extract(f)
  }

  extract(f) {
    const amount = f.wilds.bounty
    f.wilds.bounty = 0
    f.channel = null
    this.ledger.extracted += amount
    this.event({ t: 'extract', id: f.id, amount, x: f.x, y: f.y, player: f.isPlayer })
    f.vanish()
  }

  /** Called by a fighter going down: the killer takes the whole bounty. */
  onFighterDown(fighter, killer) {
    const w = fighter.wilds
    if (!w) return
    const lost = w.bounty
    w.bounty = 0
    const taker = [killer, fighter.lastHitBy].find(k => k && k !== fighter && k.alive && k.wilds)
    if (taker) {
      taker.wilds.bounty += lost
      taker.wilds.kills++
      this.event({ t: 'bounty', id: taker.id, from: fighter.id, amount: lost })
    } else if (lost > 0) {
      this.dropCache(fighter.x, fighter.y, lost)
    }
  }

  /** A fighter left carrying something: it falls where they stood. */
  onVanish(f) {
    const amount = f.wilds?.bounty ?? 0
    if (amount <= 0) return
    f.wilds.bounty = 0
    this.dropCache(f.x, f.y, amount)
  }

  dropCache(x, y, amount) {
    const cache = { id: this.nextId('c'), x, y, amount }
    this.caches.push(cache)
    this.event({ t: 'cache', id: cache.id, x, y, amount })
  }

  collectCaches(f) {
    for (const c of this.caches) {
      if (c.taken) continue
      if (distance(f.x, f.y, c.x, c.y) > f.bodyRadius + 24) continue
      c.taken = true
      f.wilds.bounty += c.amount
      this.event({ t: 'cache-taken', id: c.id, by: f.id, amount: c.amount })
    }
    this.caches = this.caches.filter(c => !c.taken)
  }

  /** Leaving without a gate: the bounty stays in the room. */
  forfeit(f) {
    if (!f?.alive) return 0
    const amount = f.wilds?.bounty ?? 0
    f.vanish()   // onVanish drops what they were carrying
    return amount
  }

  get inPlay() {
    return this.fighters.reduce((s, f) => s + (f.alive && f.wilds ? f.wilds.bounty : 0), 0)
  }

  get cached() {
    return this.caches.reduce((s, c) => s + c.amount, 0)
  }

  /** Zero when no value has been created or destroyed. */
  get imbalance() {
    return this.ledger.created - this.ledger.extracted - this.inPlay - this.cached
  }
}

/** The closing field, for the balance simulation's last-one-standing mode. */
class SimField {
  constructor(room) {
    this.room = room
    this.cx = room.arena.cx
    this.cy = room.arena.cy
    this.maxRadius = Math.hypot(2400, 1800) / 2 + 60
    this.radius = this.maxRadius
    this.startedAt = 0
    this.nextTick = 0
  }

  get active() { return this.room.now - this.startedAt >= CLOSE.startsAt }

  get progress() {
    const t = this.room.now - this.startedAt - CLOSE.startsAt
    return clamp(t / CLOSE.duration, 0, 1)
  }

  get secondsUntil() {
    return Math.max(0, Math.ceil((CLOSE.startsAt - (this.room.now - this.startedAt)) / 1000))
  }

  outside(x, y, pad = 0) {
    return distance(x, y, this.cx, this.cy) > this.radius - pad
  }

  radiusIn(ms) {
    const t = this.room.now + ms - this.startedAt - CLOSE.startsAt
    const p = clamp(t / CLOSE.duration, 0, 1)
    const eased = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2
    return lerp(this.maxRadius, CLOSE.minRadius, eased)
  }

  update() {
    const p = this.progress
    const eased = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2
    this.radius = lerp(this.maxRadius, CLOSE.minRadius, eased)
    if (!this.active) return
    const now = this.room.now
    if (now < this.nextTick) return
    this.nextTick = now + CLOSE.tickMs

    for (const f of this.room.fighters) {
      if (!f.alive) continue
      if (!this.outside(f.x, f.y)) {
        f.outsideSince = null
        continue
      }
      f.outsideSince ??= now
      const secondsOut = (now - f.outsideSince) / 1000
      const frac = Math.min(CLOSE.maxFrac, CLOSE.baseFrac + CLOSE.growthPerSec * secondsOut)
      const dmg = Math.round(f.maxHp * frac * (CLOSE.tickMs / 1000))
      f.hp -= dmg
      this.room.event({ t: 'field', id: f.id, amount: dmg })
      if (f.hp <= 0) f.fall(null)
    }
  }
}

export { SimField, hunterName, Vec2 }
