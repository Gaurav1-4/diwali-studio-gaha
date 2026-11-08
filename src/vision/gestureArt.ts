import type { GestureType } from './gestureTypes';

/** Exact single-hand and finale silhouettes; no mismatched emoji for three/four-finger signs. */
export function gestureArt(type: Exclude<GestureType, 'NONE'>): string {
  const counts: Partial<Record<typeof type, number[]>> = {
    ROCKET: [0], ROMAN_CANDLE: [0, 1], ANAR: [],
    GRAND_FINALE: [0, 1, 2, 3], STARBURST: [0], CHAKRI: [0, 1, 2, 3],
    GANGA_JAMUNA: [0, 3], SUTLI_BOMB: [0, 1]
  };
  const fingers = counts[type] ?? [];
  let drawing = '';
  if (type === 'BULLET_BOMB') {
    drawing = '<rect x="8" y="4" width="8" height="31" rx="4"/><path d="M8 27h26q8 0 7 7l-3 10H15q-7-1-7-8Z"/><path class="hand-fold" d="M25 29h12m-12 5h13m-13 5h11"/>';
  } else if (type === 'PHOOLJHADI') {
    drawing = '<rect x="25" y="21" width="6" height="15" rx="3"/><rect x="33" y="23" width="6" height="14" rx="3"/><rect x="41" y="26" width="6" height="12" rx="3"/><path d="M17 26h25v10q0 11-13 11H19q-7-3-7-10Z"/><circle cx="13" cy="25" r="8"/><circle class="hand-hole" cx="13" cy="25" r="4"/>';
  } else {
    const xs = [13, 21, 29, 37], tops = [8, 3, 7, 14];
    drawing = '<rect x="12" y="26" width="31" height="19" rx="8"/>';
    for (let i = 0; i < 4; i++) {
      const raised = fingers.includes(i), y = raised ? tops[i] : 24;
      drawing += `<rect x="${xs[i]}" y="${y}" width="6" height="${36 - y}" rx="3"/>`;
      if (!raised) drawing += `<path class="hand-fold" d="M${xs[i] + 1} 29h4"/>`;
    }
    const thumbOut = ['SUTLI_BOMB', 'STARBURST', 'CHAKRI', 'GRAND_FINALE'].includes(type);
    drawing += thumbOut ? '<path d="m16 30-9-10q-5-5-7 0-1 2 1 5l12 16Z"/>' : '<path d="m15 31 15 3q4 2 2 5H17q-6-2-2-8Z"/>';
  }
  if (type === 'GRAND_FINALE') {
    const palm = drawing + '<rect x="20" y="42" width="17" height="8" rx="2"/>';
    return `<svg class="hand-sign" viewBox="0 0 82 54" fill="currentColor" aria-hidden="true"><g transform="translate(2 4) scale(.78)">${palm}</g><g transform="translate(43 4) scale(.78)">${palm}</g></svg>`;
  }
  return `<svg class="hand-sign" viewBox="-2 0 52 52" fill="currentColor" aria-hidden="true">${drawing}<rect x="20" y="42" width="17" height="8" rx="2"/></svg>`;
}
