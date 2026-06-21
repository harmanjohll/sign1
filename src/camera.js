// camera.js — webcam capture into a hidden <video> element.
import { CONFIG } from "./config.js";

// Requests the webcam and resolves once the video is actually producing frames.
export async function startCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("getUserMedia is unavailable (needs https or localhost).");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: CONFIG.camera.facingMode,
      width: { ideal: CONFIG.camera.width },
      height: { ideal: CONFIG.camera.height },
    },
  });

  video.srcObject = stream;
  await video.play();

  // Wait until dimensions are known so detectors get valid frames.
  if (!video.videoWidth) {
    await new Promise((res) => video.addEventListener("loadeddata", res, { once: true }));
  }
  return stream;
}

export function stopCamera(video) {
  const stream = video.srcObject;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}
