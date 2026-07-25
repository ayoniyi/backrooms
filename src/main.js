import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/* =========================================================================
   CONFIG — the numbers you're most likely to want to tweak per-model
   ========================================================================= */
const MODEL_URL = '/models/backrooms_vr.glb'; // put your .glb in /public/model/
const CUTOUT_MODEL_URL = '/models/backrooms_movie_caveman_cutout.glb';

// Spawn point, in world units. Press "N" once the app is running to enter
// no-clip fly mode — it shows your live x/y/z on screen so you can fly to
// a spot inside the building and read off the numbers to put here.
const START_X = 0;
const START_Y = 1.7;
const START_Z = 5;

const PLAYER_HEIGHT     = 1.7;   // eye height, in meters, above the floor
const PLAYER_RADIUS     = 0.35;  // horizontal collision radius (shoulder width)
const MOVE_SPEED        = 4.0;   // m/s walking
const SPRINT_MULTIPLIER = 1.8;
const JUMP_SPEED        = 6;
const GRAVITY           = -20;
const MAX_STEP_UP       = 0.45;  // largest ledge/stair height you can walk up smoothly

// Mouse-look sensitivity (0–1). Values below 1 reduce how far the camera
// swings per pixel of cursor movement — giving the requested subtle feel.
const MOUSE_SENSITIVITY = 0.15;

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
  500
);
camera.position.set(START_X, START_Y, START_Z);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('app').appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* =========================================================================
   LIGHTING
   ========================================================================= */
scene.add(new THREE.HemisphereLight(0xffffff, 0x40403f, 1.1));

const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(15, 25, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 100;
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
sun.shadow.bias = -0.0005;
scene.add(sun);

/* =========================================================================
   POINTER LOCK CONTROLS (mouse look disabled entirely)
   ========================================================================= */
const controls = new PointerLockControls(camera, document.body);
scene.add(controls.getObject());

// Disable cursor/mouse look around action entirely by intercepting mousemove in capture phase
document.addEventListener(
  'mousemove',
  (e) => {
    e.stopImmediatePropagation();
    camera.rotation.x = 0; // keep camera pitch level
  },
  true  // capture phase
);

const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');
const continueBtn = document.getElementById('continue-btn');
const pauseBtn = document.getElementById('pause-btn');
const crosshair = document.getElementById('crosshair');
const loadingScreen = document.getElementById('loading-screen');
const progressBar = document.getElementById('progress-bar');
const loadingText = document.getElementById('loading-text');
const debugHud = document.getElementById('debug-hud');
const cutoutToast = document.getElementById('cutout-toast');

let cutoutModel = null;
let cutoutBoundingRadius = 0.5;
let cutoutDiscovered = false;

function triggerCutoutDiscovery() {
  if (cutoutDiscovered || !cutoutToast) return;
  cutoutDiscovered = true;
  cutoutToast.classList.add('visible');
  setTimeout(() => {
    cutoutToast.classList.remove('visible');
  }, 4500);
}

function resumeGame() {
  blocker.style.display = 'none';
  if (pauseBtn) pauseBtn.style.display = 'flex';
  if (crosshair) crosshair.style.display = 'block';
  if (!isMobile && !controls.isLocked) {
    controls.lock();
  }
}

function pauseGame() {
  blocker.style.display = 'flex';
  if (pauseBtn) pauseBtn.style.display = 'none';
  if (crosshair) crosshair.style.display = 'none';
  if (!isMobile && controls.isLocked) {
    controls.unlock();
  }
}

if (continueBtn) {
  continueBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resumeGame();
  });
}

if (pauseBtn) {
  pauseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    pauseGame();
  });
}

controls.addEventListener('lock', () => {
  blocker.style.display = 'none';
  if (pauseBtn) pauseBtn.style.display = 'flex';
  if (crosshair) crosshair.style.display = 'block';
});

controls.addEventListener('unlock', () => {
  blocker.style.display = 'flex';
  if (pauseBtn) pauseBtn.style.display = 'none';
  if (crosshair) crosshair.style.display = 'none';
});

/* =========================================================================
   KEYBOARD INPUT
   ========================================================================= */
