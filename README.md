# sign1 — SgSL Mirror

Reboot of the SgSL Signing App. **Milestone 1: live mirror.**

Stand in front of your webcam and the 3D avatar copies you in real time — a
mirror / VTuber-style rig focused on **hands** (full finger articulation) and
**face** (blink, mouth, expressions, head turn), plus upper-body arms and spine.
Everything runs **client-side** in the browser; there is no backend and no build
step.

## Run it

It needs a secure context (camera + WebAssembly), so use `localhost` or HTTPS —
opening `index.html` from the file system will not work.

```bash
python3 -m http.server 8000
# open http://localhost:8000 in desktop Chrome, click "Start camera"
```

Deploys as-is to GitHub Pages (serve the repo root).

## How it works

```
webcam ─▶ MediaPipe Tasks (face + hands + pose landmarks)
       ─▶ solver (Kalidokit body/hand math + ARKit face blendshapes)  ─▶ rig
       ─▶ avatarTarget (apply rig to VRM bones + expressions, smoothed)
       ─▶ three.js render
```

| File | Role |
|------|------|
| `src/config.js` | All CDN URLs, the avatar path, and tuning knobs |
| `src/detectors.js` | MediaPipe face / hand / pose landmarkers |
| `src/solver.js` | Landmarks → a single `rig` object |
| `src/avatarTarget.js` | Loads the VRM, applies the `rig` to bones + expressions |
| `src/scene.js` · `src/camera.js` · `src/main.js` | three.js scene, webcam, loop/UI |

Libraries (pinned, loaded from jsDelivr in the browser): three.js 0.180,
`@pixiv/three-vrm` 3.5.4, `@mediapipe/tasks-vision` 0.10.35, Kalidokit 1.1.5.

## Tuning while it runs

Tracking-to-avatar mapping often needs a left/right or sign flip depending on
your camera. Adjust live with the keyboard (or edit `src/config.js`):

- **M** — toggle mirror (reflection) vs. same-side (direct copy) mapping
- **H** — flip head turn direction
- **L** — toggle the landmark overlay (points + connections) on the self-view
- **R** — rotate the avatar 180° (if it loads facing away)

## Avatar

`assets/avatar.vrm` is **"Sakurada Fumiriya"**, a CC0 VRoid sample model (male),
with a full finger rig and the standard VRoid face blendshapes. See
`assets/avatar.vrm.LICENSE.txt`. To change the look, drop in any VRM with finger
bones and `A/I/U/E/O` + `Blink` expressions — no code changes needed. A
"perfect-sync" VRM (52 ARKit blendshapes) will give even richer facial mirroring.
