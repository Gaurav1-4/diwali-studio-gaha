/** Retina detail with a bounded fill-rate and framebuffer size. */
export function renderScale(width: number, height: number, devicePixelRatio: number, pixelBudget = 3_686_400): number {
  const desired = Math.min(2, Math.max(1, devicePixelRatio || 1));
  return Math.min(desired, Math.sqrt(pixelBudget / Math.max(1, width * height)));
}
