import { ParticlePool } from '../particles/particle';
import { FireworkEffect, SoundTriggerCallback } from './fireworkTypes';
import { COLORS } from './fireworkColors';

/** Fine incandescent metal jets, a wider heavy-spark fan, and a drifting smoke column. */
export class Anar implements FireworkEffect {
  public active = true;
  private age = 0;
  private smokeTimer = 0;

  constructor(private x: number, private y: number, private sound?: SoundTriggerCallback, private scale = 1) {

  }

  public updatePosition(x: number, y: number): void { this.x = x; this.y = y; }

  public update(dt: number, pool: ParticlePool): void {
    if (!this.active) return;
    this.age += dt;
    this.sound?.('ANAR_LOOP');
    const pressure = Math.min(1, this.age / 0.3) * (0.92 + Math.sin(this.age * 9) * 0.045 + Math.sin(this.age * 23) * 0.035);
    pool.addFlash(this.x, this.y - 30, 180, COLORS.AMBER, 0.045 * pressure);

    // A hot, narrow jet. Fine filaments retain detail even at the nozzle.
    for (let i = 0; i < 7 * pressure; i++) {
      const speed = (18 + Math.random() * 17) * Math.sqrt(pressure);
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.16;
      pool.spawn({ x: this.x + (Math.random() - 0.5) * 3, y: this.y,
        vx: Math.cos(angle) * speed * this.scale, vy: Math.sin(angle) * speed * this.scale,
        color: COLORS.WHITE_HOT, fadeColor: COLORS.AMBER, size: 1.6 + Math.random() * 1.6,
        life: 0.32 + Math.random() * 0.35, drag: 0.969, gravity: 0.22 * this.scale, heat: 1 });
    }
    // Most metal grains follow ballistic arcs; heavier grains fall farther and stay warm.
    for (let i = 0; i < 27 * pressure; i++) {
      const wide = Math.random() < 0.38;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * (wide ? 0.96 : 0.32);
      const speed = (wide ? 9 + Math.random() * 15 : 16 + Math.random() * 17) * Math.sqrt(pressure);
      const heavy = Math.random() < 0.16;
      pool.spawn({ x: this.x + (Math.random() - 0.5) * 5, y: this.y + Math.random() * 3,
        vx: Math.cos(angle) * speed * this.scale, vy: Math.sin(angle) * speed * this.scale,
        color: Math.random() < 0.12 ? COLORS.SILVER : COLORS.GOLD, fadeColor: COLORS.DEEP_ORANGE,
        size: heavy ? 3 + Math.random() : 0.9 + Math.random() * 1.9,
        life: (heavy ? 1.15 : 0.75) + Math.random() * 0.7,
        drag: 0.977, gravity: (wide ? 0.38 : 0.29) * this.scale,
        flicker: true, crackle: Math.random() < 0.1, heat: heavy ? 0.5 : 0.85 });
    }
    this.smokeTimer += dt;
    if (this.smokeTimer >= 0.055) {
      this.smokeTimer = 0;
      pool.spawn({ x: this.x + (Math.random() - 0.5) * 10, y: this.y - 20,
        vx: 0.15 + Math.random() * 0.25, vy: -1.3 - Math.random() * 0.8,
        color: COLORS.AMBER, size: 14 + Math.random() * 9, life: 2.4 + Math.random() * 1.2,
        drag: 0.995, gravity: -0.003, kind: 'smoke', opacity: 0.11, trail: false });
    }
  }

  public stop(): void { this.active = false; }
}
