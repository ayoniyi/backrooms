import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

/* =========================================================================
   CONFIG — the numbers you're most likely to want to tweak per-model
   ========================================================================= */
const MODEL_URL = "/models/backrooms_vr.glb"; // put your .glb in /public/model/
const CUTOUT_MODEL_URL = "/models/backrooms_movie_caveman_cutout.glb";

// Spawn point, in world units. Press "N" once the app is running to enter
// no-clip fly mode — it shows your live x/y/z on screen so you can fly to
// a spot inside the building and read off the numbers to put here.
const START_X = 0;
const START_Y = 1.7;
const START_Z = 5;

const PLAYER_HEIGHT = 1.7; // eye height, in meters, above the floor
const PLAYER_RADIUS = 0.35; // horizontal collision radius (shoulder width)
const MOVE_SPEED = 4.0; // m/s walking
const SPRINT_MULTIPLIER = 1.8;
const JUMP_SPEED = 6;
const GRAVITY = -20;
const MAX_STEP_UP = 0.45; // largest ledge/stair height you can walk up smoothly

// Mouse-look sensitivity (0–1). Values below 1 reduce how far the camera
// swings per pixel of cursor movement — giving the requested subtle feel.
const MOUSE_SENSITIVITY = 0.15;

// Movement smoothing — higher = snappier, lower = more floaty
const MOVE_DAMPING = 12; // damp factor for speed acceleration
const TURN_DAMPING = 14; // damp factor for yaw rotation

/* =========================================================================
   SCENE / CAMERA / RENDERER
   ========================================================================= */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1c22);
scene.fog = new THREE.Fog(0x1b1c22, 25, 90);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.05,
  500,
);
camera.position.set(START_X, START_Y, START_Z);
camera.rotation.order = "YXZ";

// OPT 1: powerPreference forces discrete GPU on laptops with dual GPUs.
// OPT 1: Shadow maps disabled — indoor baked lighting doesn't need them and
//         they are the single most expensive GPU feature to enable.
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false; // OPT 1: was true + PCFSoftShadowMap
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById("app").appendChild(renderer.domElement);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* =========================================================================
   LIGHTING
   OPT 2: Removed the expensive DirectionalLight shadow map (2048×2048).
          Kept a weaker DirectionalLight as a pure fill light (no shadows).
          Indoor Backrooms relies on baked textures + emissive ceiling panels,
          so real-time shadows add GPU cost with no visible benefit.
   ========================================================================= */
scene.add(new THREE.HemisphereLight(0xffffff, 0x40403f, 1.1));

const fillLight = new THREE.DirectionalLight(0xffffff, 0.6); // OPT 2: was 1.6, shadows off
fillLight.position.set(15, 25, 10);
fillLight.castShadow = false; // OPT 2: explicitly off
scene.add(fillLight);

/* =========================================================================
   DOCUMENT-VISIBILITY-AWARE CLOCK  (OPT 3)
   THREE.Clock accumulates elapsed time while the tab is hidden, causing a
   massive delta spike the next frame. This wrapper pauses on visibilitychange
   and resets the internal startTime so getDelta() returns ≈0 after unhide.
   ========================================================================= */
const clock = new THREE.Clock();
let _tabHidden = false;

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    _tabHidden = true;
    clock.stop();
  } else {
    _tabHidden = false;
    clock.start(); // resets startTime, so next getDelta() is tiny
  }
});

/* =========================================================================
   POINTER LOCK CONTROLS (mouse look disabled entirely)
   ========================================================================= */
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

// Disable cursor/mouse look around action entirely by intercepting mousemove in capture phase
document.addEventListener(
  "mousemove",
  (e) => {
    e.stopImmediatePropagation();
    camera.rotation.x = 0; // keep camera pitch level
  },
  true, // capture phase
);

