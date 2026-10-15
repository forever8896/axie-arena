/**
 * The hit effects, cut and packed like a fighter's sheets.
 *
 * They sit at the top of public/sprites rather than in a fighter's folder,
 * because an impact belongs to the blow rather than to whoever threw it — so
 * this passes '.' as the fighter, which is the one place that shortcut lives.
 *
 * Usage: node scripts/ronke/cut-effects.mjs [name ...]
 */
import { execFileSync } from 'node:child_process'

/** Short and punchy: an effect that outstays the blow turns into clutter. */
const FX = {
  fx_impact: { fps: 26, from: 0.08, to: 0.55 },
  fx_rice: { fps: 20, from: 0.2, to: 1.4 },
  fx_heart: { fps: 24, from: 0.08, to: 0.7 },
  fx_dust: { fps: 22, from: 0.1, to: 0.8 },
  fx_heal: { fps: 20, from: 0.2, to: 1.2 },
  fx_power: { fps: 24, from: 0.1, to: 0.9 },
}

const wanted = process.argv.slice(2).filter(n => FX[n])
for (const name of (wanted.length ? wanted : Object.keys(FX))) {
  const f = FX[name]
  process.stdout.write(execFileSync('node', [
    'scripts/ronke/cut-frames.mjs', '.', name,
    '--fps', String(f.fps), '--from', String(f.from), '--to', String(f.to), '--height', '150',
  ], { encoding: 'utf8' }))
}
