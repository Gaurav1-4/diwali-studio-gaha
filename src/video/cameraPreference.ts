const KEY = 'diwali.camera.enabled';

export function rememberCamera(enabled: boolean, storage: Pick<Storage, 'setItem'>): void {
  try { storage.setItem(KEY, enabled ? 'on' : 'off'); } catch { /* Private browsing may disable storage. */ }
}

export function cameraWasEnabled(storage: Pick<Storage, 'getItem'>): boolean {
  try { return storage.getItem(KEY) === 'on'; } catch { return false; }
}

export async function mayResumeCamera(enabled: boolean, permissions?: Pick<Permissions, 'query'>): Promise<boolean> {
  if (!enabled || !permissions) return false;
  try {
    const status = await permissions.query({ name: 'camera' as PermissionName });
    return status.state === 'granted';
  } catch { return false; } // Unsupported camera queries must never trigger a permission prompt.
}

export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access is blocked. Allow camera access for this site in your browser, then retry.';
  if (name === 'NotFoundError') return 'No camera was found. Connect a camera, then retry.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'The camera could not deliver video. Close other apps using it, then retry.';
  if (name === 'NotSupportedError') return 'Camera access is unavailable in this browser. You can still tap the crackers below.';
  return 'The camera could not start. Retry when it is available, or tap a cracker to keep playing.';
}
