// detectors.js — MediaPipe Tasks: face + hands + pose landmarkers.
import {
  FilesetResolver,
  FaceLandmarker,
  HandLandmarker,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import { CONFIG } from "./config.js";

export async function createDetectors() {
  const fileset = await FilesetResolver.forVisionTasks(CONFIG.mediapipe.wasm);
  const delegate = CONFIG.mediapipe.delegate;

  const face = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: CONFIG.mediapipe.faceModel, delegate },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true, // 52 ARKit blendshapes -> expressions
    outputFacialTransformationMatrixes: true, // head pose
  });

  const hands = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: CONFIG.mediapipe.handModel, delegate },
    runningMode: "VIDEO",
    numHands: 2,
  });

  const pose = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: CONFIG.mediapipe.poseModel, delegate },
    runningMode: "VIDEO",
    numPoses: 1,
  });

  // detectForVideo requires a strictly increasing timestamp per detector.
  let lastTs = 0;
  function detect(video, nowMs) {
    const ts = Math.max(nowMs, lastTs + 1);
    lastTs = ts;
    return {
      face: face.detectForVideo(video, ts),
      hands: hands.detectForVideo(video, ts),
      pose: pose.detectForVideo(video, ts),
    };
  }

  return { detect, face, hands, pose };
}