const keys = {
  forward: false,
  backward: false,
  turnLeft: false,   // A / ArrowLeft  → rotate yaw left
  turnRight: false,  // D / ArrowRight → rotate yaw right
  sprint: false,
  up: false,   // no-clip fly mode only
  down: false, // no-clip fly mode only
};

// Turning speed in radians per second
const TURN_SPEED = 1.8;

document.addEventListener('keydown', (e) => setKey(e.code, true));
document.addEventListener('keyup',   (e) => setKey(e.code, false));

function setKey(code, isDown) {
  switch (code) {
    case 'ArrowUp':
    case 'KeyW':
      keys.forward = isDown;
      break;
    case 'ArrowDown':
    case 'KeyS':
      keys.backward = isDown;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      keys.turnLeft = isDown;
      break;
    case 'ArrowRight':
    case 'KeyD':
      keys.turnRight = isDown;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      keys.sprint = isDown;
      break;
    case 'Space':
      if (noclip) {
        keys.up = isDown; // fly up
      } else if (isDown && canJump) {
        verticalVelocity = JUMP_SPEED;
        canJump = false;
      }
      break;
    case 'KeyC':
      keys.down = isDown; // fly down (no-clip only)
      break;
    case 'KeyN':
      if (isDown) toggleNoclip();
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
  // PointerLockControls' yaw object is controls.getObject()
  controls.getObject().rotation.y += radians;
}

function levelPitch() {
  // The pitch is stored on the camera itself (child of yaw object)
  // Smoothly interpolate toward 0 (forward-facing) over a few frames
  camera.rotation.x *= 0.12; // fast lerp toward 0
  if (Math.abs(camera.rotation.x) < 0.005) camera.rotation.x = 0;
}

function needsLeveling() {
  return Math.abs(camera.rotation.x) > 0.05; // more than ~3° off horizontal
}

/* =========================================================================
   LOAD THE BUILDING MODEL & CUTOUT MODEL
   ========================================================================= */
const collidables = []; // every mesh in the model — used for both walls and floor

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader); // harmless no-op if the .glb isn't Draco-compressed

gltfLoader.load(
  MODEL_URL,
  (gltf) => {
    const model = gltf.scene;

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        collidables.push(child);
      }
    });

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
    console.error('Failed to load model:', error);
    loadingText.textContent =
      'Could not load /model/building.glb — check the file exists and the path is correct.';
  }
);

// Reusable vectors — avoids heap allocations in hot paths
const _snapOrigin    = new THREE.Vector3();
const _feetOrigin    = new THREE.Vector3();
const _wallOriginHi  = new THREE.Vector3();
const _wallOriginLo  = new THREE.Vector3();
const _testOrigin    = new THREE.Vector3();
const _testPlayerPos = new THREE.Vector3();

function snapToFloor() {
  // Only searches a short distance below the spawn point on purpose.
  // Use no-clip mode (press "N") to find START_X/START_Y/START_Z values
  // that are already inside the building, close to the floor you want —
  // this function then just nudges you the last bit onto that exact floor.
  const position = controls.getObject().position;
  _snapOrigin.set(position.x, position.y + 1, position.z);
  downRay.set(_snapOrigin, DOWN);
  downRay.far = 4;
  const hit = downRay.intersectObjects(collidables, true)[0];
  if (hit) {
    position.y = hit.point.y + PLAYER_HEIGHT;
  } else {
    console.warn(
      'snapToFloor: no floor found within range of START_Y. ' +
        'Fly around with no-clip mode (press "N") to find better START_X/START_Y/START_Z values.'
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

      // Make sure all meshes cast/receive shadows & use double-sided materials
      cutout.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
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

      outer:
      for (const dist of candidateDistances) {
        for (let a = 0; a < 10; a++) {
          const angle = (a / 10) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
          const testX = START_X + Math.cos(angle) * dist;
          const testZ = START_Z + Math.sin(angle) * dist;

          // Raycast downwards to find ground level
          _testOrigin.set(testX, START_Y + 3, testZ);
          downRay.set(_testOrigin, DOWN);
          downRay.far = 8;
          const hits = downRay.intersectObjects(mapCollidables, true);

          if (hits.length > 0) {
            const hitPoint = hits[0].point;
            const expectedFloorY = START_Y - PLAYER_HEIGHT;

            // Check if floor level is near spawn floor height
            if (Math.abs(hitPoint.y - expectedFloorY) < 1.5) {
              _testPlayerPos.set(testX, hitPoint.y + PLAYER_HEIGHT, testZ);
              if (!isWallBlocked(_testPlayerPos)) {
                cutout.position.set(testX, hitPoint.y + (-box.min.y), testZ);
                cutout.rotation.y = Math.random() * Math.PI * 2;
                placed = true;
                console.log(`Placed Caveman Cutout at X:${testX.toFixed(2)}, Y:${cutout.position.y.toFixed(2)}, Z:${testZ.toFixed(2)}`);
                break outer;
              }
            }
          }
        }
      }

      if (!placed) {
        // Fallback position if random search couldn't find a spot
        cutout.position.set(START_X + 2, START_Y - PLAYER_HEIGHT, START_Z - 4);
      }

      scene.add(cutout);
      cutoutModel = cutout;

      // Add cutout meshes to collidables so raycasts block player movement
      cutout.traverse((child) => {
        if (child.isMesh) {
          collidables.push(child);
        }
      });

      loadingScreen.style.display = 'none';
      blocker.style.display = 'flex';
    },
    (xhr) => {
      if (xhr.total) {
        const pct = Math.round((xhr.loaded / xhr.total) * 100);
        loadingText.textContent = `Loading "that" model… ${pct}%`;
      }
    },
    (error) => {
      console.error('Failed to load caveman cutout model:', error);
      loadingScreen.style.display = 'none';
      blocker.style.display = 'flex';
    }
  );
}

