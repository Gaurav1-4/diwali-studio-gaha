import { ParticlePool } from '../particles/particle';
import { FireworkEffect, SoundTriggerCallback } from './fireworkTypes';
import { PALETTES } from './fireworkColors';
import { aerialBurst } from './aerialBurst';

export class Starburst implements FireworkEffect {
  public active = false;

  constructor(x: number, y: number, pool: ParticlePool, sound?: SoundTriggerCallback, scale = 1) {
    sound?.('EXPLOSION', 1.15);
    const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    aerialBurst(pool, x, y, palette[0], 360, false, 1.1 * scale);
  }

  public update(): void { /* One-shot shell. */ }
}
