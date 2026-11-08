import { ParticlePool, ParticleColor } from '../particles/particle';
import { FireworkEffect, SoundTriggerCallback } from './fireworkTypes';
import { Rocket } from './rocket';
import { Anar } from './anar';
import { Starburst } from './starburst';
import { RomanCandle } from './romanCandle';
import { Sparkler } from './sparkler';
import { GrandFinale } from './grandFinale';
import { DetectedGesture } from '../vision/gestureTypes';
import { COLORS } from './fireworkColors';
import { GangaJamuna } from './gangaJamuna';
import { Chakri } from './chakri';
import { Bomb } from './bomb';
import { CrackerType } from './catalog';
import type { HandPose } from '../vision/gestureTypes';

export class FireworkDirector {
  public pool: ParticlePool = new ParticlePool();
  private effects: FireworkEffect[] = [];
  private continuousAnars: Map<number, BurningEmitter> = new Map();
  private continuousSparklers: Map<number, BurningEmitter> = new Map();
  private onSound?: SoundTriggerCallback;
  private accumulatedTime = 0;
  private manualEmitters = new Map<BurningEmitter, 'ANAR' | 'PHOOLJHADI'>();
  private manualLaunchers = new Map<FireworkEffect, CrackerType>();
  private attached = new Map<number, { type: CrackerType; effect: FireworkEffect; missingFor: number }>();
  public get activeCount(): number { return this.effects.length; }

  constructor(onSound?: SoundTriggerCallback) {
    this.onSound = onSound;
  }

  public setSoundCallback(cb: SoundTriggerCallback): void {
    this.onSound = cb;
  }

  public ignite(type: CrackerType, x: number, y: number, screenW: number, screenH: number): void {
    const before = this.effects.length;
    switch (type) {
      case 'ROCKET': this.effects.push(new Rocket(x, y, Math.min(y - 100, screenH * (0.12 + Math.random() * 0.2)), this.onSound, Math.min(1, screenH / 1300))); break;
      case 'STARBURST': new Starburst(x, y, this.pool, this.onSound, Math.min(1, screenH / 1300)); break;
      case 'ROMAN_CANDLE': this.effects.push(new RomanCandle(x, y, this.onSound)); break;
      case 'GRAND_FINALE': this.effects.push(new GrandFinale(screenW, screenH, this.onSound)); break;
      case 'GANGA_JAMUNA': this.effects.push(new GangaJamuna(x, y, this.onSound, Math.min(1, screenH / 1000))); break;
      case 'CHAKRI': this.effects.push(new Chakri(x, y, this.onSound)); break;
      case 'SUTLI_BOMB': this.effects.push(new Bomb(x, y, true, this.onSound)); break;
      case 'BULLET_BOMB': this.effects.push(new Bomb(x, y, false, this.onSound)); break;
      case 'ANAR':
      case 'PHOOLJHADI': {
        this.startEmitter(type, x, y, screenH, false);
        break;
      }
    }
    const added = this.effects[this.effects.length - 1];
    if (this.effects.length > before && added.updatePosition && type !== 'ANAR' && type !== 'PHOOLJHADI') this.manualLaunchers.set(added, type);
  }

  /**
   * Handle gestures recognized in current frame
   */
  public handleGestures(
    gestures: DetectedGesture[],
    screenW: number,
    screenH: number,
    hands: HandPose[] = []
  ): void {
    const activeAnarHands = new Set<number>();
    const activeSparklerHands = new Set<number>();

    for (const g of gestures) {
      const { type, triggerPoint, handIndex } = g;

      switch (type) {
        case 'ANAR': {
          activeAnarHands.add(handIndex);
          let anar = this.continuousAnars.get(handIndex);
          if (!anar || !anar.active) {
            anar = this.startEmitter('ANAR', triggerPoint.x, triggerPoint.y, screenH, true);
            this.continuousAnars.set(handIndex, anar);
          } else {
            anar.updatePosition(triggerPoint.x, triggerPoint.y);
          }
          break;
        }

        case 'PHOOLJHADI': {
          activeSparklerHands.add(handIndex);
          let sparkler = this.continuousSparklers.get(handIndex);
          if (!sparkler || !sparkler.active) {
            sparkler = this.startEmitter('PHOOLJHADI', triggerPoint.x, triggerPoint.y, screenH, true);
            this.continuousSparklers.set(handIndex, sparkler);
          } else {
            sparkler.updatePosition(triggerPoint.x, triggerPoint.y);
          }
          break;
        }

        default: {
          if (type !== 'NONE') {
            let effect: FireworkEffect | undefined;
            for (const [candidate, kind] of this.manualLaunchers) if (candidate.active && kind === type) effect = candidate;
            if (!effect) {
              const before = this.effects.length;
              this.ignite(type, triggerPoint.x, triggerPoint.y, screenW, screenH);
              if (this.effects.length > before) effect = this.effects[this.effects.length - 1];
            }
            if (effect?.updatePosition) {
              this.manualLaunchers.delete(effect);
              effect.updatePosition(triggerPoint.x, triggerPoint.y);
              this.attached.set(handIndex, { type, effect, missingFor: 0 });
            }
          }
          break;
        }
      }
    }

    // Apply the same continuity and release rules to every hand-held continuous emitter.
    for (const [type, emitters, active] of [
      ['ANAR', this.continuousAnars, activeAnarHands],
      ['PHOOLJHADI', this.continuousSparklers, activeSparklerHands]
    ] as const) for (const [id, emitter] of emitters) {
      if (active.has(id)) emitter.hold();
      else {
        const hand = hands.find(h => (h.handedness === 'Left' ? 0 : 1) === id);
        const switched = gestures.some(g => g.handIndex === id && g.type !== 'NONE') || (hand?.heldGesture && hand.heldGesture.type !== type);
        if (switched) emitter.stop();
        else {
          if (hand) {
            const point = type === 'PHOOLJHADI' ? { x: (hand.landmarks[4].x + hand.landmarks[8].x) / 2, y: (hand.landmarks[4].y + hand.landmarks[8].y) / 2 } : hand.palmCenter;
            emitter.updatePosition(point.x, point.y);
          }
          emitter.release();
        }
        if (!emitter.active) emitters.delete(id);
      }
    }
    // Finite fountains, wheels, bombs and candle launchers move while their sign is held.
    for (const [id, binding] of this.attached) {
      const hand = hands.find(h => (h.handedness === 'Left' ? 0 : 1) === id);
      const held = hand?.heldGesture;
      if (!binding.effect.active || (held && held.type !== binding.type)) { this.attached.delete(id); continue; }
      if (held) { binding.effect.updatePosition?.(held.triggerPoint.x, held.triggerPoint.y); binding.missingFor = 0; }
      else if (hand && binding.missingFor <= 0.22) binding.effect.updatePosition?.(hand.palmCenter.x, hand.palmCenter.y);
    }
  }

