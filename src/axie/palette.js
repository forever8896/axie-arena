/**
 * Axie class pigments. These are the nine class colours Origins uses, so the
 * arena reads as Axie before a single piece of official art is loaded.
 */
export const CLASS_COLORS = {
  aquatic:  { body: 0x00b1d2, shade: 0x0079a1, rim: 0x7ce8ff },
  beast:    { body: 0xffb812, shade: 0xc07d00, rim: 0xffe08a },
  bird:     { body: 0xff7a9c, shade: 0xc04a6b, rim: 0xffc2d4 },
  bug:      { body: 0x9a5ad4, shade: 0x66339c, rim: 0xd7b0ff },
  plant:    { body: 0x3cb86a, shade: 0x1f7d44, rim: 0x9ff0bb },
  reptile:  { body: 0xc46ad8, shade: 0x8b3ba0, rim: 0xefb8ff },
  mech:     { body: 0x8b9098, shade: 0x5a5f66, rim: 0xd6dbe2 },
  dawn:     { body: 0x7ea2ff, shade: 0x4a6bc4, rim: 0xc4d5ff },
  dusk:     { body: 0x5b4fd4, shade: 0x362c96, rim: 0xa79cff },
}

export const CLASS_NAMES = Object.keys(CLASS_COLORS)

export const ARENA_PALETTE = {
  deep: 0x0b0918,
  floor: 0x171132,
  floorLit: 0x2a1f5c,
  ring: 0x3d2f7a,
  glow: 0xffb0e0,
  ink: 0xe8e4f5,
  mute: 0x8b83ad,
}
