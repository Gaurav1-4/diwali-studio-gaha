import { ParticlePool } from '../particles/particle';

export interface FireworkEffect {
  active: boolean;
  update(dt: number, pool: ParticlePool): void;
  updatePosition?(x: number, y: number): void;
  render?(ctx: CanvasRenderingContext2D): void;
}

export type SoundTriggerCallback = (
  soundType: 'ROCKET_LAUNCH' | 'EXPLOSION' | 'ANAR_LOOP' | 'SPARKLER_LOOP' | 'ROMAN_POP' | 'FINALE' | 'CHAKRI_LOOP' | 'FUSE' | 'SUTLI_BANG' | 'BULLET_BANG' | 'GANGA_BANG',
  intensity?: number
) => void;
