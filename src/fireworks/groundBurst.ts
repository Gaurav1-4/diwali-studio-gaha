import { ParticlePool } from '../particles/particle';
import { COLORS } from './fireworkColors';

/** Ground reports are fast flashes, irregular fragments, and smoke, without a neon ring. */
export function groundBurst(pool: ParticlePool, x: number, y: number, power: number): void {
  pool.addFlash(x, y, 220 + power * 160, COLORS.WHITE_HOT, 0.38 + power * 0.12);
  const count = Math.round(45 + power * 90);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() ** 0.6 * 17 * power;
    const hot = Math.random() < 0.2;
    pool.spawn({ x: x + (Math.random() - 0.5) * 4, y,
      vx: Math.cos(angle) * speed, vy: -Math.abs(Math.sin(angle)) * speed * 0.65 - Math.random() * 2,
      color: hot ? COLORS.WHITE_HOT : COLORS.GOLD, fadeColor: COLORS.DEEP_ORANGE,
      size: hot ? 2 + Math.random() * 2 : 0.7 + Math.random() * 1.5,
      life: hot ? 0.05 + Math.random() * 0.08 : 0.25 + Math.random() * 0.55,
      drag: 0.963, gravity: 0.25, crackle: !hot && Math.random() < 0.1, flicker: !hot });
  }
  for (let i = 0; i < 12 * power; i++) {
    pool.spawn({ x: x + (Math.random() - 0.5) * 20, y: y - Math.random() * 10,
      vx: (Math.random() - 0.4) * 1.6, vy: -0.5 - Math.random() * 1.2,
      color: COLORS.AMBER, size: 15 + Math.random() * 18, life: 1.5 + Math.random() * 1.8,
      drag: 0.993, gravity: -0.002, kind: 'smoke', opacity: 0.16, trail: false });
  }
}
