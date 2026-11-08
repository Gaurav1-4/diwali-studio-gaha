import { ParticlePool } from '../particles/particle';
import { COLORS } from './fireworkColors';
import { FireworkEffect, SoundTriggerCallback } from './fireworkTypes';
import { groundBurst } from './groundBurst';
import { drawCasing, drawBurningFuse, fuseTip } from './casingArt';

export class Bomb implements FireworkEffect {
  public active = true;
  private elapsed = 0;
  private fuseDuration: number;

  constructor(private x: number, private y: number, private heavy: boolean, private sound?: SoundTriggerCallback) {
    this.fuseDuration = heavy ? 1.25 : 0.72;
    this.sound?.('FUSE', heavy ? 1 : 0.65);
  }

  public updatePosition(x: number, y: number): void { this.x = x; this.y = y; }

  public update(dt: number, pool: ParticlePool): void {
    if (!this.active) return;
    this.elapsed += dt;
    if (this.elapsed < this.fuseDuration) {
      const tip = fuseTip(this.x,this.y,this.elapsed/this.fuseDuration);
      const fuseX=tip.x, fuseY=tip.y;
      for (let i = 0; i < 4; i++) {
        const angle = Math.random() * Math.PI * 2;
        pool.spawn({ x: fuseX, y: fuseY, vx: Math.cos(angle) * 2.5,
          vy: -Math.random() * 3, color: COLORS.WHITE_HOT, fadeColor: COLORS.DEEP_ORANGE,
          size: 1.8, life: 0.2 + Math.random() * 0.15, gravity: 0.14, crackle: true });
      }
      pool.addFlash(fuseX, fuseY, 50, COLORS.AMBER, 0.1);
      return;
    }
    this.sound?.(this.heavy ? 'SUTLI_BANG' : 'BULLET_BANG');
    groundBurst(pool, this.x, this.y, this.heavy ? 1.3 : 0.55);
    this.active = false;
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return;
    drawCasing(ctx,this.heavy?'SUTLI_BOMB':'BULLET_BOMB',this.x,this.y,this.heavy?29:27);
    drawBurningFuse(ctx,this.x,this.y,this.elapsed/this.fuseDuration);
  }
}
