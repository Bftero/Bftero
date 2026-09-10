/**
 * Bftero AI – VRM character controller
 * Uses @pixiv/three-vrm for expressions, look-at, blink, and simple lip-sync.
 * Lazy-loads Three.js + three-vrm only when the AI page is open.
 */
(function (global) {
  'use strict';

  let THREE, GLTFLoader, VRMLoaderPlugin, VRMUtils, VRMHumanoid, VRMExpressionPresetName;
  let renderer, scene, camera, vrm, clock, animId;
  let lookAtTarget = null;
  let mouthOpen = 0;
  let currentEmotion = 'neutral';
  let isSpeaking = false;
  let blinkTimer = 0;
  let nextBlink = 2 + Math.random() * 3;
  let headSway = 0;
  let breathPhase = 0;
  let analyser = null;
  let audioCtx = null;
  let stageEl = null;
  let ready = false;
  let reduceMotion = false;

  async function loadLibs() {
    if (THREE) return;
    // Dynamic import from CDN (already used on main site)
    const threeMod = await import('https://unpkg.com/three@0.160.0/build/three.module.js');
    THREE = threeMod;
    const { GLTFLoader: L } = await import('https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js');
    GLTFLoader = L;
    const vrmMod = await import('https://unpkg.com/@pixiv/three-vrm@2.1.2/lib/three-vrm.module.js');
    VRMLoaderPlugin = vrmMod.VRMLoaderPlugin;
    VRMUtils = vrmMod.VRMUtils;
    VRMExpressionPresetName = vrmMod.VRMExpressionPresetName;
  }

  function createLookAt() {
    lookAtTarget = new THREE.Object3D();
    scene.add(lookAtTarget);
  }

  async function init(container) {
    stageEl = container;
    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      await loadLibs();
    } catch (e) {
      console.warn('VRM libs failed', e);
      return false;
    }

    const w = container.clientWidth || 320;
    const h = container.clientHeight || 420;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 20);
    camera.position.set(0, 1.35, 2.4);

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !reduceMotion, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, reduceMotion ? 1 : 1.75));
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Soft lighting matching site cyan/magenta palette
    scene.add(new THREE.AmbientLight(0xb8c4ff, 0.55));
    const key = new THREE.DirectionalLight(0x29f1e6, 0.7);
    key.position.set(1.5, 2.5, 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xff3fb0, 0.35);
    fill.position.set(-2, 1.2, 1);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.25);
    rim.position.set(0, 1.5, -2);
    scene.add(rim);

    createLookAt();
    clock = new THREE.Clock();

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const url = (window.BFTERO_AI_CONFIG && window.BFTERO_AI_CONFIG.characterUrl) ||
      'https://pixiv.github.io/three-vrm/examples/models/three-vrm-girl.vrm';

    return new Promise((resolve) => {
      loader.load(
        url,
        (gltf) => {
          vrm = gltf.userData.vrm;
          if (!vrm) {
            console.warn('No VRM data');
            resolve(false);
            return;
          }
          VRMUtils.removeUnnecessaryVertices(gltf.scene);
          VRMUtils.removeUnnecessaryJoints(gltf.scene);
          vrm.scene.rotation.y = Math.PI; // face camera
          scene.add(vrm.scene);

          // Look-at
          if (vrm.lookAt) {
            vrm.lookAt.target = lookAtTarget;
          }

          // Initial neutral
          setExpression('neutral', 1);
          ready = true;
          startLoop();
          resolve(true);
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
    // Reset common presets
    ['happy', 'angry', 'sad', 'surprised', 'relaxed', 'neutral', 'blink', 'aa', 'ih', 'ou', 'ee', 'oh'].forEach((p) => {
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

      // Idle breathing
      breathPhase += dt * 1.2;
      const breath = Math.sin(breathPhase) * 0.008;
      if (vrm.humanoid) {
        const chest = vrm.humanoid.getNormalizedBoneNode('chest') || vrm.humanoid.getNormalizedBoneNode('spine');
        if (chest) chest.position.y = breath;
      }

      // Subtle head sway
      headSway += dt * 0.6;
      if (vrm.humanoid && !isSpeaking) {
        const head = vrm.humanoid.getNormalizedBoneNode('head');
        if (head) {
          head.rotation.y = Math.sin(headSway) * 0.04;
          head.rotation.x = Math.sin(headSway * 0.7) * 0.02;
        }
      }

      // Blink
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

      // Look-at slight movement
      if (lookAtTarget) {
        lookAtTarget.position.x = Math.sin(Date.now() * 0.0004) * 0.15;
        lookAtTarget.position.y = 1.4 + Math.sin(Date.now() * 0.0003) * 0.05;
      }

      // Lip-sync from analyser if available
      if (isSpeaking && analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length / 255;
        setMouth(0.15 + avg * 1.4);
      } else if (!isSpeaking) {
        setMouth(mouthOpen * 0.85); // decay
      }

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

  function attachAnalyser(mediaStreamOrAudio) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (analyser) return analyser;
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      if (mediaStreamOrAudio instanceof MediaStream) {
        const src = audioCtx.createMediaStreamSource(mediaStreamOrAudio);
        src.connect(analyser);
      }
      return analyser;
    } catch (_) {
      return null;
    }
  }

  function dispose() {
    if (animId) cancelAnimationFrame(animId);
    animId = null;
    if (renderer) {
      renderer.dispose();
      renderer.domElement.remove();
    }
    vrm = null;
    ready = false;
  }

  global.BfteroVRM = {
    init,
    resize,
    setExpression,
    speakStart,
    speakEnd,
    attachAnalyser,
    setMouth,
    isReady: () => ready,
    dispose
  };

  window.addEventListener('resize', () => {
    if (ready) resize();
  });
})(window);