/* =========================================================================
   COLLISION HELPERS
   ========================================================================= */
const raycaster = new THREE.Raycaster();
const downRay = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);

// 8 evenly-spaced horizontal directions (correct angle formula)
const RING_DIRECTIONS = 8;
const ringDirs = Array.from({ length: RING_DIRECTIONS }, (_, i) => {
  const angle = (i / RING_DIRECTIONS) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
});

function isWallBlocked(position) {
  if (collidables.length === 0) return false;

  // Fast squared-distance cylinder check vs. cutout — no sqrt needed
  if (cutoutModel) {
    const cp      = cutoutModel.position;
    const dx      = position.x - cp.x;
    const dz      = position.z - cp.z;
    const minDist = PLAYER_RADIUS + cutoutBoundingRadius;
    if (dx * dx + dz * dz < minDist * minDist) {
      triggerCutoutDiscovery();
      return true;
    }
  }

  const baseY = position.y - PLAYER_HEIGHT;
  _wallOriginHi.set(position.x, baseY + 1.3, position.z);
  _wallOriginLo.set(position.x, baseY + 0.3, position.z);
  raycaster.far = PLAYER_RADIUS;

  for (const origin of [_wallOriginHi, _wallOriginLo]) {
    for (const dir of ringDirs) {
      raycaster.set(origin, dir);
      const intersects = raycaster.intersectObjects(collidables, true);
      if (intersects.length > 0) {
        if (cutoutModel && !cutoutDiscovered) {
          for (const hit of intersects) {
            let p = hit.object;
            while (p) {
              if (p === cutoutModel) { triggerCutoutDiscovery(); break; }
              p = p.parent;
            }
          }
        }
        return true;
      }
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
  debugHud.style.display = noclip ? 'block' : 'none';
}

function updateNoclipMovement(delta) {
  const inputForward = Number(keys.forward)  - Number(keys.backward);
  const inputUp      = Number(keys.up)       - Number(keys.down);
  // turnLeft adds positive Y (CCW = turn left), turnRight subtracts (CW = turn right)
  const turnInput    = Number(keys.turnLeft) - Number(keys.turnRight);

  const speed = MOVE_SPEED * (keys.sprint ? 3 : 1.6) * delta;

  if (turnInput    !== 0) rotateYaw(turnInput * TURN_SPEED * delta);
  if (inputForward !== 0) controls.moveForward(inputForward * speed);
  if (inputUp      !== 0) controls.getObject().position.y += inputUp * speed;

  const p = controls.getObject().position;
  debugHud.textContent =
    `NO-CLIP FLY MODE — press N to exit\n` +
    `x: ${p.x.toFixed(2)}   y: ${p.y.toFixed(2)}   z: ${p.z.toFixed(2)}\n` +
    `Space/C: up/down   Shift: faster\n` +
    `Copy these into START_X / START_Y / START_Z`;
}

function updateHorizontalMovement(delta) {
  const inputForward = Number(keys.forward)  - Number(keys.backward);
  // turnLeft = CCW (+Y), turnRight = CW (-Y) — positive rotateYaw arg turns LEFT
  const turnInput    = Number(keys.turnLeft) - Number(keys.turnRight);

  if (turnInput !== 0) {
    rotateYaw(turnInput * TURN_SPEED * delta);
  }

  if (inputForward === 0) return;

  if (needsLeveling()) levelPitch();

  const speed         = MOVE_SPEED * (keys.sprint ? SPRINT_MULTIPLIER : 1) * delta;
  const forwardAmount = inputForward * speed;
  const position      = controls.getObject().position;

  const prevX = position.x;
  const prevZ = position.z;
  controls.moveForward(forwardAmount);
  if (isWallBlocked(position)) {
    position.x = prevX;
    position.z = prevZ;
  }
}

function updateVerticalMovement(delta) {
  const position = controls.getObject().position;

  // Look for floor beneath the player's feet, slightly above current
  // feet level, so we can both fall onto lower floors and step up stairs.
  const feetY = position.y - PLAYER_HEIGHT;
  _feetOrigin.set(position.x, feetY + MAX_STEP_UP, position.z);
  downRay.set(_feetOrigin, DOWN);
  downRay.far = MAX_STEP_UP + 0.5;
  const groundHit = collidables.length ? downRay.intersectObjects(collidables, true)[0] : null;

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
const isMobile = window.matchMedia('(max-width: 1024px)').matches;

// Build the d-pad regardless of screen size so CSS can show/hide it
;(function buildDpad() {
  const dpad = document.createElement('div');
  dpad.id    = 'dpad';
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
    'dpad-fwd':   'forward',
    'dpad-back':  'backward',
    'dpad-left':  'turnLeft',
    'dpad-right': 'turnRight',
  };

  function setDpadKey(btnId, isDown) {
    const key = dpadMap[btnId];
    if (!key) return;
    keys[key] = isDown;
    document.getElementById(btnId)?.classList.toggle('active', isDown);
  }

  Object.keys(dpadMap).forEach((btnId) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); setDpadKey(btnId, true);  }, { passive: false });
    btn.addEventListener('touchend',   (e) => { e.preventDefault(); setDpadKey(btnId, false); }, { passive: false });
    btn.addEventListener('touchcancel',(e) => { e.preventDefault(); setDpadKey(btnId, false); }, { passive: false });
    btn.addEventListener('mousedown',  ()  => setDpadKey(btnId, true));
    btn.addEventListener('mouseup',    ()  => setDpadKey(btnId, false));
    btn.addEventListener('mouseleave', ()  => setDpadKey(btnId, false));
  });
})();

