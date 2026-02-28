/**
 * Mode 3 Mission Config — Realistic ATC Airspace Corridors
 *
 * Coordinate system (matches backend controlled_generator.py):
 *   x = North/South offset in metres   (↑ = North)
 *   y = East/West  offset in metres    (→ = East)
 *   z = altitude in metres AGL
 *
 * Design principles:
 *   • 10 deconflicted corridors (5 N→S + 5 E→W), each with 3 drones forming a
 *     chase-train (200 m gap at 12 m/s → 16.7 s to conflict if leader pauses).
 *   • N→S corridors cruise at 60 m; E→W corridors cruise at 115 m.
 *     Vertical separation = 55 m > 15 m threshold → no conflict at crossings.
 *   • Each drone has a realistic 4-waypoint profile:
 *       [0]  Ground start (staggered by 200 m along route per train position)
 *       [1]  Climb-out   (same XY, target cruise altitude)
 *       [2]  Mid-route   (slight lateral offset of ±30 m — "navigation waypoint")
 *       [3]  Destination (far end of corridor, same cruise altitude)
 *   • ATC can pause any drone via the DroneControlPanel.  The next drone in the
 *     same corridor will reach the paused leader in ≈16-17 s and trigger
 *     a CRITICAL conflict alert.
 */

const VELOCITY = 12;       // m/s  — realistic delivery-class UAV
const STAGGER = 150;      // m    — gap: 150m / 12m/s = 12.5s to conflict when leader pauses
const ALT_NS = 60;       // m    — N→S corridors cruise altitude
const ALT_EW = 115;      // m    — E→W corridors cruise altitude
const DEST_NS = 3200;     // m    — northern/southern end of N→S corridor
const DEST_EW = 3200;     // m    — eastern end of E→W corridor

// N→S corridor definitions: [East offset, lateral mid-wobble]
// Five corridors spaced 500 m apart East-West
const NS_CORRIDORS: [number, number][] = [
    [150, 30],
    [650, -30],
    [1150, 30],
    [1650, -30],
    [2150, 30],
];

// E→W corridor definitions: [North offset, lateral mid-wobble]
// Five corridors spaced 400 m apart North-South
const EW_CORRIDORS: [number, number][] = [
    [250, 20],
    [650, -20],
    [1050, 20],
    [1450, -20],
    [1850, 20],
];

const generate30DroneMission = (): Record<string, any> => {
    const drones: Record<string, any> = {};
    let droneNum = 1;

    // ── Group A: 5 N→S corridors × 3 drones ──────────────────────────────
    // All drones in a corridor travel North (x increases).
    // Drone 0 leads; Drone 1 starts 200 m south; Drone 2 starts 400 m south.
    // ─────────────────────────────────────────────────────────────────────
    for (const [eastY, wobble] of NS_CORRIDORS) {
        for (let train = 0; train < 3; train++) {
            const startX = train * STAGGER;     // 0 m, 200 m, 400 m south
            const midX = DEST_NS / 2;

            drones[`Drone_${droneNum++}`] = {
                velocity: VELOCITY,
                waypoints: [
                    { x: startX, y: eastY, z: 0 },  // Ground
                    { x: startX, y: eastY, z: ALT_NS },  // Climb
                    { x: midX, y: eastY + wobble, z: ALT_NS },  // Nav waypoint
                    { x: DEST_NS, y: eastY, z: ALT_NS },  // Destination
                ],
            };
        }
    }

    // ── Group B: 5 E→W corridors × 3 drones ──────────────────────────────
    // All drones travel East (y increases).
    // ─────────────────────────────────────────────────────────────────────
    for (const [northX, wobble] of EW_CORRIDORS) {
        for (let train = 0; train < 3; train++) {
            const startY = train * STAGGER;     // 0 m, 200 m, 400 m west
            const midY = DEST_EW / 2;

            drones[`Drone_${droneNum++}`] = {
                velocity: VELOCITY,
                waypoints: [
                    { x: northX, y: startY, z: 0 },  // Ground
                    { x: northX, y: startY, z: ALT_EW },  // Climb
                    { x: northX + wobble, y: midY, z: ALT_EW },  // Nav waypoint
                    { x: northX, y: DEST_EW, z: ALT_EW },  // Destination
                ],
            };
        }
    }

    return drones;
};

export const MOCK_MISSIONS_MODE3 = [
    {
        name: "30-Drone ATC Corridor Operations",
        drones: generate30DroneMission(),
    },
];
