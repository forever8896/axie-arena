/**
 * Ronke's pigments, read off the asset itself, so the
 * arena reads as Ronke before a single piece of official art is loaded.
 */
export const CLASS_COLORS = {
  // Ronke's own blues, read off the asset: the dark body, the belly, the hands.
  ronke: { body: 0x3b45c8, shade: 0x2a2f8f, rim: 0x4ea8f5 },
}

export const CLASS_NAMES = Object.keys(CLASS_COLORS)

/**
 * the Ronkeverse field palette.
 *
 * Greens sampled from the Origins story-arena ground art (deep-forest and
 * crossroad layers), so the field reads as Ronke rather than as generic grass.
 */
export const FIELD = {
  grassBase: 0x8fc242,
  grassLight: 0xa8c030,
  grassPale: 0xc0d890,
  grassDeep: 0x5f9c30,
  grassShadow: 0x467f2a,
  dirt: 0xb08a52,
  dirtDark: 0x8a6a3c,
  stoneFace: 0xa88a5e,
  stoneTop: 0xd9bd85,
  stoneSide: 0x6d5236,
  stoneEdge: 0xf0dcae,
  hedge: 0x2f6b33,
  hedgeLight: 0x4d9b47,
  bloomWhite: 0xfdf6e3,
  bloomPink: 0xff9ec4,
  bloomGold: 0xffd964,
}

export const ARENA_PALETTE = {
  deep: 0x24401c,
  floor: 0x5f9330,
  floorLit: 0x8fbb3c,
  ring: 0x3d6f28,
  glow: 0xfdf6e3,
  ink: 0xf4f8e8,
  mute: 0x9aa88a,
}
