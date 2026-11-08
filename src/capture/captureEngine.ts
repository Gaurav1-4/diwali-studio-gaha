/**
 * Reel Recording & Postcard Screenshot Engine
 * Uses MediaRecorder with visual canvas stream + mixed recorded and synthesized audio.
 * Supports in-browser video preview modal before download.
 */

import { BRAND } from '../branding';

export interface CaptureCallbacks {
  onRecordingStart?: () => void;
  onRecordingStop?: (videoBlob: Blob, videoUrl: string) => void;
  onTimeUpdate?: (elapsedSeconds: number, maxSeconds: number) => void;
  onRecordingError?: () => void;
}

export class CaptureEngine {
  private canvas: HTMLCanvasElement;
  private recorder: MediaRecorder | null = null;
  public isRecording: boolean = false;
  private startTime: number = 0;
  private timerInterval: number = 0;
  private readonly MAX_DURATION_SEC: number = 30;
  private callbacks: CaptureCallbacks = {};
  public latestBlob: Blob | null = null;
  public latestVideoUrl: string | null = null;
  public selectedExtension: string = 'mp4';
  private finishing = false;
  private recordingTracks: MediaStreamTrack[] = [];
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, callbacks?: CaptureCallbacks) {
    this.canvas = canvas;
    if (callbacks) this.callbacks = callbacks;
  }

  public setCallbacks(callbacks: CaptureCallbacks): void {
    this.callbacks = callbacks;
  }

  /** Draw into the recorded canvas, since HTML branding is outside the export. */
  public drawRecordingBrand(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.isRecording) return;
    const pad = Math.max(12, width * 0.02);
    ctx.save();
    ctx.font = `${Math.max(11, Math.min(18, width * 0.018))}px "DM Sans", sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f2eee6';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 5;
    ctx.fillText(BRAND.signature, width - pad, height - Math.max(14, height * 0.025));
    ctx.restore();
  }

  public startRecording(audioTrack: MediaStreamTrack | null): boolean {
    if (this.isRecording || this.finishing || this.disposed) return false;

    try {
      // 60 FPS capture matching display refresh for buttery-smooth video
      const canvasStream = this.canvas.captureStream(60);
      this.recordingTracks = canvasStream.getTracks();
      const combinedStream = new MediaStream();

      canvasStream.getVideoTracks().forEach((track) => combinedStream.addTrack(track));

      if (audioTrack) {
        const clone = audioTrack.clone();
        combinedStream.addTrack(clone);
        this.recordingTracks.push(clone);
      }

      // Prefer a canvas-friendly WebM encoder; MP4 remains available on Safari.
      const candidates = [
        { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
        { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
        { mime: 'video/webm', ext: 'webm' },
        { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
        { mime: 'video/mp4;codecs=avc1', ext: 'mp4' },
        { mime: 'video/mp4', ext: 'mp4' }
      ];

      let selectedMime = '';
      for (const cand of candidates) {
        if (MediaRecorder.isTypeSupported(cand.mime)) {
          selectedMime = cand.mime;
          break;
        }
      }

      const options: MediaRecorderOptions = {
        mimeType: selectedMime || undefined,
        videoBitsPerSecond: 8_000_000 // 8 Mbps high-bitrate Full HD
      };

      const recorder = new MediaRecorder(combinedStream, options);
      this.recorder = recorder;
      const chunks: Blob[] = [];
      let failed = false;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        this.finishing = false;
        this.isRecording = false;
        window.clearInterval(this.timerInterval);
        this.releaseTracks();
        if (this.disposed || failed) return;
        if (!chunks.length) { this.callbacks.onRecordingError?.(); return; }
        if (this.latestVideoUrl) URL.revokeObjectURL(this.latestVideoUrl);
        this.latestBlob = new Blob(chunks, { type: recorder.mimeType || chunks[0].type || 'video/webm' });
        this.selectedExtension = this.latestBlob.type.startsWith('video/mp4') ? 'mp4' : 'webm';
        this.latestVideoUrl = URL.createObjectURL(this.latestBlob);
        this.callbacks.onRecordingStop?.(this.latestBlob, this.latestVideoUrl);
      };
      recorder.onerror = () => {
        failed = true;
        this.isRecording = false;
        this.finishing = true;
        window.clearInterval(this.timerInterval);
        this.releaseTracks();
        this.callbacks.onRecordingError?.();
      };

      // 1000ms timeslice to avoid rapid GOP keyframe flushes that cause playback judder
      this.recorder.start(1000);
      this.isRecording = true;
      this.startTime = performance.now();

      this.callbacks.onRecordingStart?.();

      this.timerInterval = window.setInterval(() => {
        if (!this.isRecording) return;
        const elapsed = (performance.now() - this.startTime) / 1000;
        this.callbacks.onTimeUpdate?.(elapsed, this.MAX_DURATION_SEC);

        if (elapsed >= this.MAX_DURATION_SEC) {
          this.stopRecording();
        }
      }, 200);

      return true;
    } catch (e) {
      this.releaseTracks();
      console.error('Failed to start MediaRecorder:', e);
      return false;
    }
  }

  public stopRecording(): void {
    if (!this.isRecording || !this.recorder) return;
    this.isRecording = false;
    this.finishing = true;
    window.clearInterval(this.timerInterval);
    this.callbacks.onTimeUpdate?.((performance.now() - this.startTime) / 1000, this.MAX_DURATION_SEC);

    if (this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
  }

  private releaseTracks(): void {
    this.recordingTracks.forEach(track => track.stop());
    this.recordingTracks = [];
  }

  public dispose(): void {
    this.disposed = true;
    this.stopRecording();
    this.releaseTracks();
    if (this.latestVideoUrl) URL.revokeObjectURL(this.latestVideoUrl);
  }

  public downloadCurrentReel(filename?: string): void {
    if (!this.latestVideoUrl) return;
    const a = document.createElement('a');
    a.href = this.latestVideoUrl;
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = filename || `${BRAND.exportPrefix}-Diwali-${timestamp}.${this.selectedExtension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  public takeScreenshot(): void {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;
    const tCtx = tempCanvas.getContext('2d');
    if (!tCtx) return;

    tCtx.drawImage(this.canvas, 0, 0);

    const pad = tempCanvas.width * 0.035;
    tCtx.save();
    tCtx.textAlign = 'right';
    tCtx.fillStyle = '#FFD700';
    tCtx.shadowColor = 'rgba(255, 215, 0, 0.8)';
    tCtx.shadowBlur = 15;
    tCtx.font = `${Math.max(22, tempCanvas.width * 0.035)}px "Instrument Serif", serif`;
    tCtx.fillText('✨ Happy Diwali ✨', tempCanvas.width - pad, tempCanvas.height - pad - 18);

    tCtx.fillStyle = '#E2E8F0';
    tCtx.shadowBlur = 0;
    tCtx.font = `${Math.max(12, tempCanvas.width * 0.012)}px "DM Sans", sans-serif`;
    tCtx.fillText(`${BRAND.signature} · ${new Date().getFullYear()}`, tempCanvas.width - pad, tempCanvas.height - pad);
    tCtx.restore();

    tempCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.download = `${BRAND.exportPrefix}-Postcard-${timestamp}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  }
}
