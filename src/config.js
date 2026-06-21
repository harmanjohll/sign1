// ---------------------------------------------------------------------------
// config.js — single source of truth for URLs, the avatar, and tuning knobs.
// Edit values here first; the rest of the app reads from this object.
// ---------------------------------------------------------------------------

export const CONFIG = {
  // The VRM avatar to mirror. Any VRM 0.x/1.0 with finger bones + A/I/U/E/O +
  // Blink expressions works; replace assets/avatar.vrm to change the look.
  avatarUrl: "./assets/avatar.vrm",

  // MediaPipe Tasks — these load in the user's browser (any CDN is fine there).
  mediapipe: {
    wasm: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
    faceModel:
      "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    handModel:
      "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
    // "lite" pose keeps three models running at ~30fps on desktop.
    poseModel:
      "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    delegate: "GPU", // "GPU" | "CPU"
  },

  camera: { width: 1280, height: 720, facingMode: "user" },

  // --- Mirror / handedness tuning -----------------------------------------
  // The avatar faces you like a mirror. If hands/head end up reversed during
  // testing, flip these (also toggleable live with keyboard: see main.js).
  mirror: {
    swapHands: false, // map your left hand to the avatar's left side or not
    flipHeadYaw: false, // negate head turn left/right
  },

  // --- Smoothing (0..1 per frame; higher = snappier, lower = smoother) -----
  smoothing: {
    body: 0.35, // arms / spine
    hands: 0.45, // fingers (a touch snappier so signs read clearly)
    head: 0.4,
    expression: 0.5, // blink / mouth / emotions
    handLost: 0.12, // rate fingers relax back to neutral when a hand leaves frame
  },

  // Per-channel dampeners applied to Kalidokit output before lerping.
  gain: {
    arm: 1.0,
    spine: 0.6,
    head: 0.8,
    smile: 1.4, // map ARKit smile -> "happy"; >1 makes it read more clearly
    surprised: 1.2,
  },

  // Show the dotted landmark overlay on the camera preview.
  debugLandmarks: false,
};
