// solver.js — turn raw MediaPipe results into a single, renderer-agnostic `rig`.
// Body + hands use Kalidokit's proven solvers; face expression intensity is read
// from MediaPipe's ARKit blendshapes (cleaner/less jittery than geometry).
import * as Kalidokit from "kalidokit";
import { CONFIG } from "./config.js";
import { clamp } from "./utils.js";

const opposite = (s) => (s === "Left" ? "Right" : "Left");

// Build a {blendshapeName: score} lookup from a FaceLandmarker result.
function blendMap(faceResult) {
  const cats = faceResult?.faceBlendshapes?.[0]?.categories;
  if (!cats) return null;
  const m = {};
  for (const c of cats) m[c.categoryName] = c.score;
  return m;
}

export function solve(results, video) {
  const imageSize = { width: video.videoWidth, height: video.videoHeight };
  const rig = {
    pose: null,
    face: null,
    hands: { left: null, right: null },
    blink: null,
    emotion: null,
    hasFace: false,
    hasPose: false,
  };

  // --- Pose (upper body) ---------------------------------------------------
  const poseLm = results.pose?.landmarks?.[0];
  const poseWorld = results.pose?.worldLandmarks?.[0];
  if (poseLm && poseWorld) {
    rig.pose = Kalidokit.Pose.solve(poseWorld, poseLm, {
      runtime: "mediapipe",
      video,
      imageSize,
    });
    rig.hasPose = !!rig.pose;
  }

  // --- Face (head + visemes + blink) + emotion blendshapes -----------------
  const faceLm = results.face?.faceLandmarks?.[0];
  if (faceLm) {
    rig.face = Kalidokit.Face.solve(faceLm, {
      runtime: "mediapipe",
      video,
      imageSize,
      smoothBlink: false,
    });
    rig.hasFace = !!rig.face;

    if (rig.face?.eye) {
      const stab = Kalidokit.Face.stabilizeBlink(
        { l: rig.face.eye.l, r: rig.face.eye.r },
        rig.face.head?.y ?? 0,
      );
      rig.blink = { l: stab.l, r: stab.r }; // 1 = open, 0 = closed
    }

    const bs = blendMap(results.face);
    if (bs) {
      const avg = (a, b) => ((bs[a] || 0) + (bs[b] || 0)) / 2;
      rig.emotion = {
        happy: clamp(avg("mouthSmileLeft", "mouthSmileRight") * CONFIG.gain.smile),
        surprised: clamp(
          (avg("eyeWideLeft", "eyeWideRight") * 0.7 +
            avg("browOuterUpLeft", "browOuterUpRight") * 0.5) *
            CONFIG.gain.surprised,
        ),
        angry: clamp(avg("browDownLeft", "browDownRight")),
        sad: clamp(avg("mouthFrownLeft", "mouthFrownRight") * 0.8 + (bs.browInnerUp || 0) * 0.4),
      };
    }
  }

  // --- Hands (fingers) -----------------------------------------------------
  const handLms = results.hands?.landmarks || [];
  const handed = results.hands?.handedness || [];
  for (let i = 0; i < handLms.length; i++) {
    const raw = handed[i]?.[0]?.categoryName; // "Left" | "Right"
    if (!raw) continue;
    const side = CONFIG.mirror.swapHands ? opposite(raw) : raw;
    const solved = Kalidokit.Hand.solve(handLms[i], side);
    if (solved) rig.hands[side.toLowerCase()] = { side, data: solved };
  }

  return rig;
}
