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
// BONE CACHE
// --------------------------------------------------

let bones = {};

// Store original rotations
let restRotations = {};

// --------------------------------------------------
// CREATE LOOK TARGET
// --------------------------------------------------

function createLookAt() {

  lookAtTarget = new THREE.Object3D();

  lookAtTarget.position.set(
    0,
    1.25,
    1
  );

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

    }

  });

  console.log(
    'MAYA bones:',
    Object.keys(bones)
  );
}

// --------------------------------------------------
// RESET BONE TO ORIGINAL POSE
// --------------------------------------------------

function resetBone(name) {

  const bone = bones[name];

  if (!bone) return;

  const rest = restRotations[name];

  if (!rest) return;

  bone.quaternion.copy(rest);
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

  q.setFromEuler(
    new THREE.Euler(
      x,
      y,
      z,
      'XYZ'
    )
  );

  bone.quaternion
    .copy(rest)
    .multiply(q);

}

// --------------------------------------------------
// EXPRESSIONS
// --------------------------------------------------

function detectExpressions() {

  availableExpressions = [];

  if (!vrm || !vrm.blendShapeProxy) {

    console.log(
      'MAYA: VRM expression system not found'
    );

    return;
  }

  try {

    const proxy = vrm.blendShapeProxy;

    const names = [

      'happy',
      'angry',
      'sad',
      'surprised',
      'relaxed',

      'blink',
      'blink_l',
      'blink_r',

      'aa',
      'ih',
      'ou',
      'ee',
      'oh'

    ];

    names.forEach(name => {

      try {

        const value =
          proxy.getValue(name);

        if (
          value !== undefined ||
          proxy.blendShapeNames?.includes(name)
        ) {

          availableExpressions.push(name);

        }

      } catch (_) {}

    });

  } catch (_) {}

  console.log(
    'MAYA expressions:',
    availableExpressions
  );
}

// --------------------------------------------------
// CLEAR EXPRESSIONS
// --------------------------------------------------

function clearExpressions() {

  if (!vrm || !vrm.blendShapeProxy) return;

  const proxy = vrm.blendShapeProxy;

  const names = [

    'happy',
    'angry',
    'sad',
    'surprised',
    'relaxed',

    'aa',
    'ih',
    'ou',
    'ee',
    'oh'

  ];

  names.forEach(name => {

    try {

      proxy.setValue(
        name,
        0
      );

    } catch (_) {}

  });
}

// --------------------------------------------------
// EMOTION
// --------------------------------------------------

function setExpression(
  name,
  weight = 1
) {

  if (
    !vrm ||
    !vrm.blendShapeProxy
  ) return;

  currentEmotion = name;

  const proxy =
    vrm.blendShapeProxy;

  clearExpressions();

  const w =
    Math.max(
      0,
      Math.min(
        1,
        weight
      )
    );

  const emotion =
    String(name || '')
      .toLowerCase();

  try {

    switch (emotion) {

      case 'funny':
      case 'laughing':

        proxy.setValue(
          'happy',
          w
        );

        proxy.setValue(
          'aa',
          w * 0.25
        );

        break;


      case 'happy':
      case 'excited':
      case 'playful':
      case 'teasing':

        proxy.setValue(
          'happy',
          w
        );

        break;


      case 'calm':

        proxy.setValue(
          'relaxed',
          w * 0.7
        );

        break;


      case 'shy':

        proxy.setValue(
          'happy',
          w * 0.45
        );

        proxy.setValue(
          'relaxed',
          w * 0.3
        );

        break;


      case 'angry':
      case 'annoyed':

        proxy.setValue(
          'angry',
          w
        );

        break;


      case 'sad':

        proxy.setValue(
          'sad',
          w
        );

        break;


      case 'surprised':
      case 'confused':

        proxy.setValue(
          'surprised',
          w
        );

        break;


      case 'serious':
      case 'neutral':

        proxy.setValue(
          'relaxed',
          w * 0.25
        );

        break;


      default:

        proxy.setValue(
          'happy',
          w * 0.5
        );

    }

  } catch (e) {

    console.warn(
      'MAYA expression error:',
      e
    );

  }
}

// --------------------------------------------------
// MOUTH
// --------------------------------------------------

