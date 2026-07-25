# Building Walkthrough (Three.js + Vite, vanilla JS)

A first-person, FPS-style walkthrough of a `.glb` building model: mouse-look,
WASD movement, sprinting, jumping, gravity, and wall/floor collision so you
can't walk through walls and can climb stairs.

## Setup

```bash
npm install
```

Drop your building model at:

```
public/model/building.glb
```

(Change `MODEL_URL` at the top of `src/main.js` if you want a different path.)

```bash
npm run dev
```

Open the printed localhost URL, click "Click to look around" to enter
pointer-lock mode, and walk around with WASD + mouse.

## Controls

| Input          | Action           |
|----------------|------------------|
| W / A / S / D  | Move             |
| Mouse          | Look around      |
| Shift          | Sprint           |
| Space          | Jump             |
| Esc            | Release cursor   |

## How it works

- **Look**: `PointerLockControls` from `three/examples/jsm` locks the cursor
  and maps mouse movement to camera rotation — the standard FPS-camera setup.
- **Move**: WASD sets a desired direction each frame; `controls.moveForward`
  / `controls.moveRight` apply it relative to where the camera is facing.
- **Wall collision**: before committing a move, a ring of raycasts is fired
  outward from the player at two heights (waist + knee) with `far` set to
  the player's radius. If any ray hits a wall within that radius, that axis
  of movement is reverted — this is what lets you slide along walls instead
  of getting stuck when approaching them diagonally.
- **Floor / gravity**: a ray is cast straight down from just above the
  player's feet each frame. Gravity is integrated normally, and when the
  player's feet reach the detected ground, vertical velocity resets and
  jumping is re-enabled. Casting from slightly above the feet (see
  `MAX_STEP_UP`) is what lets you walk up small steps/stairs smoothly
  instead of colliding with the front of each step.
- **Multi-room / multi-floor**: since collision is derived directly from the
  model's own geometry (every mesh is pushed into `collidables`), this works
  for any room layout or floor count without manual boundary setup — as
  long as rooms are connected by walkable geometry (doorways, stairs, ramps).

## Tuning

All the key constants are at the top of `src/main.js`:

- `START_X` / `START_Z` — spawn position (XZ). Match this to your building's
  entrance; the player is dropped from above and snapped onto the floor on load.
- `PLAYER_HEIGHT`, `PLAYER_RADIUS` — the player's "capsule" size.
- `MOVE_SPEED`, `SPRINT_MULTIPLIER`, `JUMP_SPEED`, `GRAVITY` — movement feel.
- `MAX_STEP_UP` — largest ledge height the player can walk up without jumping.

## Performance note

Collision raycasts run against every mesh in the model directly. For a
simple/medium building this is fine. For a very high-poly model, consider:

- Using simplified invisible "collision-only" meshes exported alongside the
  visual ones (push only those into `collidables`), or
- Adding [`three-mesh-bvh`](https://github.com/gkjohnson/three-mesh-bvh) to
  accelerate raycasts against the real geometry.

## Build for production

```bash
npm run build
npm run preview
```
