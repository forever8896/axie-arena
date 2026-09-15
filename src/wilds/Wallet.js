import { WILDS } from './config.js'

const KEY = 'lunacy.wilds.wallet.v1'

/**
 * The simulated wallet: a practice balance and season points, kept in this
 * browser only. No real value, no network, no account.
 */
export default class Wallet {
  constructor() {
    this.state = { AXS: WILDS.startingBalance, PTS: 0, session: blankSession() }
    try {
      const saved = JSON.parse(localStorage.getItem(KEY))
      if (saved && typeof saved.AXS === 'number') this.state = { ...this.state, ...saved, session: blankSession() }
    } catch {
      // Storage blocked (private window, previews): a fresh balance each visit.
    }
  }

  balance(currency) {
    return this.state[currency] ?? 0
  }

  canAfford(room) {
    return room.free || this.balance(room.currency) >= room.stake - 1e-9
  }

  /** Pays the stake for one life. Returns the bounty it buys, or null. */
  enter(room) {
    if (!this.canAfford(room)) return null
    const s = this.state.session
    s.entries++
    if (room.free) return room.stake
    this.state.AXS -= room.stake
    s.staked += room.stake
    s.fees += room.stake * WILDS.feeRate
    this.save()
    return room.stake * (1 - WILDS.feeRate)
  }

  extract(room, amount) {
    const s = this.state.session
    s.extractions++
    if (room.free) {
      this.state.PTS += amount
      s.points += amount
    } else {
      this.state.AXS += amount
      s.extracted += amount
      s.best = Math.max(s.best, amount)
    }
    this.save()
  }

  died(room, lost) {
    const s = this.state.session
    s.deaths++
    if (!room.free) s.lost += lost
  }

  topUp() {
    this.state.AXS = Math.max(this.state.AXS, WILDS.startingBalance)
    this.save()
  }

  get session() {
    return this.state.session
  }

  save() {
    try {
      const { session, ...keep } = this.state
      localStorage.setItem(KEY, JSON.stringify(keep))
    } catch {
      // Not persisted; the session still works.
    }
  }
}

function blankSession() {
  return { entries: 0, deaths: 0, extractions: 0, staked: 0, fees: 0, extracted: 0, lost: 0, best: 0, points: 0 }
}

/** One wallet for the whole page, shared by the lobby and the arena. */
export const wallet = new Wallet()
