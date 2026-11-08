import { GestureType } from '../vision/gestureTypes';

export type CrackerType = Exclude<GestureType, 'NONE'>;
export interface Cracker {
  type: CrackerType;
  name: string;
  category: 'Sky' | 'Ground' | 'Spark';
  gesture: string;
  gestureHint?: string;
  description: string;
  color: string;
  key: string;
  isNew?: boolean;
}

export const CRACKERS: Cracker[] = [
  { type: 'ROCKET', name: 'Rocket', category: 'Sky', gesture: 'One finger up', gestureHint: '1 finger', description: 'A golden ascent. A sky full of falling stars.', color: '#f8bb64', key: '1' },
  { type: 'ANAR', name: 'Anar', category: 'Ground', gesture: 'Closed fist', description: 'A roaring fountain of molten gold and crackling embers.', color: '#ffaf56', key: '2' },
  { type: 'STARBURST', name: 'Starburst', category: 'Sky', gesture: 'L sign: index up, thumb out', gestureHint: 'L sign', description: 'A brilliant shell of color, breaking into a thousand sparks.', color: '#dca4ff', key: '3' },
  { type: 'ROMAN_CANDLE', name: 'Roman candle', category: 'Sky', gesture: 'Two fingers up', gestureHint: '2 fingers', description: 'Five colorful comets, one after another.', color: '#9bd2ff', key: '4' },
  { type: 'PHOOLJHADI', name: 'Phooljhadi', category: 'Spark', gesture: 'Pinch thumb and index', gestureHint: 'Pinch', description: 'A silver-gold sparkler. Draw a little light in the air.', color: '#fff0b4', key: '5' },
  { type: 'GRAND_FINALE', name: 'Grand finale', category: 'Sky', gesture: 'Both palms open', gestureHint: '2 palms', description: 'The whole sky celebrates. A cascading, colorful curtain call.', color: '#fca1ac', key: '6' },
  { type: 'GANGA_JAMUNA', name: 'Ganga Jamuna', category: 'Ground', gesture: 'Index and little finger up', gestureHint: 'Outer tips', description: 'First the fountain. Then the surprise: a brilliant, booming burst.', color: '#9fe4be', key: '7', isNew: true },
  { type: 'CHAKRI', name: 'Chakri', category: 'Ground', gesture: 'Open palm', description: 'A spinning wheel of silver fire, gathering speed into a golden halo.', color: '#a9c7ff', key: '8', isNew: true },
  { type: 'SUTLI_BOMB', name: 'Sutli bomb', category: 'Ground', gesture: 'Three fingers up', gestureHint: '3 fingers', description: 'A glowing fuse, a split-second flash, and a deep, heavy boom.', color: '#f5b38d', key: '9', isNew: true },
  { type: 'BULLET_BOMB', name: 'Bullet bomb', category: 'Ground', gesture: 'Thumb up', description: 'Small but spirited. A quick fuse and a sharp, crisp report.', color: '#e1cc8b', key: '0', isNew: true }
];