const blocker = document.getElementById("blocker");
const instructions = document.getElementById("instructions");
const continueBtn = document.getElementById("continue-btn");
const pauseBtn = document.getElementById("pause-btn");
const crosshair = document.getElementById("crosshair");
const loadingScreen = document.getElementById("loading-screen");
const progressBar = document.getElementById("progress-bar");
const loadingText = document.getElementById("loading-text");
const debugHud = document.getElementById("debug-hud");
const cutoutToast = document.getElementById("cutout-toast");
const subtitleToast = document.getElementById("subtitle-toast");

function showSubtitle(text) {
  if (!subtitleToast) return;
  subtitleToast.textContent = text;
  subtitleToast.classList.add("visible");
}

function hideSubtitle() {
  if (!subtitleToast) return;
  subtitleToast.classList.remove("visible");
}

// OPT 10: Track whether the game is actively rendering to skip render
//          when paused — avoids GPU work on a hidden overlay screen.
let isGameActive = false;

/* =========================================================================
   AMBIENT SUSPENSE HORROR SOUND
   ========================================================================= */
const AMBIENT_SOUND_URL = "/sounds/backroom-atm.mp3";
const AMBIENT_PAUSE_INTERVAL_MS = 15000; // 30 seconds pause AFTER track finishes

// VOLUME CONFIGURATION: Set sound volume here (0.0 = muted, 1.0 = 100% max volume)
const AMBIENT_VOLUME = 0.1; // <-- Edit this number to change volume (e.g. 0.2 for 20%)

const ambientAudio = new Audio(AMBIENT_SOUND_URL);
ambientAudio.volume = AMBIENT_VOLUME;
ambientAudio.loop = false; // Ensure native HTML5 audio loop is disabled

let ambientTimer = null;
let isAudioScheduled = false;

/**
 * Helper to dynamically change volume at runtime (0.0 to 1.0)
 * Example: setAmbientVolume(0.3);
 */
function setAmbientVolume(level) {
  ambientAudio.volume = Math.max(0, Math.min(1, level));
}

// Expose helper globally so it can be called from browser console for quick testing
window.setAmbientVolume = setAmbientVolume;

function playAmbientSound() {
  if (!isGameActive) return;
  ambientAudio.currentTime = 0;
  ambientAudio.play().catch((err) => {
    console.warn("Ambient audio playback error:", err);
  });
}

// Wait until track finishes playing, then wait 30 seconds before playing again
ambientAudio.addEventListener("ended", () => {
  if (!isGameActive) return;
  ambientTimer = setTimeout(() => {
    playAmbientSound();
  }, AMBIENT_PAUSE_INTERVAL_MS);
});

function startAmbientLoop() {
  if (isAudioScheduled) return;
  isAudioScheduled = true;
  playAmbientSound();
}

function stopAmbientLoop() {
  isAudioScheduled = false;
  if (ambientTimer) {
    clearTimeout(ambientTimer);
    ambientTimer = null;
  }
  ambientAudio.pause();
  ambientAudio.currentTime = 0;
}

/* =========================================================================
   TALK & RESPONSE AUDIO SYSTEM ('T' KEY)
   ========================================================================= */
const HELLO_SOUNDS = ["/sounds/hello1.mp3", "/sounds/hello2.mp3"];
const RESPONSE_SOUNDS = ["/sounds/response2.mp3"];
const RESPONSE_DELAY_MS = 2000; // 5 seconds wait after talk ends

// VOLUME CONFIGURATION FOR TALK & RESPONSE (0.0 = muted, 1.0 = 100% max volume)
let TALK_VOLUME = 1; // <-- Change volume for talk sounds (e.g. 0.5 for 50%)
let RESPONSE_VOLUME = 0.075; // <-- Change volume for response sounds (e.g. 0.5 for 50%)

let currentTalkAudio = null;
let currentResponseAudio = null;
let responseTimeout = null;

/**
 * Helpers to dynamically change Talk & Response volumes at runtime (0.0 to 1.0)
 * Example: setTalkVolume(0.5); setResponseVolume(0.3);
 */
function setTalkVolume(level) {
  TALK_VOLUME = Math.max(0, Math.min(1, level));
  if (currentTalkAudio) currentTalkAudio.volume = TALK_VOLUME;
}

