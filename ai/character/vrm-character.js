/**
 * MAYA – VRM character with full emotion expressions
 * Uses your custom my-character.vrm
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
let availableExpressions = [];

function createLookAt() {
  lookAtTarget = new THREE.Object3D();
  scene.add(lookAtTarget);
}

function applyArmsDown() {
  if (!vrm || !vrm.humanoid) return;
  const h = vrm.humanoid;
  try {
    const lU = h.getNormalizedBoneNode('leftUpperArm');
    const rU = h.getNormalizedBoneNode('rightUpperArm');
    const lL = h.getNormalizedBoneNode('leftLowerArm');
    const rL = h.getNormalizedBoneNode('rightLowerArm');
    const lS = h.getNormalizedBoneNode('leftShoulder');
    const rS = h.getNormalizedBoneNode('rightShoulder');
    if (lS) lS.rotation.set(0.04, 0, 0.12);
    if (rS) rS.rotation.set(0.04, 0, -0.12);
    if (lU) lU.rotation.set(0.3, 0.08, 1.2);
    if (rU) rU.rotation.set(0.3, -0.08, -1.2);
    if (lL) lL.rotation.set(0.12, -0.18, 0.08);
    if (rL) rL.rotation.set(0.12, 0.18, -0.08);
  } catch (_) {}
}

function detectExpressions() {
  availableExpressions = [];
  if (!vrm || !vrm.expressionManager) return;
  try {
    const em = vrm.expressionManager;
    // VRM 1.0 expression names
    const candidates = [
      'happy', 'angry', 'sad', 'surprised', 'relaxed', 'neutral',
      'blink', 'blinkLeft', 'blinkRight',
      'aa', 'ih', 'ou', 'ee', 'oh',
      'lookUp', 'lookDown', 'lookLeft', 'lookRight'
    ];
    candidates.forEach((name) => {
      try {
        // expressionManager.expressionMap or getExpressionTrackName
        if (em.getExpressionTrackName) {
          const t = em.getExpressionTrackName(name);
          if (t) availableExpressions.push(name);
        } else if (em.expressionMap && em.expressionMap[name]) {
          availableExpressions.push(name);
        } else {
          // try set/get
          em.setValue(name, 0);
          availableExpressions.push(name);
        }
      } catch (_) {}
    });
  } catch (_) {}
  console.log('MAYA expressions:', availableExpressions);
}

async function init(container) {
  stageEl = container;
  reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const w = container.clientWidth || 320;
  const h = container.clientHeight || 420;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 20);
  camera.position.set(0, 1.2, 1.75);
  camera.lookAt(0, 1.05, 0);

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !reduceMotion, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, reduceMotion ? 1 : 1.75));
  renderer.setSize(w, h, false);
  renderer.setClearColor(0x000000, 0);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xc8d0ff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 1.05);
  key.position.set(0.5, 2.0, 2.2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x29f1e6, 0.35);
  fill.position.set(-2, 1.2, 1.5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xff3fb0, 0.3);
  rim.position.set(0, 1.5, -2);
  scene.add(rim);

  createLookAt();
  clock = new THREE.Clock();

  const loader = new GLTFLoader();
  loader.crossOrigin = 'anonymous';
  loader.register((parser) => new VRMLoaderPlugin(parser));

  const url =
    (window.BFTERO_AI_CONFIG && window.BFTERO_AI_CONFIG.characterUrl) ||
    'ai/character/my-character.vrm';

  return new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => {
        try {
          vrm = gltf.userData.vrm;
          if (!vrm) {
            console.warn('No VRM in file');
            resolve(false);
            return;
          }

          try {
            VRMUtils.removeUnnecessaryVertices(gltf.scene);
            if (VRMUtils.combineSkeletons) VRMUtils.combineSkeletons(gltf.scene);
            if (VRMUtils.combineMorphs) VRMUtils.combineMorphs(vrm);
          } catch (_) {}

          // Face the camera (adjust if your model faces the other way)
          vrm.scene.rotation.y = Math.PI;
          vrm.scene.traverse((o) => { o.frustumCulled = false; });
          scene.add(vrm.scene);

          if (vrm.lookAt) vrm.lookAt.target = lookAtTarget;

          detectExpressions();
          setExpression('happy', 0.4);
          ready = true;
          startLoop();
          resolve(true);
        } catch (e) {
          console.warn('VRM setup error', e);
          resolve(false);
        }
      },
      undefined,
      (e) => {
        console.warn('VRM load failed', e);
        resolve(false);
      }
    );
  });
}

function clearExpressions() {
  if (!vrm || !vrm.expressionManager) return;
  const em = vrm.expressionManager;
  const names = [
    'happy', 'angry', 'sad', 'surprised', 'relaxed', 'neutral',
    'aa', 'ih', 'ou', 'ee', 'oh'
  ];
  names.forEach((n) => {
    try { em.setValue(n, 0); } catch (_) {}
  });
}

/**
 * Map API emotions → VRM blendshapes
 */