function setMouth(open) {

  mouthOpen =
    Math.max(
      0,
      Math.min(
        1,
        open
      )
    );

  if (
    !vrm ||
    !vrm.blendShapeProxy
  ) return;

  const proxy =
    vrm.blendShapeProxy;

  try {

    proxy.setValue(
      'aa',
      mouthOpen * 0.9
    );

    proxy.setValue(
      'oh',
      mouthOpen * 0.25
    );

    proxy.setValue(
      'ih',
      mouthOpen * 0.15
    );

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

  currentGesture =
    gestures[
      Math.floor(
        Math.random() *
        gestures.length
      )
    ];

  gestureTimer = 0;

  gestureDuration =
    1.5 +
    Math.random() * 2.5;

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

  if (
    gestureTimer >
    gestureDuration
  ) {

    chooseGesture();

  }

  const wave =
    Math.sin(talkPhase);

  const wave2 =
    Math.sin(
      talkPhase * 0.65
    );

  // ------------------------------------------------
  // ALWAYS GIVE SMALL TALKING MOVEMENT
  // ------------------------------------------------

  rotateBone(
    'chest',
    0,
    wave * 0.025,
    wave2 * 0.018
  );

  rotateBone(
    'head',
    wave2 * 0.025,
    wave * 0.035,
    0
  );

  // ------------------------------------------------
  // GESTURES
  // ------------------------------------------------

  switch (currentGesture) {

    // ----------------------------------------------
    // NORMAL TALK
    // ----------------------------------------------

    case 'talk':

      rotateBone(
        'leftUpperArm',
        -0.12 + wave * 0.12,
        0,
        0.15
      );

      rotateBone(
        'rightUpperArm',
        -0.12 - wave * 0.12,
        0,
        -0.15
      );

      rotateBone(
        'leftLowerArm',
        wave * 0.18,
        0,
        0
      );

      rotateBone(
        'rightLowerArm',
        -wave * 0.18,
        0,
        0
      );

      break;


    // ----------------------------------------------
    // EXPLAIN
    // ----------------------------------------------

    case 'explain':

      rotateBone(
        'leftUpperArm',
        -0.45,
        0,
        0.55
      );

      rotateBone(
        'rightUpperArm',
        -0.45,
        0,
        -0.55
      );

      rotateBone(
        'leftLowerArm',
        0,
        0,
        -0.15 + wave * 0.25
      );

      rotateBone(
        'rightLowerArm',
        0,
        0,
        0.15 - wave * 0.25
      );

      break;


    // ----------------------------------------------
    // OPEN HANDS
    // ----------------------------------------------

    case 'openHands':

      rotateBone(
        'leftUpperArm',
        -0.35 + wave * 0.08,
        0,
        0.8
      );

      rotateBone(
        'rightUpperArm',
        -0.35 - wave * 0.08,
        0,
        -0.8
      );

      rotateBone(
        'leftLowerArm',
        0,
        0,
        -0.2
      );

      rotateBone(
        'rightLowerArm',
        0,
        0,
        0.2
      );

      break;


    // ----------------------------------------------
    // POINTING
    // ----------------------------------------------

    case 'point':

      rotateBone(
        'rightUpperArm',
        -0.65,
        0,
        -0.85
      );

      rotateBone(
        'rightLowerArm',
        -0.15,
        0,
        0.05
      );

      rotateBone(
        'leftUpperArm',
        -0.15,
        0,
        0.2
      );

      rotateBone(
        'leftLowerArm',
        0.2,
        0,
        0
      );

      break;


    // ----------------------------------------------
    // HANDS TOGETHER
    // ----------------------------------------------

    case 'handsTogether':

      rotateBone(
        'leftUpperArm',
        -0.45,
        0,
        0.55
      );

      rotateBone(
        'rightUpperArm',
        -0.45,
        0,
        -0.55
      );

      rotateBone(
        'leftLowerArm',
        -0.4,
        0,
        -0.25
      );

      rotateBone(
        'rightLowerArm',
        -0.4,
        0,
        0.25
      );

      break;


    // ----------------------------------------------
    // SHRUG
    // ----------------------------------------------

    case 'shrug':

      rotateBone(
        'leftShoulder',
        0,
        0,
        0.2
      );

      rotateBone(
        'rightShoulder',
        0,
        0,
        -0.2
      );

      rotateBone(
        'leftUpperArm',
        -0.3,
        0,
        0.65
      );

      rotateBone(
        'rightUpperArm',
        -0.3,
        0,
        -0.65
      );

      break;


    // ----------------------------------------------
    // THINKING
    // ----------------------------------------------

    case 'thinking':

      rotateBone(
        'rightUpperArm',
        -0.55,
        0,
        -0.45
      );

      rotateBone(
        'rightLowerArm',
        -0.8,
        0,
        0.15
      );

      rotateBone(
        'leftUpperArm',
        -0.15,
        0,
        0.25
      );

      rotateBone(
        'leftLowerArm',
        0.1,
        0,
        0
      );

      break;

  }

}

// --------------------------------------------------
// IDLE BODY
// --------------------------------------------------

function updateIdle(dt) {

  if (isSpeaking) return;

  const t =
    performance.now() *
    0.001;

  const gentle =
    Math.sin(t * 1.3);

  const gentle2 =
    Math.sin(t * 0.8);

  // Small natural body movement

  rotateBone(
    'chest',
    gentle * 0.008,
    gentle2 * 0.012,
    0
  );

  rotateBone(
    'head',
    gentle2 * 0.015,
    gentle * 0.025,
    0
  );

}

// --------------------------------------------------
// BLINK
// --------------------------------------------------

function updateBlink(dt) {

  if (
    !vrm ||
    !vrm.blendShapeProxy
  ) return;

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

      vrm.blendShapeProxy.setValue(
        'blink',
        1
      );

      setTimeout(() => {

        try {

          if (
            vrm &&
            vrm.blendShapeProxy
          ) {

            vrm.blendShapeProxy.setValue(
              'blink',
              0
            );

          }

        } catch (_) {}

      }, 120);

    } catch (_) {}

  }

}

