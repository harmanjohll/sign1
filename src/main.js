// main.js — wires everything together: scene + avatar + detectors + camera,
// then runs the render/detect loop and the small UI.
import * as THREE from "three";
import { CONFIG } from "./config.js";
import { createScene } from "./scene.js";
import { startCamera, stopCamera } from "./camera.js";
import { createDetectors } from "./detectors.js";
import { solve } from "./solver.js";
import { VrmTarget } from "./avatarTarget.js";

const view = document.getElementById("view");
const video = document.getElementById("cam");
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const statusEl = document.getElementById("status");
const fpsEl = document.getElementById("fps");
const octx = overlay.getContext("2d"); // overlay canvas 2D context (used in the loop)

// Offscreen canvas to horizontally flip the webcam frame before tracking, so
// pose + hands + face are all detected in ONE consistent (mirrored) space —
// which keeps arms and fingers on the same side. Toggled by CONFIG.mirror.reflect.
const flipCanvas = document.createElement("canvas");
const fctx = flipCanvas.getContext("2d");
function detectionInput() {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!CONFIG.mirror.reflect || !w) return video; // same-side mode: raw frame
  flipCanvas.width = w;
  flipCanvas.height = h;
  fctx.save();
  fctx.translate(w, 0);
  fctx.scale(-1, 1);
  fctx.drawImage(video, 0, 0);
  fctx.restore();
  return flipCanvas;
}

const setStatus = (msg) => (statusEl.textContent = msg);

// Friendly text for the common getUserMedia / model-load failures.
function cameraErrorMessage(e) {
  const n = e?.name || "";
  if (n === "NotAllowedError" || n === "SecurityError")
    return "Camera blocked. Click the camera icon in the address bar and Allow, then press Start again.";
  if (n === "NotFoundError" || n === "OverconstrainedError")
    return "No camera found. Plug one in / close other apps using it, then press Start.";
  if (n === "NotReadableError")
    return "Camera is in use by another app. Close it (Zoom/Meet/Photo Booth) and press Start.";
  return "Error: " + (e?.message || e);
}

const { renderer, scene, camera, controls } = createScene(view);
const avatar = new VrmTarget();

let detectors = null;
let running = false;
let lastResults = null;
let lastVideoTime = -1;
const clock = new THREE.Clock();

// --- Fumi loads immediately so the idle character is visible on page load ---
setStatus("Loading Fumi…");
avatar
  .load(CONFIG.avatarUrl, scene)
  .then(() => setStatus("Ready. Click “Start camera”. (Drag to rotate, scroll to zoom.)"))
  .catch((e) => {
    console.error(e);
    setStatus("Fumi failed to load: " + e.message);
  });

// --- Main loop: render every frame; detect once per new camera frame ----------
let frames = 0;
let fpsClock = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  if (running && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    try {
      lastResults = detectors.detect(detectionInput(), performance.now());
      avatar.applyRig(solve(lastResults, video));
    } catch (e) {
      console.error("detect/solve error:", e);
    }
  }

  avatar.update(dt);
  controls.update();
  renderer.render(scene, camera);
  if (CONFIG.debugLandmarks && lastResults) drawOverlay(lastResults);
  else clearOverlay();

  frames++;
  const now = performance.now();
  if (now - fpsClock >= 500) {
    fpsEl.textContent = Math.round((frames * 1000) / (now - fpsClock)) + " fps";
    frames = 0;
    fpsClock = now;
  }
}

// --- Start / stop -------------------------------------------------------------
startBtn.addEventListener("click", async () => {
  if (running) {
    running = false;
    stopCamera(video);
    startBtn.textContent = "Start camera";
    setStatus("Stopped.");
    return;
  }
  try {
    startBtn.disabled = true;
    // Camera FIRST, so you see yourself immediately even while models load.
    setStatus("Requesting camera…");
    await startCamera(video);
    startBtn.textContent = "Stop";

    if (!detectors) {
      setStatus("Camera on. Loading tracking models… (first run ~30MB)");
      detectors = await createDetectors();
    }
    running = true;
    setStatus("Mirroring Fumi. Keys: M mirror/direct · H head · L points · R turn Fumi");
  } catch (e) {
    console.error(e);
    setStatus(cameraErrorMessage(e));
    startBtn.textContent = "Start camera";
  } finally {
    startBtn.disabled = false;
  }
});

// --- Live tuning keys (no code edits needed while testing) --------------------
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "m") CONFIG.mirror.reflect = !CONFIG.mirror.reflect;
  else if (k === "h") CONFIG.mirror.flipHeadYaw = !CONFIG.mirror.flipHeadYaw;
  else if (k === "l") CONFIG.debugLandmarks = !CONFIG.debugLandmarks;
  else if (k === "r" && avatar.vrm) avatar.vrm.scene.rotation.y += Math.PI;
  else return;
  console.info("[config]", { ...CONFIG.mirror, debugLandmarks: CONFIG.debugLandmarks });
});

// --- Landmark overlay (points + connections; toggle with L) -------------------
// Connection index pairs (MediaPipe topology) for drawing the "skeleton".
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
];
// Map detection-space x into the mirrored self-view so dots line up with the video.
const sx = (x) => (CONFIG.mirror.reflect ? x : 1 - x);

function clearOverlay() {
  if (overlay.width) octx.clearRect(0, 0, overlay.width, overlay.height);
}
function drawOverlay(results) {
  const w = (overlay.width = overlay.clientWidth);
  const h = (overlay.height = overlay.clientHeight);
  octx.clearRect(0, 0, w, h);

  const lines = (pts, conns, color, lw) => {
    if (!pts) return;
    octx.strokeStyle = color;
    octx.lineWidth = lw;
    for (const [a, b] of conns) {
      const p = pts[a];
      const q = pts[b];
      if (!p || !q) continue;
      octx.beginPath();
      octx.moveTo(sx(p.x) * w, p.y * h);
      octx.lineTo(sx(q.x) * w, q.y * h);
      octx.stroke();
    }
  };
  const dots = (pts, color, r) => {
    if (!pts) return;
    octx.fillStyle = color;
    for (const p of pts) {
      octx.beginPath();
      octx.arc(sx(p.x) * w, p.y * h, r, 0, Math.PI * 2);
      octx.fill();
    }
  };

  // Face mesh — faint, every 4th point to avoid clutter.
  const face = results.face?.faceLandmarks?.[0];
  if (face) {
    octx.fillStyle = "rgba(120,255,180,0.4)";
    for (let i = 0; i < face.length; i += 4) {
      const p = face[i];
      octx.beginPath();
      octx.arc(sx(p.x) * w, p.y * h, 1, 0, Math.PI * 2);
      octx.fill();
    }
  }
  // Pose (upper body).
  const pose = results.pose?.landmarks?.[0];
  lines(pose, POSE_CONNECTIONS, "rgba(255,209,102,0.9)", 3);
  dots(pose, "#ffd166", 3);
  // Hands.
  (results.hands?.landmarks || []).forEach((lm) => {
    lines(lm, HAND_CONNECTIONS, "rgba(90,209,255,0.9)", 2);
    dots(lm, "#5ad1ff", 2.5);
  });
}

// Start the render loop last, after all setup and listeners are in place.
animate();
