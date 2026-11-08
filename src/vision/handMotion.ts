import type { HandPose } from './gestureTypes';

type Motion = { x: number; y: number; time: number; vx: number; vy: number; size: number };

/** Predict only palm translation, never finger shape or gesture identity. */
export class HandMotion {
  private history = new Map<HandPose['handedness'], Motion>();

  public reset(): void { this.history.clear(); }

  public observe(hands: HandPose[], capturedAt: number): void {
    const present = new Set(hands.map(hand => hand.handedness));
    for (const id of this.history.keys()) if (!present.has(id)) this.history.delete(id);
    for (const hand of hands) {
      const { x, y } = hand.palmCenter, previous = this.history.get(hand.handedness);
      const size = Math.max(1, Math.hypot(hand.landmarks[0].x - hand.landmarks[9].x, hand.landmarks[0].y - hand.landmarks[9].y));
      const dt = previous ? capturedAt - previous.time : 0;
      let vx = 0, vy = 0;
      if (previous && dt > 0 && dt <= 200) {
        const dx = x - previous.x, dy = y - previous.y;
        // Reject identity jumps and stationary landmark noise. Stop/reverse immediately.
        if (Math.hypot(dx, dy) > size * 0.012 && Math.hypot(dx, dy) < size * 1.5) {
          vx = dx / dt; vy = dy / dt;
          if (vx * previous.vx + vy * previous.vy > 0) {
            vx = vx * 0.8 + previous.vx * 0.2;
            vy = vy * 0.8 + previous.vy * 0.2;
          }
        }
      }
      this.history.set(hand.handedness, { x, y, time: capturedAt, vx, vy, size });
    }
  }

  public project(hands: HandPose[], now: number): HandPose[] {
    return hands.map(hand => {
      const motion = this.history.get(hand.handedness);
      if (!motion) return hand;
      const age = Math.max(0, now - motion.time);
      // Never keep extrapolating a missing/old hand; cap both time and distance.
      const horizon = Math.min(70, age);
      let dx = motion.vx * horizon, dy = motion.vy * horizon;
      const length = Math.hypot(dx, dy), limit = motion.size * 0.5;
      if (length > limit) { dx *= limit / length; dy *= limit / length; }
      if (!dx && !dy) return hand;
      return {
        ...hand,
        landmarks: hand.landmarks.map(point => ({ ...point, x: point.x + dx, y: point.y + dy })),
        palmCenter: { ...hand.palmCenter, x: hand.palmCenter.x + dx, y: hand.palmCenter.y + dy },
        heldGesture: hand.heldGesture ? { ...hand.heldGesture, triggerPoint: { x: hand.heldGesture.triggerPoint.x + dx, y: hand.heldGesture.triggerPoint.y + dy } } : undefined
      };
    });
  }
}
