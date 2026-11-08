import type { HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import {
  HandPose,
  ScreenLandmark,
  DetectedGesture
} from './gestureTypes';
import { GestureClassifier } from './gestureClassifier';
import { coverTransform, type CameraViewport } from '../video/coverTransform';
import { fingerGeometry, pinchContact } from './handGeometry';
import { HandMotion } from './handMotion';

export class VisionEngine {
  private landmarker: HandLandmarker | null = null;
  private classifier: GestureClassifier = new GestureClassifier();
  private motion = new HandMotion();
  private observedHands: HandPose[] = [];
  private pinchStates = new Map<HandPose['handedness'], boolean>();
  public isReady: boolean = false;
  private lastVideoTime: number = -1;
  private lastDetectionTime = -Infinity;
  private detectionInterval = 1000 / 30;
  public detectedHands: HandPose[] = [];
  public activeGestures: DetectedGesture[] = [];
  public showDebug: boolean = false;
  public cameraViewport: CameraViewport | null = null;
  private initializing: Promise<void> | null = null;
  private worker: Worker | null = null;
  private framePending = false;
  private pendingSince = 0;
  private epoch = 0;
  private freshResult = false;
  private lastResult = 0;
  private workerError: Error | null = null;
  private cancelWorkerStart: (() => void) | null = null;
  private screenW = 1;
  private screenH = 1;
  private trackingHz = 30;
  private inferenceFrames = 0;
  private inferenceMs = 0;
  private captureToResultMs = 0;
  private lastCapture = 0;
  private droppedResults = 0;
  private sampleStarted = 0;
  private sampleFrames = 0;
  private updatesPerSecond = 0;
  private inputWidth = 0;
  private inputHeight = 0;
  private trackedVideo: HTMLVideoElement | null = null;
  private videoCallback: number | null = null;
  private sourceFrameTime = -1;
  private videoWatchStarted = 0;
  private lastVideoCallbackAt = -Infinity;
  private pollingFrames = false;
  private videoCallbacksUnavailable = false;
  private preferMainThread = false;
  private get freshnessMs(): number { return Math.max(250, Math.min(600, this.inferenceMs * 2.2 + 80)); }
  public get diagnostics() { return {
    mode: this.mode, frames: this.inferenceFrames, inferenceMs: +this.inferenceMs.toFixed(1),
    captureToResultMs: +this.captureToResultMs.toFixed(1), resultAgeMs: this.lastResult ? Math.round(performance.now() - this.lastCapture) : null,
    updatesPerSecond: this.lastResult && performance.now() - this.lastResult < 1000 ? +this.updatesPerSecond.toFixed(1) : 0,
    fresh: !!this.lastResult && performance.now() - this.lastCapture <= this.freshnessMs,
    hands: this.detectedHands.length, signs: this.observedHands.map(hand => hand.heldGesture?.type ?? 'NONE'),
    input: `${this.inputWidth}×${this.inputHeight}`, frameSource: this.pollingFrames ? 'polling' : this.trackedVideo ? 'video' : 'animation', dropped: this.droppedResults, pending: this.framePending
  }; }
  public get mode(): 'worker' | 'main' { return this.worker ? 'worker' : 'main'; }
  public setTrackingRate(hz: number): void { this.trackingHz = hz; this.detectionInterval = 1000 / hz; }

  public init(onProgress?: (msg: string) => void): Promise<void> {
    if (this.isReady) return Promise.resolve();
    if (this.initializing) return this.initializing;
    const operation = this.load(onProgress);
    this.initializing = operation;
    void operation.then(() => { this.initializing = null; }, () => { this.initializing = null; });
    return operation;
  }

  public resetTracking(): void {
    this.epoch++;
    this.freshResult = false;
    this.motion.reset(); this.observedHands = []; this.pinchStates.clear();
    this.classifier = new GestureClassifier();
    this.lastVideoTime = -1;
    this.lastDetectionTime = -Infinity;
    this.detectedHands = [];
    this.activeGestures = [];
    this.lastResult = 0; this.lastCapture = 0; this.sampleStarted = 0; this.sampleFrames = 0; this.updatesPerSecond = 0;
  }

  public resumeAfterVisibility(): void {
    if (!this.isReady) return;
    this.resetTracking();
    // A backgrounded tab may suspend bitmap transfer or inference. Give that
    // existing operation time to finish; its old epoch cannot produce events.
    if (this.framePending) this.pendingSince = performance.now();
  }

  private stopWorker(): void {
    if (this.videoCallback !== null) this.trackedVideo?.cancelVideoFrameCallback?.(this.videoCallback);
    this.videoCallback = null; this.trackedVideo = null; this.sourceFrameTime = -1;
    this.videoWatchStarted = 0; this.lastVideoCallbackAt = -Infinity;
    this.pollingFrames = false; this.videoCallbacksUnavailable = false;
    this.cancelWorkerStart?.(); this.cancelWorkerStart = null;
    this.worker?.terminate(); this.worker = null; this.framePending = false;
  }

  public pause(): void {
    this.isReady = false; this.stopWorker();
    this.landmarker?.close(); this.landmarker = null;
    this.resetTracking();
  }

  private async load(onProgress?: (msg: string) => void): Promise<void> {
    this.landmarker?.close(); this.landmarker = null;
    this.stopWorker();
    this.workerError = null;
    this.resetTracking();
    const epoch = this.epoch;
    if (!this.preferMainThread && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined') {
      try {
        await this.startWorker(onProgress);
        if (epoch !== this.epoch) throw new DOMException('Tracking cancelled', 'AbortError');
        this.isReady = true;
        onProgress?.('Hand tracking ready');
        return;
      } catch (error) {
        this.stopWorker();
        if (epoch !== this.epoch) throw error;
        this.preferMainThread = true;
        console.warn('Background tracking unavailable, using paced fallback:', error);
      }
    }
    const { loadLandmarker } = await import('./landmarkerLoader');
    this.landmarker = await loadLandmarker(window.location.origin, message => onProgress?.(message));
    if (epoch !== this.epoch) { this.landmarker.close(); this.landmarker = null; throw new DOMException('Tracking cancelled', 'AbortError'); }
    this.isReady = true;
    onProgress?.('Hand tracking ready');
  }

  private startWorker(onProgress?: (message: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./visionWorker.ts', import.meta.url), { type: 'module' });
      this.worker = worker;
      const timer = setTimeout(() => reject(new Error('Background tracker initialization timed out')), 30000);
      this.cancelWorkerStart = () => { clearTimeout(timer); reject(new DOMException('Tracking cancelled', 'AbortError')); };
      let ready = false;
      worker.onerror = event => {
        clearTimeout(timer);
        const error = new Error(event.message || 'Background tracker failed');
        if (!ready) reject(error); else this.workerError = error;
      };
      worker.onmessage = event => {
        const data = event.data;
        if (data.type === 'progress') onProgress?.(data.message);
        else if (data.type === 'ready') { clearTimeout(timer); this.cancelWorkerStart = null; ready = true; resolve(); }
        else if (data.type === 'error') {
          clearTimeout(timer);
          if (!ready) reject(new Error(data.message)); else this.workerError = new Error(data.message);
        } else if (data.type === 'result') {
          this.framePending = false;
          this.inferenceFrames++; this.inferenceMs = data.cost;
          if (data.epoch !== this.epoch) return;
          const received = performance.now(), captured = data.timestamp ?? received;
          this.captureToResultMs = Math.max(0, received - captured);
          // A late answer must not resurrect an old sign or move a source backward.
          if (this.captureToResultMs > this.freshnessMs) { this.droppedResults++; return; }
          this.detectionInterval = Math.max(1000 / this.trackingHz, Math.min(160, data.cost * 1.05));
          this.acceptResult(data.result, data.width, data.height, captured, received);
          this.freshResult = true;
          // If a newer camera frame arrived while busy, consume that latest one
          // immediately instead of waiting for another animation/video tick.
          if (this.trackedVideo) this.captureLatest(this.trackedVideo, received, this.pollingFrames ? this.trackedVideo.currentTime : this.sourceFrameTime);
        }
      };
      worker.postMessage({ type: 'init', origin: window.location.origin });
    });
  }

  private watchVideo(video: HTMLVideoElement, now: number): void {
    if (typeof video.requestVideoFrameCallback !== 'function' || this.videoCallbacksUnavailable) return;
    if (this.trackedVideo !== video) { this.trackedVideo = video; this.videoWatchStarted = now; }
    if (this.videoCallback !== null) return;
    try {
      this.videoCallback = video.requestVideoFrameCallback((_now, metadata) => {
        this.videoCallback = null;
        if (!this.isReady || this.trackedVideo !== video || !this.worker) return;
        const received = performance.now();
        if (Number.isFinite(metadata.mediaTime) && metadata.mediaTime > this.sourceFrameTime) {
          this.lastVideoCallbackAt = received;
          this.sourceFrameTime = metadata.mediaTime;
          this.pollingFrames = false;
        } else if (!Number.isFinite(metadata.mediaTime) || received - Math.max(this.videoWatchStarted, this.lastVideoCallbackAt) >= 200) {
          this.pollingFrames = true;
        }
        this.captureLatest(video, received, this.pollingFrames ? video.currentTime : this.sourceFrameTime);
        this.watchVideo(video, received);
      });
    } catch {
      // Some WebKit versions expose the API without a usable callback path.
      this.videoCallbacksUnavailable = true; this.pollingFrames = true;
    }
  }

  private captureLatest(video: HTMLVideoElement, now: number, frameTime: number): void {
    if (!this.isReady || !this.worker || video.readyState < 2 || !video.videoWidth || !video.videoHeight || this.framePending || !Number.isFinite(frameTime) || frameTime < 0 || frameTime <= this.lastVideoTime || now - this.lastDetectionTime < this.detectionInterval) return;
    this.lastVideoTime = frameTime; this.lastDetectionTime = now;
    this.queueFrame(video, now);
  }

  private queueFrame(video: HTMLVideoElement, now: number): void {
    this.framePending = true; this.pendingSince = now;
    const epoch = this.epoch, worker = this.worker;
    const width = video.videoWidth, height = video.videoHeight;
    // Preserve fingertip detail. Only slow inference reduces the bounded source size.
    const maxEdge = this.inferenceMs > 120 ? 320 : this.inferenceMs > 70 ? 384 : 512;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    this.inputWidth = Math.max(1, Math.round(width * scale)); this.inputHeight = Math.max(1, Math.round(height * scale));
    void createImageBitmap(video, { resizeWidth: this.inputWidth, resizeHeight: this.inputHeight, resizeQuality: 'low' }).then(bitmap => {
      if (this.worker !== worker || !this.isReady || this.epoch !== epoch) { bitmap.close(); this.framePending = false; return; }
      try { worker!.postMessage({ type: 'frame', bitmap, timestamp: now, epoch, width, height }, [bitmap]); }
      catch (error) { bitmap.close(); this.framePending = false; this.workerError = error as Error; }
    }).catch(error => { this.framePending = false; this.workerError = error; });
  }

  /**
   * Process a new video frame and extract poses & gestures
   */
  public update(video: HTMLVideoElement, screenW: number, screenH: number): DetectedGesture[] {
    if (!this.isReady || (!this.landmarker && !this.worker) || video.readyState < 2) {
      return [];
    }

    const currentTime = video.currentTime;
    const now = performance.now();
    if (this.screenW !== screenW || this.screenH !== screenH) this.motion.reset();
    this.screenW = screenW; this.screenH = screenH;
    if (this.lastResult && now - this.lastCapture > this.freshnessMs) {
      if (this.observedHands.length || this.activeGestures.length) {
        this.classifier = new GestureClassifier(); this.pinchStates.clear();
      }
      this.activeGestures = []; this.observedHands = []; this.motion.reset();
    }
    if (this.worker) {
      if (this.workerError) { this.preferMainThread = true; throw this.workerError; }
      if (this.framePending && now - this.pendingSince > (this.lastResult ? 3000 : 8000)) {
        this.preferMainThread = true;
        throw new Error('Background tracking stopped responding');
      }
      if (typeof video.requestVideoFrameCallback === 'function') {
        this.watchVideo(video, now);
        // API presence isn't enough: hidden/occluded video may receive no
        // presentation callbacks. Keep tracking the advancing camera clock.
        if (now - Math.max(this.videoWatchStarted, this.lastVideoCallbackAt) >= 200) this.pollingFrames = true;
        if (this.pollingFrames) this.captureLatest(video, now, currentTime);
      }
      else this.captureLatest(video, now, currentTime);
      this.detectedHands = this.motion.project(this.observedHands, now);
      if (this.freshResult) { this.freshResult = false; return this.projectGestures(this.activeGestures); }
      return this.projectGestures(this.activeGestures.filter(gesture => gesture.isContinuous));
    }
    // Only detect if video time has advanced
    if (currentTime !== this.lastVideoTime && now - this.lastDetectionTime >= this.detectionInterval) {
      this.lastVideoTime = currentTime;
      this.lastDetectionTime = now;
      const result: HandLandmarkerResult = this.landmarker!.detectForVideo(video, now);
      this.inferenceFrames++; this.inferenceMs = performance.now() - now;
      this.inputWidth = video.videoWidth; this.inputHeight = video.videoHeight;
      this.captureToResultMs = this.inferenceMs;
      // Slow CPUs get time to paint between inference calls instead of queuing work.
      this.detectionInterval = Math.max(1000 / this.trackingHz, Math.min(100, (performance.now() - now) * 2));
      this.acceptResult(result, video.videoWidth, video.videoHeight, now, performance.now());
      return this.projectGestures(this.activeGestures);
    }

    // Sustain fountains between camera frames, but consume one-shot events once.
    this.detectedHands = this.motion.project(this.observedHands, now);
    return this.projectGestures(this.activeGestures.filter((gesture) => gesture.isContinuous));
  }

  private acceptResult(result: HandLandmarkerResult, videoW: number, videoH: number, captured: number, received: number): void {
    this.observedHands = this.parsePoses(result, this.screenW, this.screenH, videoW, videoH);
    this.activeGestures = this.classifier.classify(this.observedHands, this.screenW);
    this.motion.observe(this.observedHands, captured);
    this.detectedHands = this.motion.project(this.observedHands, received);
    this.lastCapture = captured; this.lastResult = received;
    if (!this.sampleStarted) this.sampleStarted = received;
    this.sampleFrames++;
    if (received - this.sampleStarted >= 1000) {
      this.updatesPerSecond = this.sampleFrames * 1000 / (received - this.sampleStarted);
      this.sampleFrames = 0; this.sampleStarted = received;
    }
  }

  private projectGestures(gestures: DetectedGesture[]): DetectedGesture[] {
    return gestures.map(gesture => {
      const hand = this.detectedHands.find(hand => (hand.handedness === 'Left' ? 0 : 1) === gesture.handIndex);
      return hand?.heldGesture?.type === gesture.type ? { ...gesture, triggerPoint: hand.heldGesture.triggerPoint } : gesture;
    });
  }

  /**
   * Converts raw normalized landmarks into screen-space pixel coordinates
   * with horizontal mirroring applied.
   */
  private parsePoses(
    result: HandLandmarkerResult,
    screenW: number,
    screenH: number,
    videoW: number,
    videoH: number
  ): HandPose[] {
    const hands: HandPose[] = [];
    const cover = coverTransform(videoW || 640, videoH || 480, screenW, screenH, this.cameraViewport);

    result.landmarks.forEach((rawMarks, idx) => {
      const handednessRaw = result.handedness[idx]?.[0]?.categoryName;
      // Invert handedness because the view is mirrored
      const handedness: 'Left' | 'Right' = handednessRaw === 'Left' ? 'Right' : 'Left';

      // Transform normalized coords into mirrored screen pixels
      const screenMarks: ScreenLandmark[] = rawMarks.map((lm) => ({
        x: screenW - (lm.x * cover.width + cover.x),
        y: lm.y * cover.height + cover.y,
        z: lm.z
      }));

      // Calculate Palm Center (average of wrist 0, index MCP 5, pinky MCP 17)
      const wrist = screenMarks[0];
      const indexMcp = screenMarks[5];
      const pinkyMcp = screenMarks[17];
      const palmCenter: ScreenLandmark = {
        x: (wrist.x + indexMcp.x + pinkyMcp.x) / 3,
        y: (wrist.y + indexMcp.y + pinkyMcp.y) / 3,
        z: (wrist.z + indexMcp.z + pinkyMcp.z) / 3
      };

      // Use 3D joint angles in model world space, with a pixel-proportional fallback.
      const geometry = result.worldLandmarks?.[idx] ?? rawMarks.map(lm => ({x:lm.x*videoW,y:lm.y*videoH,z:lm.z*videoW}));
      const fingerStates = fingerGeometry(geometry);
      const extendedFingers = {
        thumb:fingerStates.thumb==='extended', index:fingerStates.index==='extended',
        middle:fingerStates.middle==='extended', ring:fingerStates.ring==='extended', pinky:fingerStates.pinky==='extended'
      };
      const thumbTip=screenMarks[4], indexTip=screenMarks[8];
      const pinchDistance=Math.hypot(thumbTip.x-indexTip.x,thumbTip.y-indexTip.y);
      const isPinching=pinchContact(screenMarks, this.pinchStates.get(handedness));
      this.pinchStates.set(handedness, isPinching);

      hands.push({
        handedness,
        landmarks: screenMarks,
        rawLandmarks: rawMarks,
        extendedFingers,
        fingerStates,
        palmCenter,
        pinchDistance,
        isPinching
      });
    });

    const present = new Set(hands.map(hand => hand.handedness));
    for (const id of this.pinchStates.keys()) if (!present.has(id)) this.pinchStates.delete(id);
    return hands;
  }

  /**
   * Renders debug wireframe bone skeleton over hands
   */
  public drawDebugSkeleton(ctx: CanvasRenderingContext2D): void {
    if (!this.showDebug || this.detectedHands.length === 0) return;

    ctx.save();
    ctx.lineWidth = 2.5;

    const CONNECTIONS = [
      // Thumb
      [0, 1], [1, 2], [2, 3], [3, 4],
      // Index
      [0, 5], [5, 6], [6, 7], [7, 8],
      // Middle
      [5, 9], [9, 10], [10, 11], [11, 12],
      // Ring
      [9, 13], [13, 14], [14, 15], [15, 16],
      // Pinky
      [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]
    ];

    for (const hand of this.detectedHands) {
      // Draw bones
      ctx.strokeStyle = hand.handedness === 'Right' ? 'rgba(0, 240, 255, 0.65)' : 'rgba(255, 215, 0, 0.65)';
      for (const [i, j] of CONNECTIONS) {
        const p1 = hand.landmarks[i];
        const p2 = hand.landmarks[j];
        if (p1 && p2) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }

      // Draw landmarks
      for (let i = 0; i < hand.landmarks.length; i++) {
        const pt = hand.landmarks[i];
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, i === 8 || i === 4 ? 6 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = i === 8 ? '#ff3366' : i === 4 ? '#ffd700' : '#ffffff';
        ctx.fill();
      }

      // Draw Palm Center
      ctx.beginPath();
      ctx.arc(hand.palmCenter.x, hand.palmCenter.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 215, 0, 0.85)';
      ctx.fill();
    }

    ctx.restore();
  }
}
