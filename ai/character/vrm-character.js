/**
 * MAYA – VRM 0.x Character
 * Bftero AI
 *
 * Compatible with:
 * - VRM 0.x
 * - your my-character.vrm
 * - facial expressions
 * - blinking
 * - mouth movement
 * - talking gestures
 * - hand movement
 * - body language
 * - head movement
 * - mouse rotate / orbit
 * - human-like idle + breathing
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

let renderer;
let scene;
let camera;
let vrm;
let clock;
let animId;
let lookAtTarget = null;
let mouthOpen = 0;
let currentEmotion = 'happy';
let isSpeaking = false;
let blinkTimer = 0;
let nextBlink = 2 + Math.random() * 3;
let breathPhase = 0;
let talkPhase = 0;
let gestureTimer = 0;
let gestureDuration = 0;
let currentGesture = 'idle';
let stageEl = null;
let ready = false;
let reduceMotion = false;
let availableExpressions = [];

// --------------------------------------------------
// MOUSE INTERACTION (rotate character)
// --------------------------------------------------
let isDragging = false;
let previousMouseX = 0;
let previousMouseY = 0;
let targetRotationY = 0;   // horizontal (yaw)
let targetRotationX = 0;   // vertical (pitch) – limited
let currentRotationY = 0;
let currentRotationX = 0;
const ROTATION_SPEED = 0.005;
const MAX_PITCH = 0.35;    // radians (~20°)
const DAMPING = 0.12;      // smooth follow

// --------------------------------------------------
// BONE CACHE
// --------------------------------------------------
let bones = {};
let restRotations = {};
let restPositions = {};

// --------------------------------------------------
// CREATE LOOK TARGET
// --------------------------------------------------
function createLookAt() {
  lookAtTarget = new THREE.Object3D();
  lookAtTarget.position.set(0, 1.25, 1);
  scene.add(lookAtTarget);
}

// --------------------------------------------------
// GET HUMANOID BONE
// --------------------------------------------------
function getBone(name) {
  if (!vrm || !vrm.humanoid) return null;
  try {
    return vrm.humanoid.getNormalizedBoneNode(name);
  } catch (_) {
    return null;
  }
}

// --------------------------------------------------
// CACHE BONES
// --------------------------------------------------
function cacheBones() {
  bones = {};
  restRotations = {};
  restPositions = {};

  const names = [
    'hips',
    'spine',
    'chest',
    'upperChest',
    'neck',
    'head',
    'leftShoulder',
    'leftUpperArm',
    'leftLowerArm',
    'leftHand',
    'rightShoulder',
    'rightUpperArm',
    'rightLowerArm',
    'rightHand'
  ];

  names.forEach(name => {
    const bone = getBone(name);
    if (bone) {
      bones[name] = bone;
      restRotations[name] = bone.quaternion.clone();
      restPositions[name] = bone.position.clone();
    }
  });

  console.log('MAYA bones:', Object.keys(bones));
}

// --------------------------------------------------
// RESET BONE TO ORIGINAL POSE
// --------------------------------------------------
function resetBone(name) {
  const bone = bones[name];
  if (!bone) return;
  const rest = restRotations[name];
  if (rest) bone.quaternion.copy(rest);
  const restPos = restPositions[name];
  if (restPos) bone.position.copy(restPos);
}

// --------------------------------------------------
// RESET BODY
// --------------------------------------------------
function resetBody() {
  Object.keys(restRotations).forEach(name => {
    resetBone(name);
  });
}

// --------------------------------------------------
// ROTATE BONE RELATIVE TO ORIGINAL POSE
// --------------------------------------------------
function rotateBone(name, x, y, z) {
  const bone = bones[name];
  if (!bone) return;
  const rest = restRotations[name];
  if (!rest) return;

  const q = new THREE.Quaternion();
  q.setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
  bone.quaternion.copy(rest).multiply(q);
}

// --------------------------------------------------
// EXPRESSIONS
// --------------------------------------------------
function detectExpressions() {
  availableExpressions = [];
  if (!vrm || !vrm.blendShapeProxy) {
    console.log('MAYA: VRM expression system not found');
    return;
  }

  try {
    const proxy = vrm.blendShapeProxy;
    const names = [
      'happy', 'angry', 'sad', 'surprised', 'relaxed',
      'blink', 'blink_l', 'blink_r',
      'aa', 'ih', 'ou', 'ee', 'oh'
    ];

    names.forEach(name => {
      try {
        const value = proxy.getValue(name);
        if (value !== undefined || proxy.blendShapeNames?.includes(name)) {
          availableExpressions.push(name);
        }
      } catch (_) {}
    });
  } catch (_) {}

  console.log('MAYA expressions:', availableExpressions);
}

// --------------------------------------------------
// CLEAR EXPRESSIONS
// --------------------------------------------------
function clearExpressions() {
  if (!vrm || !vrm.blendShapeProxy) return;
  const proxy = vrm.blendShapeProxy;
  const names = [
    'happy', 'angry', 'sad', 'surprised', 'relaxed',
    'aa', 'ih', 'ou', 'ee', 'oh'
  ];
  names.forEach(name => {
    try {
      proxy.setValue(name, 0);
    } catch (_) {}
  });
}

// --------------------------------------------------
// EMOTION  (expanded set)
// --------------------------------------------------
function setExpression(name, weight = 1) {
  if (!vrm || !vrm.blendShapeProxy) return;

  currentEmotion = name;
  const proxy = vrm.blendShapeProxy;
  clearExpressions();

  const w = Math.max(0, Math.min(1, weight));
  const emotion = String(name || '').toLowerCase();

  try {
    switch (emotion) {
      // positive
      case 'funny':
      case 'laughing':
        proxy.setValue('happy', w);
        proxy.setValue('aa', w * 0.35);
        break;
      case 'happy':
      case 'excited':
      case 'playful':
      case 'teasing':
      case 'joyful':
        proxy.setValue('happy', w);
        break;
      case 'smug':
      case 'confident':
        proxy.setValue('happy', w * 0.55);
        proxy.setValue('relaxed', w * 0.25);
        break;

      // calm / soft
      case 'calm':
      case 'peaceful':
        proxy.setValue('relaxed', w * 0.8);
        break;
      case 'shy':
      case 'embarrassed':
        proxy.setValue('happy', w * 0.4);
        proxy.setValue('relaxed', w * 0.35);
        break;
      case 'loving':
      case 'affectionate':
        proxy.setValue('happy', w * 0.7);
        proxy.setValue('relaxed', w * 0.3);
        break;

      // negative
      case 'angry':
      case 'annoyed':
      case 'frustrated':
        proxy.setValue('angry', w);
        break;
      case 'sad':
      case 'disappointed':
        proxy.setValue('sad', w);
        break;
      case 'worried':
      case 'anxious':
        proxy.setValue('sad', w * 0.45);
        proxy.setValue('surprised', w * 0.25);
        break;

      // surprise / thinking
      case 'surprised':
      case 'shocked':
        proxy.setValue('surprised', w);
        break;
      case 'confused':
      case 'curious':
        proxy.setValue('surprised', w * 0.55);
        proxy.setValue('relaxed', w * 0.2);
        break;
      case 'thinking':
      case 'pondering':
        proxy.setValue('relaxed', w * 0.4);
        proxy.setValue('surprised', w * 0.15);
        break;

      // neutral / serious
      case 'serious':
      case 'neutral':
      case 'focused':
        proxy.setValue('relaxed', w * 0.3);
        break;

      default:
        proxy.setValue('happy', w * 0.45);
    }
  } catch (e) {
    console.warn('MAYA expression error:', e);
  }
}

// --------------------------------------------------
// MOUTH
// --------------------------------------------------
function setMouth(open) {
  mouthOpen = Math.max(0, Math.min(1, open));
  if (!vrm || !vrm.blendShapeProxy) return;

  const proxy = vrm.blendShapeProxy;
  try {
    proxy.setValue('aa', mouthOpen * 0.9);
    proxy.setValue('oh', mouthOpen * 0.25);
    proxy.setValue('ih', mouthOpen * 0.15);
  } catch (_) {}
}

// --------------------------------------------------
// RANDOM TALK GESTURE
// --------------------------------------------------
function chooseGesture() {
  const gestures = [
    'talk',
    'explain',
    'openHands',
    'point',
    'handsTogether',
    'shrug',
    'thinking'
  ];
  currentGesture = gestures[Math.floor(Math.random() * gestures.length)];
  gestureTimer = 0;
  gestureDuration = 1.5 + Math.random() * 2.5;
}

// --------------------------------------------------
// TALK BODY LANGUAGE
// --------------------------------------------------
function updateGesture(dt) {
  if (!isSpeaking) {
    currentGesture = 'idle';
    return;
  }

  gestureTimer += dt;
  talkPhase += dt * 4;

  if (gestureTimer > gestureDuration) {
    chooseGesture();
  }

  const wave = Math.sin(talkPhase);
  const wave2 = Math.sin(talkPhase * 0.65);

  // always a little upper-body movement while talking
  rotateBone('chest', 0, wave * 0.025, wave2 * 0.018);
  rotateBone('head', wave2 * 0.025, wave * 0.035, 0);

  switch (currentGesture) {
    case 'talk':
      rotateBone('leftUpperArm', -0.12 + wave * 0.12, 0, 0.15);
      rotateBone('rightUpperArm', -0.12 - wave * 0.12, 0, -0.15);
      rotateBone('leftLowerArm', wave * 0.18, 0, 0);
      rotateBone('rightLowerArm', -wave * 0.18, 0, 0);
      break;

    case 'explain':
      rotateBone('leftUpperArm', -0.45, 0, 0.55);
      rotateBone('rightUpperArm', -0.45, 0, -0.55);
      rotateBone('leftLowerArm', 0, 0, -0.15 + wave * 0.25);
      rotateBone('rightLowerArm', 0, 0, 0.15 - wave * 0.25);
      break;

    case 'openHands':
      rotateBone('leftUpperArm', -0.35 + wave * 0.08, 0, 0.8);
      rotateBone('rightUpperArm', -0.35 - wave * 0.08, 0, -0.8);
      rotateBone('leftLowerArm', 0, 0, -0.2);
      rotateBone('rightLowerArm', 0, 0, 0.2);
      break;

    case 'point':
      rotateBone('rightUpperArm', -0.65, 0, -0.85);
      rotateBone('rightLowerArm', -0.15, 0, 0.05);
      rotateBone('leftUpperArm', -0.15, 0, 0.2);
      rotateBone('leftLowerArm', 0.2, 0, 0);
      break;

    case 'handsTogether':
      rotateBone('leftUpperArm', -0.45, 0, 0.55);
      rotateBone('rightUpperArm', -0.45, 0, -0.55);
      rotateBone('leftLowerArm', -0.4, 0, -0.25);
      rotateBone('rightLowerArm', -0.4, 0, 0.25);
      break;

    case 'shrug':
      rotateBone('leftShoulder', 0, 0, 0.2);
      rotateBone('rightShoulder', 0, 0, -0.2);
      rotateBone('leftUpperArm', -0.3, 0, 0.65);
      rotateBone('rightUpperArm', -0.3, 0, -0.65);
      break;

    case 'thinking':
      rotateBone('rightUpperArm', -0.55, 0, -0.45);
      rotateBone('rightLowerArm', -0.8, 0, 0.15);
      rotateBone('leftUpperArm', -0.15, 0, 0.25);
      rotateBone('leftLowerArm', 0.1, 0, 0);
      break;
  }
}

// --------------------------------------------------
// IDLE BODY  (more human-like)
// --------------------------------------------------
function updateIdle(dt) {
  if (isSpeaking) return;

  const t = performance.now() * 0.001;

  // multi-frequency natural sway
  const sway1 = Math.sin(t * 0.9);
  const sway2 = Math.sin(t * 1.35 + 0.4);
  const sway3 = Math.sin(t * 0.55 + 1.2);
  const sway4 = Math.sin(t * 2.1);

  // weight shift (hips)
  if (bones.hips) {
    rotateBone('hips',
      sway3 * 0.012,
      sway1 * 0.018,
      sway2 * 0.01
    );
  }

  // spine / chest gentle breathing + posture
  rotateBone('spine',
    sway2 * 0.008,
    sway3 * 0.01,
    0
  );
  rotateBone('chest',
    sway1 * 0.01 + sway4 * 0.004,
    sway2 * 0.015,
    sway3 * 0.008
  );

  // shoulders micro movement
  if (bones.leftShoulder) {
    rotateBone('leftShoulder', 0, 0, sway1 * 0.015 + 0.02);
  }
  if (bones.rightShoulder) {
    rotateBone('rightShoulder', 0, 0, -sway1 * 0.015 - 0.02);
  }

  // arms rest pose with tiny life
  rotateBone('leftUpperArm',
    -0.08 + sway2 * 0.02,
    0,
    0.12 + sway3 * 0.025
  );
  rotateBone('rightUpperArm',
    -0.08 - sway2 * 0.02,
    0,
    -0.12 - sway3 * 0.025
  );
  rotateBone('leftLowerArm', sway4 * 0.03, 0, 0);
  rotateBone('rightLowerArm', -sway4 * 0.03, 0, 0);

  // head – natural look around + nod
  rotateBone('neck',
    sway3 * 0.012,
    sway1 * 0.02,
    0
  );
  rotateBone('head',
    sway2 * 0.018 + Math.sin(t * 0.4) * 0.01,
    sway1 * 0.03,
    sway4 * 0.008
  );
}

// --------------------------------------------------
// BLINK
// --------------------------------------------------
function updateBlink(dt) {
  if (!vrm || !vrm.blendShapeProxy) return;

  blinkTimer += dt;
  if (blinkTimer > nextBlink) {
    blinkTimer = 0;
    nextBlink = 2 + Math.random() * 3.5;

    try {
      vrm.blendShapeProxy.setValue('blink', 1);
      setTimeout(() => {
        try {
          if (vrm && vrm.blendShapeProxy) {
            vrm.blendShapeProxy.setValue('blink', 0);
          }
        } catch (_) {}
      }, 110 + Math.random() * 40);
    } catch (_) {}
  }
}

// --------------------------------------------------
// BREATHING  (more realistic – chest + upper chest + slight spine)
// --------------------------------------------------
function updateBreathing(dt) {
  breathPhase += dt * 1.15; // ~11–12 breaths / min

  const breath = Math.sin(breathPhase);
  const breath2 = Math.sin(breathPhase * 0.5); // slower secondary

  // vertical lift
  const chestLift = breath * 0.0045;
  const upperLift = breath * 0.0032;

  if (bones.chest) {
    const rest = restPositions.chest;
    if (rest) {
      bones.chest.position.y = rest.y + chestLift;
    }
  }
  if (bones.upperChest) {
    const rest = restPositions.upperChest;
    if (rest) {
      bones.upperChest.position.y = rest.y + upperLift;
    }
  }

  // subtle expansion via rotation
  rotateBone('chest',
    breath * 0.012,
    0,
    0
  );
  if (bones.upperChest) {
    rotateBone('upperChest',
      breath * 0.008,
      0,
      0
    );
  }

  // very small spine contribution
  if (bones.spine) {
    rotateBone('spine',
      breath2 * 0.004,
      0,
      0
    );
  }
}

// --------------------------------------------------
// MOUSE CONTROLS
// --------------------------------------------------
function setupMouseControls(container) {
  const canvas = renderer.domElement;

  const onPointerDown = (e) => {
    isDragging = true;
    previousMouseX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    previousMouseY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    canvas.style.cursor = 'grabbing';
  };

  const onPointerMove = (e) => {
    if (!isDragging) return;

    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;

    const deltaX = clientX - previousMouseX;
    const deltaY = clientY - previousMouseY;

    targetRotationY += deltaX * ROTATION_SPEED;
    targetRotationX += deltaY * ROTATION_SPEED;
    targetRotationX = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, targetRotationX));

    previousMouseX = clientX;
    previousMouseY = clientY;
  };

  const onPointerUp = () => {
    isDragging = false;
    canvas.style.cursor = 'grab';
  };

  // mouse
  canvas.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);

  // touch
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    onPointerDown(e);
  }, { passive: false });
  window.addEventListener('touchmove', (e) => {
    if (isDragging) e.preventDefault();
    onPointerMove(e);
  }, { passive: false });
  window.addEventListener('touchend', onPointerUp);

  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'none';
}

// apply smooth rotation every frame
function updateMouseRotation() {
  if (!vrm) return;

  currentRotationY += (targetRotationY - currentRotationY) * DAMPING;
  currentRotationX += (targetRotationX - currentRotationX) * DAMPING;

  // apply to the whole VRM scene (or root)
  vrm.scene.rotation.y = currentRotationY;
  vrm.scene.rotation.x = currentRotationX;
}

// --------------------------------------------------
// INIT
// --------------------------------------------------
async function init(container) {
  stageEl = container;
  reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const w = container.clientWidth || 320;
  const h = container.clientHeight || 420;

  // SCENE
  scene = new THREE.Scene();

  // CAMERA
  camera = new THREE.PerspectiveCamera(28, w / h, 0.1, 20);
  camera.position.set(0, 1.35, 2.15);
  camera.lookAt(0, 1.15, 0);

  // RENDERER
  renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: !reduceMotion,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, reduceMotion ? 1 : 1.75)
  );
  renderer.setSize(w, h, false);
  renderer.setClearColor(0x000000, 0);

  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  // LIGHTING
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));

  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(0.5, 2, 2);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x29f1e6, 0.25);
  fill.position.set(-2, 1, 1.5);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xff3fb0, 0.25);
  rim.position.set(0, 1.5, -2);
  scene.add(rim);

  // LOOK AT
  createLookAt();
  clock = new THREE.Clock();

  // LOAD VRM
  const loader = new GLTFLoader();
  loader.crossOrigin = 'anonymous';
  loader.register(parser => new VRMLoaderPlugin(parser));

  const url =
    (window.BFTERO_AI_CONFIG && window.BFTERO_AI_CONFIG.characterUrl) ||
    'ai/character/my-character.vrm';

  console.log('MAYA loading:', url);

  return new Promise(resolve => {
    loader.load(
      url,
      gltf => {
        try {
          vrm = gltf.userData.vrm;
          if (!vrm) {
            console.error('MAYA: VRM not found');
            resolve(false);
            return;
          }

          console.log('MAYA: VRM loaded');

          // VRM 0.x orientation fix
          if (VRMUtils.rotateVRM0) {
            VRMUtils.rotateVRM0(vrm.scene);
            console.log('MAYA: VRM 0.x rotation applied');
          } else {
            vrm.scene.rotation.y = Math.PI;
          }

          vrm.scene.traverse(object => {
            object.frustumCulled = false;
          });

          scene.add(vrm.scene);

          cacheBones();
          detectExpressions();
          setExpression('happy', 0.5);

          if (vrm.lookAt) {
            vrm.lookAt.target = lookAtTarget;
          }

          // enable mouse / touch rotation
          setupMouseControls(container);

          ready = true;
          console.log('MAYA READY – drag to rotate');
          startLoop();
          resolve(true);
        } catch (error) {
          console.error('MAYA setup error:', error);
          resolve(false);
        }
      },
      progress => {
        if (progress.total) {
          const percent = (progress.loaded / progress.total) * 100;
          console.log(`MAYA loading ${percent.toFixed(0)}%`);
        }
      },
      error => {
        console.error('MAYA VRM load failed:', error);
        resolve(false);
      }
    );
  });
}

// --------------------------------------------------
// ANIMATION LOOP
// --------------------------------------------------
function startLoop() {
  if (animId) return;

  function tick() {
    animId = requestAnimationFrame(tick);
    const dt = clock.getDelta();
    if (!vrm) return;

    // mouse rotation (smooth)
    updateMouseRotation();

    // breathing (always)
    updateBreathing(dt);

    // body language
    if (isSpeaking) {
      updateGesture(dt);
    } else {
      updateIdle(dt);
    }

    // blink
    updateBlink(dt);

    // eye target subtle movement
    if (lookAtTarget) {
      const t = performance.now() * 0.001;
      lookAtTarget.position.set(
        Math.sin(t * 0.7) * 0.08,
        1.2 + Math.sin(t * 0.5) * 0.025,
        1
      );
    }

    vrm.update(dt);
    renderer.render(scene, camera);
  }

  tick();
}

// --------------------------------------------------
// RESIZE
// --------------------------------------------------
function resize() {
  if (!renderer || !stageEl || !camera) return;
  const w = stageEl.clientWidth || 320;
  const h = stageEl.clientHeight || 420;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

// --------------------------------------------------
// SPEAK START / END
// --------------------------------------------------
function speakStart(emotion) {
  isSpeaking = true;
  talkPhase = 0;
  gestureTimer = 0;
  chooseGesture();
  if (emotion) {
    setExpression(emotion, 0.95);
  }
}

function speakEnd() {
  isSpeaking = false;
  setMouth(0);
  currentGesture = 'idle';

  if (currentEmotion === 'funny' || currentEmotion === 'laughing') {
    setExpression('happy', 0.45);
  } else {
    setExpression(currentEmotion, 0.4);
  }
}

// --------------------------------------------------
// PUBLIC API
// --------------------------------------------------
window.BfteroVRM = {
  init,
  resize,
  setExpression,
  speakStart,
  speakEnd,
  setMouth,
  isReady: () => ready,

  // extra helpers
  resetRotation() {
    targetRotationY = 0;
    targetRotationX = 0;
  },
  setRotation(y, x = 0) {
    targetRotationY = y;
    targetRotationX = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, x));
  },

  dispose() {
    if (animId) {
      cancelAnimationFrame(animId);
    }
    animId = null;
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }
    vrm = null;
    bones = {};
    restRotations = {};
    restPositions = {};
    ready = false;
  }
};

// --------------------------------------------------
// WINDOW RESIZE
// --------------------------------------------------
window.addEventListener('resize', () => {
  if (ready) {
    resize();
  }
});
