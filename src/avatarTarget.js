// avatarTarget.js — loads the VRM and applies a `rig` (from solver.js) to its
// humanoid bones + expressions every frame. This is the only file that touches
// three-vrm internals, so swapping in a different avatar/target stays isolated.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { CONFIG } from "./config.js";
import { clamp, lcFirst } from "./utils.js";

const FINGERS = ["Index", "Middle", "Ring", "Little"];
const JOINTS = ["Proximal", "Intermediate", "Distal"];
// Kalidokit thumb (Proximal/Intermediate/Distal) -> VRM1 thumb bone names.
const THUMB = [
  ["ThumbProximal", "ThumbMetacarpal"],
  ["ThumbIntermediate", "ThumbProximal"],
  ["ThumbDistal", "ThumbDistal"],
];

// Candidate expression names per semantic target (handles VRM 0.x/1.0 + customs).
const EXPR_CANDIDATES = {
  blink: ["blink"],
  blinkLeft: ["blinkLeft", "blink_l"],
  blinkRight: ["blinkRight", "blink_r"],
  aa: ["aa", "a"],
  ih: ["ih", "i"],
  ou: ["ou", "u"],
  ee: ["ee", "e"],
  oh: ["oh", "o"],
  happy: ["happy", "joy"],
  angry: ["angry"],
  sad: ["sad", "sorrow"],
  surprised: ["surprised"],
};

export class VrmTarget {
  constructor() {
    this.vrm = null;
    this.exprName = {}; // semantic -> actual expression name present on the model
    this.exprCurrent = {}; // semantic -> smoothed weight
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._id = new THREE.Quaternion(); // identity, for relaxing fingers
    this._handPresent = { left: false, right: false };
  }

  async load(url, scene) {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.loadAsync(url);
    const vrm = gltf.userData.vrm;
    if (!vrm) {
      throw new Error(
        "This file has no VRM data (humanoid/expressions). A .vrm avatar is required.",
      );
    }
    this.vrm = vrm;

    VRMUtils.rotateVRM0(vrm); // VRM 0.x faces +Z toward the camera after this
    try { VRMUtils.removeUnnecessaryJoints?.(gltf.scene); } catch {}
    vrm.scene.traverse((o) => (o.frustumCulled = false));
    scene.add(vrm.scene);

    this._resolveExpressions();
    this._restPose();
    return vrm;
  }

  // Pick the actual expression name present for each semantic target.
  _resolveExpressions() {
    const map = this.vrm.expressionManager?.expressionMap || {};
    const keys = Object.keys(map);
    const find = (cands) =>
      cands.map((c) => keys.find((k) => k.toLowerCase() === c.toLowerCase())).find(Boolean) || null;
    for (const sem of Object.keys(EXPR_CANDIDATES)) {
      this.exprName[sem] = find(EXPR_CANDIDATES[sem]);
      this.exprCurrent[sem] = 0;
    }
    console.info("[avatar] expressions resolved:", this.exprName);
  }

  // Lower the arms into a relaxed idle pose (T-pose looks unnatural before start).
  _restPose() {
    const set = (name, x, y, z) => {
      const n = this.vrm.humanoid.getNormalizedBoneNode(name);
      if (n) n.rotation.set(x, y, z);
    };
    set("leftUpperArm", 0, 0, 1.2);
    set("rightUpperArm", 0, 0, -1.2);
    set("leftLowerArm", 0, -0.2, 0);
    set("rightLowerArm", 0, 0.2, 0);
  }

  _bone(name) {
    return this.vrm.humanoid.getNormalizedBoneNode(name);
  }

  // Slerp a bone toward the euler rotation produced by the solver.
  _rot(name, rot, dampener, t) {
    if (!rot) return;
    const node = this._bone(name);
    if (!node) return;
    this._e.set(
      (rot.x || 0) * dampener,
      (rot.y || 0) * dampener,
      (rot.z || 0) * dampener,
      rot.rotationOrder || "XYZ",
    );
    this._q.setFromEuler(this._e);
    node.quaternion.slerp(this._q, t);
  }

  _setExpr(sem, weight) {
    const name = this.exprName[sem];
    if (!name) return;
    const t = CONFIG.smoothing.expression;
    this.exprCurrent[sem] += (clamp(weight) - this.exprCurrent[sem]) * t;
    this.vrm.expressionManager.setValue(name, this.exprCurrent[sem]);
  }

