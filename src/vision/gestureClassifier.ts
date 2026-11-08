import { GestureType, HandPose, DetectedGesture, FingerName } from './gestureTypes';

type Candidate = { type: GestureType; point: { x: number; y: number }; continuous: boolean };
const COOLDOWNS: Record<GestureType, number> = {
  NONE: 0, ROCKET: 650, ANAR: 0, STARBURST: 1200, ROMAN_CANDLE: 1300, PHOOLJHADI: 0,
  GRAND_FINALE: 8000, GANGA_JAMUNA: 4200, CHAKRI: 650, SUTLI_BOMB: 650, BULLET_BOMB: 650
};
const extended = (h: HandPose, ...names: FingerName[]) => names.every(name => h.fingerStates ? h.fingerStates[name] === 'extended' : h.extendedFingers[name]);
const folded = (h: HandPose, ...names: FingerName[]) => names.every(name => h.fingerStates ? h.fingerStates[name] === 'folded' : !h.extendedFingers[name]);
const palmSize = (h: HandPose) => Math.max(1,
  Math.hypot(h.landmarks[0].x - h.landmarks[9].x, h.landmarks[0].y - h.landmarks[9].y),
  Math.hypot(h.landmarks[5].x - h.landmarks[17].x, h.landmarks[5].y - h.landmarks[17].y));
const thumbUp = (h: HandPose) => extended(h, 'thumb') && h.landmarks[4].y < h.landmarks[2].y - palmSize(h) * 0.35;
const fist = (h: HandPose) => folded(h, 'index', 'middle', 'ring', 'pinky') && !thumbUp(h);
const FINGER_TIPS = { index: 8, middle: 12, ring: 16, pinky: 20 } as const;
function upright(h: HandPose, ...names: (keyof typeof FINGER_TIPS)[]): boolean {
  const size = palmSize(h);
  return extended(h, ...names) && names.every(name => {
    const tip = FINGER_TIPS[name], marks = h.landmarks;
    return marks[tip].y < marks[tip - 3].y - size * 0.35 && marks[tip].y < marks[tip - 2].y - size * 0.1;
  });
}

function openPalm(hand: HandPose): boolean {
  const fingers = ['index', 'middle', 'ring', 'pinky'] as const;
  const marks = hand.landmarks, size = palmSize(hand);
  const ax = marks[9].x - marks[0].x, ay = marks[9].y - marks[0].y;
  const length = Math.hypot(ax, ay);
  // Measure finger reach along the palm, so a spread/tilted hand still works.
  // Keep the upward intent and require all four fingertips outside the knuckles.
  if (hand.isPinching || length < 1 || ay / length > -0.25) return false;
  let longFingers = 0;
  for (const name of fingers) {
    const tip = FINGER_TIPS[name], base = tip - 3, pip = tip - 2;
    const reach = ((marks[tip].x - marks[base].x) * ax + (marks[tip].y - marks[base].y) * ay) / length;
    const beyondPip = ((marks[tip].x - marks[pip].x) * ax + (marks[tip].y - marks[pip].y) * ay) / length;
    if (reach < size * 0.35 || beyondPip < size * 0.05) return false;
    if (reach > size * 0.65) longFingers++;
  }
  return longFingers >= 3;
}

export class GestureClassifier {
  private pending = new Map<number, { type: GestureType; since: number }>();
  private lastFired = new Map<string, number>();
  private pairGraceUntil = -Infinity;

