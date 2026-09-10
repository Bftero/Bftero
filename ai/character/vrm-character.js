```javascript
/**
 * MAYA – VRM 0.x Character
 * BFTERO AI
 *
 * Natural Human Animation System
 *
 * FEATURES
 * - Correct front-facing camera/model orientation
 * - Natural idle pose
 * - Arms DOWN in idle — NO T-POSE
 * - Subtle breathing
 * - Natural body-weight shifting
 * - Head movement
 * - Blinking
 * - Eyes looking around
 * - Subtle hand/finger movement
 * - Hair/body movement through natural secondary motion
 * - Natural talking gestures
 * - Gesture changes every few seconds
 * - Pointing
 * - Explaining
 * - Open hands
 * - Hands together
 * - Shrug
 * - Thinking
 * - Emotional body language
 * - Happy
 * - Shy
 * - Angry
 * - Sad
 * - Surprised
 * - Laughing
 * - Facial expressions
 * - Mouth movement
 * - VRM 0.x compatible
 */

import * as THREE from 'three';
import {
    GLTFLoader
} from 'three/addons/loaders/GLTFLoader.js';

import {
    VRMLoaderPlugin,
    VRMUtils
} from '@pixiv/three-vrm';


// ==========================================================
// GLOBALS
// ==========================================================

let renderer;
let scene;
let camera;
let vrm;
let clock;
let animId;

let stageEl = null;

let ready = false;
let reduceMotion = false;

let lookAtTarget = null;

let mouthOpen = 0;

let currentEmotion = 'happy';
let isSpeaking = false;

let blinkTimer = 0;
let nextBlink = 2 + Math.random() * 3;

let breathPhase = 0;
let talkPhase = 0;

let gestureTimer = 0;
let gestureDuration = 2;

let currentGesture = 'idle';

let idleTime = 0;

let availableExpressions = [];


// ==========================================================
// BONE CACHE
// ==========================================================

let bones = {};
let restRotations = {};


// ==========================================================
// NATURAL MOTION VARIABLES
// ==========================================================

let weightShift = 0;
let headMotion = 0;
let handMotion = 0;


// ==========================================================
// HELPERS
// ==========================================================

function clamp(value, min, max) {

    return Math.max(
        min,
        Math.min(max, value)
    );

}


// ==========================================================
// LOOK TARGET
// ==========================================================

function createLookAt() {

    lookAtTarget =
        new THREE.Object3D();

    /*
     * Camera is positioned on the FRONT side.
     * Target is also placed toward the front.
     */

    lookAtTarget.position.set(
        0,
        1.25,
        2
    );

    scene.add(
        lookAtTarget
    );
}


// ==========================================================
// GET HUMANOID BONE
// ==========================================================

function getBone(name) {

    if (!vrm || !vrm.humanoid) {

        return null;

    }

    try {

        return vrm.humanoid
            .getNormalizedBoneNode(name);

    } catch (_) {

        return null;

    }

}


// ==========================================================
// CACHE BONES
// ==========================================================

function cacheBones() {

    bones = {};
    restRotations = {};

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
        'rightHand',

        'leftThumbMetacarpal',
        'leftThumbProximal',
        'leftThumbDistal',

        'rightThumbMetacarpal',
        'rightThumbProximal',
        'rightThumbDistal'

    ];


    names.forEach(name => {

        const bone =
            getBone(name);

        if (bone) {

            bones[name] = bone;

            restRotations[name] =
                bone.quaternion.clone();

        }

    });


    console.log(
        'MAYA bones:',
        Object.keys(bones)
    );

}


// ==========================================================
// RESET BONE
// ==========================================================

function resetBone(name) {

    const bone =
        bones[name];

    if (!bone) return;

    const rest =
        restRotations[name];

    if (!rest) return;

    bone.quaternion.copy(rest);

}


// ==========================================================
// RESET BODY
// ==========================================================

function resetBody() {

    Object.keys(
        restRotations
    ).forEach(name => {

        resetBone(name);

    });

}


// ==========================================================
// ROTATE BONE RELATIVE TO REST
// ==========================================================

function rotateBone(
    name,
    x = 0,
    y = 0,
    z = 0
) {

    const bone =
        bones[name];

    if (!bone) return;

    const rest =
        restRotations[name];

    if (!rest) return;


    const q =
        new THREE.Quaternion();


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


// ==========================================================
// EXPRESSIONS
// ==========================================================

function detectExpressions() {

    availableExpressions = [];

    if (
        !vrm ||
        !vrm.blendShapeProxy
    ) {

        return;

    }


    const proxy =
        vrm.blendShapeProxy;


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

                availableExpressions.push(
                    name
                );

            }

        } catch (_) {}

    });


    console.log(
        'MAYA expressions:',
        availableExpressions
    );

}


// ==========================================================
// CLEAR EXPRESSIONS
// ==========================================================

function clearExpressions() {

    if (
        !vrm ||
        !vrm.blendShapeProxy
    ) {

        return;

    }


    const proxy =
        vrm.blendShapeProxy;


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


// ==========================================================
// EMOTION
// ==========================================================

function setExpression(
    name,
    weight = 1
) {

    if (
        !vrm ||
        !vrm.blendShapeProxy
    ) {

        return;

    }


    currentEmotion =
        String(name || 'happy')
            .toLowerCase();


    const proxy =
        vrm.blendShapeProxy;


    clearExpressions();


    const w =
        clamp(
            weight,
            0,
            1
        );


    try {

        switch (currentEmotion) {

            case 'happy':
            case 'excited':
            case 'playful':
            case 'teasing':

                proxy.setValue(
                    'happy',
                    w
                );

                break;


            case 'funny':
            case 'laughing':

                proxy.setValue(
                    'happy',
                    w
                );

                proxy.setValue(
                    'aa',
                    w * 0.2
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
                    w * 0.35
                );

                proxy.setValue(
                    'relaxed',
                    w * 0.4
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
                    w * 0.2
                );

                break;


            default:

                proxy.setValue(
                    'happy',
                    w * 0.5
                );

        }

    } catch (error) {

        console.warn(
            'MAYA expression error:',
            error
        );

    }

}


// ==========================================================
// MOUTH
// ==========================================================

function setMouth(open) {

    mouthOpen =
        clamp(
            open,
            0,
            1
        );


    if (
        !vrm ||
        !vrm.blendShapeProxy
    ) {

        return;

    }


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


// ==========================================================
// IDLE POSE
// ==========================================================

function applyNaturalIdlePose(t) {

    /*
     * IMPORTANT:
     *
     * The original rest pose can be a T-pose.
     * Therefore we DO NOT simply use the rest pose.
     *
     * Arms are explicitly placed DOWN.
     */


    const breathing =
        Math.sin(
            t * 1.15
        );


    const breathingSlow =
        Math.sin(
            t * 0.55
        );


    const sway =
        Math.sin(
            t * 0.65
        );


    const swaySmall =
        Math.sin(
            t * 0.92
        );


    const headX =
        Math.sin(
            t * 0.48
        );


    const headY =
        Math.sin(
            t * 0.36
        );


    // ------------------------------------------------------
    // SHOULDERS
    // ------------------------------------------------------

    rotateBone(
        'leftShoulder',
        0,
        0,
        0.035 +
        breathing * 0.012
    );


    rotateBone(
        'rightShoulder',
        0,
        0,
        -0.035 -
        breathing * 0.012
    );


    // ------------------------------------------------------
    // ARMS DOWN
    // ------------------------------------------------------

    rotateBone(
        'leftUpperArm',

        -1.15 +
        breathing * 0.025,

        sway * 0.025,

        0.08
    );


    rotateBone(
        'rightUpperArm',

        -1.15 -
        breathing * 0.025,

        sway * -0.025,

        -0.08
    );


    // ------------------------------------------------------
    // LOWER ARMS
    // ------------------------------------------------------

    rotateBone(
        'leftLowerArm',

        0.18 +
        swaySmall * 0.035,

        0,

        0.04
    );


    rotateBone(
        'rightLowerArm',

        0.18 -
        swaySmall * 0.035,

        0,

        -0.04
    );


    // ------------------------------------------------------
    // HANDS
    // ------------------------------------------------------

    rotateBone(
        'leftHand',

        breathing * 0.025,

        sway * 0.02,

        swaySmall * 0.025
    );


    rotateBone(
        'rightHand',

        -breathing * 0.025,

        -sway * 0.02,

        -swaySmall * 0.025
    );


    // ------------------------------------------------------
    // CHEST
    // ------------------------------------------------------

    rotateBone(
        'chest',

        breathing * 0.018,

        sway * 0.018,

        swaySmall * 0.012
    );


    // ------------------------------------------------------
    // SPINE
    // ------------------------------------------------------

    rotateBone(
        'spine',

        breathing * 0.008,

        swaySmall * 0.012,

        0
    );


    // ------------------------------------------------------
    // HEAD
    // ------------------------------------------------------

    rotateBone(
        'head',

        headX * 0.018,

        headY * 0.035,

        Math.sin(t * 0.28) * 0.012
    );


    // ------------------------------------------------------
    // NECK
    // ------------------------------------------------------

    rotateBone(
        'neck',

        -headX * 0.008,

        -headY * 0.012,

        0
    );

}


// ==========================================================
// NATURAL IDLE
// ==========================================================

function updateIdle(dt) {

    if (isSpeaking) return;


    idleTime += dt;


    const t =
        idleTime;


    resetBody();


    applyNaturalIdlePose(t);


    // ------------------------------------------------------
    // NATURAL WEIGHT SHIFT
    // ------------------------------------------------------

    const shift =
        Math.sin(
            t * 0.42
        );


    const shift2 =
        Math.sin(
            t * 0.27
        );


    if (bones.hips) {

        bones.hips.rotation.y +=
            shift * 0.015;

        bones.hips.rotation.z +=
            shift2 * 0.008;

    }


    // ------------------------------------------------------
    // OCCASIONAL HAND MOVEMENT
    // ------------------------------------------------------

    const handWave =
        Math.sin(
            t * 1.7
        );


    rotateBone(
        'leftHand',
        handWave * 0.018,
        handWave * 0.012,
        0
    );


    rotateBone(
        'rightHand',
        -handWave * 0.018,
        -handWave * 0.012,
        0
    );

}


// ==========================================================
// BLINK
// ==========================================================

function updateBlink(dt) {

    if (
        !vrm ||
        !vrm.blendShapeProxy
    ) {

        return;

    }


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

            }, 110);

        } catch (_) {}

    }

}


// ==========================================================
// BREATHING
// ==========================================================

function updateBreathing(dt) {

    breathPhase +=
        dt * 1.15;


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


// ==========================================================
// CHOOSE TALK GESTURE
// ==========================================================

function chooseGesture() {

    const gestures = [

        'talk',

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
        1.7 +
        Math.random() * 2.3;

}


// ==========================================================
// TALKING
// ==========================================================

function updateGesture(dt) {

    if (!isSpeaking) {

        currentGesture =
            'idle';

        return;

    }


    gestureTimer += dt;

    talkPhase +=
        dt * 3.5;


    if (
        gestureTimer >
        gestureDuration
    ) {

        chooseGesture();

    }


    const wave =
        Math.sin(
            talkPhase
        );


    const wave2 =
        Math.sin(
            talkPhase * 0.67
        );


    const wave3 =
        Math.sin(
            talkPhase * 1.35
        );


    // ------------------------------------------------------
    // RESET BEFORE NEW TALKING POSE
    // ------------------------------------------------------

    resetBody();


    // ------------------------------------------------------
    // NATURAL BODY MOVEMENT
    // ------------------------------------------------------

    rotateBone(
        'chest',
        wave2 * 0.025,
        wave * 0.035,
        wave3 * 0.015
    );


    rotateBone(
        'spine',
        wave2 * 0.012,
        wave * 0.018,
        0
    );


    rotateBone(
        'head',
        wave2 * 0.025,
        wave * 0.04,
        0
    );


    // ------------------------------------------------------
    // GESTURES
    // ------------------------------------------------------

    switch (
        currentGesture
    ) {


        // ==================================================
        // NORMAL TALK
        // ==================================================

        case 'talk':

            rotateBone(
                'leftUpperArm',
                -0.85 + wave * 0.12,
                wave2 * 0.08,
                0.10
            );


            rotateBone(
                'rightUpperArm',
                -0.88 - wave * 0.12,
                -wave2 * 0.08,
                -0.10
            );


            rotateBone(
                'leftLowerArm',
                0.25 + wave2 * 0.15,
                0,
                0
            );


            rotateBone(
                'rightLowerArm',
                0.22 - wave2 * 0.15,
                0,
                0
            );


            break;


        // ==================================================
        // EXPLAIN
        // ==================================================

        case 'explain':

            rotateBone(
                'leftUpperArm',
                -0.65,
                0,
                0.42
            );


            rotateBone(
                'rightUpperArm',
                -0.65,
                0,
                -0.42
            );


            rotateBone(
                'leftLowerArm',
                0.18,
                0,
                -0.15 + wave * 0.2
            );


            rotateBone(
                'rightLowerArm',
                0.18,
                0,
                0.15 - wave * 0.2
            );


            break;


        // ==================================================
        // OPEN HANDS
        // ==================================================

        case 'openHands':

            rotateBone(
                'leftUpperArm',
                -0.72,
                0,
                0.72
            );


            rotateBone(
                'rightUpperArm',
                -0.72,
                0,
                -0.72
            );


            rotateBone(
                'leftLowerArm',
                0.25,
                0,
                -0.25
            );


            rotateBone(
                'rightLowerArm',
                0.25,
                0,
                0.25
            );


            break;


        // ==================================================
        // POINT
        // ==================================================

        case 'point':

            rotateBone(
                'rightUpperArm',
                -0.62,
                0,
                -0.75
            );


            rotateBone(
                'rightLowerArm',
                -0.15,
                0,
                0.05
            );


            rotateBone(
                'leftUpperArm',
                -0.75,
                0,
                0.18
            );


            rotateBone(
                'leftLowerArm',
                0.2,
                0,
                0
            );


            break;


        // ==================================================
        // HANDS TOGETHER
        // ==================================================

        case 'handsTogether':

            rotateBone(
                'leftUpperArm',
                -0.72,
                0,
                0.45
            );


            rotateBone(
                'rightUpperArm',
                -0.72,
                0,
                -0.45
            );


            rotateBone(
                'leftLowerArm',
                -0.35,
                0,
                -0.18
            );


            rotateBone(
                'rightLowerArm',
                -0.35,
                0,
                0.18
            );


            break;


        // ==================================================
        // SHRUG
        // ==================================================

        case 'shrug':

            rotateBone(
                'leftShoulder',
                0,
                0,
                0.20
            );


            rotateBone(
                'rightShoulder',
                0,
                0,
                -0.20
            );


            rotateBone(
                'leftUpperArm',
                -0.65,
                0,
                0.65
            );


            rotateBone(
                'rightUpperArm',
                -0.65,
                0,
                -0.65
            );


            rotateBone(
                'leftLowerArm',
                0.25,
                0,
                -0.20
            );


            rotateBone(
                'rightLowerArm',
                0.25,
                0,
                0.20
            );


            break;


        // ==================================================
        // THINKING
        // ==================================================

        case 'thinking':

            rotateBone(
                'rightUpperArm',
                -0.65,
                0,
                -0.42
            );


            rotateBone(
                'rightLowerArm',
                -0.75,
                0,
                0.12
            );


            rotateBone(
                'leftUpperArm',
                -0.78,
                0,
                0.20
            );


            rotateBone(
                'leftLowerArm',
                0.20,
                0,
                0
            );


            rotateBone(
                'head',
                0.02,
                -0.08,
                -0.03
            );


            break;

    }

}


// ==========================================================
// EMOTIONAL BODY LANGUAGE
// ==========================================================

function updateEmotionBody(t) {

    if (isSpeaking) return;


    const emotion =
        currentEmotion;


    const pulse =
        Math.sin(
            t * 2
        );


    switch (emotion) {


        // ==================================================
        // HAPPY
        // ==================================================

        case 'happy':
        case 'excited':
        case 'playful':

            rotateBone(
                'chest',
                pulse * 0.015,
                0,
                0
            );


            rotateBone(
                'head',
                pulse * 0.018,
                0,
                0
            );

            break;


        // ==================================================
        // SHY
        // ==================================================

        case 'shy':

            rotateBone(
                'head',
                0.05,
                -0.08,
                -0.04
            );


            rotateBone(
                'leftUpperArm',
                -1.05,
                0,
                0.12
            );


            rotateBone(
                'rightUpperArm',
                -1.05,
                0,
                -0.12
            );


            rotateBone(
                'leftLowerArm',
                0.32,
                0,
                -0.08
            );


            rotateBone(
                'rightLowerArm',
                0.32,
                0,
                0.08
            );

            break;


        // ==================================================
        // ANGRY
        // ==================================================

        case 'angry':
        case 'annoyed':

            rotateBone(
                'chest',
                -0.025,
                0,
                0
            );


            rotateBone(
                'head',
                -0.025,
                0,
                0
            );


            rotateBone(
                'leftShoulder',
                0,
                0,
                0.05
            );


            rotateBone(
                'rightShoulder',
                0,
                0,
                -0.05
            );

            break;


        // ==================================================
        // SAD
        // ==================================================

        case 'sad':

            rotateBone(
                'chest',
                0.055,
                0,
                0
            );


            rotateBone(
                'head',
                0.12,
                0,
                0
            );


            rotateBone(
                'leftUpperArm',
                -1.05,
                0,
                0.04
            );


            rotateBone(
                'rightUpperArm',
                -1.05,
                0,
                -0.04
            );

            break;


        // ==================================================
        // SURPRISED
        // ==================================================

        case 'surprised':
        case 'confused':

            rotateBone(
                'chest',
                -0.04,
                0,
                0
            );


            rotateBone(
                'head',
                -0.04,
                0,
                0
            );

            break;


        // ==================================================
        // LAUGHING
        // ==================================================

        case 'laughing':
        case 'funny':

            rotateBone(
                'chest',
                pulse * 0.045,
                0,
                0
            );


            rotateBone(
                'head',
                pulse * 0.035,
                0,
                0
            );


            rotateBone(
                'leftUpperArm',
                -0.92,
                0,
                0.12
            );


            rotateBone(
                'rightUpperArm',
                -0.92,
                0,
                -0.12
            );

            break;

    }

}


// ==========================================================
// EYE MOVEMENT
// ==========================================================

function updateEyeMovement() {

    if (!lookAtTarget) return;


    const t =
        performance.now() *
        0.001;


    /*
     * Slow natural eye movement.
     *
     * Not constant left-right movement.
     * The target moves subtly.
     */

    lookAtTarget.position.set(

        Math.sin(
            t * 0.43
        ) * 0.10,

        1.20 +
        Math.sin(
            t * 0.31
        ) * 0.035,

        2

    );

}


// ==========================================================
// LOAD VRM
// ==========================================================

async function init(container) {

    stageEl =
        container;


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


    // ======================================================
    // SCENE
    // ======================================================

    scene =
        new THREE.Scene();


    // ======================================================
    // CAMERA
    // ======================================================

    camera =
        new THREE.PerspectiveCamera(

            28,

            w / h,

            0.1,

            20

        );


    /*
     * FRONT CAMERA
     *
     * The camera is on the positive Z side.
     */

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


    // ======================================================
    // RENDERER
    // ======================================================

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

            reduceMotion
                ? 1
                : 1.75

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


    // ======================================================
    // LIGHTING
    // ======================================================

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


    // ======================================================
    // LOOK AT
    // ======================================================

    createLookAt();


    clock =
        new THREE.Clock();


    // ======================================================
    // VRM LOADER
    // ======================================================

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
        )

        ||

        'ai/character/my-character.vrm';


    console.log(
        'MAYA loading:',
        url
    );


    return new Promise(
        resolve => {

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


                        console.log(
                            'MAYA: VRM loaded'
                        );


                        // ==================================================
                        // IMPORTANT ORIENTATION FIX
                        // ==================================================

                        /*
                         * Do NOT rely on rotateVRM0 here.
                         *
                         * We explicitly orient the character
                         * toward the camera.
                         */

                        vrm.scene.rotation.set(
                            0,
                            Math.PI,
                            0
                        );


                        // ==================================================
                        // MODEL
                        // ==================================================

                        vrm.scene.traverse(
                            object => {

                                object.frustumCulled =
                                    false;

                            }
                        );


                        scene.add(
                            vrm.scene
                        );


                        // ==================================================
                        // BONES
                        // ==================================================

                        cacheBones();


                        // ==================================================
                        // EXPRESSIONS
                        // ==================================================

                        detectExpressions();


                        setExpression(
                            'happy',
                            0.5
                        );


                        // ==================================================
                        // LOOK AT
                        // ==================================================

                        if (
                            vrm.lookAt
                        ) {

                            vrm.lookAt.target =
                                lookAtTarget;

                        }


                        // ==================================================
                        // READY
                        // ==================================================

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

                            `MAYA loading ${
                                percent.toFixed(0)
                            }%`

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

        }
    );

}


// ==========================================================
// ANIMATION LOOP
// ==========================================================

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


        const now =
            performance.now() *
            0.001;


        // ==================================================
        // BREATHING
        // ==================================================

        updateBreathing(dt);


        // ==================================================
        // BODY
        // ==================================================

        if (isSpeaking) {

            updateGesture(dt);

        } else {

            updateIdle(dt);

            updateEmotionBody(now);

        }


        // ==================================================
        // BLINK
        // ==================================================

        updateBlink(dt);


        // ==================================================
        // EYES
        // ==================================================

        updateEyeMovement();


        // ==================================================
        // VRM UPDATE
        // ==================================================

        vrm.update(dt);


        // ==================================================
        // RENDER
        // ==================================================

        renderer.render(
            scene,
            camera
        );

    }


    tick();

}


// ==========================================================
// RESIZE
// ==========================================================

function resize() {

    if (
        !renderer ||
        !stageEl ||
        !camera
    ) {

        return;

    }


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


// ==========================================================
// SPEAK START
// ==========================================================

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


// ==========================================================
// SPEAK END
// ==========================================================

function speakEnd() {

    isSpeaking = false;


    setMouth(0);


    currentGesture =
        'idle';


    /*
     * Keep the current emotion
     * but reduce facial intensity.
     */

    if (

        currentEmotion ===
            'funny'

        ||

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


// ==========================================================
// PUBLIC API
// ==========================================================

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

                renderer.domElement
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


// ==========================================================
// WINDOW RESIZE
// ==========================================================

window.addEventListener(
    'resize',
    () => {

        if (ready) {

            resize();

        }

    }
);
```
