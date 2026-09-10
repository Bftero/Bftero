/**
 * MAYA – VRM character with full emotion expressions,
 * natural hand gestures, body language and speaking animation.
 *
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

// ============================================================
// GESTURE / BODY LANGUAGE STATE
// ============================================================

let gestureTime = 0;
let gestureCooldown = 0;

let currentGesture = 'idle';
let gestureDuration = 0;
let gestureStrength = 0;

let gestureSide = 1;

// ============================================================
// HELPERS
// ============================================================

function clamp(v, min = 0, max = 1) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, speed) {
  return a + (b - a) * speed;
}

function smooth(current, target, speed) {
  return current + (target - current) * speed;
}

// ============================================================
// LOOK AT
// ============================================================

function createLookAt() {
  lookAtTarget = new THREE.Object3D();
  scene.add(lookAtTarget);
}

// ============================================================
// GET BONES
// ============================================================

function getBones() {
  if (!vrm || !vrm.humanoid) return {};

  const h = vrm.humanoid;

  try {
    return {
      head: h.getNormalizedBoneNode('head'),

      neck: h.getNormalizedBoneNode('neck'),

      chest:
        h.getNormalizedBoneNode('chest') ||
        h.getNormalizedBoneNode('spine'),

      spine: h.getNormalizedBoneNode('spine'),

      hips: h.getNormalizedBoneNode('hips'),

      leftShoulder: h.getNormalizedBoneNode('leftShoulder'),
      rightShoulder: h.getNormalizedBoneNode('rightShoulder'),

      leftUpperArm: h.getNormalizedBoneNode('leftUpperArm'),
      rightUpperArm: h.getNormalizedBoneNode('rightUpperArm'),

      leftLowerArm: h.getNormalizedBoneNode('leftLowerArm'),
      rightLowerArm: h.getNormalizedBoneNode('rightLowerArm'),

      leftHand: h.getNormalizedBoneNode('leftHand'),
      rightHand: h.getNormalizedBoneNode('rightHand')
    };
  } catch (_) {
    return {};
  }
}

// ============================================================
// REST POSE
// ============================================================

function applyRestPose() {
  if (!vrm || !vrm.humanoid) return;

  const b = getBones();

  try {
    if (b.leftUpperArm) {
      b.leftUpperArm.rotation.z = 1.05;
      b.leftUpperArm.rotation.x = 0.08;
      b.leftUpperArm.rotation.y = 0;
    }

    if (b.rightUpperArm) {
      b.rightUpperArm.rotation.z = -1.05;
      b.rightUpperArm.rotation.x = 0.08;
      b.rightUpperArm.rotation.y = 0;
    }

    if (b.leftLowerArm) {
      b.leftLowerArm.rotation.y = -0.12;
      b.leftLowerArm.rotation.x = 0;
    }

    if (b.rightLowerArm) {
      b.rightLowerArm.rotation.y = 0.12;
      b.rightLowerArm.rotation.x = 0;
    }

    if (b.leftHand) {
      b.leftHand.rotation.set(0, 0, 0);
    }

    if (b.rightHand) {
      b.rightHand.rotation.set(0, 0, 0);
    }
  } catch (_) {}
}

// ============================================================
// EXPRESSIONS
// ============================================================

function detectExpressions() {
  availableExpressions = [];

  if (!vrm || !vrm.expressionManager) return;

  try {
    const em = vrm.expressionManager;

    const candidates = [
      'happy',
      'angry',
      'sad',
      'surprised',
      'relaxed',
      'neutral',

      'blink',
      'blinkLeft',
      'blinkRight',

      'aa',
      'ih',
      'ou',
      'ee',
      'oh',

      'lookUp',
      'lookDown',
      'lookLeft',
      'lookRight'
    ];

    candidates.forEach((name) => {
      try {
        if (em.getExpressionTrackName) {
          const t = em.getExpressionTrackName(name);
          if (t) availableExpressions.push(name);
        } else if (em.expressionMap && em.expressionMap[name]) {
          availableExpressions.push(name);
        } else {
          em.setValue(name, 0);
          availableExpressions.push(name);
        }
      } catch (_) {}
    });
  } catch (_) {}

  console.log('MAYA expressions:', availableExpressions);
}

// ============================================================
// CLEAR EXPRESSIONS
// ============================================================

function clearExpressions() {
  if (!vrm || !vrm.expressionManager) return;

  const em = vrm.expressionManager;

  const names = [
    'happy',
    'angry',
    'sad',
    'surprised',
    'relaxed',
    'neutral',
    'aa',
    'ih',
    'ou',
    'ee',
    'oh'
  ];

  names.forEach((n) => {
    try {
      em.setValue(n, 0);
    } catch (_) {}
  });
}

// ============================================================
// EMOTION
// ============================================================

function setExpression(name, weight = 1) {
  if (!vrm || !vrm.expressionManager) return;

  currentEmotion = name;

  const em = vrm.expressionManager;

  clearExpressions();

  const w = clamp(weight);

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

// ============================================================
// MOUTH
// ============================================================

function setMouth(open) {
  mouthOpen = clamp(open);

  if (!vrm || !vrm.expressionManager) return;

  try {
    vrm.expressionManager.setValue('aa', mouthOpen * 0.9);
    vrm.expressionManager.setValue('oh', mouthOpen * 0.35);
    vrm.expressionManager.setValue('ih', mouthOpen * 0.15);
  } catch (_) {}
}

// ============================================================
// RANDOM GESTURES
// ============================================================

function chooseGesture() {

  const gestures = [
    'talk',
    'talk',
    'talk',

    'point',
    'openHands',
    'explain',
    'handsTogether',
    'wave',
    'shrug',
    'thinking'
  ];

  currentGesture =
    gestures[Math.floor(Math.random() * gestures.length)];

  gestureTime = 0;

  gestureDuration =
    0.8 + Math.random() * 1.5;

  gestureStrength =
    0.65 + Math.random() * 0.35;

  gestureSide =
    Math.random() > 0.5 ? 1 : -1;

  gestureCooldown =
    0.4 + Math.random() * 1.5;
}

// ============================================================
// RESET HANDS
// ============================================================

function resetArms(b, amount = 0.12) {

  if (b.leftUpperArm) {
    b.leftUpperArm.rotation.x =
      lerp(b.leftUpperArm.rotation.x, 0.08, amount);

    b.leftUpperArm.rotation.y =
      lerp(b.leftUpperArm.rotation.y, 0, amount);

    b.leftUpperArm.rotation.z =
      lerp(b.leftUpperArm.rotation.z, 1.05, amount);
  }

  if (b.rightUpperArm) {
    b.rightUpperArm.rotation.x =
      lerp(b.rightUpperArm.rotation.x, 0.08, amount);

    b.rightUpperArm.rotation.y =
      lerp(b.rightUpperArm.rotation.y, 0, amount);

    b.rightUpperArm.rotation.z =
      lerp(b.rightUpperArm.rotation.z, -1.05, amount);
  }

  if (b.leftLowerArm) {
    b.leftLowerArm.rotation.x =
      lerp(b.leftLowerArm.rotation.x, 0, amount);

    b.leftLowerArm.rotation.y =
      lerp(b.leftLowerArm.rotation.y, -0.12, amount);
  }

  if (b.rightLowerArm) {
    b.rightLowerArm.rotation.x =
      lerp(b.rightLowerArm.rotation.x, 0, amount);

    b.rightLowerArm.rotation.y =
      lerp(b.rightLowerArm.rotation.y, 0.12, amount);
  }
}

// ============================================================
// NATURAL SPEAKING HANDS
// ============================================================

function updateGesture(dt) {

  const b = getBones();

  if (!b.leftUpperArm || !b.rightUpperArm) return;

  gestureTime += dt;

  if (!isSpeaking) {
    resetArms(b, 0.08);
    return;
  }

  gestureCooldown -= dt;

  if (
    gestureCooldown <= 0 &&
    gestureTime >= gestureDuration
  ) {
    chooseGesture();
  }

  const t =
    gestureDuration > 0
      ? gestureTime / gestureDuration
      : 0;

  const wave =
    Math.sin(gestureTime * 5.5);

  const waveSlow =
    Math.sin(gestureTime * 2.2);

  const strength = gestureStrength;

  // ----------------------------------------------------------
  // BASE TALKING MOVEMENT
  // ----------------------------------------------------------

  resetArms(b, 0.12);

  b.leftUpperArm.rotation.x +=
    wave * 0.08 * strength;

  b.rightUpperArm.rotation.x +=
    Math.sin(gestureTime * 5.2 + 1.5) *
    0.08 *
    strength;

  b.leftLowerArm.rotation.x +=
    waveSlow * 0.12 * strength;

  b.rightLowerArm.rotation.x +=
    Math.sin(gestureTime * 2.5) *
    0.12 *
    strength;

  // ----------------------------------------------------------
  // TALK
  // ----------------------------------------------------------

  if (currentGesture === 'talk') {

    b.leftUpperArm.rotation.z +=
      Math.sin(gestureTime * 3.5) *
      0.12 *
      strength;

    b.rightUpperArm.rotation.z -=
      Math.sin(gestureTime * 3.1 + 1) *
      0.12 *
      strength;

    b.leftLowerArm.rotation.y +=
      Math.sin(gestureTime * 4) *
      0.16 *
      strength;

    b.rightLowerArm.rotation.y -=
      Math.sin(gestureTime * 4.2) *
      0.16 *
      strength;
  }

  // ----------------------------------------------------------
  // POINT
  // ----------------------------------------------------------

  else if (currentGesture === 'point') {

    const arm =
      gestureSide > 0
        ? b.rightUpperArm
        : b.leftUpperArm;

    const lower =
      gestureSide > 0
        ? b.rightLowerArm
        : b.leftLowerArm;

    if (arm) {

      if (gestureSide > 0) {
        arm.rotation.z = -0.55;
        arm.rotation.x = -0.25;
      } else {
        arm.rotation.z = 0.55;
        arm.rotation.x = -0.25;
      }
    }

    if (lower) {
      lower.rotation.x = -0.35;
      lower.rotation.y =
        gestureSide > 0 ? 0.35 : -0.35;
    }
  }

  // ----------------------------------------------------------
  // OPEN HANDS
  // ----------------------------------------------------------

  else if (currentGesture === 'openHands') {

    b.leftUpperArm.rotation.z = 0.72;
    b.rightUpperArm.rotation.z = -0.72;

    b.leftUpperArm.rotation.x = -0.18;
    b.rightUpperArm.rotation.x = -0.18;

    b.leftLowerArm.rotation.y =
      -0.25 + wave * 0.08;

    b.rightLowerArm.rotation.y =
      0.25 - wave * 0.08;
  }

  // ----------------------------------------------------------
  // EXPLAIN
  // ----------------------------------------------------------

  else if (currentGesture === 'explain') {

    b.leftUpperArm.rotation.z =
      0.78 +
      Math.sin(gestureTime * 3) * 0.12;

    b.rightUpperArm.rotation.z =
      -0.78 -
      Math.sin(gestureTime * 3 + 1) * 0.12;

    b.leftUpperArm.rotation.x = -0.15;
    b.rightUpperArm.rotation.x = -0.15;

    b.leftLowerArm.rotation.x =
      -0.2 +
      Math.sin(gestureTime * 4) * 0.12;

    b.rightLowerArm.rotation.x =
      -0.2 +
      Math.sin(gestureTime * 4 + 1) * 0.12;
  }

  // ----------------------------------------------------------
  // HANDS TOGETHER
  // ----------------------------------------------------------

  else if (currentGesture === 'handsTogether') {

    b.leftUpperArm.rotation.z = 0.72;
    b.rightUpperArm.rotation.z = -0.72;

    b.leftUpperArm.rotation.x = -0.12;
    b.rightUpperArm.rotation.x = -0.12;

    b.leftLowerArm.rotation.x = -0.55;
    b.rightLowerArm.rotation.x = -0.55;

    b.leftLowerArm.rotation.y = -0.4;
    b.rightLowerArm.rotation.y = 0.4;
  }

  // ----------------------------------------------------------
  // WAVE
  // ----------------------------------------------------------

  else if (currentGesture === 'wave') {

    if (gestureSide > 0) {

      b.rightUpperArm.rotation.z = -0.5;
      b.rightUpperArm.rotation.x = -0.35;

      b.rightLowerArm.rotation.x =
        -0.7 +
        Math.sin(gestureTime * 6) * 0.25;

      b.rightLowerArm.rotation.y =
        Math.sin(gestureTime * 6) * 0.35;

    } else {

      b.leftUpperArm.rotation.z = 0.5;
      b.leftUpperArm.rotation.x = -0.35;

      b.leftLowerArm.rotation.x =
        -0.7 +
        Math.sin(gestureTime * 6) * 0.25;

      b.leftLowerArm.rotation.y =
        Math.sin(gestureTime * 6) * 0.35;
    }
  }

  // ----------------------------------------------------------
  // SHRUG
  // ----------------------------------------------------------

  else if (currentGesture === 'shrug') {

    b.leftUpperArm.rotation.z = 0.75;
    b.rightUpperArm.rotation.z = -0.75;

    b.leftUpperArm.rotation.x = -0.15;
    b.rightUpperArm.rotation.x = -0.15;

    b.leftLowerArm.rotation.x = -0.15;
    b.rightLowerArm.rotation.x = -0.15;

    if (b.leftShoulder) {
      b.leftShoulder.rotation.z =
        Math.sin(gestureTime * 3) * 0.12;
    }

    if (b.rightShoulder) {
      b.rightShoulder.rotation.z =
        -Math.sin(gestureTime * 3) * 0.12;
    }
  }

  // ----------------------------------------------------------
  // THINKING
  // ----------------------------------------------------------

  else if (currentGesture === 'thinking') {

    b.rightUpperArm.rotation.z = -0.62;
    b.rightUpperArm.rotation.x = -0.2;

    b.rightLowerArm.rotation.x = -0.8;
    b.rightLowerArm.rotation.y = 0.15;

    b.leftUpperArm.rotation.z = 0.95;
  }

  // ----------------------------------------------------------
  // HAND MOVEMENT
  // ----------------------------------------------------------

  if (b.leftHand) {

    b.leftHand.rotation.x =
      Math.sin(gestureTime * 5) *
      0.15 *
      strength;

    b.leftHand.rotation.z =
      Math.sin(gestureTime * 3) *
      0.12 *
      strength;
  }

  if (b.rightHand) {

    b.rightHand.rotation.x =
      Math.sin(gestureTime * 5.3 + 1) *
      0.15 *
      strength;

    b.rightHand.rotation.z =
      Math.sin(gestureTime * 3.2 + 1) *
      0.12 *
      strength;
  }
}

// ============================================================
// BODY LANGUAGE
// ============================================================

function updateBodyLanguage(dt) {

  if (!vrm || !vrm.humanoid) return;

  const b = getBones();

  if (!b.chest && !b.spine) return;

  const chest = b.chest || b.spine;

  const time = performance.now() * 0.001;

  // Natural breathing
  const breathing =
    Math.sin(time * 1.25) * 0.015;

  chest.rotation.x =
    smooth(
      chest.rotation.x,
      breathing,
      0.08
    );

  // ----------------------------------------------------------
  // SPEAKING BODY SWAY
  // ----------------------------------------------------------

  if (isSpeaking) {

    chest.rotation.y =
      Math.sin(time * 1.25) * 0.025;

    chest.rotation.z =
      Math.sin(time * 1.7) * 0.018;

    // Small energetic movement
    chest.rotation.x +=
      Math.sin(time * 3.0) * 0.012;

    // Emotion-specific body language
    if (
      currentEmotion === 'excited' ||
      currentEmotion === 'happy' ||
      currentEmotion === 'playful' ||
      currentEmotion === 'funny'
    ) {

      chest.rotation.y +=
        Math.sin(time * 2.5) * 0.025;

      chest.rotation.z +=
        Math.sin(time * 2.2) * 0.02;
    }

    if (
      currentEmotion === 'sad'
    ) {

      chest.rotation.x =
        smooth(
          chest.rotation.x,
          0.035,
          0.05
        );
    }

    if (
      currentEmotion === 'angry' ||
      currentEmotion === 'annoyed'
    ) {

      chest.rotation.x += 0.02;

      chest.rotation.y +=
        Math.sin(time * 4) * 0.015;
    }

    if (
      currentEmotion === 'shy'
    ) {

      chest.rotation.y +=
        Math.sin(time * 1.4) * 0.035;
    }

  } else {

    // Calm idle body
    chest.rotation.y =
      smooth(
        chest.rotation.y,
        Math.sin(time * 0.7) * 0.012,
        0.03
      );

    chest.rotation.z =
      smooth(
        chest.rotation.z,
        Math.sin(time * 0.9) * 0.01,
        0.03
      );
  }
}

// ============================================================
// HEAD / FACIAL BODY LANGUAGE
// ============================================================

function updateHead(dt) {

  if (!vrm || !vrm.humanoid) return;

  const b = getBones();

  if (!b.head) return;

  const time = performance.now() * 0.001;

  if (isSpeaking) {

    // Natural talking head movement
    b.head.rotation.y =
      Math.sin(time * 1.7) * 0.055;

    b.head.rotation.x =
      Math.sin(time * 1.25) * 0.035;

    b.head.rotation.z =
      Math.sin(time * 1.4) * 0.025;

    // Excited = more movement
    if (
      currentEmotion === 'excited' ||
      currentEmotion === 'funny' ||
      currentEmotion === 'laughing'
    ) {

      b.head.rotation.y +=
        Math.sin(time * 3) * 0.025;

      b.head.rotation.z +=
        Math.sin(time * 2.5) * 0.02;
    }

    // Shy = slight head tilt
    if (currentEmotion === 'shy') {
      b.head.rotation.z =
        0.06 +
        Math.sin(time * 1.2) * 0.025;
    }

    // Sad = slightly downward
    if (currentEmotion === 'sad') {
      b.head.rotation.x = 0.08;
    }

  } else {

    // Idle head movement
    b.head.rotation.y =
      Math.sin(time * 0.7) * 0.035;

    b.head.rotation.x =
      Math.sin(time * 0.5) * 0.018;

    b.head.rotation.z =
      Math.sin(time * 0.6) * 0.012;
  }
}

// ============================================================
// INIT
// ============================================================

async function init(container) {

  stageEl = container;

  reduceMotion =
    window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

  const w =
    container.clientWidth || 320;

  const h =
    container.clientHeight || 420;

  scene = new THREE.Scene();

  camera =
    new THREE.PerspectiveCamera(
      28,
      w / h,
      0.1,
      20
    );

  camera.position.set(
    0,
    1.35,
    2.15
  );

  camera.lookAt(
    0,
    1.15,
    0
  );

  renderer =
    new THREE.WebGLRenderer({
      alpha: true,
      antialias: !reduceMotion,
      powerPreference: 'low-power'
    });

  renderer.setPixelRatio(
    Math.min(
      window.devicePixelRatio || 1,
      reduceMotion ? 1 : 1.75
    )
  );

  renderer.setSize(
    w,
    h,
    false
  );

  renderer.setClearColor(
    0x000000,
    0
  );

  container.innerHTML = '';

  container.appendChild(
    renderer.domElement
  );

  // ==========================================================
  // LIGHTING
  // ==========================================================

  scene.add(
    new THREE.AmbientLight(
      0xc8d0ff,
      0.7
    )
  );

  const key =
    new THREE.DirectionalLight(
      0xffffff,
      1.05
    );

  key.position.set(
    0.5,
    2.0,
    2.2
  );

  scene.add(key);

  const fill =
    new THREE.DirectionalLight(
      0x29f1e6,
      0.35
    );

  fill.position.set(
    -2,
    1.2,
    1.5
  );

  scene.add(fill);

  const rim =
    new THREE.DirectionalLight(
      0xff3fb0,
      0.3
    );

  rim.position.set(
    0,
    1.5,
    -2
  );

  scene.add(rim);

  createLookAt();

  clock =
    new THREE.Clock();

  // ==========================================================
  // LOAD VRM
  // ==========================================================

  const loader =
    new GLTFLoader();

  loader.crossOrigin =
    'anonymous';

  loader.register(
    (parser) =>
      new VRMLoaderPlugin(parser)
  );

  const url =
    (
      window.BFTERO_AI_CONFIG &&
      window.BFTERO_AI_CONFIG.characterUrl
    ) ||
    'ai/character/my-character.vrm';

  return new Promise((resolve) => {

    loader.load(

      url,

      (gltf) => {

        try {

          vrm =
            gltf.userData.vrm;

          if (!vrm) {

            console.warn(
              'No VRM in file'
            );

            resolve(false);
            return;
          }

          try {

            VRMUtils
              .removeUnnecessaryVertices(
                gltf.scene
              );

            if (
              VRMUtils.combineSkeletons
            ) {
              VRMUtils.combineSkeletons(
                gltf.scene
              );
            }

            if (
              VRMUtils.combineMorphs
            ) {
              VRMUtils.combineMorphs(
                vrm
              );
            }

          } catch (_) {}

          // ==================================================
          // IMPORTANT:
          // YOUR MODEL WAS FACING BACKWARDS.
          // ROTATE 180 DEGREES.
          // ==================================================

          vrm.scene.rotation.y =
            Math.PI;

          vrm.scene.traverse(
            (o) => {
              o.frustumCulled = false;
            }
          );

          scene.add(
            vrm.scene
          );

          if (vrm.lookAt) {
            vrm.lookAt.target =
              lookAtTarget;
          }

          detectExpressions();

          setExpression(
            'happy',
            0.4
          );

          applyRestPose();

          ready = true;

          startLoop();

          resolve(true);

        } catch (e) {

          console.warn(
            'VRM setup error',
            e
          );

          resolve(false);
        }
      },

      undefined,

      (e) => {

        console.warn(
          'VRM load failed',
          e
        );

        resolve(false);
      }
    );
  });
}

// ============================================================
// MAIN LOOP
// ============================================================

function startLoop() {

  if (animId) return;

  function tick() {

    animId =
      requestAnimationFrame(
        tick
      );

    const dt =
      clock.getDelta();

    if (!vrm) return;

    // ========================================================
    // TIME
    // ========================================================

    breathPhase +=
      dt * 1.1;

    headSway +=
      dt * 0.5;

    // ========================================================
    // BODY
    // ========================================================

    updateBodyLanguage(dt);

    updateHead(dt);

    updateGesture(dt);

    // ========================================================
    // LOOK AT
    // ========================================================

    if (lookAtTarget) {

      const time =
        Date.now();

      lookAtTarget.position.set(

        Math.sin(
          time * 0.00035
        ) * 0.08,

        1.15 +
          Math.sin(
            time * 0.00028
          ) * 0.03,

        1.0
      );
    }

    // ========================================================
    // BLINK
    // ========================================================

    blinkTimer += dt;

    if (
      blinkTimer >
      nextBlink
    ) {

      blinkTimer = 0;

      nextBlink =
        2 +
        Math.random() * 3.5;

      try {

        vrm.expressionManager
          .setValue(
            'blink',
            1
          );

        setTimeout(
          () => {

            try {

              vrm.expressionManager
                .setValue(
                  'blink',
                  0
                );

            } catch (_) {}

          },
          120
        );

      } catch (_) {}
    }

    // ========================================================
    // MOUTH
    // ========================================================

    if (!isSpeaking) {

      setMouth(
        mouthOpen * 0.85
      );
    }

    // ========================================================
    // UPDATE VRM
    // ========================================================

    vrm.update(dt);

    // ========================================================
    // RENDER
    // ========================================================

    renderer.render(
      scene,
      camera
    );
  }

  tick();
}

// ============================================================
// RESIZE
// ============================================================

function resize() {

  if (
    !renderer ||
    !stageEl ||
    !camera
  ) return;

  const w =
    stageEl.clientWidth || 320;

  const h =
    stageEl.clientHeight || 420;

  camera.aspect =
    w / h;

  camera.updateProjectionMatrix();

  renderer.setSize(
    w,
    h,
    false
  );
}

// ============================================================
// SPEAK START
// ============================================================

function speakStart(emotion) {

  isSpeaking = true;

  gestureTime = 0;

  gestureCooldown = 0.1;

  chooseGesture();

  if (emotion) {

    setExpression(
      emotion,
      0.95
    );
  }
}

// ============================================================
// SPEAK END
// ============================================================

function speakEnd() {

  isSpeaking = false;

  setMouth(0);

  const keep =
    currentEmotion === 'funny' ||
    currentEmotion === 'laughing'
      ? 'happy'
      : currentEmotion;

  setExpression(
    keep,
    0.4
  );

  // Return hands gradually to normal
  gestureTime = 0;
}

// ============================================================
// PUBLIC API
// ============================================================

window.BfteroVRM = {

  init,

  resize,

  setExpression,

  speakStart,

  speakEnd,

  setMouth,

  isReady: () =>
    ready,

  dispose() {

    if (animId) {

      cancelAnimationFrame(
        animId
      );
    }

    animId = null;

    if (renderer) {

      renderer.dispose();

      if (
        renderer.domElement &&
        renderer.domElement.parentNode
      ) {

        renderer
          .domElement
          .parentNode
          .removeChild(
            renderer.domElement
          );
      }
    }

    vrm = null;

    ready = false;
  }
};

// ============================================================
// WINDOW RESIZE
// ============================================================

window.addEventListener(
  'resize',
  () => {

    if (ready) {
      resize();
    }
  }
);