  public classify(hands: HandPose[], _screenW: number): DetectedGesture[] {
    const now = performance.now();
    const palms = hands.filter(openPalm);
    if (palms.length >= 2) {
      this.pending.delete(0); this.pending.delete(1);
      this.pairGraceUntil = now + 220;
      const point = { x: (palms[0].palmCenter.x + palms[1].palmCenter.x) / 2, y: (palms[0].palmCenter.y + palms[1].palmCenter.y) / 2 };
      for (const hand of hands) hand.heldGesture = { type: 'GRAND_FINALE', triggerPoint: point };
      return this.stabilize({ type: 'GRAND_FINALE', point, continuous: false }, -1, now, 300);
    }
    this.pending.delete(-1);
    const present = new Set<number>();
    const results: DetectedGesture[] = [];
    // Each hand uses the existing one-hand signs, with its own hold and cooldown.
    // Other signs stay independent; only the two-open-palm finale combines hands.
    for (const hand of hands) {
      const id = hand.handedness === 'Left' ? 0 : 1;
      if (present.has(id)) continue;
      present.add(id);
      const candidate = this.single(hand);
      hand.heldGesture = candidate ? { type: candidate.type, triggerPoint: candidate.point } : undefined;
      if (!candidate || (candidate.type === 'CHAKRI' && now < this.pairGraceUntil)) { this.pending.delete(id); continue; }
      const hold = candidate.type === 'PHOOLJHADI' ? 70 : candidate.type === 'CHAKRI' ? 220 : candidate.type === 'SUTLI_BOMB' ? 250 : 180;
      const result = this.stabilize(candidate, id, now, hold);
      if (result[0]) result[0].handedness = hand.handedness;
      results.push(...result);
    }
    for (const id of this.pending.keys()) if (!present.has(id)) this.pending.delete(id);
    return results;
  }

  private single(hand: HandPose): Candidate | null {
    const marks = hand.landmarks, center = hand.palmCenter;
    const candidate = (type: GestureType, point: Candidate['point'] = center, continuous = false): Candidate => ({ type, point, continuous });
    // A real thumb/index pinch projects beyond the knuckles; thumb contact inside a fist does not.
    const pinch = { x: (marks[4].x + marks[8].x) / 2, y: (marks[4].y + marks[8].y) / 2 };
    const size = palmSize(hand);
    const okFingers = (['middle', 'ring', 'pinky'] as const).filter(name => {
      const tip = FINGER_TIPS[name];
      return extended(hand, name) || (marks[tip].y < marks[tip - 3].y - size * 0.35 && marks[tip].y < marks[tip - 2].y - size * 0.05);
    }).length >= 2;
    if (hand.isPinching && (okFingers || pinch.y < marks[5].y - palmSize(hand) * 0.08 || Math.abs(pinch.x - marks[5].x) > palmSize(hand) * 0.35)) return candidate('PHOOLJHADI', pinch, true);
    if (openPalm(hand)) return candidate('CHAKRI');
    if (fist(hand)) return candidate('ANAR', center, true);
    if (hand.isPinching) return null;
    if (thumbUp(hand) && folded(hand, 'index', 'middle', 'ring', 'pinky')) return candidate('BULLET_BOMB', marks[4]);
    if (upright(hand, 'index') && folded(hand, 'middle', 'ring', 'pinky')) {
      if (extended(hand, 'thumb')) return candidate('STARBURST', marks[8]);
      if (folded(hand, 'thumb')) return candidate('ROCKET', marks[8]);
    }
    if (upright(hand, 'index', 'middle') && folded(hand, 'ring', 'pinky')) {
      if (extended(hand, 'thumb')) return candidate('SUTLI_BOMB');
      if (folded(hand, 'thumb')) return candidate('ROMAN_CANDLE', marks[8]);
    }
    if (upright(hand, 'index', 'middle', 'ring') && folded(hand, 'thumb', 'pinky')) return candidate('SUTLI_BOMB');
    if (upright(hand, 'index', 'pinky') && folded(hand, 'middle', 'ring')) return candidate('GANGA_JAMUNA');
    return null;
  }

  private stabilize(candidate: Candidate, id: number, now: number, hold: number): DetectedGesture[] {
    const pending = this.pending.get(id);
    if (!pending || pending.type !== candidate.type) { this.pending.set(id, { type: candidate.type, since: now }); return []; }
    if (now - pending.since < hold) return [];
    const key = `${candidate.type}_${id}`;
    if (!candidate.continuous && now - (this.lastFired.get(key) ?? -Infinity) < COOLDOWNS[candidate.type]) return [];
    if (!candidate.continuous) this.lastFired.set(key, now);
    return [{ type: candidate.type, triggerPoint: candidate.point, confidence: 0.95, handIndex: id, isContinuous: candidate.continuous }];
  }
}
