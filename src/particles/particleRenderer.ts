import type { AmbientFlash, Particle, ParticleColor } from './particle';
import { GpuSparkRenderer } from './gpuSparkRenderer';

interface TrailBatch {
  color: string;
  alpha: number;
  width: number;
  points: number[];
  length: number;
}

interface GlowGroup {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  color: ParticleColor;
}

const CELL = 32;
const COLUMNS = 32;
const ATLAS_SIZE = CELL * COLUMNS;

/** GPU light strokes, drifting smoke, and a cached Canvas fallback. */
export class ParticleRenderer {
  private atlas!: HTMLCanvasElement;
  private atlasCtx!: CanvasRenderingContext2D;
  private gpu: GpuSparkRenderer | null = null;
  private smoke: HTMLCanvasElement | null = null;
  private stamps = new Map<number, number>();
  private trails = new Map<number, TrailBatch>();
  private usedTrails: TrailBatch[] = [];
  private glows = new Map<number, HTMLCanvasElement>();
  private glowGroups: GlowGroup[] = [];
  private groupCount = 0;
  private profileEnabled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('profile');
  private profileStart = 0;
  private profileFrames = 0;
  private profileCost = 0;
  private profileLastFrame = 0;
  private profileSamples = 0;

  constructor() {
    try { this.gpu = new GpuSparkRenderer(); } catch { /* Canvas fallback below. */ }
    if (!this.gpu) this.createAtlas();
  }

  private createAtlas(): void {
    this.atlas = document.createElement('canvas');
    this.atlas.width = this.atlas.height = ATLAS_SIZE;
    this.atlasCtx = this.atlas.getContext('2d')!;
  }

  private colorKey(r: number, g: number, b: number): number {
    // 4-bit channels retain the chemical palette without a texture per lifetime tick.
    return (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
  }

  private color(key: number): string {
    return `rgb(${Math.round((key >> 8) * 255 / 15)},${Math.round(((key >> 4) & 15) * 255 / 15)},${Math.round((key & 15) * 255 / 15)})`;
  }

  private stamp(key: number): number {
    const cached = this.stamps.get(key);
    if (cached !== undefined) return cached;
    // A custom palette can fall back to a path until the cache is reset next frame.
    const index = this.stamps.size;
    if (index >= COLUMNS * COLUMNS) return -1;
    const x = (index % COLUMNS) * CELL + CELL / 2;
    const y = Math.floor(index / COLUMNS) * CELL + CELL / 2;
    const ctx = this.atlasCtx;
    const r = Math.round((key >> 8) * 255 / 15);
    const g = Math.round(((key >> 4) & 15) * 255 / 15);
    const b = Math.round((key & 15) * 255 / 15);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, 15);
    gradient.addColorStop(0, '#fff8df');
    gradient.addColorStop(0.1, `rgba(${r},${g},${b},0.9)`);
    gradient.addColorStop(0.27, `rgba(${r},${g},${b},0.32)`);
    gradient.addColorStop(0.6, `rgba(${r},${g},${b},0.045)`);
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(x - 16, y - 16, CELL, CELL);
    this.stamps.set(key, index);
    return index;
  }

  private glow(color: ParticleColor): HTMLCanvasElement {
    const key = (color.r << 16) | (color.g << 8) | color.b;
    let sprite = this.glows.get(key);
    if (sprite) return sprite;
    sprite = document.createElement('canvas');
    sprite.width = sprite.height = 128;
    const ctx = sprite.getContext('2d')!;
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    const rgb = `${color.r},${color.g},${color.b}`;
    gradient.addColorStop(0, `rgba(${rgb},1)`);
    gradient.addColorStop(0.45, `rgba(${rgb},0.356)`);
    gradient.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    this.glows.set(key, sprite);
    return sprite;
  }

