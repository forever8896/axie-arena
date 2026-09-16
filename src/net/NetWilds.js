/**
 * The Endless Wilds HUD, fed from a room on a server.
 *
 * WildsHud was written against WildsDirector — the thing that runs a room in
 * the page. A networked room has no director here: the room is elsewhere, and
 * all this client gets is snapshots and a list of what happened. This presents
 * the same surface the HUD already reads, built from those, so the networked
 * game gets the real HUD instead of a lesser copy of it.
 *
 * It answers questions and remembers the feed. It decides nothing.
 */
import { money } from '../wilds/config.js'
import { wallet } from '../wilds/Wallet.js'
import { CLASS_KITS } from '../axie/classKits.js'

export default class NetWilds {
  constructor(scene, room) {
    this.scene = scene
    this.room = room
    this.events = []
    this.panel = null
    this.caches = []
    this.gates = []
    this.hotspot = null
    this.fighters = []
    this.staked = false
  }

  get currency() {
    return this.room.currency
  }

  get now() {
    return this.scene.time.now
  }

  /** Called every frame with the interpolated room. */
  sync(view, actors) {
    this.fighters = [...actors.values()]
    this.caches = view.caches ?? []
    this.gates = (view.gates ?? []).map(g => ({ ...g, open: true }))
    this.hotspot = view.moon ? { x: view.moon.x, y: view.moon.y, radius: view.moon.r } : null
  }

  topHunters(n = 3) {
    return this.fighters
      .filter(f => f.alive && f.wilds)
      .sort((a, b) => b.wilds.bounty - a.wilds.bounty)
      .slice(0, n)
  }

  log(text, color = '#e8f0d6') {
    this.events.unshift({ text, color, at: this.now })
    this.events.length = Math.min(this.events.length, 6)
  }

  /**
   * Room events become the feed on the right, and the panels that stop play.
   * The same events the renderer turns into noise; this reads them for meaning.
   */
  handle(e, view, you) {
    const who = id => view.fighters.find(f => f.id === id)
    const name = id => (id === you ? 'You' : who(id)?.name ?? 'A hunter')

    switch (e.t) {
      case 'join':
        if (e.id !== you) this.log(`${e.name} joined as ${cap(e.cls)}`, '#b9c4a6')
        break
      case 'die': {
        const killer = e.by ? name(e.by) : null
        if (e.id === you) {
          const lost = this.carried ?? 0
          this.panel = { kind: 'fell', lost, killer: e.by === you ? null : killer }
          wallet.died(this.room, lost)
        } else if (killer) {
          this.log(`${killer} took ${name(e.id)}'s bounty`, e.by === you ? '#ffd964' : '#e8f0d6')
        } else {
          this.log(`${name(e.id)} fell`, '#b9c4a6')
        }
        break
      }
      case 'extract':
        if (e.id === you) {
          this.panel = { kind: 'extracted', amount: e.amount }
          wallet.extract(this.room, e.amount)
        } else {
          this.log(`${name(e.id)} extracted ${money(e.amount, this.currency)}`, '#c9b8ff')
        }
        break
      case 'cache':
        this.log(`${money(e.amount, this.currency)} dropped in the open`, '#ffd964')
        break
      case 'cache-taken':
        if (e.by === you) this.log(`You picked up ${money(e.amount, this.currency)}`, '#ffd964')
        break
      case 'moon':
        this.log('A Blood Moon rises', '#ff8098')
        this.scene.announce?.('A BLOOD MOON RISES', '#ff8098')
        break
      case 'gate-open':
        this.scene.announce?.('A MOON GATE OPENS', '#c9b8ff')
        break
      case 'gate-closing':
        this.log('A Moon Gate is closing', '#ff8098')
        break
      case 'well-open':
        this.scene.announce?.('A MOONWELL BLOOMS', '#9dffd8')
        break
      case 'leaving':
        if (e.id !== you) this.log(`${name(e.id)} is heading for a gate`, '#c9b8ff')
        break
    }
  }

  /** What the player is carrying, remembered so a death can report the loss. */
  remember(bounty) {
    this.carried = bounty
  }

  // --- The choices a panel offers -----------------------------------------

  /** Esc: ask before leaving mid-hunt; from a panel, go back to the lobby. */
  requestLeave() {
    // Straight from the room rather than from the last drawn frame: Esc pressed
    // before the first frame is drawn still has to do something sensible.
    const live = this.scene.client?.view()?.me
    const me = this.fighters.find(f => f.isPlayer && f.alive)
      ?? (live?.alive ? { wilds: { bounty: live.bounty ?? 0 } } : null)
    if (this.panel?.kind === 'leave') this.panel = null
    else if (!this.panel && me) this.panel = { kind: 'leave', bounty: me.wilds.bounty }
    else if (this.panel) this.toLobby()
  }

  /** Leaving without a gate: the room keeps what you were carrying. */
  forfeit() {
    const lost = this.carried ?? 0
    this.panel = { kind: 'left', lost }
    wallet.died(this.room, lost)
    this.scene.client?.leave()
  }

  reenter() {
    this.panel = null
    this.scene.rejoin()
  }

  toLobby() {
    this.panel = null
    this.scene.backToLobby()
  }
}

const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : 'a hunter')

/** The class kit, for a hunter described only by a snapshot. */
export const kitOf = cls => CLASS_KITS[cls] ?? CLASS_KITS.beast