function setResponseVolume(level) {
  RESPONSE_VOLUME = Math.max(0, Math.min(1, level));
  if (currentResponseAudio) currentResponseAudio.volume = RESPONSE_VOLUME;
}

window.setTalkVolume = setTalkVolume;
window.setResponseVolume = setResponseVolume;

function stopTalkAndResponse() {
  hideSubtitle();
  if (responseTimeout) {
    clearTimeout(responseTimeout);
    responseTimeout = null;
  }
  if (currentTalkAudio) {
    currentTalkAudio.pause();
    currentTalkAudio = null;
  }
  if (currentResponseAudio) {
    currentResponseAudio.pause();
    currentResponseAudio = null;
  }
}

function triggerTalk() {
  if (!isGameActive) return;

  // Clear any existing active talk, response, or pending response timer
  stopTalkAndResponse();

  // Pick either hello1.mp3 or hello2.mp3 at random
  const randomHello =
    HELLO_SOUNDS[Math.floor(Math.random() * HELLO_SOUNDS.length)];
  const talkAudio = new Audio(randomHello);
  talkAudio.volume = TALK_VOLUME;
  currentTalkAudio = talkAudio;

  showSubtitle(`Player - "Hello"`);

  // Wait for talk sound to finish playing
  talkAudio.addEventListener("ended", () => {
    currentTalkAudio = null;
    hideSubtitle();
    if (!isGameActive) return;

    // Wait 5 seconds after talk finishes, then play response1.mp3 or response2.mp3
    responseTimeout = setTimeout(() => {
      if (!isGameActive) return;

      const randomResponse =
        RESPONSE_SOUNDS[Math.floor(Math.random() * RESPONSE_SOUNDS.length)];
      const responseAudio = new Audio(randomResponse);
      responseAudio.volume = RESPONSE_VOLUME;
      currentResponseAudio = responseAudio;

      showSubtitle(`Unknown - "Hello"`);

      responseAudio.addEventListener("ended", () => {
        currentResponseAudio = null;
        hideSubtitle();
      });

      responseAudio
        .play()
        .catch((err) => console.warn("Response audio playback error:", err));
    }, RESPONSE_DELAY_MS);
  });

  talkAudio
    .play()
    .catch((err) => console.warn("Talk audio playback error:", err));
}

function setGameActive(active) {
  if (isGameActive === active) return;
  isGameActive = active;
  if (active) {
    startAmbientLoop();
  } else {
    stopAmbientLoop();
    stopTalkAndResponse();
  }
}

let cutoutModel = null;
let cutoutBoundingRadius = 0.5;
let cutoutDiscovered = false;

function triggerCutoutDiscovery() {
  if (cutoutDiscovered || !cutoutToast) return;
  cutoutDiscovered = true;
  cutoutToast.classList.add("visible");
  setTimeout(() => {
    cutoutToast.classList.remove("visible");
  }, 4500);
}

function resumeGame() {
  blocker.style.display = "none";
  if (pauseBtn) pauseBtn.style.display = "flex";
  if (crosshair) crosshair.style.display = "block";
  if (!isMobile && !controls.isLocked) {
    controls.lock();
  }
  setGameActive(true);
}

function pauseGame() {
  blocker.style.display = "flex";
  if (pauseBtn) pauseBtn.style.display = "none";
  if (crosshair) crosshair.style.display = "none";
  if (!isMobile && controls.isLocked) {
    controls.unlock();
  }
  setGameActive(false);
}

if (continueBtn) {
  continueBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    resumeGame();
  });
}

if (pauseBtn) {
  pauseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    pauseGame();
  });
}

controls.addEventListener("lock", () => {
  blocker.style.display = "none";
  if (pauseBtn) pauseBtn.style.display = "flex";
  if (crosshair) crosshair.style.display = "block";
  setGameActive(true);
});

controls.addEventListener("unlock", () => {
  blocker.style.display = "flex";
  if (pauseBtn) pauseBtn.style.display = "none";
  if (crosshair) crosshair.style.display = "none";
  setGameActive(false);
});