  private renderGlows(ctx: CanvasRenderingContext2D, flashes: AmbientFlash[]): void {
    this.groupCount = 0;
    // Sum nearby flashes at render time; their independent decay stays unchanged.
    for (const flash of flashes) {
      if (flash.alpha <= 0.01) continue;
      let group: GlowGroup | undefined;
      for (let i = 0; i < this.groupCount; i++) {
        const candidate = this.glowGroups[i];
        if (candidate.color === flash.color && Math.abs(candidate.radius - flash.radius) < 1
          && Math.abs(candidate.x - flash.x) + Math.abs(candidate.y - flash.y) < flash.radius * 0.1) {
          group = candidate;
          break;
        }
      }
      if (group) {
        const sum = group.alpha + flash.alpha;
        group.x = (group.x * group.alpha + flash.x * flash.alpha) / sum;
        group.y = (group.y * group.alpha + flash.y * flash.alpha) / sum;
        group.alpha = sum;
      } else {
        const index = this.groupCount++;
        group = this.glowGroups[index] ??= { x: 0, y: 0, radius: 0, alpha: 0, color: flash.color };
        Object.assign(group, flash);
      }
    }
    for (let i = 0; i < this.groupCount; i++) {
      const group = this.glowGroups[i];
      ctx.globalAlpha = Math.min(0.45, group.alpha * 0.16);
      ctx.drawImage(this.glow(group.color), group.x - group.radius, group.y - group.radius, group.radius * 2, group.radius * 2);
    }
  }

  public render(ctx: CanvasRenderingContext2D, particles: Particle[], flashes: AmbientFlash[]): void {
    const started = this.profileEnabled ? performance.now() : 0;
    ctx.save();
    this.renderSmoke(ctx, particles);
    ctx.globalCompositeOperation = 'lighter';
    this.renderGlows(ctx, flashes);
    const scale = ctx.getTransform().a || 1;
    const width = ctx.canvas.width / scale;
    const height = ctx.canvas.height / scale;
    if (this.gpu) {
      if (this.gpu.render(ctx, particles, width, height)) {
        if (ctx.canvas.dataset.sparkRenderer !== 'webgl2') ctx.canvas.dataset.sparkRenderer = 'webgl2';
        ctx.restore();
        this.profile(ctx, started, this.gpu.visibleCount);
        return;
      }
      this.gpu = null;
      this.createAtlas();
    }
    if (ctx.canvas.dataset && ctx.canvas.dataset.sparkRenderer !== 'canvas2d') ctx.canvas.dataset.sparkRenderer = 'canvas2d';
    // All colors used in a frame fit; an exceptionally varied custom palette can
    // reclaim the atlas only between frames, when no draw references remain.
    if (this.stamps.size >= COLUMNS * COLUMNS) {
      this.stamps.clear();
      this.atlasCtx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
    }
    this.usedTrails.length = 0;

    // First collect trails, grouped by color, opacity, and line width.
    for (const p of particles) {
      if (!p.active || p.kind === 'smoke' || p.alpha <= 0.008) continue;
      const radius = Math.max(0.8, p.size * 1.25) * (0.6 + 0.4 * Math.sqrt(p.life / p.maxLife));
      if (Math.max(p.x, p.prevX) + radius < 0 || Math.min(p.x, p.prevX) - radius > width
        || Math.max(p.y, p.prevY) + radius < 0 || Math.min(p.y, p.prevY) - radius > height) continue;
      const progress = 1 - p.life / p.maxLife;
      const key = this.colorKey(
        Math.round(p.color.r + (p.fadeColor.r - p.color.r) * progress),
        Math.round(p.color.g + (p.fadeColor.g - p.color.g) * progress),
        Math.round(p.color.b + (p.fadeColor.b - p.color.b) * progress)
      );
      const index = this.stamp(key);
      ctx.globalAlpha = p.alpha;
      const size = radius * CELL / 15;
      if (index >= 0) {
        ctx.drawImage(this.atlas, (index % COLUMNS) * CELL, Math.floor(index / COLUMNS) * CELL,
          CELL, CELL, p.x - size / 2, p.y - size / 2, size, size);
      } else {
        ctx.fillStyle = this.color(key);
        ctx.beginPath();ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();ctx.arc(p.x, p.y, radius * 0.35, 0, Math.PI * 2);ctx.fill();
      }

      if (!p.trail || Math.abs(p.x - p.prevX) + Math.abs(p.y - p.prevY) < 0.7) continue;
      const opacity = Math.max(1, Math.round(p.alpha * 5));
      const widthIndex = Math.min(5, Math.max(1, Math.round(p.size * 0.4)));
      const lineWidth = widthIndex * 0.25;
      const batchKey = key * 64 + opacity * 8 + widthIndex;
      let batch = this.trails.get(batchKey);
      if (!batch) {
        batch = { color: this.color(key), alpha: opacity / 5, width: lineWidth, points: [], length: 0 };
        this.trails.set(batchKey, batch);
      }
      if (batch.length === 0) this.usedTrails.push(batch);
      const offset = batch.length;
      batch.points[offset] = p.prevX;
      batch.points[offset + 1] = p.prevY;
      batch.points[offset + 2] = p.x;
      batch.points[offset + 3] = p.y;
      batch.length += 4;
    }
    ctx.lineCap = 'round';
    for (const batch of this.usedTrails) {
      ctx.globalAlpha = batch.alpha;
      ctx.strokeStyle = batch.color;
      ctx.lineWidth = batch.width;
      ctx.beginPath();
      for (let i = 0; i < batch.length; i += 4) {
        ctx.moveTo(batch.points[i], batch.points[i + 1]);
        ctx.lineTo(batch.points[i + 2], batch.points[i + 3]);
      }
      ctx.stroke();
      batch.length = 0;
    }
    ctx.restore();
    this.profile(ctx, started, 0);
  }

