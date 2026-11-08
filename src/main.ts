import './style.css';
import { AdaptiveQuality, QUALITY } from './performance/quality';
import { VideoCompositor } from './video/videoCompositor';
import { VisionEngine } from './vision/visionEngine';
import { FireworkDirector } from './fireworks/fireworkDirector';
import { PyroAudioEngine } from './audio/pyroAudioEngine';
import { CaptureEngine } from './capture/captureEngine';
import { CRACKERS, Cracker, CrackerType } from './fireworks/catalog';
import { crackerArt } from './fireworks/crackerArt';
import { gestureArt } from './vision/gestureArt';
import { rememberCamera, cameraWasEnabled, mayResumeCamera, cameraErrorMessage } from './video/cameraPreference';
import { enterFullscreen, leaveFullscreen, isFullscreen } from './display/fullscreen';

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing UI element: ${id}`);
  return node as T;
}

class FireworksApp {
  private quality = (() => {
    const device = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const forced = QUALITY.findIndex(profile => profile.name === new URLSearchParams(window.location.search).get('quality'));
    return new AdaptiveQuality({ cores: device.hardwareConcurrency, memory: device.deviceMemory, saveData: device.connection?.saveData }, forced < 0 ? undefined : forced);
  })();
  private compositor = new VideoCompositor({ canvas: element<HTMLCanvasElement>('stage'), video: element<HTMLVideoElement>('webcam'), pixelBudget: this.quality.profile.pixels });
  private vision = new VisionEngine();
  private audio = new PyroAudioEngine();
  private director = new FireworkDirector();
  private capture = new CaptureEngine(this.compositor.canvas);
  private selected: Cracker = CRACKERS.find(c => c.type === 'GANGA_JAMUNA')!;
  private cameraLoading = false;
  private trackingLoading = false;
  private cameraAttempt = 0;
  private disposed = false;
  private cameraPanelAction: 'camera' | 'tracking' | 'resume' = 'camera';
  private cameraStorage: Storage | null = (() => { try { return window.localStorage; } catch { return null; } })();
  private creatorMode = false;
  private lastFrameTime = performance.now();
  private nextPaintTime = 0;
  private nextLaunch = 0;
  private finaleStart = -Infinity;
  private finaleVisible = false;
  private lastAnnouncedType: CrackerType | null = null;
  private toastTimeout = 0;
  private recordedSeconds = 0;
  private animationFrame = 0;
  private profiling = new URLSearchParams(window.location.search).has('profile');
  private nextProfile = 0;
  private pendingQuality = false;
  private nextTrackingStatus = 0;
  private trackingRecoveries = 0;
  private trackingLive = false;

  constructor() {
    this.applyQuality();
    this.audio.onStateChange = () => this.updateAudioUI();
    this.audio.prepare();
    this.updateAudioUI();
    this.director.setSoundCallback((type, intensity) => {
      switch (type) {
        case 'ROCKET_LAUNCH': this.audio.playRocketLaunch(); break;
        case 'EXPLOSION': this.audio.playExplosion(intensity); break;
        case 'ANAR_LOOP': this.audio.pulseAnarLoop(); break;
        case 'SPARKLER_LOOP': this.audio.pulseSparklerLoop(); break;
        case 'ROMAN_POP': this.audio.playRomanPop(); break;
        case 'FINALE': this.audio.playFinaleBarrage(); break;
        case 'CHAKRI_LOOP': this.audio.pulseChakriLoop(); break;
        case 'FUSE': this.audio.playFuse(intensity); break;
        case 'SUTLI_BANG': this.audio.playBomb(true); break;
        case 'BULLET_BANG': this.audio.playBomb(false); break;
        case 'GANGA_BANG': this.audio.playGangaBurst(); break;
      }
    });
    this.renderCollection();
    this.setupListeners();
    this.setupCapture();
    // The camera and tracking both cover the entire stage, behind the controls.
    this.compositor.cameraViewport = this.vision.cameraViewport = null;
    window.visualViewport?.addEventListener('resize', () => this.compositor.resize());
    this.compositor.camera.onInterruption = state => {
      if (this.disposed) return;
      if (state === 'ended') {
        this.vision.resetTracking();
        this.director.handleGestures([], this.compositor.width, this.compositor.height);
        this.setCameraUI(false);
        this.showCameraPanel('Camera disconnected', 'Reconnect the camera, then retry. You can still tap the crackers.', 'Retry camera');
      } else if (state === 'muted') {
        this.showCameraPanel('Camera paused', 'Your browser paused the video. Keep this tab open or resume the camera.', 'Resume', 'resume');
      } else if (this.vision.isReady) {
        element('camera-panel').hidden = true;
      }
    };
    this.loop();
    void this.restoreCamera();
  }

  private renderCollection(): void {
    element('cracker-grid').innerHTML = CRACKERS.map(cracker => `
      <button class="cracker-card ${cracker.type === this.selected.type ? 'selected' : ''}" data-cracker="${cracker.type}"
        style="--cracker-color:${cracker.color}" aria-pressed="${cracker.type === this.selected.type}"
        title="${cracker.name} · ${cracker.gesture} · ${cracker.key}"
        aria-label="Ignite ${cracker.name}. Gesture: ${cracker.gesture}. Keyboard: ${cracker.key}.">
        <span class="cracker-art">${crackerArt(cracker.type, cracker.color)}</span>
        <span class="cracker-name">${cracker.name}</span>
        <span class="cracker-gesture">${gestureArt(cracker.type)}${cracker.gestureHint ?? cracker.gesture}</span>
      </button>`).join('');
    element('gesture-guide').innerHTML = CRACKERS.map(cracker => `
      <div class="guide-row"><span class="guide-sign">${gestureArt(cracker.type)}</span>
        <span class="guide-name">${cracker.name}</span><span class="guide-gesture">${cracker.gesture}</span><kbd>${cracker.key}</kbd></div>`).join('');
    this.updateCaption(this.selected);
  }

  private select(cracker: Cracker): void {
    this.selected = cracker;
    document.querySelectorAll<HTMLButtonElement>('[data-cracker]').forEach(button => {
      const active = button.dataset.cracker === cracker.type;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    this.updateCaption(cracker);
  }

  private ignite(cracker: Cracker, unlockAudio = true, point?: { x: number; y: number }): void {
    if (unlockAudio) this.audio.unlock();
    this.select(cracker);
    const w = this.compositor.width;
    const h = this.compositor.height;
    const ground = cracker.category === 'Ground' || cracker.type === 'ROMAN_CANDLE';
    const lanes = [0.5, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6];
    const x = point?.x ?? w * lanes[this.nextLaunch++ % lanes.length];
    const y = point?.y ?? (ground ? h * 0.72 : h * 0.4);
    this.director.ignite(cracker.type, x, y, w, h);
    this.announceEffect(cracker.type);
  }

  private updateCaption(cracker: Cracker): void {
    element('active-effect').textContent = cracker.name;
    element('stage-hint').textContent = cracker.gesture;
  }

  private announceEffect(type: CrackerType): void {
    if (type === 'GRAND_FINALE') this.finaleStart = performance.now();
    if (this.lastAnnouncedType === type) return;
    this.lastAnnouncedType = type;
    const cracker = CRACKERS.find(item => item.type === type)!;
    this.select(cracker);
  }

  private setupListeners(): void {
    const activateSound = (event: Event) => {
      if (!event.isTrusted || (event.target as Element)?.closest?.('#btn-audio')) return;
      this.audio.unlock();
    };
    for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) {
      document.addEventListener(type, activateSound, { capture: true, passive: true });
    }
    element('cracker-grid').addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-cracker]');
      const cracker = CRACKERS.find(item => item.type === button?.dataset.cracker);
      if (cracker) this.ignite(cracker);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { this.audio.resumeIfActivated(); this.vision.resumeAfterVisibility(); }
    });
    this.compositor.canvas.addEventListener('pointerdown', event => {
      this.ignite(this.selected, true, { x: event.clientX, y: event.clientY });
    });
    element('btn-audio').addEventListener('click', () => this.toggleAudio());
    element('btn-camera').addEventListener('click', () => { void this.toggleCamera(); });
    element('btn-camera-panel').addEventListener('click', () => {
      if (this.cameraPanelAction === 'tracking') void this.startTracking();
      else if (this.cameraPanelAction === 'resume') void this.resumeVideo();
      else void this.startCamera();
    });
    element('btn-dismiss-camera-panel').addEventListener('click', () => { element('camera-panel').hidden = true; });
    element('btn-snap').addEventListener('click', () => this.capture.takeScreenshot());
    element('btn-record').addEventListener('click', () => this.toggleRecording());
    element('btn-guide').addEventListener('click', () => {
      this.updateTrackingStatus();
      element<HTMLDialogElement>('gesture-dialog').showModal();
    });
    element('btn-fullscreen').addEventListener('click', () => { void this.toggleFullscreen(); });
    element('btn-close-fullscreen-help').addEventListener('click', () => element<HTMLDialogElement>('fullscreen-help').close());
    for (const event of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(event, () => {
      const active = isFullscreen(document);
      const button = element('btn-fullscreen');
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
      button.title = active ? 'Exit fullscreen (F)' : 'Fullscreen & landscape (F)';
      if (!active) { try { screen.orientation?.unlock?.(); } catch { /* Browser already released it. */ } }
      this.compositor.resize();
    });
    element('btn-guide-snap').addEventListener('click', () => {
      element<HTMLDialogElement>('gesture-dialog').close();
      this.capture.takeScreenshot();
    });
    element('btn-guide-record').addEventListener('click', () => {
      element<HTMLDialogElement>('gesture-dialog').close();
      this.toggleRecording();
    });
    element('btn-close-guide').addEventListener('click', () => element<HTMLDialogElement>('gesture-dialog').close());
    element('btn-hide-hud').addEventListener('click', () => {
      element<HTMLDialogElement>('gesture-dialog').close();
      this.toggleCreatorMode();
    });
    element('btn-restore-hud').addEventListener('click', () => this.toggleCreatorMode());
    element('reel-dismiss-btn').addEventListener('click', () => this.dismissPreview());
    for (const id of ['reel-save-btn', 'reel-dialog-save-btn']) {
      element(id).addEventListener('click', () => this.capture.downloadCurrentReel());
    }
    for (const id of ['reel-view-btn', 'reel-preview-thumb-btn']) {
      element(id).addEventListener('click', () => this.openReel());
    }
    element('reel-dialog-close-btn').addEventListener('click', () => this.closeReel());
    element<HTMLDialogElement>('reel-dialog').addEventListener('close', () => element<HTMLVideoElement>('reel-dialog-video').pause());
    element<HTMLDialogElement>('reel-dialog').addEventListener('cancel', () => element<HTMLVideoElement>('reel-dialog-video').pause());
    window.addEventListener('keydown', event => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.matches('input, textarea, select, [contenteditable="true"]')) return;
      const dialog = element<HTMLDialogElement>('reel-dialog');
      if (dialog.open || element<HTMLDialogElement>('gesture-dialog').open || element<HTMLDialogElement>('fullscreen-help').open) return;
      const key = event.key.toLowerCase();
      if (key === 'escape') this.dismissPreview();
      else if (key === 'h') this.toggleCreatorMode();
      else if (key === 'f') void this.toggleFullscreen();
      else if (key === 'm') this.toggleAudio();
      else if (key === 's') this.capture.takeScreenshot();
      else if (key === 'r') this.toggleRecording();
      else if (key === 'd') this.vision.showDebug = !this.vision.showDebug;
      else if (key === ' ' && !target.closest('button, a')) {
        event.preventDefault();
        this.ignite(this.selected);
      } else {
        const cracker = CRACKERS.find(item => item.key === key);
        if (cracker) this.ignite(cracker);
      }
    });
    window.addEventListener('pagehide', () => {
      this.disposed = true;
      this.cameraAttempt++;
      cancelAnimationFrame(this.animationFrame);
      this.capture.dispose();
      this.compositor.stopCamera();
      this.vision.pause();
    });
    window.addEventListener('pageshow', event => {
      if (!event.persisted) return;
      this.disposed = false;
      this.cameraLoading = false;
      this.capture = new CaptureEngine(this.compositor.canvas);
      this.setupCapture();
      this.lastFrameTime = performance.now();
      this.nextPaintTime = 0;
      this.setCameraUI(false);
      this.loop();
      void this.restoreCamera();
    });
  }

  private toggleAudio(): void {
    const activateOnly = this.audio.needsActivation && !this.audio.isMuted;
    this.audio.unlock();
    if (!activateOnly) this.audio.toggleMute();
    this.updateAudioUI();
  }

  private updateAudioUI(): void {
    const button = element('btn-audio'), muted = this.audio.isMuted;
    const locked = this.audio.needsActivation && !muted;
    button.dataset.audioState = muted ? 'muted' : locked ? 'locked' : 'on';
    button.setAttribute('aria-pressed', String(muted));
    button.setAttribute('aria-label', muted ? 'Unmute sound' : locked ? 'Enable sound' : 'Mute sound');
    button.classList.toggle('is-muted', muted);
    button.classList.toggle('sound-locked', locked);
    button.title = muted ? 'Unmute sound (M)' : locked ? 'Your first tap enables sound' : 'Mute sound (M)';
    element('sound-label').textContent = muted ? 'Muted' : locked ? 'Tap sound' : 'Sound';
  }

  private showCameraPanel(title: string, message: string, action = 'Enable camera', kind: 'camera' | 'tracking' | 'resume' = 'camera', busy = false): void {
    this.cameraPanelAction = kind;
    element('camera-panel-title').textContent = title;
    element('camera-panel-message').textContent = message;
    const button = element<HTMLButtonElement>('btn-camera-panel');
    button.textContent = action;
    button.disabled = busy;
    element('camera-panel').hidden = false;
  }

  private setCameraUI(on: boolean): void {
    if (!on) this.trackingLive = false;
    const button = element<HTMLButtonElement>('btn-camera');
    button.classList.toggle('camera-on', on);
    button.querySelector('span')!.textContent = on ? 'Camera on' : 'Camera';
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? 'Turn off camera' : 'Enable camera');
    button.title = on ? 'Turn off camera' : 'Use hand gestures';
    element('camera-status').textContent = on ? 'Camera is on' : 'Camera off';
    this.updateCaption(this.selected);
  }

  private async restoreCamera(): Promise<void> {
    if (this.disposed || !this.cameraStorage || !cameraWasEnabled(this.cameraStorage)) return;
    if (document.visibilityState !== 'visible') {
      const resume = () => {
        if (document.visibilityState !== 'visible') return;
        document.removeEventListener('visibilitychange', resume);
        void this.restoreCamera();
      };
      document.addEventListener('visibilitychange', resume);
      return;
    }
    const attempt = this.cameraAttempt;
    const allowed = await mayResumeCamera(true, navigator.permissions);
    if (this.disposed || attempt !== this.cameraAttempt || this.cameraLoading || this.compositor.isCameraReady) return;
    if (allowed) await this.startCamera();
    else this.showCameraPanel('Camera is off', 'Your browser needs a click to resume camera access. We will not keep requesting it automatically.');
  }

  private async toggleCamera(): Promise<void> {
    if (this.cameraLoading) return;
    this.audio.unlock();
    if (!this.compositor.isCameraReady) { await this.startCamera(); return; }
    this.cameraAttempt++;
    if (this.cameraStorage) rememberCamera(false, this.cameraStorage);
    this.compositor.stopCamera();
    this.vision.resetTracking();
    this.director.handleGestures([], this.compositor.width, this.compositor.height);
    this.setCameraUI(false);
    this.showCameraPanel('Camera is off', 'Enable it for hand gestures, or keep playing with a tap.');
  }

  private async startCamera(): Promise<void> {
    if (this.cameraLoading || this.disposed) return;
    const attempt = ++this.cameraAttempt;
    this.cameraLoading = true;
    element<HTMLButtonElement>('btn-camera').disabled = true;
    this.showCameraPanel('Starting camera', 'Approve the camera request in your browser if one appears.', 'Starting…', 'camera', true);
    try {
      await this.compositor.startCamera();
      this.audio.resumeIfActivated();
      if (this.disposed || attempt !== this.cameraAttempt) return;
      if (this.cameraStorage) rememberCamera(true, this.cameraStorage);
      this.setCameraUI(true);
      element('camera-panel').hidden = true;
      // Tracking loads independently: its failure must not close a healthy camera.
      void this.startTracking();
    } catch (error) {
      if (this.disposed || attempt !== this.cameraAttempt) return;
      this.setCameraUI(false);
      this.showCameraPanel('Camera unavailable', cameraErrorMessage(error), 'Retry camera');
      element('camera-note').textContent = cameraErrorMessage(error);
      console.warn('Camera startup failed:', error);
    } finally {
      if (attempt === this.cameraAttempt) {
        this.cameraLoading = false;
        element<HTMLButtonElement>('btn-camera').disabled = false;
      }
    }
  }

  private async startTracking(recovering = false): Promise<void> {
    if (this.trackingLoading || !this.compositor.isCameraReady || this.disposed) return;
    if (!recovering) this.trackingRecoveries = 0;
    this.trackingLoading = true;
    this.trackingLive = false;
    if (!this.vision.isReady) this.showCameraPanel('Camera is on', 'Loading hand tracking…', 'Loading…', 'tracking', true);
    try {
      await this.vision.init(message => { element('camera-note').textContent = message; });
      if (this.disposed || !this.compositor.isCameraReady) return;
      this.showCameraPanel('Camera is on', 'Preparing the first hand-tracking frame… keep your hand in view.', 'Starting…', 'tracking', true);
      element('camera-status').textContent = 'Preparing hand tracking';
    } catch (error) {
      this.vision.pause();
      if (!this.disposed && this.compositor.isCameraReady) this.trackingFailed();
      console.warn('Hand tracking initialization failed:', error);
    } finally { this.trackingLoading = false; }
  }

  private trackingFailed(): void {
    this.director.handleGestures([], this.compositor.width, this.compositor.height);
    element('camera-status').textContent = 'Camera on; hand tracking paused';
    this.showCameraPanel('Camera is on', 'Hand tracking paused. Retry tracking, or tap a cracker to keep playing.', 'Retry tracking', 'tracking');
  }

  private async resumeVideo(): Promise<void> {
    try {
      await this.compositor.startCamera();
      if (this.compositor.camera.isMuted) {
        this.showCameraPanel('Camera paused', 'The browser is not delivering camera frames yet. Keep this tab open; it will resume when video returns.', 'Resume', 'resume');
        return;
      }
      if (this.vision.isReady) element('camera-panel').hidden = true;
      else await this.startTracking();
    } catch (error) {
      this.setCameraUI(false);
      this.showCameraPanel('Camera unavailable', cameraErrorMessage(error), 'Retry camera');
    }
  }

  private toggleCreatorMode(): void {
    this.creatorMode = !this.creatorMode;
    element('hud').classList.toggle('hud-hidden', this.creatorMode);
    element('hud').inert = this.creatorMode;
    element('btn-restore-hud').classList.toggle('hidden', !this.creatorMode);
  }

  private async toggleFullscreen(): Promise<void> {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (mode: 'landscape') => Promise<void> };
    if (isFullscreen(document)) {
      try { await leaveFullscreen(document, orientation); } catch { this.notify('Use your browser’s exit fullscreen control.'); }
      return;
    }
    if (window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches) {
      this.notify('Already fullscreen. Turn your phone sideways for the widest view.');
      return;
    }
    const result = await enterFullscreen(document.documentElement, document, window.matchMedia('(pointer: coarse)').matches ? orientation : undefined);
    if (result === 'unavailable') element<HTMLDialogElement>('fullscreen-help').showModal();
    else if (result === 'rejected') this.notify('Fullscreen was blocked by this browser. Turn sideways for a wider view, or try opening the site in your browser.');
  }

  private setupCapture(): void {
    this.capture.setCallbacks({
      onRecordingStart: () => {
        this.recordedSeconds = 0;
        element('btn-record').classList.add('recording');
        element('btn-record').setAttribute('aria-pressed', 'true');
        element('record-label').textContent = 'Stop';
        this.dismissPreview();
      },
      onRecordingStop: (_blob, url) => {
        element('btn-record').classList.remove('recording');
        element('btn-record').setAttribute('aria-pressed', 'false');
        element('record-label').textContent = 'Record';
        element('record-timer').textContent = '00:00';
        element('reel-duration').textContent = this.formatTime(this.recordedSeconds);
        element<HTMLVideoElement>('reel-preview-video').src = url;
        element('reel-preview-card').classList.remove('hidden');
        void element<HTMLVideoElement>('reel-preview-video').play().catch(() => {});
      },
      onTimeUpdate: seconds => {
        this.recordedSeconds = seconds;
        element('record-timer').textContent = `${this.formatTime(seconds)} / 00:30`;
      },
      onRecordingError: () => {
        element('btn-record').classList.remove('recording');
        element('btn-record').setAttribute('aria-pressed', 'false');
        element('record-label').textContent = 'Record';
        this.notify('Recording is unavailable in this browser. Try a postcard instead.');
      }
    });
  }

  private toggleRecording(): void {
    this.audio.unlock();
    if (this.capture.isRecording) this.capture.stopRecording();
    else if (!this.capture.startRecording(this.audio.getAudioStream())) {
      this.notify('Recording could not start. Try another browser or save a postcard.');
    }
  }

  private dismissPreview(): void {
    element('reel-preview-card').classList.add('hidden');
    const video = element<HTMLVideoElement>('reel-preview-video');
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  private openReel(): void {
    if (!this.capture.latestVideoUrl) return;
    const video = element<HTMLVideoElement>('reel-dialog-video');
    video.src = this.capture.latestVideoUrl;
    element<HTMLDialogElement>('reel-dialog').showModal();
    void video.play().catch(() => {});
  }

  private closeReel(): void { element<HTMLDialogElement>('reel-dialog').close(); }
  private formatTime(seconds: number): string { return `00:${Math.floor(seconds).toString().padStart(2, '0')}`; }

  private notify(message: string): void {
    element('toast').textContent = message;
    element('toast').hidden = false;
    window.clearTimeout(this.toastTimeout);
    this.toastTimeout = window.setTimeout(() => { element('toast').hidden = true; }, 5500);
  }

  private drawFinale(now: number): void {
    const elapsed = (now - this.finaleStart) / 1000;
    const visible = elapsed > 1.4 && elapsed < 7.9;
    if (this.finaleVisible !== visible) {
      this.finaleVisible = visible;
      element('grand-finale-center').classList.toggle('hidden', !visible);
      element('app').classList.toggle('is-finale', visible);
    }
    if (!visible) return;
    // Put the greeting into the actual canvas, so exports contain it as well.
    const { ctx, width, height } = this.compositor;
    const alpha = Math.min(1, (elapsed - 1.4) / 0.5, (7.9 - elapsed) / 0.5);
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffdb8e';
    ctx.shadowColor = '#f5ad53';
    ctx.shadowBlur = 18;
    ctx.font = `${Math.min(72, width * 0.08)}px "Instrument Serif", Georgia, serif`;
    ctx.fillText('Happy Diwali', width / 2, height * 0.48);
    ctx.shadowBlur = 0;
    ctx.font = `${Math.max(11, width * 0.01)}px "DM Sans", sans-serif`;
    ctx.fillText('MAY YOUR WORLD BE FULL OF LIGHT', width / 2, height * 0.48 + 30);
    ctx.restore();
  }

  private applyQuality(): void {
    const profile = this.quality.profile;
    this.compositor.setPixelBudget(profile.pixels);
    this.director.pool.setBudget(profile);
    this.vision.setTrackingRate(profile.trackingHz);
    this.compositor.canvas.dataset.quality = profile.name;
  }

  private updateTrackingStatus(): void {
    const stats = this.vision.diagnostics;
    element('tracking-health').textContent = !this.compositor.isCameraReady ? 'Enable the camera to use hand gestures.'
      : !this.vision.isReady ? 'Hand tracking is loading or paused.'
      : !stats.fresh ? 'Waiting for a fresh camera frame…'
      : `Tracking ${stats.captureToResultMs > 150 ? 'slow' : 'live'} · ${Math.round(stats.updatesPerSecond)} updates/s · ${stats.hands} ${stats.hands === 1 ? 'hand' : 'hands'}`;
  }

  private trackHands(now: number): void {
    if (!this.compositor.isCameraReady || !this.vision.isReady) return;
    try {
      const gestures = this.vision.update(this.compositor.video, this.compositor.width, this.compositor.height);
      const stats = this.vision.diagnostics;
      if (!this.trackingLive && stats.fresh) {
        this.trackingLive = true;
        element('camera-panel').hidden = true;
        element('camera-status').textContent = 'Hand tracking is live';
        element('camera-note').textContent = 'Camera and hand tracking are ready.';
      }
      this.director.handleGestures(gestures, this.compositor.width, this.compositor.height, this.vision.detectedHands);
      if (gestures.some(gesture => gesture.type === 'GRAND_FINALE')) this.finaleStart = now;
      const newest = gestures.find(gesture => !gesture.isContinuous) ?? gestures[0];
      if (newest && newest.type !== 'NONE') this.announceEffect(newest.type);
    } catch (error) {
      this.vision.pause();
      if (this.trackingRecoveries < 1 && !this.trackingLoading) {
        this.trackingRecoveries++;
        void this.startTracking(true);
      } else this.trackingFailed();
      console.warn('Hand tracking interrupted:', error);
    }
  }

  private loop = (now = performance.now()): void => {
    // Input runs on every display tick, even when fireworks paint at 30 fps.
    if (!document.hidden) this.trackHands(now);
    // High-refresh displays do not need to redraw the same 60 Hz simulation twice.
    if (document.hidden || now + 0.5 < this.nextPaintTime) {
      if (document.hidden) { this.lastFrameTime = now; this.nextPaintTime = now; }
      this.animationFrame = requestAnimationFrame(this.loop);
      return;
    }
    if (this.pendingQuality) { this.applyQuality(); this.pendingQuality = false; }
    const started = performance.now();
    this.nextPaintTime = Math.max(this.nextPaintTime + 1000 / this.quality.profile.fps, now + 1);
    const interval = now - this.lastFrameTime;
    const dt = Math.min(interval / 1000, 0.1);
    this.lastFrameTime = now;
    this.compositor.drawBackground();
    this.director.updateAndRender(dt, this.compositor.ctx);
    this.drawFinale(now);
    this.capture.drawRecordingBrand(this.compositor.ctx, this.compositor.width, this.compositor.height);
    this.vision.drawDebugSkeleton(this.compositor.ctx);
    if (this.compositor.canvas.dataset.trackingMode !== this.vision.mode) this.compositor.canvas.dataset.trackingMode = this.vision.mode;
    if (now >= this.nextTrackingStatus && element<HTMLDialogElement>('gesture-dialog').open) {
      this.nextTrackingStatus = now + 1000; this.updateTrackingStatus();
    }
    const tracking = this.vision.diagnostics;
    const trackingMs = this.compositor.isCameraReady && this.vision.isReady ? Math.max(tracking.inferenceMs, tracking.captureToResultMs) : 0;
    if (this.quality.sample(now, interval, performance.now() - started, this.director.pool.activeCount > 0 || this.compositor.isCameraReady, trackingMs)) this.pendingQuality = true;
    if (this.profiling && now >= this.nextProfile) {
      this.nextProfile = now + 1000;
      this.compositor.canvas.dataset.performance = JSON.stringify({ quality: this.quality.profile.name, particles: this.director.pool.activeCount, effects: this.director.activeCount, tracking: this.vision.diagnostics, audio: this.audio.diagnostics });
    }
    this.animationFrame = requestAnimationFrame(this.loop);
  };
}

new FireworksApp();