/* =========================================================================
   KEYBOARD INPUT
   ========================================================================= */
const keys = {
  forward: false,
  backward: false,
  turnLeft: false, // A / ArrowLeft  → rotate yaw left
  turnRight: false, // D / ArrowRight → rotate yaw right
  sprint: false,
  up: false, // no-clip fly mode only
  down: false, // no-clip fly mode only
};

// Turning speed in radians per second
const TURN_SPEED = 1.8;

document.addEventListener("keydown", (e) => setKey(e.code, true));
document.addEventListener("keyup", (e) => setKey(e.code, false));

function setKey(code, isDown) {
  switch (code) {
    case "ArrowUp":
    case "KeyW":
      keys.forward = isDown;
      break;
    case "ArrowDown":
    case "KeyS":
      keys.backward = isDown;
      break;
    case "ArrowLeft":
    case "KeyA":
      keys.turnLeft = isDown;
      break;
    case "ArrowRight":
    case "KeyD":
      keys.turnRight = isDown;
      break;
    case "ShiftLeft":
    case "ShiftRight":
      keys.sprint = isDown;
      break;
    case "Space":
      if (noclip) {
        keys.up = isDown; // fly up
      } else if (isDown && canJump) {
        verticalVelocity = JUMP_SPEED;
        canJump = false;
      }
      break;
    case "KeyC":
      keys.down = isDown; // fly down (no-clip only)
      break;
    case "KeyN":
      if (isDown) toggleNoclip();
      break;
    case "KeyT":
      if (isDown && isGameActive) triggerTalk();
      break;
  }
}

/* =========================================================================
   CAMERA YAW / PITCH HELPERS
   PointerLockControls stores yaw in the parent object (controls.getObject())
   and pitch in the camera child. We expose helpers to rotate yaw and to
   level (zero) the pitch so movement always stays horizontal.
   ========================================================================= */
function rotateYaw(radians) {
  controls.getObject().rotation.y += radians;
}

function levelPitch() {
  camera.rotation.x *= 0.12; // fast lerp toward 0
  if (Math.abs(camera.rotation.x) < 0.005) camera.rotation.x = 0;
}

function needsLeveling() {
  return Math.abs(camera.rotation.x) > 0.05;
}

/* =========================================================================
   OPT 11 — SMOOTH MOVEMENT DAMPING
   Instead of instant speed changes, we damp toward target speed/yaw each
   frame. Uses frame-rate-independent exponential smoothing (same technique
   as the reference's THREE.MathUtils.damp calls).
   dampYaw uses shortest-path angular difference to avoid 360° spin-arounds.
   ========================================================================= */
let moveSpeed = 0; // current smoothed forward speed (m/s)
let targetYaw = controls.getObject().rotation.y; // desired yaw
let movementYaw = targetYaw; // current smoothed yaw

function dampYaw(current, target, lambda, delta) {
  const shortest = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
  const alpha = 1 - Math.exp(-lambda * delta);
  return current + shortest * alpha;
}

/* =========================================================================
   LOAD THE BUILDING MODEL & CUTOUT MODEL
   ========================================================================= */
const collidables = []; // every mesh in the model — used for both walls and floor

// OPT 7: Separate list of building-only wall/floor meshes used in isWallBlocked.
//         Populated after the main model loads, BEFORE the cutout is added.
//         This means wall-collision raycasts never touch the cutout's geometry.
let wallMeshes = [];

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(
  "https://www.gstatic.com/draco/versioned/decoders/1.5.6/",
);

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader); // harmless no-op if the .glb isn't Draco-compressed

