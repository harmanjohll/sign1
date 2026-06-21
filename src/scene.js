// scene.js — three.js scene, camera, lights, renderer, orbit controls, resize.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  // Pulled back so Fumi fits in the window by default; zoomable via controls.
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.2, 2.9);

  // Orbit controls: drag to rotate, scroll / pinch to zoom.
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.1, 0); // chest height
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.6;
  controls.maxDistance = 9;
  controls.minPolarAngle = 0.15;
  controls.maxPolarAngle = Math.PI * 0.52; // don't drop below the floor
  controls.update();

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

  return { renderer, scene, camera, controls, resize };
}
