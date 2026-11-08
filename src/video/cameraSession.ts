import { cameraConstraints } from './coverTransform';

export type CameraInterruption = 'ended' | 'muted' | 'resumed';
type RequestMedia = (constraints: MediaStreamConstraints) => Promise<MediaStream>;

/** Owns one camera stream. A tracker retry never needs a second permission request. */
export class CameraSession {
  public isReady = false;
  public get isMuted(): boolean { return this.stream?.getVideoTracks().some(track => track.muted) ?? false; }
  public onInterruption?: (state: CameraInterruption) => void;
  private stream: MediaStream | null = null;
  private pending: Promise<MediaStream> | null = null;
  private generation = 0;
  private detach: (() => void) | null = null;
  private cancelFrameWait: (() => void) | null = null;
  private framingPortrait: boolean | null = null;

  constructor(private video: HTMLVideoElement, private requestMedia: RequestMedia = async constraints => {
    if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('Camera access is unavailable in this browser.', 'NotSupportedError');
    return navigator.mediaDevices.getUserMedia(constraints);
  }) {}

  public start(): Promise<MediaStream> {
    if (this.pending) return this.pending;
    if (this.stream?.getVideoTracks().some(track => track.readyState === 'live') && this.isReady && !this.video.paused) {
      return Promise.resolve(this.stream);
    }
    const operation = this.open(this.generation);
    this.pending = operation;
    void operation.then(() => { if (this.pending === operation) this.pending = null; },
      () => { if (this.pending === operation) this.pending = null; });
    return operation;
  }

  private async open(generation: number): Promise<MediaStream> {
    let stream: MediaStream | null = null;
    try {
      stream = this.stream?.getVideoTracks().some(track => track.readyState === 'live') ? this.stream : await this.requestMedia({
        video: cameraConstraints(typeof window !== 'undefined' ? window.innerWidth : 640, typeof window !== 'undefined' ? window.innerHeight : 480), audio: false
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach(track => track.stop());
        throw new DOMException('Camera startup was cancelled.', 'AbortError');
      }
      this.stream = stream;
      this.framingPortrait = typeof window !== 'undefined' ? window.innerWidth < window.innerHeight : false;
      this.video.muted = true;
      this.video.playsInline = true;
      if (this.video.srcObject !== stream) this.video.srcObject = stream;
      await this.waitForFrame(generation);
      this.isReady = true;
      this.watch(stream, generation);
      return stream;
    } catch (error) {
      if (generation === this.generation) this.stop();
      throw error;
    }
  }

  /** Reframe the existing stream on rotation without opening the camera again. */
  public async updateFraming(width: number, height: number): Promise<void> {
    const track = this.stream?.getVideoTracks().find(item => item.readyState === 'live');
    const portrait = width < height;
    if (!track || this.framingPortrait === portrait) return;
    this.framingPortrait = portrait;
    try { await track.applyConstraints?.(cameraConstraints(width, height)); } catch { /* Keep the healthy stream if the device rejects new ideals. */ }
  }

  private waitForFrame(generation: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let finished = false;
      const cleanup = () => {
        clearTimeout(timeout);
        for (const name of ['loadeddata', 'canplay', 'playing']) this.video.removeEventListener(name, check);
        this.video.removeEventListener('error', fail);
        this.cancelFrameWait = null;
      };
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        cleanup();
        if (error) reject(error); else resolve();
      };
      const check = () => {
        if (generation !== this.generation) finish(new DOMException('Camera startup was cancelled.', 'AbortError'));
        else if (this.video.readyState >= 2 && this.video.videoWidth > 0 && this.video.videoHeight > 0) finish();
      };
      const fail = () => finish(new DOMException('The camera did not deliver a video frame.', 'NotReadableError'));
      const timeout = setTimeout(fail, 8000);
      this.cancelFrameWait = () => finish(new DOMException('Camera startup was cancelled.', 'AbortError'));
      for (const name of ['loadeddata', 'canplay', 'playing']) this.video.addEventListener(name, check);
      this.video.addEventListener('error', fail);
      void this.video.play().then(check, error => finish(error));
    });
  }

  private watch(stream: MediaStream, generation: number): void {
    this.detach?.();
    const current = () => this.stream === stream && this.generation === generation;
    const ended = () => {
      if (!current()) return;
      this.stop();
      this.onInterruption?.('ended');
    };
    const muted = () => { if (current()) this.onInterruption?.('muted'); };
    const resumed = () => { if (current()) this.onInterruption?.('resumed'); };
    const tracks = stream.getVideoTracks();
    for (const track of tracks) {
      track.addEventListener('ended', ended);
      track.addEventListener('mute', muted);
      track.addEventListener('unmute', resumed);
    }
    this.detach = () => {
      for (const track of tracks) {
        track.removeEventListener('ended', ended);
        track.removeEventListener('mute', muted);
        track.removeEventListener('unmute', resumed);
      }
    };
  }

  public stop(): void {
    this.generation++;
    this.cancelFrameWait?.();
    this.detach?.();
    this.detach = null;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.framingPortrait = null;
    this.video.pause();
    this.video.srcObject = null;
    this.isReady = false;
  }
}
