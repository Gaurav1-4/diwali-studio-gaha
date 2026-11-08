export interface QualityProfile {
  name: 'low' | 'balanced' | 'high';
  pixels: number;
  particles: number;
  smoke: number;
  emission: number;
  fps: number;
  trackingHz: number;
}
export const QUALITY: readonly QualityProfile[] = [
  { name: 'low', pixels: 786432, particles: 1600, smoke: 16, emission: 0.32, fps: 30, trackingHz: 24 },
  { name: 'balanced', pixels: 1440000, particles: 3600, smoke: 48, emission: 0.62, fps: 60, trackingHz: 30 },
  { name: 'high', pixels: 3686400, particles: 7500, smoke: 192, emission: 1, fps: 60, trackingHz: 30 }
];
export interface DeviceHints { cores?: number; memory?: number; saveData?: boolean; }
export function startingQuality(hints: DeviceHints): number {
  if (hints.saveData || (hints.cores !== undefined && hints.cores <= 2) || (hints.memory !== undefined && hints.memory <= 2)) return 0;
  if ((hints.cores !== undefined && hints.cores <= 4) || (hints.memory !== undefined && hints.memory <= 4)) return 1;
  return 2;
}

/** Sustained slow frames lower the budget; recovery is deliberately slower. */
export class AdaptiveQuality {
  public level: number;
  private ceiling: number;
  private started = 0;
  private frames = 0;
  private elapsed = 0;
  private work = 0;
  private healthyWindows = 0;
  public get profile(): QualityProfile { return QUALITY[this.level]; }

  constructor(hints: DeviceHints = {}, private forced?: number) {
    this.ceiling = startingQuality(hints);
    this.level = forced ?? this.ceiling;
  }

  public sample(now: number, interval: number, work: number, busy: boolean, trackingMs = 0): boolean {
    if (this.forced !== undefined || !busy || interval > 200) { this.healthyWindows = 0; this.reset(now); return false; }
    if (!this.started) this.started = now;
    this.frames++; this.elapsed += interval; this.work += work;
    if (now - this.started < 1800) return false;
    const mean = this.elapsed / this.frames, cost = this.work / this.frames;
    const slow = mean > 1000 / this.profile.fps * 1.38 || cost > 1000 / this.profile.fps * 0.85 || trackingMs > 80;
    const healthy = mean < 1000 / this.profile.fps * 1.1 && cost < 6 && trackingMs < 55;
    this.healthyWindows = healthy ? this.healthyWindows + 1 : 0;
    let changed = false;
    if (slow && this.level > 0) { this.level--; this.healthyWindows = 0; changed = true; }
    else if (this.healthyWindows >= 5 && this.level < this.ceiling) { this.level++; this.healthyWindows = 0; changed = true; }
    this.reset(now);
    return changed;
  }
  private reset(now: number): void { this.started = now; this.frames = 0; this.elapsed = 0; this.work = 0; }
}