// --------------------------------------------------
// BREATHING
// --------------------------------------------------

function updateBreathing(dt) {

  breathPhase +=
    dt * 1.2;

  const chest =
    bones.chest ||
    bones.spine;

  if (!chest) return;

  const movement =
    Math.sin(
      breathPhase
    ) * 0.003;

  chest.position.y =
    movement;

}

// --------------------------------------------------
// INIT
// --------------------------------------------------

async function init(container) {

  stageEl = container;

  reduceMotion =
    window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

  const w =
    container.clientWidth ||
    320;

  const h =
    container.clientHeight ||
    420;

  // ------------------------------------------------
  // SCENE
  // ------------------------------------------------

  scene =
    new THREE.Scene();

  // ------------------------------------------------
  // CAMERA
  // ------------------------------------------------

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

  // ------------------------------------------------
  // RENDERER
  // ------------------------------------------------

  renderer =
    new THREE.WebGLRenderer({

      alpha: true,

      antialias:
        !reduceMotion,

      powerPreference:
        'high-performance'

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

  // ------------------------------------------------
  // LIGHTING
  // ------------------------------------------------

  scene.add(
    new THREE.AmbientLight(
      0xffffff,
      0.8
    )
  );

  const key =
    new THREE.DirectionalLight(
      0xffffff,
      1.2
    );

  key.position.set(
    0.5,
    2,
    2
  );

  scene.add(key);

  const fill =
    new THREE.DirectionalLight(
      0x29f1e6,
      0.25
    );

  fill.position.set(
    -2,
    1,
    1.5
  );

  scene.add(fill);

  const rim =
    new THREE.DirectionalLight(
      0xff3fb0,
      0.25
    );

  rim.position.set(
    0,
    1.5,
    -2
  );

  scene.add(rim);

  // ------------------------------------------------
  // LOOK AT
  // ------------------------------------------------

  createLookAt();

  clock =
    new THREE.Clock();

  // ------------------------------------------------
  // LOAD VRM
  // ------------------------------------------------

  const loader =
    new GLTFLoader();

  loader.crossOrigin =
    'anonymous';

  loader.register(
    parser =>
      new VRMLoaderPlugin(
        parser
      )
  );

  const url =

    (
      window.BFTERO_AI_CONFIG &&
      window.BFTERO_AI_CONFIG.characterUrl
    ) ||

    'ai/character/my-character.vrm';

  console.log(
    'MAYA loading:',
    url
  );

  return new Promise(resolve => {

    loader.load(

      url,

      gltf => {

        try {

          vrm =
            gltf.userData.vrm;

          if (!vrm) {

            console.error(
              'MAYA: VRM not found'
            );

            resolve(false);

            return;

          }

          // ------------------------------------------------
          // YOUR MODEL IS VRM 0.x
          // ------------------------------------------------

          console.log(
            'MAYA: VRM loaded'
          );

          console.log(
            'MAYA VRM:',
            vrm
          );

          // IMPORTANT:
          // Correct VRM 0.x orientation

          if (
            VRMUtils.rotateVRM0
          ) {

            VRMUtils.rotateVRM0(
              vrm.scene
            );

            console.log(
              'MAYA: VRM 0.x rotation applied'
            );

          } else {

            // fallback

            vrm.scene.rotation.y =
              Math.PI;

          }

          // ------------------------------------------------
          // ADD MODEL
          // ------------------------------------------------

          vrm.scene.traverse(
            object => {

              object.frustumCulled =
                false;

            }
          );

          scene.add(
            vrm.scene
          );

          // ------------------------------------------------
          // CACHE BONES
          // ------------------------------------------------

          cacheBones();

          // ------------------------------------------------
          // EXPRESSIONS
          // ------------------------------------------------

          detectExpressions();

          setExpression(
            'happy',
            0.5
          );

          // ------------------------------------------------
          // LOOK AT
          // ------------------------------------------------

          if (
            vrm.lookAt
          ) {

            vrm.lookAt.target =
              lookAtTarget;

          }

          ready = true;

          console.log(
            'MAYA READY'
          );

          startLoop();

          resolve(true);

        } catch (error) {

          console.error(
            'MAYA setup error:',
            error
          );

          resolve(false);

        }

      },

      progress => {

        if (
          progress.total
        ) {

          const percent =
            (
              progress.loaded /
              progress.total
            ) * 100;

          console.log(
            `MAYA loading ${percent.toFixed(0)}%`
          );

        }

      },

      error => {

        console.error(
          'MAYA VRM load failed:',
          error
        );

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

    animId =
      requestAnimationFrame(
        tick
      );

    const dt =
      clock.getDelta();

    if (!vrm) return;

    // ------------------------------
    // BREATH
    // ------------------------------

    updateBreathing(dt);

    // ------------------------------
    // BODY
    // ------------------------------

    if (isSpeaking) {

      updateGesture(dt);

    } else {

      updateIdle(dt);

    }

    // ------------------------------
    // BLINK
    // ------------------------------

    updateBlink(dt);

    // ------------------------------
    // EYE TARGET
    // ------------------------------

    if (lookAtTarget) {

      const t =
        performance.now() *
        0.001;

      lookAtTarget.position.set(

        Math.sin(
          t * 0.7
        ) * 0.08,

        1.2 +
        Math.sin(
          t * 0.5
        ) * 0.025,

        1

      );

    }

    // ------------------------------
    // VRM UPDATE
    // ------------------------------

    vrm.update(dt);

    // ------------------------------
    // RENDER
    // ------------------------------

    renderer.render(
      scene,
      camera
    );

  }

  tick();

}

// --------------------------------------------------
// RESIZE
// --------------------------------------------------

function resize() {

  if (
    !renderer ||
    !stageEl ||
    !camera
  ) return;

  const w =
    stageEl.clientWidth ||
    320;

  const h =
    stageEl.clientHeight ||
    420;

  camera.aspect =
    w / h;

  camera.updateProjectionMatrix();

  renderer.setSize(
    w,
    h,
    false
  );

}

// --------------------------------------------------
// SPEAK START
// --------------------------------------------------

function speakStart(
  emotion
) {

  isSpeaking = true;

  talkPhase = 0;

  gestureTimer = 0;

  chooseGesture();

  if (emotion) {

    setExpression(
      emotion,
      0.95
    );

  }

}

// --------------------------------------------------
// SPEAK END
// --------------------------------------------------

function speakEnd() {

  isSpeaking = false;

  setMouth(0);

  currentGesture =
    'idle';

  if (
    currentEmotion ===
      'funny' ||

    currentEmotion ===
      'laughing'
  ) {

    setExpression(
      'happy',
      0.45
    );

  } else {

    setExpression(
      currentEmotion,
      0.4
    );

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

    bones = {};

    restRotations = {};

    ready = false;

  }

};

// --------------------------------------------------
// WINDOW RESIZE
// --------------------------------------------------

window.addEventListener(
  'resize',
  () => {

    if (ready) {

      resize();

    }

  }
);
