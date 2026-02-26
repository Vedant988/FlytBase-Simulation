# FlytBase Full-Stack ATC Simulation

A high-performance, real-time 4D Drone Air Traffic Control (ATC) spatial-temporal simulation. Built with a Python FastAPI backend acting as the absolute mathematical "Physics Truth" engine, combined with a React + Deck.gl frontend utilizing WebWorkers for zero-lag visualization of up to 30 active drones.

## 🚀 Features & Architecture

### Core Modules
* **Mode 1 (Offline Batch Checker):** Pre-flight validation of missions. Parses waypoints to generate exact timestamps, utilizes a 4D R-Tree Broad-phase filter to find collision candidates, and analytically guarantees safety via exact Continuous Proximity Analysis (CPA). Provides a dynamic split-screen playback.
* **Mode 2 (Continuous Physics Proof):** Direct mathematical validation. An algebraic tool to expose the raw math engine proving exact minimum distance algorithms without simulation jitter.
* **Mode 3 (Live Real-Time ATC):** High-traffic live simulation. Includes Kalman filtering on unknown "Bogies" to build uncertainty cones, H3-based spatial grids to efficiently check conflicts, and Resolution Advisories proposing exact "delay" maneuvers.

### Performance Optimizations (Modes 1/3)
1. **Dual-Directional Predictive Timeline:** WebWorkers recalculate future flight paths up to T+60s in the background, plotting exact future predictions directly ahead of drones.
2. **Ghost Trajectories for Advisories:** Visualizing proposed resolutions and target vectors without clutter.
3. **Dynamic Object Tracking:** Drones gracefully switch navigation states (Takeoff -> Radial Outbound).
4. **Shadow Mode / Paused Scrubbing:** Allows the human-in-the-loop Operator to pause live data and safely scrub time forwards and backwards to untangle 30-drone conflict intersections.

---

## 💻 Tech Stack

**Backend (Mathematical Engine)**
* Python 3.9+
* FastAPI (WebSockets, REST APIs)
* NumPy, SciPy (Linear algebra engine)
* Rtree (4D temporal bounding boxes)
* H3 (Uber's spatial hex grid)
* Uvicorn (ASGI server)

**Frontend (Visualization)**
* React.js (TypeScript)
* Vite (Bundler)
* Deck.gl (Hardware-accelerated map rendering: MapView, OrthographicView)
* WebWorkers (Heavy float array offloading)

---

## 🛠️ Setup & Installation

### 1. Backend Setup
Navigate to the `backend` directory, create a virtual environment, and install dependencies:

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
```

Start the backend API and WebSocket server:
```bash
python run.py
# Or directly via uvicorn:
# uvicorn api.main:app --host 0.0.0.0 --port 8000
```

### 2. Frontend Setup
Navigate to the `frontend` directory and install the Node modules:

```bash
cd frontend
npm install
```

Start the Vite development server:
```bash
npm run dev
```

### 3. Open the App
The frontend will launch at `http://localhost:5173`. The backend swagger UI is available at `http://localhost:8000/docs`.

---

## 🎮 How to Use (Demo Guide)

1. **Test Mode 1 (Batch Offline):** Click `M1: BATCH CHECK`. Click the cycle icon 🔄 to rotate through 3D test cases. Click `VALIDATE PATHS` to run the math, and `PLAY SIMULATION` to start the scrubbing UI timeline. Enable Split Screen to see Orthographic representations.
2. **Test Mode 2 (Math Proof):** Select `M2: MATH PROOF`. Enter physical coordinate/velocity constants and click Execute to see the core derivatives calculated in closed-form.
3. **Test Mode 3 (Live 30-Drone Mission):** Select `M3: LIVE ATC`. On the right panel, select how many random "Bogies" you want to inject into the airspace (e.g., 5). Click `1. STAGE DRONES`, then `2. APPROVE & LAUNCH ALL`. Watch the drones take off to random altitudes and radiate outwards, while the background math algorithm locks onto conflicts drawing red proximity warnings. Pause the simulation at any time to scrub conflict markers gracefully!