  private profile(ctx: CanvasRenderingContext2D, started: number, visible: number): void {
    if (!this.profileEnabled) return;
    const now = performance.now();
    if (started - this.profileLastFrame > 200) {
      this.profileStart = started;
      this.profileFrames = 0;
      this.profileCost = 0;
    }
    this.profileLastFrame = now;
    if (!this.profileStart) this.profileStart = started;
    this.profileFrames++;
    this.profileCost += now - started;
    const elapsed = now - this.profileStart;
    if (elapsed < 1000) return;
    ctx.canvas.dataset.renderProfile = JSON.stringify({ sample: ++this.profileSamples, fps: Math.round(this.profileFrames * 1000 / elapsed),
      drawMs: +(this.profileCost / this.profileFrames).toFixed(2), visible });
    this.profileStart = now;
    this.profileFrames = 0;
    this.profileCost = 0;
  }

  private renderSmoke(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
    ctx.globalCompositeOperation = 'source-over';
    for (const p of particles) {
      if (!p.active || p.kind !== 'smoke' || p.alpha < 0.002) continue;
      if (!this.smoke) {
        this.smoke = document.createElement('canvas');
        this.smoke.width = this.smoke.height = 64;
        const smokeCtx = this.smoke.getContext('2d')!;
        const gradient = smokeCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(132,125,117,0.55)');
        gradient.addColorStop(0.5, 'rgba(106,104,103,0.22)');
        gradient.addColorStop(1, 'rgba(90,93,100,0)');
        smokeCtx.fillStyle = gradient;
        smokeCtx.fillRect(0, 0, 64, 64);
      }
      const age = 1 - p.life / p.maxLife;
      const radius = p.size * (1 + age * 3);
      ctx.globalAlpha = p.alpha;
      ctx.drawImage(this.smoke, p.x + Math.sin(p.seed + age * 4) * age * 18 - radius,
        p.y - radius, radius * 2, radius * 2);
    }
  }
}
