import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export async function loadLandmarker(origin: string, progress: (message: string) => void, canvas?: OffscreenCanvas): Promise<HandLandmarker> {
  progress('Loading hand tracking…');
  let vision;
  try { vision = await FilesetResolver.forVisionTasks(`${origin}/wasm`, !!canvas); }
  catch { vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm', !!canvas); }
  const sources = [`${origin}/models/hand_landmarker.task`, 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'];
  let failure: unknown;
  for (const source of sources) for (const delegate of ['GPU', 'CPU'] as const) {
    try {
      return await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: source, delegate }, canvas,
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.55, minTrackingConfidence: 0.55
      });
    } catch (error) { failure = error; }
  }
  throw failure ?? new Error('Hand tracking could not start');
}
