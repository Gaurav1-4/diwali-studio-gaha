import { ParticlePool, ParticleColor } from '../particles/particle';
import { FireworkEffect, SoundTriggerCallback } from './fireworkTypes';
import { COLORS } from './fireworkColors';
import { aerialBurst } from './aerialBurst';

interface CandleBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: ParticleColor;
  life: number;
}

export class RomanCandle implements FireworkEffect {
  public active: boolean = true;
  private x: number;
  private y: number;
  private onSound?: SoundTriggerCallback;

  private balls: CandleBall[] = [];
  private shotsRemaining: number = 5;
  private shotTimer: number = 0;
  private readonly SHOT_INTERVAL: number = 0.22;

  private colorSequence = [
    COLORS.CRIMSON,
    COLORS.EMERALD,
    COLORS.GOLD,
    COLORS.ELECTRIC_BLUE,
    COLORS.MAGENTA
  ];

  constructor(x: number, y: number, onSound?: SoundTriggerCallback) {
    this.x = x;
    this.y = y;
    this.onSound = onSound;
    this.fireSingleShot();
  }

  public updatePosition(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  private fireSingleShot(): void {
    if (this.shotsRemaining <= 0) return;

    this.onSound?.('ROMAN_POP');
    const color = this.colorSequence[5 - this.shotsRemaining] || COLORS.GOLD;
    this.shotsRemaining--;

    this.balls.push({
      x: this.x,
      y: this.y,
      vx: (Math.random() - 0.5) * 3,
      vy: -(9 + Math.random() * 3),
      color,
      life: 0.68 + Math.random() * 0.22
    });
  }

  public update(dt: number, pool: ParticlePool): void {
    if (this.shotsRemaining > 0) {
      this.shotTimer += dt;
      if (this.shotTimer >= this.SHOT_INTERVAL) {
        this.shotTimer = 0;
        this.fireSingleShot();
      }
    }

    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.life -= dt;
      b.x += b.vx;
      b.y += b.vy;
      b.vy += 0.22;

      // Comet trail
      for (let j = 0; j < 4; j++) {
        pool.spawn({
          x: b.x + (Math.random() - 0.5) * 5,
          y: b.y + (Math.random() - 0.5) * 5,
          vx: (Math.random() - 0.5) * 2,
          vy: Math.random() * 2.5 + 1,
          color: b.color,
          fadeColor: COLORS.GOLD,
          size: 1.3 + Math.random(),
          life: 0.32,
          drag: 0.94,
          gravity: 0.06
        });
      }

      if (b.life <= 0 || b.vy >= 0) {
        this.detonateBall(b, pool);
        this.balls.splice(i, 1);
      }
    }

    if (this.shotsRemaining <= 0 && this.balls.length === 0) {
      this.active = false;
    }
  }

  private detonateBall(b: CandleBall, pool: ParticlePool): void {
    this.onSound?.('EXPLOSION', 0.55);
    aerialBurst(pool, b.x, b.y, b.color, 80, false, 0.45);
  }
}
