import { ParticlePool, ParticleColor } from '../particles/particle';
import { FireworkEffect, SoundTriggerCallback } from './fireworkTypes';
import { COLORS, getRandomColor } from './fireworkColors';
import { aerialBurst } from './aerialBurst';

export class Rocket implements FireworkEffect {
  public active = true;
  private vx = (Math.random() - 0.5) * 0.8;
  private vy = -(10 + Math.random() * 2);
  private color: ParticleColor = getRandomColor();

  constructor(private x: number, private y: number, private targetY: number, private sound?: SoundTriggerCallback, private scale = 1) {
    this.sound?.('ROCKET_LAUNCH');
  }

  public update(_dt: number, pool: ParticlePool): void {
    if (!this.active) return;
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.065;
    for (let i = 0; i < 5; i++) {
      pool.spawn({ x: this.x + (Math.random() - 0.5) * 2, y: this.y + Math.random() * 7,
        vx: this.vx * 0.3 + (Math.random() - 0.5) * 0.6, vy: 1 + Math.random() * 2,
        color: COLORS.GOLD, fadeColor: COLORS.DEEP_ORANGE, size: 0.8 + Math.random() * 1.5,
        life: 0.18 + Math.random() * 0.22, drag: 0.98, gravity: 0.06, heat: 0.7 });
    }
    pool.spawn({ x: this.x, y: this.y, vx: 0, vy: this.vy * 0.15,
      color: COLORS.WHITE_HOT, fadeColor: COLORS.GOLD, size: 4, life: 0.035,
      drag: 1, gravity: 0, heat: 1 });
    if (this.y <= this.targetY || this.vy >= -0.6) {
      this.sound?.('EXPLOSION', 1.15);
      aerialBurst(pool, this.x, this.y, this.color, 300 + Math.floor(Math.random() * 60), Math.random() < 0.45, this.scale);
      this.active = false;
    }
  }
}
