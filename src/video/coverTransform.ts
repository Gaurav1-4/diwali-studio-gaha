export interface CameraViewport { x: number; y: number; width: number; height: number; }

/** Desktop fills the stage; a supplied phone viewport shows the entire camera frame. */
export function coverTransform(videoW: number, videoH: number, screenW: number, screenH: number, viewport?: CameraViewport | null) {
  const area = viewport ?? { x: 0, y: 0, width: screenW, height: screenH };
  const scale = viewport ? Math.min(area.width / videoW, area.height / videoH) : Math.max(screenW / videoW, screenH / videoH);
  const width = videoW * scale, height = videoH * scale;
  return { width, height, x: area.x + (area.width - width) / 2, y: area.y + (area.height - height) / 2 };
}

export function cameraConstraints(width = 640, height = 480): MediaTrackConstraints & { resizeMode?: ConstrainDOMString } {
  const portrait = width < height;
  return { width: { ideal: portrait ? 480 : 640 }, height: { ideal: portrait ? 640 : 480 },
    resizeMode: { ideal: 'none' }, aspectRatio: { ideal: portrait ? 3 / 4 : 4 / 3 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' };
}
