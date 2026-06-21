// scene.js — three.js scene, camera, lights, renderer, and resize handling.
import * as THREE from "three";

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  // Camera framed on the upper body (head + arms), since hands & face matter most.
  const camera = new THREE.PerspectiveCamera(
    32,
    1, // real aspect set in resize()
    0.1,
    20,
  );
  camera.position.set(0, 1.32, 1.65);
  const lookTarget = new THREE.Vector3(0, 1.28, 0);
  camera.lookAt(lookTarget);

  // Soft, even lighting so the toon-shaded VRM reads cleanly.
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444466, 1.6);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(1, 2, 2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x99bbff, 0.5);
  fill.position.set(-1.5, 1, 1);
  scene.add(fill);

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  return { renderer, scene, camera, lookTarget, resize };
}
