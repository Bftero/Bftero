/**
 * MAYA – VRM character (front-facing, arms down, expressions)
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

let renderer, scene, camera, vrm, clock, animId;
let lookAtTarget = null;
let mouthOpen = 0;
let currentEmotion = 'happy';
let isSpeaking = false;
let blinkTimer = 0;
let nextBlink = 2 + Math.random() * 3;
let headSway = 0;
let breathPhase = 0;
let stageEl = null;
let ready = false;
let reduceMotion = false;

function createLookAt() {
  lookAtTarget = new THREE.Object3D();
  scene.add(lookAtTarget);
}

function applyArmsDown() {
  if (!vrm || !vrm.humanoid) return;
  const h = vrm.humanoid;
  try {
    const bones = {
      lU: h.getNormalizedBoneNode('leftUpperArm'),
      rU: h.getNormalizedBoneNode('rightUpperArm'),
      lL: h.getNormalizedBoneNode('leftLowerArm'),
      rL: h.getNormalizedBoneNode('rightLowerArm'),
      lS: h.getNormalizedBoneNode('leftShoulder'),
      rS: h.getNormalizedBoneNode('rightShoulder')
    };
    // Rest pose: arms at sides (from default T-pose)
    if (bones.lS) bones.lS.rotation.set(0.05, 0, 0.15);
    if (bones.rS) bones.rS.rotation.set(0.05, 0, -0.15);
    if (bones.lU) bones.lU.rotation.set(0.35, 0.1, 1.25);
    if (bones.rU) bones.rU.rotation.set(0.35, -0.1, -1.25);
    if (bones.lL) bones.lL.rotation.set(0.15, -0.2, 0.1);
    if (bones.rL) bones.rL.rotation.set(0.15, 0.2, -0.1);
  } catch (_) {}
}

async function init(container) {
  stageEl = container;
  reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const w = container.clientWidth || 320;
  const h = container.clientHeight || 420;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 20);
  camera.position.set(0, 1.15, 1.7);
  camera.lookAt(0, 1.0, 0);

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !reduceMotion, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, reduceMotion ? 1 : 1.75));
  renderer.setSize(w, h, false);
  renderer.setClearColor(0x000000, 0);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xc8d0ff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(0.6, 2.0, 2.2);
  scene.add(key);
  scene.add(new THREE.DirectionalLight(0x29f1e6, 0.3).position.set(-2, 1, 1));
  scene.add(new THREE.DirectionalLight(0xff3fb0, 0.25).position.set(0, 1.5, -2));

  createLookAt();
  clock = new THREE.Clock();

  const loader = new GLTFLoader();
  loader.crossOrigin = 'anonymous';
  loader.register((parser) => new VRMLoaderPlugin(parser));

  const url =
    (window.BFTERO_AI_CONFIG && window.BFTERO_AI_CONFIG.characterUrl) ||
    'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@3.3.2/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm';

  return new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => {
        try {
          vrm = gltf.userData.vrm;
          if (!vrm) return resolve(false);
          try {
            VRMUtils.removeUnnecessaryVertices(gltf.scene);
            if (VRMUtils.combineSkeletons) VRMUtils.combineSkeletons(gltf.scene);
            if (VRMUtils.combineMorphs) VRMUtils.combineMorphs(vrm);
          } catch (_) {}

          // Face camera
          vrm.scene.rotation.y = 0;
          vrm.scene.traverse((o) => { o.frustumCulled = false; });
          scene.add(vrm.scene);
          if (vrm.lookAt) vrm.lookAt.target = lookAtTarget;

          setExpression('happy', 0.45);
          ready = true;
          startLoop();
          resolve(true);
        } catch (e) {
          console.warn(e);
          resolve(false);
        }
      },
      undefined,
      (e) => { console.warn(e); resolve(false); }
    );
  });
}

function setExpression(name, weight = 1) {
  if (!vrm || !vrm.expressionManager) return;
  currentEmotion = name;
  const em = vrm.expressionManager;
  ['happy', 'angry', 'sad', 'surprised', 'relaxed', 'neutral', 'blink', 'aa', 'ih', 'ou', 'ee', 'oh'].forEach((p) => {
    try { em.setValue(p, 0); } catch (_) {}
  });
  try {
    if (name === 'happy' || name === 'funny') em.setValue('happy', weight);
    else if (name === 'angry') em.setValue('angry', weight);
    else if (name === 'sad') em.setValue('sad', weight);
    else if (name === 'surprised') em.setValue('surprised', weight);
    else em.setValue('relaxed', weight * 0.4);
  } catch (_) {}
}

function setMouth(open) {
  mouthOpen = Math.max(0, Math.min(1, open));
  if (!vrm || !vrm.expressionManager) return;
  try {
    vrm.expressionManager.setValue('aa', mouthOpen * 0.9);
    vrm.expressionManager.setValue('oh', mouthOpen * 0.35);
  } catch (_) {}
}

function startLoop() {
  if (animId) return;
  function tick() {
    animId = requestAnimationFrame(tick);
    const dt = clock.getDelta();
    if (!vrm) return;

    breathPhase += dt * 1.1;
    headSway += dt * 0.5;

    if (vrm.humanoid) {
      const chest = vrm.humanoid.getNormalizedBoneNode('chest') || vrm.humanoid.getNormalizedBoneNode('spine');
      if (chest) chest.position.y = Math.sin(breathPhase) * 0.005;
      if (!isSpeaking) {
        const head = vrm.humanoid.getNormalizedBoneNode('head');
        if (head) {
          head.rotation.y = Math.sin(headSway) * 0.04;
          head.rotation.x = Math.sin(headSway * 0.65) * 0.02;
        }
      }
    }

    blinkTimer += dt;
    if (blinkTimer > nextBlink) {
      blinkTimer = 0;
      nextBlink = 2 + Math.random() * 3.5;
      try {
        vrm.expressionManager.setValue('blink', 1);
        setTimeout(() => { try { vrm.expressionManager.setValue('blink', 0); } catch (_) {} }, 120);
      } catch (_) {}
    }

    if (lookAtTarget) {
      lookAtTarget.position.set(
        Math.sin(Date.now() * 0.00035) * 0.08,
        1.1 + Math.sin(Date.now() * 0.00028) * 0.03,
        1.0
      );
    }

    if (!isSpeaking) setMouth(mouthOpen * 0.85);

    vrm.update(dt);
    // Apply AFTER update so T-pose does not win
    applyArmsDown();
    renderer.render(scene, camera);
  }
  tick();
}

function resize() {
  if (!renderer || !stageEl || !camera) return;
  const w = stageEl.clientWidth || 320;
  const h = stageEl.clientHeight || 420;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

function speakStart(emotion) {
  isSpeaking = true;
  if (emotion) setExpression(emotion, 0.95);
}

function speakEnd() {
  isSpeaking = false;
  setMouth(0);
  setExpression(currentEmotion === 'funny' ? 'happy' : currentEmotion, 0.45);
}

window.BfteroVRM = {
  init, resize, setExpression, speakStart, speakEnd, setMouth,
  isReady: () => ready,
  dispose() {
    if (animId) cancelAnimationFrame(animId);
    animId = null;
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode)
        renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    vrm = null;
    ready = false;
  }
};

window.addEventListener('resize', () => { if (ready) resize(); });