gltfLoader.load(
  MODEL_URL,
  (gltf) => {
    const model = gltf.scene;

    model.traverse((child) => {
      if (child.isMesh) {
        // OPT 2: castShadow/receiveShadow have no effect when shadowMap is
        //        disabled, but we leave them false to be explicit.
        child.castShadow = false;
        child.receiveShadow = false;
        collidables.push(child);
      }
    });

    // OPT 7: Snapshot building meshes before cutout is added to collidables.
    //         Wall-collision raycasts only ever test these.
    wallMeshes = [...collidables];

    scene.add(model);
    snapToFloor(); // place the player on the ground instead of mid-air

    // Load and position the Caveman Cutout 3D model randomly on the floor
    loadCutoutModel();
  },
  (xhr) => {
    if (xhr.total) {
      const pct = Math.round((xhr.loaded / xhr.total) * 100);
      progressBar.style.width = `${pct}%`;
      loadingText.textContent = `Loading models… ${pct}%`;
    }
  },
  (error) => {
    console.error("Failed to load model:", error);
    loadingText.textContent =
      "Could not load /model/building.glb — check the file exists and the path is correct.";
  },
);

// Reusable vectors — avoids heap allocations in hot paths
const _snapOrigin = new THREE.Vector3();
const _feetOrigin = new THREE.Vector3();
const _wallOriginHi = new THREE.Vector3();
const _wallOriginLo = new THREE.Vector3();
const _testOrigin = new THREE.Vector3();
const _testPlayerPos = new THREE.Vector3();

function snapToFloor() {
  const position = controls.getObject().position;
  _snapOrigin.set(position.x, position.y + 1, position.z);
  downRay.set(_snapOrigin, DOWN);
  downRay.far = 4;
  const hit = downRay.intersectObjects(collidables, false)[0]; // OPT 6: false since flat array
  if (hit) {
    position.y = hit.point.y + PLAYER_HEIGHT;
  } else {
    console.warn(
      "snapToFloor: no floor found within range of START_Y. " +
        'Fly around with no-clip mode (press "N") to find better START_X/START_Y/START_Z values.',
    );
  }
}

/* =========================================================================
   LOAD CAVEMAN CUTOUT MODEL
   ========================================================================= */
function loadCutoutModel() {
  loadingText.textContent = 'Loading "that" model…';
  gltfLoader.load(
    CUTOUT_MODEL_URL,
    (gltf) => {
      const cutout = gltf.scene;

      cutout.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = false; // OPT 2: shadows disabled globally
          child.receiveShadow = false;
          if (child.material) {
            child.material.side = THREE.DoubleSide;
          }
        }
      });

      // Compute bounding box and normalize height if necessary (~1.8m tall cutout)
      const box = new THREE.Box3().setFromObject(cutout);
      const size = new THREE.Vector3();
      box.getSize(size);

      if (size.y > 0) {
        const targetHeight = 1.8;
        if (size.y > 4 || size.y < 0.5) {
          const scaleFactor = targetHeight / size.y;
          cutout.scale.setScalar(scaleFactor);
          box.setFromObject(cutout);
          box.getSize(size);
        }
      }

      cutoutBoundingRadius = Math.max(size.x, size.z) * 0.5 || 0.5;

      // Try random positions on the floor around the camera spawn point
      let placed = false;
      const mapCollidables = [...collidables]; // copy of building meshes only

      // Candidate radii between 6 and 22 meters from spawn
      const candidateDistances = [7, 12, 16, 20, 9, 14, 18, 22];

      outer: for (const dist of candidateDistances) {
        for (let a = 0; a < 10; a++) {
          const angle = (a / 10) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
          const testX = START_X + Math.cos(angle) * dist;
          const testZ = START_Z + Math.sin(angle) * dist;

          // Raycast downwards to find ground level
          _testOrigin.set(testX, START_Y + 3, testZ);
          downRay.set(_testOrigin, DOWN);
          downRay.far = 8;
          const hits = downRay.intersectObjects(mapCollidables, false); // OPT 6

          if (hits.length > 0) {
            const hitPoint = hits[0].point;
            const expectedFloorY = START_Y - PLAYER_HEIGHT;

            if (Math.abs(hitPoint.y - expectedFloorY) < 1.5) {
              _testPlayerPos.set(testX, hitPoint.y + PLAYER_HEIGHT, testZ);
              if (!isWallBlocked(_testPlayerPos)) {
                cutout.position.set(testX, hitPoint.y + -box.min.y, testZ);
                cutout.rotation.y = Math.random() * Math.PI * 2;
                placed = true;
                console.log(
                  `Placed Caveman Cutout at X:${testX.toFixed(2)}, Y:${cutout.position.y.toFixed(2)}, Z:${testZ.toFixed(2)}`,
                );
                break outer;
              }
            }
          }
        }
      }

      if (!placed) {
        cutout.position.set(START_X + 2, START_Y - PLAYER_HEIGHT, START_Z - 4);
      }

      scene.add(cutout);
      cutoutModel = cutout;

      // Add cutout meshes to collidables so raycasts block player movement.
      // NOTE: wallMeshes is NOT updated here — cutout is intentionally excluded
      //       from wall-collision checks to avoid double-checking (OPT 7/9).
      cutout.traverse((child) => {
        if (child.isMesh) {
          collidables.push(child);
        }
      });

      loadingScreen.style.display = "none";
      blocker.style.display = "flex";
    },
    (xhr) => {
      if (xhr.total) {
        const pct = Math.round((xhr.loaded / xhr.total) * 100);
        loadingText.textContent = `Loading "that" model… ${pct}%`;
      }
    },
    (error) => {
      console.error("Failed to load caveman cutout model:", error);
      loadingScreen.style.display = "none";
      blocker.style.display = "flex";
    },
  );
}

