/**
 * The wire between a client and the room authority.
 *
 * Both sides import this file, so the shapes cannot drift apart. Messages are
 * JSON for now: a room of eight at 20 snapshots a second is a few tens of KB/s,
 * which is fine for a prototype and readable in a network tab, which is worth
 * more right now than the bytes a binary format would save.
 *
 * The rule the whole protocol exists to enforce: a client sends what it *wants*
 * to do and draws what comes back. It never sends a position, a hit or a
 * bounty, because it does not get to decide any of those.
 */

// 2: the reworked combat. A swing has phases, the parry became a guard you
// hold, and the Moonshot is aimed — a page cached from before any of that
// predicts rules the room no longer plays by, so it is turned away and told to
// reload rather than left to fight a game that is not there.
export const PROTOCOL_VERSION = 2

/** Fixed simulation step. The balance numbers were measured at 60Hz. */
export const TICK_MS = 1000 / 60

/** One snapshot every third step: 20 a second. */
export const SNAPSHOT_EVERY = 3

/** A dropped player's Axie stays in the room this long before it forfeits. */
export const ABANDON_MS = 6000

/** Inputs older than this are ignored: a client that far behind is resyncing. */
export const INPUT_STALE_MS = 2000

/** The discrete actions a client may ask for in one input. */
export const ACTIONS = ['attack', 'special', 'dash', 'parry']

// --- Client to server -------------------------------------------------------

export const hello = ({ room, cls, name, resume = null }) =>
  ({ k: 'hello', v: PROTOCOL_VERSION, room, cls, name, resume })

/**
 * `mv` is a direction, not a destination, and `aim` is an angle: the two things
 * a player actually controls. `act` lists what they pressed since the last one.
 */
export const input = ({ seq, mv = [0, 0], aim = 0, act = [], pt = null, gd = 0, ul = 0 }) =>
  ({ k: 'input', seq, mv, aim, act, pt, gd, ul })

export const leave = () => ({ k: 'leave' })
export const ping = t => ({ k: 'ping', t })

// --- Server to client -------------------------------------------------------

export const welcome = ({ you, token, room, snap }) =>
  ({ k: 'welcome', v: PROTOCOL_VERSION, you, token, room, tickMs: TICK_MS, snapshotEvery: SNAPSHOT_EVERY, snap })

/**
 * Built once per room per broadcast and sent to everyone in it, so `acks` is a
 * map rather than a field: one shared string beats one string per client.
 */
export const snapshot = ({ s, ev = [], acks = {} }) => ({ k: 'snap', s, ev, acks })

export const pong = (t, now) => ({ k: 'pong', t, now })
export const bye = why => ({ k: 'bye', why })
export const oops = why => ({ k: 'error', why })

// --- Validation -------------------------------------------------------------

const num = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const clamp1 = v => Math.max(-1, Math.min(1, num(v)))

/**
 * Everything below arrives from the network, so nothing above is trusted: a
 * malformed or hostile message becomes a harmless one rather than an exception
 * on the server's tick loop.
 */
export function parse(raw) {
  let msg = null
  try {
    msg = JSON.parse(typeof raw === 'string' ? raw : String(raw))
  } catch {
    return null
  }
  if (!msg || typeof msg !== 'object' || typeof msg.k !== 'string') return null
  return msg
}

/** An input as the authority will accept it, or null. */
export function readInput(msg) {
  if (!msg || msg.k !== 'input') return null
  const mv = Array.isArray(msg.mv) ? msg.mv : [0, 0]
  const act = Array.isArray(msg.act) ? msg.act.filter(a => ACTIONS.includes(a)) : []
  const pt = Array.isArray(msg.pt) && msg.pt.length === 2 ? { x: num(msg.pt[0]), y: num(msg.pt[1]) } : null
  return {
    seq: Math.max(0, Math.floor(num(msg.seq))),
    move: { x: clamp1(mv[0]), y: clamp1(mv[1]) },
    aim: num(msg.aim),
    act,
    point: pt,
    // Held rather than pressed: a guard is a state the player maintains, so it
    // arrives with every input instead of once.
    guard: Boolean(msg.gd),
    // So is aiming a Moonshot — it begins when this goes up and fires when it
    // comes down, which is why it cannot be an action in the list above.
    aiming: Boolean(msg.ul),
  }
}
