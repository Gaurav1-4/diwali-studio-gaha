import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { loadLandmarker } from './landmarkerLoader';

// MediaPipe's loader uses this hook when importScripts is unavailable in a module worker.
const scope = self as unknown as { import: (url: string) => Promise<void>; ModuleFactory?: unknown };
scope.import = async url => {
  const module = await import(/* @vite-ignore */ url);
  scope.ModuleFactory = module.default;
};
let tracker: HandLandmarker | null = null;
// The same worker handles one transferred bitmap at a time; the sender never queues frames.
self.onmessage = async (event: MessageEvent) => {
  const data = event.data;
  if (data.type === 'init') {
    try {
      tracker = await loadLandmarker(data.origin, message => self.postMessage({ type: 'progress', message }), new OffscreenCanvas(1, 1));
      self.postMessage({ type: 'ready' });
    } catch (error) { self.postMessage({ type: 'error', message: String(error) }); }
    return;
  }
  if (data.type === 'frame') {
    try {
      const started = performance.now();
      const result = tracker!.detectForVideo(data.bitmap, data.timestamp);
      self.postMessage({ type: 'result', result, cost: performance.now() - started, timestamp: data.timestamp, epoch: data.epoch, width: data.width, height: data.height });
    } catch (error) { self.postMessage({ type: 'error', message: String(error) }); }
    finally { data.bitmap.close(); }
  }
};