/* =========================================================================
   COLLISION HELPERS
   ========================================================================= */
const raycaster = new THREE.Raycaster();
const downRay = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);

// 8 evenly-spaced horizontal directions
const RING_DIRECTIONS = 8;
const ringDirs = Array.from({ length: RING_DIRECTIONS }, (_, i) => {
  const angle = (i / RING_DIRECTIONS) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
});

// OPT 5: Reusable hit-result array shared across all raycaster calls.
//         Avoids allocating a new array on every intersectObjects() call
//         (16+ allocations per frame were hammering the garbage collector).
const _hitBuffer = [];

function isWallBlocked(position) {
  if (wallMeshes.length === 0) return false;

  const baseY = position.y - PLAYER_HEIGHT;
  _wallOriginHi.set(position.x, baseY + 1.3, position.z);
  _wallOriginLo.set(position.x, baseY + 0.3, position.z);
  raycaster.far = PLAYER_RADIUS;

  for (const origin of [_wallOriginHi, _wallOriginLo]) {
    for (const dir of ringDirs) {
      raycaster.set(origin, dir);
      _hitBuffer.length = 0; // OPT 5: clear without reallocating
      // OPT 6: false = non-recursive since wallMeshes is already flat.
      // OPT 7: use wallMeshes (building only), not collidables (includes cutout).
      // OPT 9: cutout proximity is checked in animate(), not here.
      raycaster.intersectObjects(wallMeshes, false, _hitBuffer);
      if (_hitBuffer.length > 0) return true;
    }
  }
  return false;
}

/* =========================================================================
   MOVEMENT
   ========================================================================= */
let verticalVelocity = 0;
let canJump = false;
let noclip = false; // toggled with "N" — flies freely, ignores gravity/walls

function toggleNoclip() {
  noclip = !noclip;
  verticalVelocity = 0;
  keys.up = false;
  keys.down = false;
  debugHud.style.display = noclip ? "block" : "none";
}

function updateNoclipMovement(delta) {
  const inputForward = Number(keys.forward) - Number(keys.backward);
  const inputUp = Number(keys.up) - Number(keys.down);
  const turnInput = Number(keys.turnLeft) - Number(keys.turnRight);

  const speed = MOVE_SPEED * (keys.sprint ? 3 : 1.6) * delta;

  if (turnInput !== 0) rotateYaw(turnInput * TURN_SPEED * delta);
  if (inputForward !== 0) controls.moveForward(inputForward * speed);
  if (inputUp !== 0) controls.getObject().position.y += inputUp * speed;

  const p = controls.getObject().position;
  debugHud.textContent =
    `NO-CLIP FLY MODE — press N to exit\n` +
    `x: ${p.x.toFixed(2)}   y: ${p.y.toFixed(2)}   z: ${p.z.toFixed(2)}\n` +
    `Space/C: up/down   Shift: faster\n` +
    `Copy these into START_X / START_Y / START_Z`;
}

