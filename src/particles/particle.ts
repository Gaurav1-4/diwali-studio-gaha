import { ParticleRenderer } from './particleRenderer';
import type { QualityProfile } from '../performance/quality';

/** Fixed-step particle pool for incandescent sparks and bounded drifting smoke. */

export interface ParticleColor {
  r: number;
  g: number;
  b: number;
}

export interface Particle {
  slot: number;
  active: boolean;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  color: ParticleColor;
  fadeColor: ParticleColor;
  alpha: number;
  size: number;
  life: number;
  maxLife: number;
  drag: number;
  gravity: number;
  flicker: boolean;
  crackle: boolean;
  trail: boolean;
  kind: 'spark' | 'smoke';
  heat: number;
  shutter: number;
  seed: number;
  opacity: number;
}

export interface AmbientFlash {
  x: number;
  y: number;
  radius: number;
  color: ParticleColor;
  alpha: number;
  decay: number;
}

export class ParticlePool {
  private pool: Particle[] = [];
  private renderer: ParticleRenderer | null = null;
  private freeIndices: number[] = [];
  private smokeCount = 0;
  private live: Particle[] = [];
  private maxActive = 7500;
  private maxSmoke = 192;
  private emission = 1;
  private emissionCredit = 0;
  private maxFlashes = 256;
  public get activeCount(): number { return this.live.length; }
  private readonly MAX_PARTICLES: number = 7500; // Increased pool for massive volcanic density
  public flashes: AmbientFlash[] = [];

  constructor() {
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      this.freeIndices.push(i);
      this.pool.push({
        slot: i,
        active: false,
        x: 0,
        y: 0,
        prevX: 0,
        prevY: 0,
        vx: 0,
        vy: 0,
        color: { r: 255, g: 255, b: 255 },
        fadeColor: { r: 255, g: 180, b: 0 },
        alpha: 1,
        size: 3,
        life: 1,
        maxLife: 1,
        drag: 0.98,
        gravity: 0.05,
        flicker: false,
        crackle: false,
        trail: true,
        kind: 'spark',
        heat: 1,
        shutter: 1,
        seed: 0,
        opacity: 1
      });
    }
  }

  public spawn(config: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: ParticleColor;
    fadeColor?: ParticleColor;
    size?: number;
    life: number;
    drag?: number;
    gravity?: number;
    flicker?: boolean;
    crackle?: boolean;
    trail?: boolean;
    kind?: 'spark' | 'smoke';
    heat?: number;
    opacity?: number;
    shutter?: number;
  }): Particle | null {
    this.emissionCredit += this.emission;
    if (this.emissionCredit < 1) return null;
    this.emissionCredit -= 1;
    if (this.live.length >= this.maxActive || (config.kind === 'smoke' && this.smokeCount >= this.maxSmoke)) return null;
    const index = this.freeIndices.pop();
    if (index !== undefined) {
      const p = this.pool[index];
      p.active = true;
      p.x = config.x;
      p.y = config.y;
      p.prevX = config.x;
      p.prevY = config.y;
      p.vx = config.vx;
      p.vy = config.vy;
      p.color = config.color;
      p.fadeColor = config.fadeColor || { r: 255, g: 160, b: 40 };
      p.size = config.size ?? 3.2;
      p.life = config.life;
      p.maxLife = config.life;
      p.alpha = 1;
      p.drag = config.drag ?? 0.975;
      p.gravity = config.gravity ?? 0.08;
      p.flicker = config.flicker ?? false;
      p.crackle = config.crackle ?? false;
      p.trail = config.trail ?? true;
      p.kind = config.kind ?? 'spark';
      p.heat = config.heat ?? 0.9;
      p.seed = Math.random() * Math.PI * 2;
      p.shutter = (config.shutter ?? 1) * (0.85 + Math.random() * 0.4);
      p.opacity = config.opacity ?? 1;
      if (p.kind === 'smoke') this.smokeCount++;
      this.live.push(p);
      return p;
    }
    return null;
  }

  public addFlash(x: number, y: number, radius: number, color: ParticleColor, intensity: number = 0.5): void {
    if (this.flashes.length >= this.maxFlashes) this.flashes.shift();
    this.flashes.push({
      x,
      y,
      radius,
      color,
      alpha: Math.min(1.0, intensity),
      decay: Math.max(0.1, Math.min(1, intensity) * 10)
    });
  }

  public update(dt: number, onCrackle?: (x: number, y: number, color: ParticleColor) => void): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.live[i] = this.live[this.live.length - 1];
        this.live.pop();
        if (p.kind === 'smoke') this.smokeCount--;
        this.freeIndices.push(p.slot);
        if (p.crackle && onCrackle && Math.random() < 0.7) {
          onCrackle(p.x, p.y, p.color);
        }
        continue;
      }

      p.prevX = p.x;
      p.prevY = p.y;

      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.gravity;
      p.x += p.vx;
      p.y += p.vy;

      const lifeRatio = p.life / p.maxLife;
      if (p.kind === 'smoke') {
        p.alpha = Math.sin(Math.PI * lifeRatio) ** 2 * p.opacity;
      } else {
        p.alpha = Math.min(1, lifeRatio * 4) * p.opacity;
      }
      if (p.flicker) {
        // Each ember has a coherent burn rhythm instead of random frame-to-frame blinking.
        const age = p.maxLife - p.life;
        const pulse = Math.sin(age * (22 + p.seed * 3) + p.seed);
        p.alpha *= 0.72 + 0.28 * pulse * pulse;
      }
    }

    for (let f = this.flashes.length - 1; f >= 0; f--) {
      const flash = this.flashes[f];
      flash.alpha -= flash.decay * dt;
      if (flash.alpha <= 0) {
        this.flashes.splice(f, 1);
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.activeCount === 0 && this.flashes.length === 0) return;
    this.renderer ??= new ParticleRenderer();
    this.renderer.render(ctx, this.live, this.flashes);
  }

  public setBudget(profile: QualityProfile): void {
    this.maxActive = profile.particles;
    this.maxSmoke = profile.smoke;
    this.emission = profile.emission;
    this.maxFlashes = Math.max(16, profile.smoke);
    this.emissionCredit = 0;
    if (this.flashes.length > this.maxFlashes) this.flashes.splice(0, this.flashes.length - this.maxFlashes);
    // Thin existing sparks across all emitters rather than dropping the latest object.
    let removed = 0;
    while (this.live.length > this.maxActive) {
      const index = (Math.imul(++removed, 2654435761) >>> 0) % this.live.length;
      const p = this.live[index];
      p.active = false;
      if (p.kind === 'smoke') this.smokeCount--;
      this.freeIndices.push(p.slot);
      this.live[index] = this.live[this.live.length - 1];
      this.live.pop();
    }
    for (let i = this.live.length - 1; i >= 0 && this.smokeCount > this.maxSmoke; i--) {
      const p = this.live[i];
      if (p.kind !== 'smoke') continue;
      p.active = false; this.smokeCount--; this.freeIndices.push(p.slot);
      this.live[i] = this.live[this.live.length - 1]; this.live.pop();
    }
  }

  public clear(): void {
    this.freeIndices = [];
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      this.pool[i].active = false;
      this.freeIndices.push(i);
    }
    this.live.length = 0;
    this.emissionCredit = 0;
    this.smokeCount = 0;
    this.flashes = [];
  }
}
