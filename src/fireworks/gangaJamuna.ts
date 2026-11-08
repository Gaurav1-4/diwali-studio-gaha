import { ParticlePool } from '../particles/particle';
import { Anar } from './anar';
import { COLORS } from './fireworkColors';
import { FireworkEffect, SoundTriggerCallback } from './fireworkTypes';
import { groundBurst } from './groundBurst';
import { drawCasing } from './casingArt';

/** A finite Anar stage followed by a ground bomb. It keeps burning after ignition. */
export class GangaJamuna implements FireworkEffect {
  public active = true;
  private elapsed = 0;
  private fountain: Anar;

  constructor(private x: number, private y: number, private sound?: SoundTriggerCallback, private scale = 1) {
    this.fountain = new Anar(x, y, sound, scale);
  }

  public updatePosition(x: number, y: number): void { this.x = x; this.y = y; this.fountain.updatePosition(x, y); }

  public update(dt: number, pool: ParticlePool): void {
    if (!this.active) return;
    this.elapsed += dt;
    if (this.elapsed < 2.65) {
      this.fountain.update(dt, pool);
      // Silver blossoms distinguish this fountain from the pure golden Anar.
      for (let i = 0; i < 3; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.7;
        const speed = (12 + Math.random() * 12) * this.scale;
        pool.spawn({ x: this.x, y: this.y, vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed, color: COLORS.SILVER, fadeColor: COLORS.GOLD,
          size: 1 + Math.random() * 1.5, life: 0.55 + Math.random() * 0.55, drag: 0.96, gravity: 0.35,
          crackle: Math.random() < 0.15, flicker: true });
      }
    } else if (this.elapsed < 2.95) {
      // The fountain sputters out just before the report.
      this.fountain.stop();
      pool.spawn({ x: this.x, y: this.y, vx: (Math.random() - 0.5) * 3, vy: -4,
        color: COLORS.WHITE_HOT, life: 0.15, size: 4, gravity: 0.2 });
    } else {
      this.sound?.('GANGA_BANG');
      groundBurst(pool, this.x, this.y, 1.05);
      this.active = false;
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return;
    drawCasing(ctx,'GANGA_JAMUNA',this.x,this.y,36);
  }
}
