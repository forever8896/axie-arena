/**
 * Ronke's pigments, read off the asset itself, so the
 * arena reads as Ronke before a single piece of official art is loaded.
 */
export const CLASS_COLORS = {
  // Read off each fighter's own art: the body, a darker shade, and the bright
  // edge the game uses for their projectiles and trails.
  ronke:  { body: 0x3b45c8, shade: 0x2a2f8f, rim: 0x4ea8f5 },
  ronka:  { body: 0xf05aa8, shade: 0xb63579, rim: 0xffa8d4 },
  horske: { body: 0x1f6fe0, shade: 0x14489a, rim: 0xe03b3b },
}

export const CLASS_NAMES = Object.keys(CLASS_COLORS)

/**
 * the Ronkeverse field palette.
 *
 * Greens sampled from the Origins story-arena ground art (deep-forest and
 * crossroad layers), so the field reads as Ronke rather than as generic grass.
 */
/**
 * The Moonpetal paddies after dark.
 *
 * The old field was Lunacia's daylight meadow, and green was the worst
 * possible ground for these fighters: Ronke is blue, Ronka is pink, and green
 * sits between them, fighting both. Indigo water pushes both forward instead,
 * and gives the lanterns and the rice something to glow against.
 *
 * The names are kept — grassBase, hedge, stoneTop — because a dozen files draw
 * with them. What they mean has changed; what they are called has not.
 */
export const FIELD = {
  // Flooded terraces: deep water, with the moon moving on it.
  grassBase: 0x1b2347,
  grassLight: 0x2b3a6b,
  grassPale: 0x44568f,
  grassDeep: 0x141a36,
  grassShadow: 0x0e1328,
  // Wet straw and the mud of the banks between paddies.
  dirt: 0xc9b083,
  dirtDark: 0x6b5433,
  // The stone edging that holds a terrace up, pale under the moon.
  stoneFace: 0x8d9bb5,
  stoneTop: 0xc3cede,
  stoneSide: 0x4a5572,
  stoneEdge: 0xe8eef8,
  // Bamboo stands, the cover you break line of sight behind.
  hedge: 0x25432f,
  hedgeLight: 0x3f5d4a,
  // Rice heads, lantern light, and Ronka's pink.
  bloomWhite: 0xf4ead8,
  bloomPink: 0xff8fc4,
  bloomGold: 0xffc247,
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
