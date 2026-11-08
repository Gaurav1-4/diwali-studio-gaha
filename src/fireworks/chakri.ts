import { ParticlePool } from '../particles/particle';
import { COLORS } from './fireworkColors';
import { drawCasing } from './casingArt';
import { FireworkEffect, SoundTriggerCallback } from './fireworkTypes';

export class Chakri implements FireworkEffect {
  public active = true;
  private elapsed = 0;
  private angle = 0;

  constructor(private x: number, private y: number, private sound?: SoundTriggerCallback) {}

  public updatePosition(x: number, y: number): void { this.x = x; this.y = y; }

  public update(dt: number, pool: ParticlePool): void {
    if (!this.active) return;
    this.elapsed += dt;
    if (this.elapsed > 4.2) { this.active = false; return; }
    this.sound?.('CHAKRI_LOOP');
    const energy = Math.min(1, this.elapsed / 0.6) * Math.min(1, (4.2 - this.elapsed) / 0.65);
    this.angle += dt * (16 + energy * 24);
    const cx = this.x + Math.sin(this.elapsed * 3) * 12;
    const cy = this.y + Math.cos(this.elapsed * 4) * 4;
    pool.addFlash(cx, cy, 180, COLORS.AMBER, energy * 0.025);
    for (let i = 0; i < 36 * energy; i++) {
      const angle = this.angle + i / 36 * 1.2 + (i % 2) * Math.PI;
      const speed = (7 + Math.random() * 15) * energy;
      pool.spawn({ x: cx + Math.cos(angle) * 9, y: cy + Math.sin(angle) * 4,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * 0.38 - Math.random() * 2,
        color: Math.random() < 0.4 ? COLORS.WHITE_HOT : COLORS.GOLD,
        fadeColor: COLORS.AMBER, size: 0.7 + Math.random() * 1.7,
        life: 0.3 + Math.random() * 0.6, drag: 0.965, gravity: 0.1,
        flicker: true, crackle: Math.random() < 0.18 });
    }
    pool.spawn({ x: cx, y: cy, vx: 0, vy: 0, color: COLORS.WHITE_HOT,
      size: 3.5 * energy, life: 0.08, drag: 1, gravity: 0, trail: false });
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return;
    const cx=this.x+Math.sin(this.elapsed*3)*12,cy=this.y+Math.cos(this.elapsed*4)*4;
    drawCasing(ctx,'CHAKRI',cx,cy,13);
  }
}
