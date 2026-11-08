import { ParticleColor, ParticlePool } from '../particles/particle';
import { COLORS } from './fireworkColors';

/** Project a slightly irregular spherical shell instead of filling a flat disk. */
export function aerialBurst(pool: ParticlePool, x: number, y: number, color: ParticleColor, count = 300, willow = false, power = 1): void {
  const rotation = Math.random() * Math.PI * 2;
  const angleStep = Math.PI * (3 - Math.sqrt(5));
  pool.addFlash(x, y, 250 + power * 140, color, 0.32);
  for (let i = 0; i < count; i++) {
    const z = 1 - 2 * (i + 0.5) / count;
    const plane = Math.sqrt(1 - z * z);
    const angle = i * angleStep + rotation + (Math.random() - 0.5) * 0.12;
    const speed = (willow ? 10 : 14) * power * (0.88 + Math.random() * 0.24);
    const depth = (z + 1) / 2;
    pool.spawn({ x: x + (Math.random() - 0.5) * 3, y: y + (Math.random() - 0.5) * 3,
      vx: Math.cos(angle) * plane * speed,
      vy: Math.sin(angle) * plane * speed - 0.3,
      color: willow ? COLORS.GOLD : color, fadeColor: COLORS.DEEP_ORANGE,
      size: (1.6 + depth * 1.8) * (0.85 + Math.random() * 0.3),
      life: (willow ? 2.15 : 1.3) + Math.random() * (willow ? 1.1 : 0.8),
      drag: willow ? 0.989 : 0.982, gravity: willow ? 0.16 : 0.11,
      flicker: true, crackle: Math.random() < 0.11, heat: 0.8, opacity: 0.65 + depth * 0.35,
      shutter: willow ? 4.2 : 3.4 });
  }
  for (let i = 0; i < 15; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 5;
    pool.spawn({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      color: COLORS.WHITE_HOT, fadeColor: color, size: 2 + Math.random() * 2,
      life: 0.06 + Math.random() * 0.09, drag: 0.94, gravity: 0, heat: 1 });
  }
  for (let i = 0; i < 9; i++) {
    pool.spawn({ x: x + (Math.random() - 0.5) * 35, y: y + (Math.random() - 0.5) * 20,
      vx: 0.2 + Math.random() * 0.7, vy: -0.2 - Math.random() * 0.5,
      color, size: 12 + Math.random() * 18, life: 2 + Math.random() * 1.3,
      drag: 0.996, gravity: -0.002, kind: 'smoke', opacity: 0.08, trail: false });
  }
}
