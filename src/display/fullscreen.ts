type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FullscreenTarget = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
type Orientation = { lock?: (mode: 'landscape') => Promise<void>; unlock?: () => void };

export function isFullscreen(doc: FullscreenDocument): boolean {
  return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
}

/** Call directly from a tap: fullscreen consumes transient user activation. */
export async function enterFullscreen(target: FullscreenTarget, doc: FullscreenDocument, orientation?: Orientation): Promise<'entered' | 'unavailable' | 'rejected'> {
  const request = target.requestFullscreen ?? target.webkitRequestFullscreen;
  if (!request || doc.fullscreenEnabled === false && !doc.webkitFullscreenEnabled) return 'unavailable';
  try {
    await request.call(target, { navigationUI: 'hide' });
  } catch { return 'rejected'; }
  // Some mobile browsers only permit orientation locking after entering fullscreen.
  try { await orientation?.lock?.('landscape'); } catch { /* Manual rotation still works. */ }
  return 'entered';
}

export async function leaveFullscreen(doc: FullscreenDocument, orientation?: Orientation): Promise<void> {
  const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen;
  await exit?.call(doc);
  try { orientation?.unlock?.(); } catch { /* Not available on every platform. */ }
}