  private startEmitter(type: 'ANAR' | 'PHOOLJHADI', x: number, y: number, screenH: number, held: boolean): BurningEmitter {
    if (held) {
      let reusable: BurningEmitter | undefined;
      for (const [candidate, kind] of this.manualEmitters) if (candidate.active && kind === type) reusable = candidate;
      if (reusable) {
        this.manualEmitters.delete(reusable);
        reusable.hold(0.22); reusable.updatePosition(x, y);
        return reusable;
      }
    }
    const emitter = type === 'ANAR'
      ? new Anar(x, y, this.onSound, Math.min(1, screenH / 1000))
      : new Sparkler(x, y, this.onSound);
    const burning = new BurningEmitter(emitter, held, held ? 0.22 : 3.5);
    this.effects.push(burning);
    if (!held) this.manualEmitters.set(burning, type);
    return burning;
  }

  /**
   * Main per-frame simulation and render step
   */
  public updateAndRender(dt: number, ctx: CanvasRenderingContext2D): void {
    // Keep the original 60 Hz choreography, regardless of screen refresh rate.
    this.accumulatedTime += Math.min(dt, 0.1);
    const step = 1 / 60;
    while (this.accumulatedTime + 1e-9 >= step) {
      this.simulate(step);
      this.accumulatedTime -= step;
    }
    for (const effect of this.effects) effect.render?.(ctx);
    this.pool.render(ctx);
  }

  private simulate(dt: number): void {
    for (const [id, binding] of this.attached) {
      binding.missingFor += dt;
      if (!binding.effect.active) this.attached.delete(id);
    }
    // 1. Update active high-level firework systems
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.update(dt, this.pool);
      if (!effect.active) {
        this.manualLaunchers.delete(effect);
        if (effect instanceof BurningEmitter) this.manualEmitters.delete(effect);
        this.effects.splice(i, 1);
      }
    }

    // 2. Update particle physics with micro-crackle pop callback
    this.pool.update(dt, (x: number, y: number, color: ParticleColor) => {
      // Spawn 3 micro-sparks on crackle pop
      for (let k = 0; k < 2; k++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = Math.random() * 4 + 1;
        this.pool.spawn({
          x,
          y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          color: COLORS.WHITE_HOT,
          fadeColor: color,
          size: 0.7 + Math.random() * 0.6,
          life: 0.12 + Math.random() * 0.15,
          drag: 0.9,
          gravity: 0.05
        });
      }
    });

  }

  public clear(): void {
    for (const effect of this.effects) effect.active = false;
    this.effects = [];
    this.continuousAnars.clear();
    this.continuousSparklers.clear();
    this.manualEmitters.clear();
    this.manualLaunchers.clear();
    this.attached.clear();
    this.pool.clear();
    this.accumulatedTime = 0;
  }
}

/** A lit fountain/sparkler follows its hand, then burns out in place after release. */
class BurningEmitter implements FireworkEffect {
  public active = true;
  private remaining = 3.5;

  constructor(private emitter: Anar | Sparkler, private held: boolean, private burnTime = 3.5) { this.remaining = burnTime; }

  public updatePosition(x: number, y: number): void { this.emitter.updatePosition(x, y); }
  public hold(burnTime = this.burnTime): void { this.burnTime = burnTime; this.held = true; this.remaining = burnTime; }
  public release(): void { this.held = false; }
  public stop(): void { this.emitter.stop(); this.active = false; }

  public update(dt: number, pool: ParticlePool): void {
    if (!this.active) return;
    if (!this.held) this.remaining -= dt;
    if (this.remaining <= 0) {
      this.emitter.stop();
      this.active = false;
      return;
    }
    this.emitter.update(dt, pool);
  }
}
