import Phaser from 'phaser'
import { play } from './Sfx.js'

/**
 * Menu sounds: a tick when the cursor finds something, a blip when it is
 * taken, a flourish when the game starts. Kept quiet and slightly detuned per
 * hover, so moving along a row of buttons does not machine-gun one sample.
 */
const VOLUME = { hover: 0.3, select: 0.5, back: 0.45, start: 0.6, deny: 0.45 }

export function uiSound(scene, kind = 'select') {
  play(scene, `ui_${kind}`, {
    volume: VOLUME[kind] ?? 0.45,
    detune: kind === 'hover' ? Phaser.Math.Between(-80, 80) : 0,
  })
}

/**
 * Makes anything behave like a button: hover ticks, a sound on the way out,
 * and the click itself.
 */
export function bindButton(scene, target, onClick, { sound = 'select' } = {}) {
  if (!target) return target
  if (!target.input) target.setInteractive({ useHandCursor: true })
  target.on('pointerover', () => uiSound(scene, 'hover'))
  target.on('pointerdown', () => {
    uiSound(scene, sound)
    onClick?.()
  })
  return target
}
