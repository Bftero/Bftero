/**
 * Bftero AI – VRM character (front-facing + arms down)
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

let renderer, scene, camera, vrm, clock, animId;
let lookAtTarget = null;
let mouthOpen = 0;
let currentEmotion = 'neutral';
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

/** Keep arms down every frame (VRM update can reset pose) */
function applyArmsDown() {
  if (!vrm || !vrm.humanoid) return;
  const h = vrm.humanoid;
  try {
    const lUpper = h.getNormalizedBoneNode('leftUpperArm');
    const rUpper = h.getNormalizedBoneNode('rightUpperArm');
    const lLower = h.getNormalizedBoneNode('leftLowerArm');
    const rLower = h.getNormalizedBoneNode('rightLowerArm');
    // Lower from T-pose to sides
    if (lUpper) {
      lUpper.rotation.x = 0.25;
      lUpper.rotation.y = 0.05;
      lUpper.rotation.z = 1.35;
    }
    if (rUpper) {
      rUpper.rotation.x = 0.25;
      rUpper.rotation.y = -0.05;
      rUpper.rotation.z = -1.35;
    }
    if (lLower) {
      lLower.rotation.x = 0.1;
      lLower.rotation.y = -0.15;
      lLower.rotation.z = 0.05;
    }
    if (rLower) {
      rLower.rotation.x = 0.1;
      rLower.rotation.y = 0.15;
      rLower.rotation.z = -0.05;
    }
  } catch (_) {}
}

async function init(container) {
  stageEl = container;
  reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const w = container.clientWidth || 320;
  const h = container.clientHeight || 420;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(28, w / h, 0.1, 20);
  camera.position.set(0, 1.2, 1.85);
  camera.lookAt(0, 1.05, 0);

  renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: !reduceMotion,
    powerPreference: 'low-power'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, reduceMotion ? 1 : 1.75));
  renderer.setSize(w, h, false);
  renderer.setClearColor(0x000000, 0);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xb8c4ff, 0.65));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(0.8, 2.2, 2.5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x29f1e6, 0.35);
  fill.position.set(-2, 1.2, 1.5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xff3fb0, 0.25);
  rim.position.set(0, 1.5, -2);
  scene.add(rim);

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
          if (!vrm) {
            resolve(false);
            return;
          }

          try {
            VRMUtils.removeUnnecessaryVertices(gltf.scene);
            if (VRMUtils.combineSkeletons) VRMUtils.combineSkeletons(gltf.scene);
            if (VRMUtils.combineMorphs) VRMUtils.combineMorphs(vrm);
          } catch (_) {}

          // This sample faces +Z toward camera when rotation.y = 0
          vrm.scene.rotation.y = 0;
          vrm.scene.traverse((obj) => {
            obj.frustumCulled = false;
          });
          scene.add(vrm.scene);

          applyArmsDown();

          if (vrm.lookAt) vrm.lookAt.target = lookAtTarget;

          setExpression('happy', 0.35);
          ready = true;
          startLoop();
          resolve(true);
        } catch (err) {
          console.warn('VRM setup error', err);
          resolve(false);
        }
      },
      undefined,
      (err) => {
        console.warn('VRM load failed', err);
        resolve(false);
      }
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
    else if (name === 'sad') em.setValue('sad', weight);
    else if (name === 'surprised') em.setValue('surprised', weight);
    else if (name === 'confused') {
      em.setValue('sad', 0.2);
      em.setValue('surprised', 0.15);
    } else {
      em.setValue('relaxed', weight * 0.5);
    }
  } catch (_) {}
}

function setMouth(open) {
  mouthOpen = Math.max(0, Math.min(1, open));
  if (!vrm || !vrm.expressionManager) return;
  try {
    vrm.expressionManager.setValue('aa', mouthOpen * 0.9);
    vrm.expressionManager.setValue('oh', mouthOpen * 0.4);
  } catch (_) {}
}

function startLoop() {
  if (animId) return;
  function tick() {
    animId = requestAnimationFrame(tick);
    const dt = clock.getDelta();
    if (!vrm) return;

    // Arms must be re-applied or they snap back to T-pose
    applyArmsDown();

    breathPhase += dt * 1.15;
    if (vrm.humanoid) {
      const chest =
        vrm.humanoid.getNormalizedBoneNode('chest') ||
        vrm.humanoid.getNormalizedBoneNode('spine');
      if (chest) chest.position.y = Math.sin(breathPhase) * 0.006;
    }

    headSway += dt * 0.5;
    if (vrm.humanoid && !isSpeaking) {
      const head = vrm.humanoid.getNormalizedBoneNode('head');
      if (head) {
        head.rotation.y = Math.sin(headSway) * 0.04;
        head.rotation.x = Math.sin(headSway * 0.7) * 0.02;
      }
    }

    blinkTimer += dt;
    if (blinkTimer > nextBlink) {
      blinkTimer = 0;
      nextBlink = 2.2 + Math.random() * 3.5;
      if (vrm.expressionManager) {
        try {
          vrm.expressionManager.setValue('blink', 1);
          setTimeout(() => {
            try { vrm.expressionManager.setValue('blink', 0); } catch (_) {}
          }, 130);
        } catch (_) {}
      }
    }

    if (lookAtTarget) {
      lookAtTarget.position.set(
        Math.sin(Date.now() * 0.0004) * 0.1,
        1.15 + Math.sin(Date.now() * 0.0003) * 0.03,
        1.2
      );
    }

    if (!isSpeaking) setMouth(mouthOpen * 0.85);

    vrm.update(dt);
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
  if (emotion) setExpression(emotion, 0.9);
}

function speakEnd() {
  isSpeaking = false;
  setMouth(0);
  setExpression(currentEmotion === 'funny' ? 'happy' : currentEmotion, 0.4);
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
