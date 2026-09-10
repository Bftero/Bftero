/**
 * Bftero AI – VRM character controller
 * Loads Three.js + @pixiv/three-vrm via import map (defined in ai.html).
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

/** Lower arms from T-pose into a natural idle pose */
function applyIdlePose(vrmInstance) {
  if (!vrmInstance || !vrmInstance.humanoid) return;
  const h = vrmInstance.humanoid;
  try {
    const lUpper = h.getNormalizedBoneNode('leftUpperArm');
    const rUpper = h.getNormalizedBoneNode('rightUpperArm');
    const lLower = h.getNormalizedBoneNode('leftLowerArm');
    const rLower = h.getNormalizedBoneNode('rightLowerArm');
    // Bring arms down from T-pose
    if (lUpper) {
      lUpper.rotation.z = 1.15;
      lUpper.rotation.x = 0.15;
    }
    if (rUpper) {
      rUpper.rotation.z = -1.15;
      rUpper.rotation.x = 0.15;
    }
    if (lLower) lLower.rotation.y = -0.25;
    if (rLower) rLower.rotation.y = 0.25;
  } catch (_) {}
}

async function init(container) {
  stageEl = container;
  reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const w = container.clientWidth || 320;
  const h = container.clientHeight || 420;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(28, w / h, 0.1, 20);
  // Camera in front of character
  camera.position.set(0, 1.25, 2.0);
  camera.lookAt(0, 1.1, 0);

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

  scene.add(new THREE.AmbientLight(0xb8c4ff, 0.6));
  const key = new THREE.DirectionalLight(0x29f1e6, 0.8);
  key.position.set(1.2, 2.2, 2.5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xff3fb0, 0.35);
  fill.position.set(-2, 1.2, 1.5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.3);
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
            console.warn('No VRM data in model');
            resolve(false);
            return;
          }

          try {
            VRMUtils.removeUnnecessaryVertices(gltf.scene);
            if (VRMUtils.combineSkeletons) VRMUtils.combineSkeletons(gltf.scene);
            if (VRMUtils.combineMorphs) VRMUtils.combineMorphs(vrm);
          } catch (_) {}

          // Face the camera (sample faces -Z by default in many setups)
          vrm.scene.rotation.y = Math.PI;
          vrm.scene.traverse((obj) => {
            obj.frustumCulled = false;
          });
          scene.add(vrm.scene);

          applyIdlePose(vrm);

          if (vrm.lookAt) {
            vrm.lookAt.target = lookAtTarget;
          }

          setExpression('neutral', 1);
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
  const presets = ['happy', 'angry', 'sad', 'surprised', 'relaxed', 'neutral', 'blink', 'aa', 'ih', 'ou', 'ee', 'oh'];
  presets.forEach((p) => {
    try { em.setValue(p, 0); } catch (_) {}
  });
  try {
    if (name === 'happy' || name === 'funny') em.setValue('happy', weight);
    else if (name === 'sad') em.setValue('sad', weight);
    else if (name === 'surprised') em.setValue('surprised', weight);
    else if (name === 'confused') {
      em.setValue('sad', 0.25);
      em.setValue('surprised', 0.15);
    } else {
      em.setValue('neutral', weight);
    }
  } catch (_) {}
}

function setMouth(open) {
  mouthOpen = Math.max(0, Math.min(1, open));
  if (!vrm || !vrm.expressionManager) return;
  try {
    vrm.expressionManager.setValue('aa', mouthOpen * 0.85);
    vrm.expressionManager.setValue('oh', mouthOpen * 0.35);
  } catch (_) {}
}

function startLoop() {
  if (animId) return;
  function tick() {
    animId = requestAnimationFrame(tick);
    const dt = clock.getDelta();
    if (!vrm) return;

    breathPhase += dt * 1.2;
    const breath = Math.sin(breathPhase) * 0.008;
    if (vrm.humanoid) {
      const chest =
        vrm.humanoid.getNormalizedBoneNode('chest') ||
        vrm.humanoid.getNormalizedBoneNode('spine');
      if (chest) chest.position.y = breath;
    }

    headSway += dt * 0.55;
    if (vrm.humanoid && !isSpeaking) {
      const head = vrm.humanoid.getNormalizedBoneNode('head');
      if (head) {
        head.rotation.y = Math.sin(headSway) * 0.05;
        head.rotation.x = Math.sin(headSway * 0.7) * 0.025;
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
          }, 140);
        } catch (_) {}
      }
    }

    if (lookAtTarget) {
      lookAtTarget.position.x = Math.sin(Date.now() * 0.0004) * 0.12;
      lookAtTarget.position.y = 1.25 + Math.sin(Date.now() * 0.0003) * 0.04;
      lookAtTarget.position.z = 1.5;
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
  if (emotion) setExpression(emotion, 0.85);
}

function speakEnd() {
  isSpeaking = false;
  setMouth(0);
  setExpression(currentEmotion === 'funny' ? 'happy' : currentEmotion, 0.4);
}

function dispose() {
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

window.BfteroVRM = {
  init,
  resize,
  setExpression,
  speakStart,
  speakEnd,
  setMouth,
  isReady: () => ready,
  dispose
};

window.addEventListener('resize', () => {
  if (ready) resize();
});
