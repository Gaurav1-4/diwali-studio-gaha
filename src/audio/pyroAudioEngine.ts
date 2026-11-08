/**
 * Authentic Pyrotechnics Audio Engine
 * Loads and plays real recorded Diwali firecracker samples with zero latency,
 * pitch randomization, smooth looping, and heavy aerial blast synthesis.
 */

const SAMPLE_FILES: Record<string, string> = {
  ROCKET_WHISTLE: '/audio/rocket-whistle.mp3', ROCKET_EXPLOSION: '/audio/rocket-explosion.mp3',
  STARBURST: '/audio/starburst.mp3', HEAVY_EXPLOSION: '/audio/heavy-explosion-hit.mp3',
  THUNDER_CRACK: '/audio/thunder-crack.mp3', AERIAL_BURST: '/audio/aerial-shell-burst.mp3',
  ROMAN_POP: '/audio/roman-pop.mp3', ANAR: '/audio/anar-fountain.mp3', SPARKLER: '/audio/sparkler.mp3',
  FINALE: '/audio/finale-barrage.mp3', CHAKRI: '/audio/chakri-spin.mp3'
};

export class PyroAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;
  public isMuted: boolean = false;
  private isUnlocked: boolean = false;
  public onStateChange?: () => void;
  public get needsActivation(): boolean { return !this.ctx || this.ctx.state !== 'running'; }
  private watchdogTimer: number | null = null;
  private downloads = new Map<string, Promise<ArrayBuffer | null>>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private pendingShots = new Map<string, { at: number; volume: number; pitch: number; duration?: number; rate: number }>();
  private played = 0;
  public get diagnostics(): object { return { state: this.ctx?.state ?? 'locked', muted: this.isMuted, samples: this.buffers.size, played: this.played }; }

  /** Download recordings early, without creating or starting an audio context. */
  public resumeIfActivated(): void { if (this.ctx) this.resume(); }

  public prepare(): void { for (const key of Object.keys(SAMPLE_FILES)) void this.download(key); }

  private resume(): void {
    if (!this.ctx || this.ctx.state === 'closed') return;
    if (this.ctx.state !== 'running') void this.ctx.resume().then(() => this.onStateChange?.(), () => this.onStateChange?.());
    this.onStateChange?.();
  }

  // Decoded Audio Buffers
  private buffers: Map<string, AudioBuffer> = new Map();

  // Active continuous loop source nodes
  private anarLoopSource: AudioBufferSourceNode | null = null;
  private anarGain: GainNode | null = null;
  private anarActive: boolean = false;

  private sparklerLoopSource: AudioBufferSourceNode | null = null;
  private sparklerGain: GainNode | null = null;
  private sparklerActive: boolean = false;

  private lastAnarPulse: number = 0;
  private lastSparklerPulse: number = 0;
  private chakriLoopSource: AudioBufferSourceNode | null = null;
  private chakriGain: GainNode | null = null;
  private lastChakriPulse = 0;

  constructor() {
    // Lazy AudioContext initialization
  }

  public unlock(): void {
    if (this.isUnlocked && this.ctx && this.ctx.state !== 'closed') { this.resume(); return; }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : 0.95;

      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 12;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.18;
      this.masterGain.connect(limiter);
      const outputGain = this.ctx.createGain();
      outputGain.gain.value = 0.7; // Leave headroom for transients and recording codecs.
      limiter.connect(outputGain);
      outputGain.connect(this.ctx.destination);

      // Create stream destination for recording
      this.recordingDestination = this.ctx.createMediaStreamDestination();
      outputGain.connect(this.recordingDestination);

      this.isUnlocked = true;
      this.ctx.onstatechange = () => this.onStateChange?.();
      // This must run synchronously in the first tap/click, including on iOS.
      this.resume();

      // Load all authentic audio samples
      this.preloadSamples();

      // Start continuous loop watchdog
      this.watchdogTimer ??= window.setInterval(() => this.watchdog(), 80);
    } catch (e) {
      console.warn('AudioContext unlock failed:', e);
    }
  }

  private download(key: string): Promise<ArrayBuffer | null> {
    let pending = this.downloads.get(key);
    if (!pending) {
      pending = fetch(SAMPLE_FILES[key]).then(response => {
        if (!response.ok) throw new Error(`Audio request failed: ${response.status}`);
        return response.arrayBuffer();
      }).catch(error => { console.warn(`Audio sample ${key} unavailable:`, error); return null; });
      this.downloads.set(key, pending);
    }
    return pending;
  }

  private loadSample(key: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(key);
    if (cached) return Promise.resolve(cached);
    let pending = this.loading.get(key);
    if (!pending) {
      const context = this.ctx;
      pending = this.download(key).then(async data => {
        if (!context || !data) return null;
        const buffer = await context.decodeAudioData(data.slice(0));
        this.buffers.set(key, buffer);
        return buffer;
      }).catch(error => { console.warn(`Audio decode failed (${key}):`, error); return null; });
      this.loading.set(key, pending);
    }
    return pending;
  }

  private async preloadSamples(): Promise<void> {
    await Promise.all(Object.keys(SAMPLE_FILES).map(key => this.loadSample(key)));
  }

  public getAudioStream(): MediaStreamTrack | null {
    return this.recordingDestination?.stream.getAudioTracks()[0] || null;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isMuted) this.pendingShots.clear();
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 0.95, this.ctx.currentTime, 0.05);
    }
    this.onStateChange?.();
    return this.isMuted;
  }

  /**
   * Plays a one-shot sample with randomized pitch (±4%)
   */
  private playSample(key: string, volume: number = 1.0, pitchVariation: number = 0.06, maxDuration?: number, baseRate: number = 1): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const buffer = this.buffers.get(key);
    if (!buffer) {
      // Preserve the first action while its recording decodes, without a burst of stale sounds.
      const alreadyPending = this.pendingShots.has(key);
      this.pendingShots.set(key, { at: performance.now(), volume, pitch: pitchVariation, duration: maxDuration, rate: baseRate });
      if (!alreadyPending) void this.loadSample(key).then(loaded => {
        const shot = this.pendingShots.get(key); this.pendingShots.delete(key);
        if (!shot || this.isMuted || performance.now() - shot.at > 1200) return;
        if (loaded) this.playSample(key, shot.volume, shot.pitch, shot.duration, shot.rate);
        else this.fallbackBoom(shot.volume);
      });
      return;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    // Pitch randomization
    const rate = baseRate * (1.0 + (Math.random() - 0.5) * pitchVariation * 2);
    source.playbackRate.value = rate;

    const gain = this.ctx.createGain();
    gain.gain.value = volume;

    source.connect(gain);
    gain.connect(this.masterGain);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.start();
    this.played++;
    if (maxDuration) {
      const end = this.ctx.currentTime + maxDuration;
      gain.gain.setValueAtTime(volume, Math.max(this.ctx.currentTime, end - 0.08));
      gain.gain.linearRampToValueAtTime(0, end);
      source.stop(end);
    }
  }

  public playFuse(intensity = 1): void {
    this.playSample('SPARKLER', 0.12 * intensity, 0.04, intensity < 1 ? 0.68 : 1.2, 1.18);
  }

  public playBomb(heavy: boolean): void {
    if (heavy) {
      this.playSample('THUNDER_CRACK', 0.95, 0.025, 2.5, 0.82);
      this.playExplosion(0.95);
    } else {
      this.playSample('THUNDER_CRACK', 0.72, 0.025, 1.2, 1.05);
      this.playSample('HEAVY_EXPLOSION', 0.72, 0.03, 1.1, 1.04);
    }
  }

  public playGangaBurst(): void {
    this.playSample('THUNDER_CRACK', 0.7, 0.03, 1.8);
    this.playSample('HEAVY_EXPLOSION', 0.65, 0.04, 1.7);
  }

  public pulseChakriLoop(): void {
    this.lastChakriPulse = performance.now();
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    if (!this.chakriLoopSource) {
      this.startContinuousSample('CHAKRI', (source, gain) => {
        this.chakriLoopSource = source;
        this.chakriGain = gain;
      });
    }
  }

  /**
   * 1. Rocket Launch Whistle
   */
  public playRocketLaunch(): void {
    this.playSample('ROCKET_WHISTLE', 0.95, 0.05);
  }

  /**
   * 2. Rocket / Shell / Starburst Explosion
   * Powerful, layered aerial bomb burst with deep sub-bass punch
   */
  public playExplosion(intensity: number = 1.0): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    // Layer 1: Heavy Concussive Bomb Hit
    this.playSample('HEAVY_EXPLOSION', Math.min(1.0, 0.95 * intensity), 0.07);

    // Layer 2: Aerial Shell Crack & Sizzling Debris
    this.playSample('AERIAL_BURST', Math.min(1.0, 0.85 * intensity), 0.05);

    // Layer 3: Sub-Bass Sine Drop for physical chest rumble
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(115, now);
      osc.frequency.exponentialRampToValueAtTime(26, now + 0.65);

      oscGain.gain.setValueAtTime(0.7 * intensity, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(oscGain);
      oscGain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.75);
      osc.onended = () => { osc.disconnect(); oscGain.disconnect(); };
    } catch {
      // Ignore sub-bass if context busy
    }
  }

  /**
   * 3. Roman Candle Pop
   */
  public playRomanPop(): void {
    this.playSample('ROMAN_POP', 0.85, 0.08);
  }

  /**
   * 4. Grand Finale Multi-Burst
   */
  public playFinaleBarrage(): void {
    this.playSample('FINALE', 1.0, 0.04);
  }

  /**
   * 5. Continuous Anar Fountain Roar
   */
  public pulseAnarLoop(): void {
    this.lastAnarPulse = performance.now();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    if (!this.anarActive) {
      this.startContinuousSample('ANAR', (src, gain) => {
        this.anarLoopSource = src;
        this.anarGain = gain;
        this.anarActive = true;
      });
    } else if (this.anarGain) {
      this.anarGain.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * 6. Continuous Sparkler Crackle
   */
  public pulseSparklerLoop(): void {
    this.lastSparklerPulse = performance.now();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    if (!this.sparklerActive) {
      this.startContinuousSample('SPARKLER', (src, gain) => {
        this.sparklerLoopSource = src;
        this.sparklerGain = gain;
        this.sparklerActive = true;
      });
    } else if (this.sparklerGain) {
      this.sparklerGain.gain.setTargetAtTime(0.8, this.ctx.currentTime, 0.05);
    }
  }

  private startContinuousSample(
    key: string,
    callback: (src: AudioBufferSourceNode, gain: GainNode) => void
  ): void {
    if (!this.ctx || !this.masterGain) return;
    const buffer = this.buffers.get(key);
    if (!buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.85, this.ctx.currentTime + 0.1);

    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();
    this.played++;

    callback(source, gain);
  }

  private watchdog(): void {
    if (!this.ctx) return;
    const now = performance.now();

    if (this.chakriLoopSource && now - this.lastChakriPulse > 150) {
      this.chakriGain?.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      if (now - this.lastChakriPulse > 300) {
        this.stopSource(this.chakriLoopSource);
        this.chakriLoopSource = null;
        this.chakriGain?.disconnect();
        this.chakriGain = null;
      }
    } else if (this.chakriGain) {
      this.chakriGain.gain.setTargetAtTime(0.65, this.ctx.currentTime, 0.05);
    }

    if (this.anarActive && now - this.lastAnarPulse > 150) {
      if (this.anarGain) {
        this.anarGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      }
      if (now - this.lastAnarPulse > 300) {
        this.stopSource(this.anarLoopSource);
        this.anarLoopSource = null;
        this.anarGain = null;
        this.anarActive = false;
      }
    }

    if (this.sparklerActive && now - this.lastSparklerPulse > 150) {
      if (this.sparklerGain) {
        this.sparklerGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      }
      if (now - this.lastSparklerPulse > 300) {
        this.stopSource(this.sparklerLoopSource);
        this.sparklerLoopSource = null;
        this.sparklerGain = null;
        this.sparklerActive = false;
      }
    }
  }

  private stopSource(src: AudioBufferSourceNode | null): void {
    if (!src) return;
    try {
      src.stop();
      src.disconnect();
    } catch {
      // Ignore if already stopped
    }
  }

  private fallbackBoom(volume: number): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.5);
    gain.gain.setValueAtTime(0.7 * volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.6);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }
}