  applyRig(rig) {
    if (!this.vrm) return;
    const S = CONFIG.smoothing;
    const G = CONFIG.gain;

    // --- Upper body --------------------------------------------------------
    if (rig.pose) {
      const p = rig.pose;
      this._rot("spine", p.Spine, G.spine, S.body);
      this._rot("chest", p.Spine, G.spine * 0.5, S.body);
      this._rot("leftUpperArm", p.LeftUpperArm, G.arm, S.body);
      this._rot("leftLowerArm", p.LeftLowerArm, G.arm, S.body);
      this._rot("rightUpperArm", p.RightUpperArm, G.arm, S.body);
      this._rot("rightLowerArm", p.RightLowerArm, G.arm, S.body);
      // Rough wrist from pose; overridden below when a hand is tracked.
      this._rot("leftHand", p.LeftHand, 1, S.body);
      this._rot("rightHand", p.RightHand, 1, S.body);
    }

    // --- Hands / fingers ---------------------------------------------------
    this._applyHand("left", rig.hands.left);
    this._applyHand("right", rig.hands.right);

    // --- Head --------------------------------------------------------------
    if (rig.face?.head) {
      const h = rig.face.head;
      const y = h.y * (CONFIG.mirror.flipHeadYaw ? -1 : 1);
      const head = { x: h.x, y, z: h.z, rotationOrder: h.rotationOrder };
      this._rot("neck", head, G.head * 0.5, S.head);
      this._rot("head", head, G.head * 0.5, S.head);
    }

    // --- Face: blink ---------------------------------------------------------
    if (rig.blink) {
      const l = 1 - rig.blink.l; // closed weight
      const r = 1 - rig.blink.r;
      if (this.exprName.blinkLeft || this.exprName.blinkRight) {
        this._setExpr("blinkLeft", l);
        this._setExpr("blinkRight", r);
      } else {
        this._setExpr("blink", Math.max(l, r));
      }
    }

    // --- Face: mouth visemes ------------------------------------------------
    const shape = rig.face?.mouth?.shape;
    if (shape) {
      this._setExpr("aa", shape.A);
      this._setExpr("ih", shape.I);
      this._setExpr("ou", shape.U);
      this._setExpr("ee", shape.E);
      this._setExpr("oh", shape.O);
    }

    // --- Face: emotions (kept modest so they don't fight the visemes) -------
    if (rig.emotion) {
      this._setExpr("happy", rig.emotion.happy);
      this._setExpr("surprised", rig.emotion.surprised * 0.8);
      this._setExpr("angry", rig.emotion.angry * 0.8);
      this._setExpr("sad", rig.emotion.sad * 0.8);
    }
  }

  _applyHand(prefix, hand) {
    if (!hand) {
      if (this._handPresent[prefix]) this._relaxHand(prefix);
      return;
    }
    this._handPresent[prefix] = true;
    const t = CONFIG.smoothing.hands;
    const d = hand.data;
    const Side = prefix === "left" ? "Left" : "Right";

    this._rot(`${prefix}Hand`, d[`${Side}Wrist`], 1, t);
    for (const f of FINGERS) {
      for (const j of JOINTS) {
        this._rot(`${prefix}${f}${j}`, d[`${Side}${f}${j}`], 1, t);
      }
    }
    for (const [kJoint, vJoint] of THUMB) {
      this._rot(`${prefix}${vJoint}`, d[`${Side}${kJoint}`], 1, t);
    }
  }

  // Ease the fingers (and wrist) back toward neutral when the hand leaves frame.
  _relaxHand(prefix) {
    const t = CONFIG.smoothing.handLost;
    const ease = (name) => {
      const n = this._bone(name);
      if (n) n.quaternion.slerp(this._id, t);
    };
    ease(`${prefix}Hand`);
    for (const f of FINGERS) for (const j of JOINTS) ease(`${prefix}${f}${j}`);
    for (const [, vJoint] of THUMB) ease(`${prefix}${vJoint}`);
    // Mark settled once we're basically at neutral so we stop churning.
    const wrist = this._bone(`${prefix}Hand`);
    if (wrist && wrist.quaternion.angleTo(this._id) < 0.01) this._handPresent[prefix] = false;
  }

  update(dt) {
    if (this.vrm) this.vrm.update(dt);
  }
}