function setExpression(name, weight = 1) {
  if (!vrm || !vrm.expressionManager) return;
  currentEmotion = name;
  const em = vrm.expressionManager;
  clearExpressions();
  const w = Math.max(0, Math.min(1, weight));

  try {
    switch (String(name || '').toLowerCase()) {
      case 'funny':
      case 'laughing':
        em.setValue('happy', w);
        em.setValue('aa', w * 0.35);
        break;
      case 'happy':
      case 'excited':
      case 'playful':
      case 'teasing':
      case 'calm':
        em.setValue('happy', w * 0.85);
        break;
      case 'shy':
        em.setValue('happy', w * 0.45);
        em.setValue('relaxed', w * 0.3);
        break;
      case 'angry':
      case 'annoyed':
        em.setValue('angry', w);
        break;
      case 'sad':
        em.setValue('sad', w);
        break;
      case 'surprised':
      case 'confused':
        em.setValue('surprised', w);
        break;
      case 'serious':
      case 'neutral':
        em.setValue('relaxed', w * 0.4);
        break;
      default:
        em.setValue('happy', w * 0.5);
    }
  } catch (e) {
    console.warn('expression', name, e);
  }
}

function setMouth(open) {
  mouthOpen = Math.max(0, Math.min(1, open));
  if (!vrm || !vrm.expressionManager) return;
  try {
    vrm.expressionManager.setValue('aa', mouthOpen * 0.9);
    vrm.expressionManager.setValue('oh', mouthOpen * 0.35);
    vrm.expressionManager.setValue('ih', mouthOpen * 0.15);
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
      const chest =
        vrm.humanoid.getNormalizedBoneNode('chest') ||
        vrm.humanoid.getNormalizedBoneNode('spine');
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
        setTimeout(() => {
          try { vrm.expressionManager.setValue('blink', 0); } catch (_) {}
        }, 120);
      } catch (_) {}
    }

    if (lookAtTarget) {
      lookAtTarget.position.set(
        Math.sin(Date.now() * 0.00035) * 0.08,
        1.15 + Math.sin(Date.now() * 0.00028) * 0.03,
        1.0
      );
    }

    if (!isSpeaking) setMouth(mouthOpen * 0.85);

    vrm.update(dt);
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
  const keep = currentEmotion === 'funny' || currentEmotion === 'laughing' ? 'happy' : currentEmotion;
  setExpression(keep, 0.4);
}

window.BfteroVRM = {
  init,
  resize,
  setExpression,
  speakStart,
  speakEnd,
  setMouth,
  isReady: () => ready,
  dispose() {
    if (animId) cancelAnimationFrame(animId);
    animId = null;
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }
    vrm = null;
    ready = false;
  }
};

window.addEventListener('resize', () => {
  if (ready) resize();
});
