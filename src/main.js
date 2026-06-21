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
      lastResults = detectors.detect(video, performance.now());
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
    setStatus("Mirroring Fumi. Keys: M swap hands · H flip head · L landmarks · R turn Fumi");
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
  if (k === "m") CONFIG.mirror.swapHands = !CONFIG.mirror.swapHands;
  else if (k === "h") CONFIG.mirror.flipHeadYaw = !CONFIG.mirror.flipHeadYaw;
  else if (k === "l") CONFIG.debugLandmarks = !CONFIG.debugLandmarks;
  else if (k === "r" && avatar.vrm) avatar.vrm.scene.rotation.y += Math.PI;
  else return;
  console.info("[config]", { ...CONFIG.mirror, debugLandmarks: CONFIG.debugLandmarks });
});

// --- Optional landmark overlay (toggle with L) --------------------------------
function clearOverlay() {
  if (overlay.width) octx.clearRect(0, 0, overlay.width, overlay.height);
}
function drawOverlay(results) {
  const w = (overlay.width = overlay.clientWidth);
  const h = (overlay.height = overlay.clientHeight);
  octx.clearRect(0, 0, w, h);
  const dot = (pts, color) => {
    if (!pts) return;
    octx.fillStyle = color;
    for (const p of pts) {
      octx.beginPath();
      octx.arc(p.x * w, p.y * h, 2.5, 0, Math.PI * 2);
      octx.fill();
    }
  };
  (results.hands?.landmarks || []).forEach((lm) => dot(lm, "#5ad1ff"));
  dot(results.pose?.landmarks?.[0], "#ffd166");
  dot(results.face?.faceLandmarks?.[0], "rgba(120,255,180,0.5)");
}

// Start the render loop last, after all setup and listeners are in place.
animate();
