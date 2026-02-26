# FlytBase Simulation Architecture

## Modes of Operation

### Mode 1 (V1.0) — Offline Batch Checker
- **Purpose**: Pre-flight validation of missions
- **Inputs**: JSON/WPML ordered waypoints, constant velocity, safety radius
- **Pipeline**:
  1. *Parsing*: `(x, y, z)` and timestamps: $t_i = \text{distance}/v$
  2. *Segment Construction*: Segment = `A0, A1, v, t_start, t_end`
  3. *Broad-phase filtering*: R-tree with safety buffer bounding cylinder
  4. *Continuous Conflict Detection*: CPA logic within valid time windows
  5. *Report*: Exact conflict time, location, min separation, severity

### Mode 2 (V1.1) — Continuous Physics Proof
- **Purpose**: Mathematical validation output only (terminal).
- **Assumptions**: Constant velocity, straight-line, no GPS noise/wind/accel.
- **Pipeline**:
  1. *Parametric Modeling*: $P_i(t) = A_0 + v \cdot t$
  2. *Optimization*: Minimize $D^2(t)$ analytically via exact CPA.
  3. *Exact Evaluation*: Determine min distance unconditionally.

### Mode 3 (V2.0) — Real-Time ATC Dashboard
- **Purpose**: Monitor airspace, suggest RA, highlight bogies.
- **Backend Pipeline**:
  1. *Telemetry*: 0.5–2Hz into rolling 20s deque buffer.
  2. *Estimation*: Kalman filtering on bogies for uncertainty cones.
  3. *Filtering*: Grid-based spatial hash (H3).
  4. *Detection*: Dynamic safety radius CPA.
  5. *Advisory*: Resolution Advisory (RA) time-shift logic.
- **UI Optimizations**:
  1. *Dual-Directional Predictive Timeline*
  2. *Ghost Trajectories* (RA Previews)
  3. *Dynamic Telemetry LOD*
  4. *Shadow Mode* (Pause Evaluation)

### Responsibility Map
- **core_math**: Physics truth
- **spatial_index**: Candidate filtering
- **simulators**: Mode orchestration
- **api**: Data transport
- **WebWorker**: Math offloading
- **React UI**: Visualization only
