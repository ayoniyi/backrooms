# Backrooms 3D Environment

A first-person 3D Backrooms web experience built with **Three.js**, **Vite**, and **Vanilla JavaScript**. 

Features real-time GLTF/Draco model rendering, realistic lighting and fog, wall collision detection, floor snapping, secret object discovery, keyboard turning, locked vertical view, and full mobile support with interactive touch D-pad controls.

---

## 🚀 Setup & Running

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start dev server:**
   ```bash
   npm run dev
   ```
   Open the local server URL (e.g., `http://localhost:5173`) in your web browser.

3. **Build for production:**
   ```bash
   npm run build
   npm run preview
   ```

---

## 📂 Project Structure

```
my_backrooms/
├── public/
│   └── models/
│       ├── backrooms_vr.glb                  # Primary 3D environment model
│       ├── backrooms_movie_caveman_cutout.glb # Secret collectible model
│       └── ...
├── src/
│   ├── main.js                               # Core scene setup, game loop, physics & controls
│   └── style.css                             # Glassmorphism UI, mobile D-pad, loading & toast styles
├── index.html                                # Main HTML shell & UI overlays
├── package.json
└── vite.config.js
```

---

## 🎮 Controls

### Desktop Controls

| Input | Action |
| :--- | :--- |
| **W** / **Up Arrow** | Move Forward (in facing direction; auto-levels camera pitch) |
| **S** / **Down Arrow** | Move Backward |
| **A** / **Left Arrow** | Turn Camera Left (Yaw) |
| **D** / **Right Arrow** | Turn Camera Right (Yaw) |
| **Continue Button** | Dismiss controls modal & start/resume exploration |
| **Pause Button (⏸)** | Open controls modal & pause active movement |
| **Shift** | Sprint (boosts movement speed) |
| **Space** | Jump (or Fly Up in No-Clip mode) |
| **C** | Fly Down (No-Clip mode only) |
| **N** | Toggle No-Clip Fly Mode (displays live X, Y, Z coordinates for spawn tuning) |
| **Esc** | Toggle Pause / Controls screen |

*Note: Cursor/mouse look around action is disabled entirely. Camera orientation is controlled via keyboard turning inputs or the touch D-pad.*

### Mobile & Small Screen Controls (≤ 1024px)
On mobile devices and smaller screen sizes:
- **Continue Button**: Added to the controls modal so users can easily dismiss the modal and enter/resume exploration on touch and small screens.
- **Floating Pause Button (⏸)**: Positioned at the top-right corner to open the controls modal whenever inactive.
- **Glassmorphic D-pad**: Appears automatically at the bottom of the screen:
  - **Forward Arrow**: Walk forward
  - **Backward Arrow**: Walk backward
  - **Left Arrow**: Turn camera left
  - **Right Arrow**: Turn camera right
- **Active State Highlights**: Buttons provide visual feedback when pressed/touched.

---

## ⚙️ Key Technical Features

### 1. Disabled Mouse Look & Keyboard Turning
- Mouse look around action is disabled entirely in the capture phase.
- Camera rotation (Yaw) is driven strictly by **A / D** and **Left / Right Arrow** keys (or touch D-pad on mobile).
- Automatic pitch leveling resets any pitch offset when moving forward or backward.

### 2. Controls Modal & Pause Architecture
- Integrated **Continue** button inside `#instructions` modal to allow immediate dismissal on all screen sizes (including smaller viewports where clicking overlay background might fail).
- In-game floating **Pause** button allows opening/closing the controls modal on demand.

### 3. Collision System & Physics
- **Wall Collision**: Raycasts in 8 horizontal directions at knee and waist heights prevent clipping through environment walls and allow smooth wall sliding.
- **Stair & Ledge Climbing**: Downward ground-detection raycast allows walking up stairs and small obstacles up to `MAX_STEP_UP` height smoothly.
- **Gravity & Jump**: Integrated vertical velocity physics with jump reset upon grounding.
- **Safety Respawn Net**: Automatically respawns player at start coordinates if dropped out of bounds (`Y < -60`).

### 4. Dynamic Secret Model Placement & Toast Discovery
- Asynchronously loads `backrooms_movie_caveman_cutout.glb` and uses random floor sampling to place the model in a valid, unblocked room location.
- Triggers a styled UI discovery toast (*"🗿 You found the Caveman Cutout!"*) upon player proximity or collision.

### 5. No-Clip Fly Mode
- Pressing **N** toggles No-Clip mode, allowing free flying through walls to inspect room layouts and discover exact `START_X`, `START_Y`, `START_Z` coordinates via an on-screen HUD.

### 6. Performance Optimizations
- Pre-allocated `THREE.Vector3` objects in hot execution paths to prevent garbage collection frame drops.
- Squared-distance calculations (`dx * dx + dz * dz`) for fast cylinder collision and proximity detection without square-root overhead.
- Optimized 8-direction raycasting array for lightweight collision checks across all frames.

---

## 🛠️ Configuration & Tuning

Configuration constants can be adjusted at the top of `src/main.js`:

```javascript
const START_X = 0;             // Spawn X position
const START_Y = 1.7;           // Spawn Y position
const START_Z = 5;             // Spawn Z position
const PLAYER_HEIGHT = 1.7;     // Eye height in meters
const PLAYER_RADIUS = 0.35;    // Player collision width radius
const MOVE_SPEED = 4.0;        // Base walking speed (m/s)
const SPRINT_MULTIPLIER = 1.8; // Sprint speed multiplier
const JUMP_SPEED = 6;          // Jump velocity
const GRAVITY = -20;           // Downward gravity acceleration
const MAX_STEP_UP = 0.45;      // Max walkable stair/step height
const TURN_SPEED = 1.8;        // Keyboard rotation speed (rad/s)
```
