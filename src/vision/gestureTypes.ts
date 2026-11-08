export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
export type FingerState = 'extended' | 'folded' | 'uncertain';

export type GestureType =
  | 'NONE'
  | 'ROCKET'
  | 'ANAR'
  | 'STARBURST'
  | 'ROMAN_CANDLE'
  | 'PHOOLJHADI'
  | 'GRAND_FINALE'
  | 'GANGA_JAMUNA'
  | 'CHAKRI'
  | 'SUTLI_BOMB'
  | 'BULLET_BOMB';

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
}

export interface ScreenLandmark {
  x: number;
  y: number;
  z: number;
}

export interface HandPose {
  handedness: 'Left' | 'Right';
  landmarks: ScreenLandmark[]; // Screen-space pixel coordinates (already mirrored)
  rawLandmarks: NormalizedLandmark[];
  extendedFingers: {
    thumb: boolean;
    index: boolean;
    middle: boolean;
    ring: boolean;
    pinky: boolean;
  };
  palmCenter: ScreenLandmark;
  fingerStates?: Record<FingerName, FingerState>;
  heldGesture?: { type: GestureType; triggerPoint: { x: number; y: number } };
  pinchDistance: number;
  isPinching: boolean;
}

export interface DetectedGesture {
  type: GestureType;
  confidence: number;
  triggerPoint: { x: number; y: number }; // Pixel coordinate where firework originates
  handIndex: number;
  handedness?: 'Left' | 'Right';
  isContinuous: boolean; // True for Anar and Sparkler
}
