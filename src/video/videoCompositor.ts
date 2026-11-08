/**
 * Natural-color camera compositing with mirrored framing and a camera-off sky.
 */

import { coverTransform, type CameraViewport } from './coverTransform';
import { renderScale } from './renderScale';
import { CameraSession } from './cameraSession';

export interface CompositorOptions {
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  pixelBudget?: number;
}

export class VideoCompositor {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  public video: HTMLVideoElement;
  public width: number = window.innerWidth;
  public height: number = window.innerHeight;
  public camera: CameraSession;
  public get isCameraReady(): boolean { return this.camera.isReady; }
  public cameraViewport: CameraViewport | null = null;
  private sky: HTMLCanvasElement;
  private pixelBudget = 3_686_400;

  constructor(options: CompositorOptions) {
    this.canvas = options.canvas;
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not acquire 2D rendering context from stage canvas');
    this.ctx = ctx;
    this.sky = document.createElement('canvas');
    this.video = options.video;
    this.camera = new CameraSession(this.video);

    this.pixelBudget = options.pixelBudget ?? this.pixelBudget;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  public setPixelBudget(pixels: number): void {
    if (this.pixelBudget === pixels) return;
    this.pixelBudget = pixels;
    this.resize();
  }

  public resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    void this.camera.updateFraming(this.width, this.height);

    const scale = renderScale(this.width, this.height, window.devicePixelRatio, this.pixelBudget);
    this.canvas.width = Math.round(this.width * scale);
    this.canvas.height = Math.round(this.height * scale);
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.cacheSky();
  }

  private cacheSky(): void {
    // Cache the static backdrop at display resolution, instead of repainting it.
    this.sky.width = this.canvas.width;
    this.sky.height = this.canvas.height;
    const ctx = this.sky.getContext('2d')!;
    const width = this.sky.width;
    const height = this.sky.height;
    const glow = ctx.createRadialGradient(width * 0.65, height * 0.55, 0, width * 0.65, height * 0.55, width * 0.65);
    glow.addColorStop(0, '#151424');
    glow.addColorStop(1, '#06070d');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 95; i++) {
      const x = ((i * 7919 % 997) / 997) * width;
      const y = ((i * 3571 % 991) / 991) * height;
      ctx.fillStyle = `rgba(222,217,237,${0.12 + (i % 5) * 0.06})`;
      ctx.beginPath();
      ctx.arc(x, y, i % 7 === 0 ? 1.1 : 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  public async startCamera(): Promise<MediaStream> {
    return this.camera.start();
  }

  public stopCamera(): void { this.camera.stop(); }

  /**
   * Draws the mirrored camera at its original brightness and color.
   */
  public drawBackground(): void {
    const { ctx, width, height, video } = this;

    // Reset transform & composite operation
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    // Letterboxing shows the full phone camera without stale pixels behind its edges.
    if (this.cameraViewport) ctx.drawImage(this.sky, 0, 0, width, height);

    // 2. Draw webcam video if available
    if (this.isCameraReady && video.videoWidth > 0) {
      ctx.save();
      // Mirror horizontally so gestures feel natural (like looking in a mirror)
      ctx.translate(width, 0);
      ctx.scale(-1, 1);

      const cover = coverTransform(video.videoWidth, video.videoHeight, width, height, this.cameraViewport);
      ctx.drawImage(video, cover.x, cover.y, cover.width, cover.height);

      ctx.restore();
    } else {
      ctx.drawImage(this.sky, 0, 0, width, height);
    }

    ctx.restore();
  }
}
