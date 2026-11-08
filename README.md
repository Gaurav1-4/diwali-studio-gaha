# Gaha Diwali Studio — by Gaurav

[Open the live studio](https://diwali-studio-gaha.vercel.app/) · [Source on GitHub](https://github.com/Gaurav1-4/diwali-studio-gaha)

**Gaha** is a Diwali fireworks experience customized and maintained by **Gaurav**: ten firecrackers, hand gestures, recorded pyrotechnic sounds, postcards, and video reels.

[Instagram @gauravvx14](https://www.instagram.com/gauravvx14/) · [Gaurav on GitHub](https://github.com/Gaurav1-4) · [Credits and asset provenance](CREDITS.md) · [Software license](LICENSE)

## Run locally

Use Node.js 18.19+ and pnpm (or npm):

```sh
pnpm install
pnpm dev --port 5000 --host 127.0.0.1 --strictPort
```

Open `http://127.0.0.1:5000/` consistently. Every cracker works without a webcam. Click **Enable camera** to enable video and hand tracking. The app remembers this choice and resumes it after reload only when the browser reports that camera permission is already granted. It does not repeatedly request access when permission is pending, denied, or cannot be queried. Turning the camera off clears the resume preference. Browser and OS permission settings remain in control of the actual grant. Video is processed in the browser; it is not uploaded.

```sh
pnpm build
pnpm test
```

The build runs strict TypeScript checking and Vite. The tests cover gesture events, coordinate projection, effect sequencing, simulation timing, audio scheduling, particle reuse, and recorder cleanup. The simulated tracker tests do not evaluate MediaPipe recognition accuracy.

## The patakha box

The interface keeps the sky clear: a small toolbar and a compact illustrated dock. Each cracker shows its name and gesture directly in the dock. Open **?** for guidance, keyboard shortcuts, and live tracking health (measured updates/s and detected hand count). The camera fills the entire page edge to edge, behind the controls, at its original brightness and color. The app adds no dimming, tint, saturation filter or vignette. Phones use a compact five-column, two-row tray; landscape phones show all ten in a single 54px row. The small toolbar keeps camera, sound, guidance and fullscreen accessible; postcard, recording and creator links are also in the guide. Safe-area insets protect controls around notches and home indicators. Click a cracker to ignite it. Tap anywhere in the sky to place another instance of the selected cracker. Every tap adds a separate instance, including repeated crackers. Dock clicks and hotkeys spread launches across the sky; taps place them exactly where you touch. Anar and Phooljhadi burn for 3.5 seconds when tapped. Hand-controlled Anar and Phooljhadi both follow the hand and share a 220 ms tracking-gap grace period. Releasing or changing the sign stops the hand-held source, avoiding stationary duplicates. A matching sign picks up the latest clicked object. Ganga Jamuna, Chakri, bomb fuses and Roman candle launchers also follow their held sign while burning; already-fired projectiles keep their own trajectories.

| Key | Cracker | Hand gesture | Performance |
| --- | --- | --- | --- |
| 1 | Rocket | Index finger pointing up | A climbing golden trail followed by a peony or willow burst |
| 2 | Anar | Closed fist | Dense golden fountain with white-hot jets and crackling fallout |
| 3 | Starburst | L sign: index up, thumb out | A colorful radial shell with secondary crackles |
| 4 | Roman candle | Two fingers up (V) | Five successive colorful comets |
| 5 | Phooljhadi | Thumb and index pinched together | A sparkler that follows the pinch point |
| 6 | Grand finale | Both hands open | A cascade of shells and a Happy Diwali greeting |
| 7 | Ganga Jamuna | Index and little finger raised | An Anar fountain for 2.65 seconds, a 0.3-second sputter, then a bomb burst |
| 8 | Chakri | One open palm (hold to repeat) | A spinning ground wheel that accelerates and fades over 4.2 seconds |
| 9 | Sutli bomb | Three fingers up (hold to repeat) | A 1.25-second fuse followed by a heavy flash and deep report |
| 0 | Bullet bomb | Thumb up | A shorter 0.72-second fuse followed by a smaller, sharper report |

All signs use one hand except **Grand finale**, which uses both palms open. Rocket and Roman candle retain their upright one/two-finger signs. Anar uses a fist; Phooljhadi uses thumb/index contact and follows the pinch point. Starburst uses an L; Ganga Jamuna uses index/little fingers. Chakri uses an open palm, Sutli uses three fingers, and Bullet uses thumbs up.

Hold a pose briefly: 180 ms normally, 70 ms for the sparkler, 220 ms for Chakri, 250 ms for Sutli, and 300 ms for the two-palm finale. Holding the Chakri or Sutli sign creates another instance every 650 ms, allowing overlapping wheels and bomb fuses. Other single-hand signs remain independent per hand. Two open palms take priority over individual palms, with a short dropout grace to avoid firing wheels when a finale hand briefly disappears. Recognition depends on framing, lighting, and keeping the hand visible. Clicks and hotkeys are always available.

## Controls

- **Space:** Replay the selected cracker.
- **H:** Hide or restore the controls.
- **F / fullscreen icon:** Enter or exit fullscreen; supported phones also request landscape orientation. If the browser cannot lock orientation, turn the phone sideways. iPhone browsers that do not support element fullscreen show Home Screen instructions: Share → Add to Home Screen → Open as Web App (if shown), then launch from the Home Screen. The web app manifest requests standalone/fullscreen display and landscape; actual support remains browser-dependent.
- **M:** Toggle sound.
- **S:** Download a PNG postcard.
- **R:** Start or stop a reel, up to 30 seconds.
- **D:** Show the tracking skeleton.

Reels capture the canvas, including a Gaha · by Gaurav watermark, and mixed audio at a requested 60 fps and 8 Mbps. WebM is preferred, with MP4 as a browser-dependent fallback. Actual frame rate depends on the device. The finale greeting is drawn into the canvas so it appears in exports; ornamental HTML decorations are display-only.

## Implementation

- **Vite + TypeScript:** No UI framework or backend.
- **MediaPipe Tasks Vision:** Local hand model and WASM, with remote fallbacks. GPU inference with CPU fallback. Camera capture prefers 480×640 in portrait and 640×480 in landscape, with uncropped capture when available. The camera uses cover fitting on every screen, with the same crop transform for video and hand landmarks. It fills the stage rather than a separate box. Rotation reapplies framing ideals to the existing stream without another media request. Differing camera/screen aspect ratios crop the edges; landscape gives the widest view. A background worker receives at most one transferred frame at a time, keeping recognition off the animation thread. Input is bounded to a 512px longest edge for fingertip detail and drops to 384/320px on slow inference. Camera-frame callbacks feed the worker directly when supported, coalescing busy frames to the newest source frame. If presentation callbacks stall, throw, or stop advancing media timestamps, a 200ms watchdog falls back to polling the camera clock. Animation polling also covers browsers without the callback API. Input updates run independently of the fireworks paint limit, targeting 24–30 Hz within actual inference limits. Unsupported browsers use a paced main-thread fallback. Late results are discarded using a measured-cost freshness window, normally 250 ms and capped at 600 ms for slow inference, so slow devices do not reject every current pose. Bounded palm-translation prediction compensates for recent result age without changing the finger shape or classification. OK contact uses image-space fingertip distance with hysteresis, while palm recognition measures finger reach along the wrist-to-knuckle axis so spread and tilted palms work.
- **Rendering:** Analytic WebGL2 sparks with soft glow and tapered motion trails, composited over the camera in Canvas 2D. There is a cached Canvas 2D fallback when WebGL2 is unavailable. Adaptive drawing ranges from 0.79 to 3.69 million pixels. Device memory/core hints choose the starting budget, and sustained slow frames or slow background inference reduce it further. Fast painting alone cannot raise graphics budgets while tracking remains slow. Low-cost mode targets 30 fps with 1,600 particles and 16 smoke puffs; larger devices retain up to 7,500 particles and 60 fps. Fine metal jets, projected spherical shells, gradual cooling, and drifting smoke replace the old solid-dot look. The fixed 60 Hz simulation keeps motion consistent across display refresh rates.
- **Casings:** Cached 256-pixel material renders with paper grain, cylindrical shading, cardboard rims, and projected jute windings. The dock and ground effects share these assets; textures are generated once, not every frame.
- **Particle pool:** A free-slot stack plus a packed live list avoids scanning inactive slots in simulation and rendering. Emission, smoke, and ambient flash budgets stay bounded when many crackers overlap.
- **Audio:** The first tap/click/key interaction resumes audio, including the camera and cracker controls. Recordings download early and first sounds are queued briefly while decoding. Explicit mute is preserved, and interruptions resume after returning from a camera prompt or backgrounding. Browsers still require an initial user interaction for audible playback. Existing local MP3 recordings plus synthesis. Ganga Jamuna uses the fountain recording before its report. Chakri uses the previously bundled spinner recording. Bullet combines a stronger thunder crack and heavy report; Sutli retains a longer, louder and deeper layered mix. Both use existing recordings, rather than new field recordings. A compressor controls overlapping peaks.
- **Camera lifecycle:** A single shared startup request, live-stream reuse, a decoded-frame readiness check, visible status, and clean cancellation. Tracking retries keep a healthy camera running and do not request camera permission again. A runtime worker failure gets one automatic recovery on the paced main-thread path, avoiding repeated attempts at an incompatible worker; persistent errors expose Retry tracking. The app shows preparation until the first usable tracking result arrives. Cold inference has an eight-second warm-up allowance, and returning from background resets the pending-frame watchdog and invalidates pre-background gestures.
- **Capture:** Independent recording tracks, codec-based extensions, clean stream shutdown, and preview before download.

See [docs/architecture.md](docs/architecture.md) for the module map.

## Gaha and Gaurav

The product identity is **Gaha · by Gaurav**. The app header, creator links, browser and sharing metadata, Home Screen identity, postcard signature, recording watermark and download filenames use this identity. Gaurav maintains the current experience and its deployment.

- [Gaurav on GitHub](https://github.com/Gaurav1-4)
- [Instagram @gauravvx14](https://www.instagram.com/gauravvx14/)
- [Source repository](https://github.com/Gaurav1-4/diwali-studio-gaha)
- [Live Gaha Diwali Studio](https://diwali-studio-gaha.vercel.app/)

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Deployment

The Vercel project builds the repository with `npm ci` and `npm run build`, then serves `dist`. Production is deployed from the local folder using `vercel deploy --prod --scope semly-2`. The GitHub repository stores the source; automatic deployments from GitHub pushes are not enabled.