// Mobile-only: add tap-to-start overlay
if (isMobile) {
  const mobileStart = document.createElement('div');
  mobileStart.id    = 'mobile-start';
  mobileStart.innerHTML =
    `<div class="mobile-start-inner"><h1>BACKROOMS</h1><p>Tap to explore</p></div>`;
  document.body.appendChild(mobileStart);

  mobileStart.addEventListener('click', () => {
    mobileStart.style.display = 'none';
    resumeGame();
  }, { once: true });
}

/* =========================================================================
   RENDER LOOP
   ========================================================================= */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1); // clamp so tab-switches don't cause huge jumps

  if (controls.isLocked || isMobile) {
    if (noclip) {
      updateNoclipMovement(delta);
    } else {
      camera.rotation.x = 0; // Lock vertical pitch completely
      updateHorizontalMovement(delta);
      updateVerticalMovement(delta);
    }

    // Proximity check for cutout discovery (squared distance — no sqrt)
    if (cutoutModel && !cutoutDiscovered) {
      const p  = controls.getObject().position;
      const dx = p.x - cutoutModel.position.x;
      const dz = p.z - cutoutModel.position.z;
      if (dx * dx + dz * dz < 4.0) { // 2 m radius (2² = 4)
        triggerCutoutDiscovery();
      }
    }
  }

  renderer.render(scene, camera);
}

animate();