function updateHorizontalMovement(delta) {
  const inputForward = Number(keys.forward) - Number(keys.backward);
  const turnInput = Number(keys.turnLeft) - Number(keys.turnRight);

  // OPT 11: Smooth yaw with exponential damping (dampYaw) instead of instant steps.
  //         This prevents snapping and gives the camera a natural inertia feel.
  if (turnInput !== 0) {
    targetYaw += turnInput * TURN_SPEED * delta;
  }
  movementYaw = dampYaw(movementYaw, targetYaw, TURN_DAMPING, delta);
  controls.getObject().rotation.y = movementYaw;

  if (inputForward === 0) {
    // OPT 11: Smoothly decelerate to zero instead of instant stop.
    moveSpeed = THREE.MathUtils.damp(moveSpeed, 0, MOVE_DAMPING, delta);
  } else {
    if (needsLeveling()) levelPitch();
    const targetSpeed =
      MOVE_SPEED * (keys.sprint ? SPRINT_MULTIPLIER : 1) * inputForward;
    // OPT 11: Smoothly accelerate toward target speed.
    moveSpeed = THREE.MathUtils.damp(
      moveSpeed,
      targetSpeed,
      MOVE_DAMPING,
      delta,
    );
  }

  // OPT 8: Only run wall-collision raycasts if the player is actually moving.
  //         When moveSpeed is negligible, skip all 16 raycasts entirely.
  if (Math.abs(moveSpeed) > 0.001) {
    const position = controls.getObject().position;
    const prevX = position.x;
    const prevZ = position.z;
    controls.moveForward(moveSpeed * delta);
    if (isWallBlocked(position)) {
      position.x = prevX;
      position.z = prevZ;
      moveSpeed = 0; // shed momentum on collision
    }
  }
}

function updateVerticalMovement(delta) {
  const position = controls.getObject().position;

  const feetY = position.y - PLAYER_HEIGHT;
  _feetOrigin.set(position.x, feetY + MAX_STEP_UP, position.z);
  downRay.set(_feetOrigin, DOWN);
  downRay.far = MAX_STEP_UP + 0.5;

  _hitBuffer.length = 0;
  // OPT 6: false = non-recursive, collidables is a flat array.
  downRay.intersectObjects(collidables, false, _hitBuffer);
  const groundHit = collidables.length ? _hitBuffer[0] : null;

  verticalVelocity += GRAVITY * delta;
  position.y += verticalVelocity * delta;

  if (groundHit) {
    const groundY = groundHit.point.y;
    const newFeetY = position.y - PLAYER_HEIGHT;
    if (newFeetY <= groundY) {
      position.y = groundY + PLAYER_HEIGHT;
      verticalVelocity = 0;
      canJump = true;
    } else {
      canJump = false;
    }
  } else {
    canJump = false;
  }

  // Safety net: if the player somehow falls out of the world, respawn.
  if (position.y < -60) {
    verticalVelocity = 0;
    position.set(START_X, START_Y, START_Z);
    snapToFloor();
  }
}

/* =========================================================================
   MOBILE D-PAD — always injected; CSS @media controls visibility
   ========================================================================= */
const isMobile = window.matchMedia("(max-width: 1024px)").matches;

// Build the d-pad regardless of screen size so CSS can show/hide it
(function buildDpad() {
  const dpad = document.createElement("div");
  dpad.id = "dpad";
  dpad.innerHTML = `
    <div class="dpad-row">
      <button class="dpad-btn" id="dpad-fwd" aria-label="Move Forward">
        <svg viewBox="0 0 24 24"><polyline points="12 5 12 19"/><polyline points="5 12 12 5 19 12"/></svg>
      </button>
    </div>
    <div class="dpad-row">
      <button class="dpad-btn" id="dpad-left" aria-label="Turn Left">
        <svg viewBox="0 0 24 24"><polyline points="19 12 5 12"/><polyline points="12 5 5 12 12 19"/></svg>
      </button>
      <button class="dpad-btn dpad-center" id="dpad-center" aria-label="Center" disabled>
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/></svg>
      </button>
      <button class="dpad-btn" id="dpad-right" aria-label="Turn Right">
        <svg viewBox="0 0 24 24"><polyline points="5 12 19 12"/><polyline points="12 5 19 12 12 19"/></svg>
      </button>
    </div>
    <div class="dpad-row">
      <button class="dpad-btn" id="dpad-back" aria-label="Move Backward">
        <svg viewBox="0 0 24 24"><polyline points="12 19 12 5"/><polyline points="5 12 12 19 19 12"/></svg>
      </button>
    </div>
  `;
  document.body.appendChild(dpad);

  const dpadMap = {
    "dpad-fwd": "forward",
    "dpad-back": "backward",
    "dpad-left": "turnLeft",
    "dpad-right": "turnRight",
  };

  function setDpadKey(btnId, isDown) {
    const key = dpadMap[btnId];
    if (!key) return;
    keys[key] = isDown;
    document.getElementById(btnId)?.classList.toggle("active", isDown);
  }

  Object.keys(dpadMap).forEach((btnId) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        setDpadKey(btnId, true);
      },
      { passive: false },
    );
    btn.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        setDpadKey(btnId, false);
      },
      { passive: false },
    );
    btn.addEventListener(
      "touchcancel",
      (e) => {
        e.preventDefault();
        setDpadKey(btnId, false);
      },
      { passive: false },
    );
    btn.addEventListener("mousedown", () => setDpadKey(btnId, true));
    btn.addEventListener("mouseup", () => setDpadKey(btnId, false));
    btn.addEventListener("mouseleave", () => setDpadKey(btnId, false));
  });
})();

// Mobile-only: add tap-to-start overlay
if (isMobile) {
  const mobileStart = document.createElement("div");
  mobileStart.id = "mobile-start";
  mobileStart.innerHTML = `<div class="mobile-start-inner"><h1>BACKROOMS</h1><p>Tap to explore</p></div>`;
  document.body.appendChild(mobileStart);

  mobileStart.addEventListener(
    "click",
    () => {
      mobileStart.style.display = "none";
      resumeGame();
    },
    { once: true },
  );
}

/* =========================================================================
   RENDER LOOP
   ========================================================================= */

function animate() {
  requestAnimationFrame(animate);

  // OPT 4: Clamp delta to 50ms (was 100ms).
  //         Tighter clamp = smaller max position/velocity jump on spike frames
  //         (e.g. after switching tabs or heavy GC pauses).
  const delta = Math.min(clock.getDelta(), 0.05);

  // OPT 10: Skip all movement and rendering when the game is paused.
  //          When the blocker overlay is shown, nothing visible changes, so
  //          there is no reason to consume GPU time on a render pass.
  if (!isGameActive && !isMobile) {
    return;
  }

  if (controls.isLocked || isMobile) {
    if (noclip) {
      updateNoclipMovement(delta);
    } else {
      camera.rotation.x = 0; // Lock vertical pitch completely
      updateHorizontalMovement(delta);
      updateVerticalMovement(delta);
    }

    // OPT 9: Single, canonical cutout proximity check (squared distance — no sqrt).
    //         Removed the duplicate check from inside isWallBlocked; this is the
    //         only place discovery triggers now, avoiding double-work.
    if (cutoutModel && !cutoutDiscovered) {
      const p = controls.getObject().position;
      const dx = p.x - cutoutModel.position.x;
      const dz = p.z - cutoutModel.position.z;
      if (dx * dx + dz * dz < 4.0) {
        // 2 m radius (2² = 4)
        triggerCutoutDiscovery();
      }
    }
  }

  renderer.render(scene, camera);
}

animate();
