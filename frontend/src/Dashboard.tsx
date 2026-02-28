import { useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, TextLayer, LineLayer, GridCellLayer, PathLayer } from '@deck.gl/layers';
import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import { MapView, LinearInterpolator } from '@deck.gl/core';
import { useCameraOrbit } from './hooks/useCameraOrbit';
import { useSimWebSocket } from './hooks/useSimWebSocket';
import { SystemHealthBadge } from './components/SystemHealthBadge';
import { DroneControlPanel } from './components/DroneControlPanel';

const DRONE_MODEL = 'https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/CesiumDrone/CesiumDrone.glb';

const mathWorker = new Worker(new URL('./workers/mathWorker.ts', import.meta.url), { type: 'module' });

const INITIAL_VIEW_STATE = {
    longitude: 0,
    latitude: 0,
    zoom: 16,
    pitch: 45,
    bearing: 0
};

import { MOCK_MISSIONS } from './config/MockMissions';
import { MOCK_MISSIONS_MODE3 } from './config/MockMissionsMode3';
import { ModeSelector } from './components/ModeSelector';
import { CameraControls } from './components/CameraControls';
import { Mode2Panel } from './components/Mode2Panel';
import { useReplayBuffer } from './hooks/useReplayBuffer';
import { IncidentReplayPanel, ReplayTriggerButton } from './components/IncidentReplayPanel';

export default function Dashboard() {
    // --- WebSocket + Telemetry (extracted to hooks/useSimWebSocket.ts) ---
    const {
        telemetry, setTelemetry,
        conflicts, setConflicts,
        flightPlans, setFlightPlans,
        conflictCheckMs,
        droneCount,
        pausedDrones,
        lastMsgAt,
    } = useSimWebSocket();


    // --- Replay Buffer (20s rolling history) ---
    const {
        isReplaying, replayCursor, setReplayCursor,
        replaySnapshot, activateReplay, exitReplay,
        bufferDurationSec, cursorAgeSec, allSnapshots,
    } = useReplayBuffer(telemetry, conflicts);

    // When replaying, use snapshot data instead of live feeds
    const activeTelemetry = isReplaying ? (replaySnapshot?.telemetry ?? telemetry) : telemetry;
    const activeConflicts = isReplaying ? (replaySnapshot?.conflicts ?? conflicts) : conflicts;

    // Remaining local UI state
    const [timeOffset, setTimeOffset] = useState(0);
    const [predictedPositions, setPredictedPositions] = useState<Float32Array | null>(null);
    const [hoveredRA, setHoveredRA] = useState<any>(null);
    const [isPlaying, setIsPlaying] = useState(true);

    const [hoveredDroneId, setHoveredDroneId] = useState<string | null>(null);
    const [activeMode, setActiveMode] = useState<1 | 2 | 3>(3);
    const [isSplitScreen, setIsSplitScreen] = useState(false);
    const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
    const [multiViewState, setMultiViewState] = useState<any>({
        'xy-plane': { ...INITIAL_VIEW_STATE, pitch: 0, bearing: 0 },
        'yz-plane': { ...INITIAL_VIEW_STATE, pitch: 89.9, bearing: 90 },
        'xz-plane': { ...INITIAL_VIEW_STATE, pitch: 89.9, bearing: 0 }
    });

    // --- Camera Orbit (extracted to hooks/useCameraOrbit.ts) ---
    useCameraOrbit(isSplitScreen, setViewState);

    const [mode1Segments, setMode1Segments] = useState<any[]>([]);
    const [mode1OriginalSegments, setMode1OriginalSegments] = useState<any[]>([]); // To store pre-resolution ghost paths
    const [mode1Report, setMode1Report] = useState<any>(null);
    const [isMode1Playing, setIsMode1Playing] = useState(false);
    const [mode2Trace, setMode2Trace] = useState<string>("");
    const [mode3Status, setMode3Status] = useState<any>(null);
    const [isApproved, setIsApproved] = useState(false);
    const [m2Form, setM2Form] = useState({
        p0_A: [0, 0, 50], v_A: [5, 5, 0],
        p0_B: [0, 100, 50], v_B: [5, -5, 0],
        t_start: 0, t_end: 20
    });

    const [activeMissionIdx, setActiveMissionIdx] = useState(0);

    const [bogieCount, setBogieCount] = useState(25);
    const [m1Input, setM1Input] = useState(JSON.stringify(MOCK_MISSIONS[0], null, 2));

    const [landingConflicts, setLandingConflicts] = useState<any[]>([]);

    useEffect(() => {
        try {
            const parsedData = JSON.parse(m1Input);
            const droneIds = Object.keys(parsedData);
            const conflicts = [];

            for (let i = 0; i < droneIds.length; i++) {
                for (let j = i + 1; j < droneIds.length; j++) {
                    const d1 = parsedData[droneIds[i]];
                    const d2 = parsedData[droneIds[j]];

                    if (d1.waypoints && d2.waypoints && d1.waypoints.length > 0 && d2.waypoints.length > 0) {
                        const w1 = d1.waypoints[d1.waypoints.length - 1];
                        const w2 = d2.waypoints[d2.waypoints.length - 1];

                        const dx = w1.x - w2.x;
                        const dy = w1.y - w2.y;
                        const dz = (w1.z || 0) - (w2.z || 0);

                        const distXY = Math.sqrt(dx * dx + dy * dy);
                        const distZ = Math.abs(dz);

                        if (distXY < 35.0 && distZ < 15.0) {
                            conflicts.push({
                                d1: droneIds[i],
                                d2: droneIds[j],
                                distXY
                            });
                        }
                    }
                }
            }
            setLandingConflicts(conflicts);
        } catch (e) {
            setLandingConflicts([]);
        }
    }, [m1Input]);

    const autoCorrectLandingConflicts = () => {
        try {
            const parsedData = JSON.parse(m1Input);
            const droneIds = Object.keys(parsedData);
            let changesMade = false;

            for (let i = 0; i < droneIds.length; i++) {
                for (let j = i + 1; j < droneIds.length; j++) {
                    const d1 = parsedData[droneIds[i]];
                    const d2 = parsedData[droneIds[j]];

                    if (d1.waypoints && d2.waypoints && d1.waypoints.length > 0 && d2.waypoints.length > 0) {
                        const wpList1 = d1.waypoints;
                        const wpList2 = d2.waypoints;
                        let w1 = wpList1[wpList1.length - 1];
                        let w2 = wpList2[wpList2.length - 1];

                        const dx = w1.x - w2.x;
                        const dy = w1.y - w2.y;
                        const dz = (w1.z || 0) - (w2.z || 0);

                        const distXY = Math.sqrt(dx * dx + dy * dy);
                        const distZ = Math.abs(dz);

                        if (distXY < 35.0 && distZ < 15.0) {
                            let pushX = 45.0, pushY = 0;

                            if (wpList2.length > 1) {
                                const prev2 = wpList2[wpList2.length - 2];
                                let v2x = w2.x - prev2.x;
                                let v2y = w2.y - prev2.y;
                                const v2len = Math.sqrt(v2x * v2x + v2y * v2y) || 1;
                                v2x /= v2len; v2y /= v2len;

                                let rx = w2.x - w1.x;
                                let ry = w2.y - w1.y;
                                let rlen = Math.sqrt(rx * rx + ry * ry);
                                if (rlen < 0.001) { rx = v2x; ry = v2y; rlen = 1; }
                                rx /= rlen; ry /= rlen;

                                const rightX = v2y, rightY = -v2x;
                                const leftX = -v2y, leftY = v2x;
                                const dotRight = rx * rightX + ry * rightY;
                                const dotLeft = rx * leftX + ry * leftY;
                                const dodgeX = dotRight > dotLeft ? rightX : leftX;
                                const dodgeY = dotRight > dotLeft ? rightY : leftY;
                                const dotForward = rx * v2x + ry * v2y;

                                const osx = rx * 0.4 + dodgeX * 1.2 + (dotForward > 0 ? v2x : 0);
                                const osy = ry * 0.4 + dodgeY * 1.2 + (dotForward > 0 ? v2y : 0);
                                const optLen = Math.sqrt(osx * osx + osy * osy);
                                pushX = (osx / optLen) * 45.0;
                                pushY = (osy / optLen) * 45.0;
                            } else if (distXY > 0.001) {
                                pushX = -(dx / distXY) * 45.0;
                                pushY = -(dy / distXY) * 45.0;
                            }

                            w2.x += pushX;
                            w2.y += pushY;
                            changesMade = true;
                        }
                    }
                }
            }

            if (changesMade) {
                setM1Input(JSON.stringify(parsedData, null, 2));
            }
        } catch (e) { }
    };


    // --- Trajectory system ---
    // useRef for bogie trails — avoids extra re-renders since layers re-run on every telemetry tick anyway
    const bogieTrailRef = useRef<Map<string, Array<[number, number, number]>>>(new Map());
    const MAX_TRAIL_PTS = 80; // ~40s of 500ms ticks per bogie

    // Accumulate bogie breadcrumbs on every telemetry update (O(bogies), ref mutation = no re-render)
    useEffect(() => {
        const trailMap = bogieTrailRef.current;
        telemetry.forEach((d: any) => {
            if (d.type !== 'bogie') return;
            const pos: [number, number, number] = [d.y / 111000.0, d.x / 111000.0, d.z || 50];
            if (!trailMap.has(d.id)) trailMap.set(d.id, []);
            const trail = trailMap.get(d.id)!;
            // Only append if moved more than 1m to avoid duplicate stuttering points
            const last = trail[trail.length - 1];
            if (!last || Math.hypot(pos[0] - last[0], pos[1] - last[1]) > 0.000009) {
                trail.push(pos);
                if (trail.length > MAX_TRAIL_PTS) trail.shift();
            }
        });
        // Prune departed bogies
        for (const id of trailMap.keys()) {
            if (!telemetry.some((d: any) => d.id === id)) trailMap.delete(id);
        }
    }, [telemetry]);

    // Controlled drone paths — only when approved, split per-drone into covered + future
    // O(launchedCount × 4 waypoints) per telemetry tick = negligible
    const { coveredPaths, futurePaths } = useMemo(() => {
        if (!isApproved) return { coveredPaths: [], futurePaths: [] };

        const missionDrones = MOCK_MISSIONS_MODE3[0].drones;
        const launched = telemetry.filter((d: any) => d.type === 'controlled');
        const coveredPaths: Array<{ id: string; path: [number, number, number][] }> = [];
        const futurePaths: Array<{ id: string; path: [number, number, number][] }> = [];

        launched.forEach((live: any) => {
            const drone = missionDrones[live.id];
            if (!drone) return;
            const wps: { x: number; y: number; z: number }[] = drone.waypoints;

            // ── Segment-projection: find which XY segment drone is currently on ──
            // Nearest-waypoint fails because wp0 and wp1 share the SAME XY (vertical
            // takeoff), so distance checks always return wp0 as nearest.
            // Project curXY onto each segment → segment with min perpendicular dist
            // is the active segment.
            const curX = live.x, curY = live.y;
            let bestSegIdx = 0;
            let minProjDist2 = Infinity;
            for (let i = 0; i < wps.length - 1; i++) {
                const ax = wps[i].x, ay = wps[i].y;
                const bx = wps[i + 1].x, by = wps[i + 1].y;
                const dx = bx - ax, dy = by - ay;
                const len2 = dx * dx + dy * dy;
                if (len2 < 1) continue; // skip vertical takeoff segment (same XY)
                const t = Math.max(0, Math.min(1, ((curX - ax) * dx + (curY - ay) * dy) / len2));
                const d2 = (curX - (ax + t * dx)) ** 2 + (curY - (ay + t * dy)) ** 2;
                if (d2 < minProjDist2) { minProjDist2 = d2; bestSegIdx = i; }
            }

            const toCoord = (wp: { x: number; y: number; z: number }): [number, number, number] =>
                [wp.y / 111000.0, wp.x / 111000.0, wp.z];
            const curCoord: [number, number, number] = [live.y / 111000.0, live.x / 111000.0, live.z || 50];

            // Covered: all wps up to & including segment start, then current pos
            const covPath = [...wps.slice(0, bestSegIdx + 1).map(toCoord), curCoord];
            if (covPath.length >= 2) coveredPaths.push({ id: live.id, path: covPath });

            // Future: current pos → remaining wps from segment END onward
            const futPath = [curCoord, ...wps.slice(bestSegIdx + 1).map(toCoord)];
            if (futPath.length >= 2) futurePaths.push({ id: live.id, path: futPath });
        });

        return { coveredPaths, futurePaths };
    }, [telemetry, isApproved]);

    // Poll Mode 3 status
    useEffect(() => {
        if (activeMode !== 3) return;
        const interval = setInterval(async () => {
            try {
                const res = await fetch('http://localhost:8000/api/mode3/status');
                const data = await res.json();
                setMode3Status(data);
            } catch (e) { }
        }, 1500);
        return () => clearInterval(interval);
    }, [activeMode]);


    useEffect(() => {
        mathWorker.onmessage = (e) => {
            if (e.data.type === 'FUTURE_CALCULATED') {
                setPredictedPositions(e.data.payload);
            }
        };
        if (timeOffset !== 0) {
            mathWorker.postMessage({
                type: 'SCRUB_FUTURE',
                payload: { timeOffset, activeDrones: telemetry }
            });
        } else {
            setPredictedPositions(null);
        }
    }, [timeOffset, telemetry]);

    useEffect(() => {
        let interval: any;
        if (activeMode === 1 && isMode1Playing && mode1Segments.length > 0) {
            const maxT = Math.max(...mode1Segments.map((s: any) => s.t_end)) + 10;
            interval = setInterval(() => {
                setTimeOffset(prev => {
                    if (prev >= maxT) {
                        setIsMode1Playing(false);
                        return prev;
                    }
                    return prev + 0.1; // Smooth scrubbing speed
                });
            }, 30); // ~30fps
        }
        return () => clearInterval(interval);
    }, [activeMode, isMode1Playing, mode1Segments]);

    const getCoordinates = (d: any, index: number): [number, number, number] => {
        let x = d.x;
        let y = d.y;
        let z = d.z || 50;
        if (predictedPositions && timeOffset !== 0) {
            x = predictedPositions[index * 3];
            y = predictedPositions[index * 3 + 1];
            z = predictedPositions[index * 3 + 2];
        }
        return [y / 111000.0, x / 111000.0, z];
    };

    const futureWaypoints: any[] = [];
    if (activeMode === 3) {
        flightPlans.forEach((fp: any) => {
            for (let t = 10; t <= 60; t += 10) {
                futureWaypoints.push({
                    type: fp.type,
                    time: t,
                    coord: [(fp.y + (fp.vy * t)) / 111000.0, (fp.x + (fp.vx * t)) / 111000.0, fp.z + (fp.vz * t)]
                });
            }
        });
    }

    const gridSize = 250; // 250m blocks (4 per km)
    const gridData = [];

    let centerLat = 0;
    let centerLon = 0;

    if (activeMode === 1) {
        if (mode1Segments.length > 0) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            mode1Segments.forEach((s: any) => {
                minX = Math.min(minX, s.A0[0], s.A1[0]);
                maxX = Math.max(maxX, s.A0[0], s.A1[0]);
                minY = Math.min(minY, s.A0[1], s.A1[1]);
                maxY = Math.max(maxY, s.A0[1], s.A1[1]);
            });
            centerLat = (minX + maxX) / 2;
            centerLon = (minY + maxY) / 2;
        } else {
            try {
                const parsed = JSON.parse(m1Input);
                const firstDroneKey = Object.keys(parsed)[0];
                if (firstDroneKey && parsed[firstDroneKey].waypoints.length > 0) {
                    const wp = parsed[firstDroneKey].waypoints[0];
                    centerLat = wp.x;
                    centerLon = wp.y;
                }
            } catch (e) { }
        }
    }

    for (let i = -40; i <= 40; i++) {
        for (let j = -40; j <= 40; j++) {
            gridData.push({
                position: [(centerLon + i * gridSize) / 111000.0, (centerLat + j * gridSize) / 111000.0],
                size: gridSize / 111000.0
            });
        }
    }

    const layers: any[] = [
        new GridCellLayer({
            id: 'ground-grid',
            data: gridData,
            getPosition: (d: any) => d.position,
            cellSize: gridSize,
            getElevation: 0,
            getFillColor: [255, 255, 255, 5],
            getLineColor: [255, 255, 255, 30],
            extruded: false,
            stroked: true,
            lineWidthMinPixels: 1
        })
    ];

    if (activeMode === 3) {
        layers.push(
            new LineLayer({
                id: 'flight-paths',
                data: flightPlans,
                getSourcePosition: (d: any) => [(d.y) / 111000.0, (d.x) / 111000.0, d.z],
                getTargetPosition: (d: any) => [(d.y + (d.vy * 60)) / 111000.0, (d.x + (d.vx * 60)) / 111000.0, d.z + ((d.vz || 0) * 60)],
                getColor: (d: any) => d.type === 'bogie' ? [239, 68, 68, 100] : [59, 130, 246, 100],
                getWidth: 2
            }),
            new LineLayer({
                id: 'altitude-drop-lines',
                data: telemetry,
                getSourcePosition: (d: any, { index }) => getCoordinates(d, index),
                getTargetPosition: (d: any, { index }) => {
                    const c = getCoordinates(d, index);
                    return [c[0], c[1], 0]; // Ground reference
                },
                getColor: [255, 255, 255, 80],
                getWidth: 1
            }),
            new ScatterplotLayer({
                id: 'future-waypoint-dots',
                data: futureWaypoints,
                getPosition: (d: any) => d.coord,
                getRadius: 8,
                getFillColor: (d: any) => d.type === 'bogie' ? [239, 68, 68, 200] : [59, 130, 246, 200]
            }),
            new TextLayer({
                id: 'future-waypoint-labels',
                data: futureWaypoints,
                getPosition: (d: any) => d.coord,
                getText: (d: any) => `T+${d.time}s`,
                getSize: 10,
                getColor: [255, 255, 255, 200],
                getPixelOffset: [0, -15]
            }),
            new LineLayer({
                id: 'bogie-target-lines',
                data: telemetry.filter((d: any) => d.type === 'bogie' && d.target_x !== undefined),
                getSourcePosition: (d: any, { index }) => getCoordinates(d, index),
                getTargetPosition: (d: any) => [(d.target_y) / 111000.0, (d.target_x) / 111000.0, d.target_z],
                getColor: [239, 68, 68, 80], // Faded red for bogie intentions
                getWidth: 2
            }),
            new ScatterplotLayer({
                id: 'bogie-target-dots',
                data: telemetry.filter((d: any) => d.type === 'bogie' && d.target_x !== undefined),
                getPosition: (d: any) => [(d.target_y) / 111000.0, (d.target_x) / 111000.0, d.target_z],
                getFillColor: [239, 68, 68, 150],
                getRadius: 10
            }),
            new LineLayer({
                id: 'conflict-indicator-lines',
                data: conflicts.map((c: any) => {
                    const idxA = telemetry.findIndex((t: any) => t.id === c.id_A);
                    const idxB = telemetry.findIndex((t: any) => t.id === c.id_B);
                    if (idxA !== -1 && idxB !== -1) {
                        return { source: telemetry[idxA], target: telemetry[idxB], severity: c.severity, idxA, idxB };
                    }
                    return null;
                }).filter(Boolean),
                getSourcePosition: (d: any) => getCoordinates(d.source, d.idxA),
                getTargetPosition: (d: any) => getCoordinates(d.target, d.idxB),
                getColor: (d: any) => d.severity === 'CRITICAL' ? [239, 68, 68, (Date.now() % 1000 > 500 ? 255 : 50)] : [245, 158, 11, 255],
                getWidth: 4
            })
        );
    }

    if (activeMode === 3) {
        layers.push(
            new ScenegraphLayer({
                id: 'drones-layer',
                data: telemetry,
                scenegraph: DRONE_MODEL,
                getPosition: (d: any, { index }) => getCoordinates(d, index),
                getColor: (d: any) => d.type === 'bogie' ? [239, 68, 68] : [59, 130, 246],
                getOrientation: (d: any) => {
                    const vx = d.target_x ? (d.target_x - d.x) : (d.vx || 0);
                    const vy = d.target_y ? (d.target_y - d.y) : (d.vy || 1);
                    const yaw = Math.atan2(vx, vy) * 180 / Math.PI;
                    return [0, -yaw, 90];
                },
                sizeScale: 3,
                _lighting: 'pbr',
                pickable: true
            }),
            new ScatterplotLayer({
                id: 'uncertainty-layer',
                data: telemetry,
                opacity: 0.2,
                stroked: true,
                filled: false,
                radiusScale: 1,
                getPosition: (d: any, { index }) => getCoordinates(d, index),
                getRadius: (d: any) => (d.uncertainty_radius || 3) * 10,
                getLineColor: (d: any) => d.type === 'bogie' ? [239, 68, 68] : [59, 130, 246],
                lineWidthMinPixels: 2,
            }),
            new TextLayer({
                id: 'labels-layer',
                data: telemetry,
                getPosition: (d: any, { index }) => {
                    const coords = getCoordinates(d, index);
                    return [coords[0], coords[1], coords[2] + 20];
                },
                getText: (d: any) => {
                    if (d.id.startsWith('Drone_')) return `D${d.id.split('_')[1].padStart(2, '0')}`;
                    if (d.id.startsWith('Bogie_')) return `B${d.id.split('_')[1].padStart(2, '0')}`;
                    return d.id;
                },
                getSize: 10,
                getColor: [255, 255, 255]
            }),

            // ── Controlled drone trajectory paths (only after ATC approves) ──
            // COVERED portion: solid, lighter — shows path already flown this session
            new PathLayer({
                id: 'path-covered',
                data: coveredPaths,
                getPath: (d) => d.path,
                getColor: (d) => d.id === hoveredDroneId
                    ? [139, 92, 246, 255]   // violet highlight on hover
                    : [99, 102, 241, 140],  // solid-ish indigo for flown path
                getWidth: (d) => d.id === hoveredDroneId ? 5 : 2,
                widthUnits: 'pixels',
                widthMinPixels: 1,
                pickable: false,
                jointRounded: true,
                updateTriggers: { getColor: hoveredDroneId, getWidth: hoveredDroneId }
            }),

            // FUTURE portion: faint, dashed — planned route ahead
            new PathLayer({
                id: 'path-future',
                data: futurePaths,
                getPath: (d) => d.path,
                getColor: (d) => d.id === hoveredDroneId
                    ? [167, 139, 250, 200]  // lighter violet on hover
                    : [99, 102, 241, 28],   // barely-there ghost for future route
                getWidth: (d) => d.id === hoveredDroneId ? 3 : 1,
                widthUnits: 'pixels',
                widthMinPixels: 1,
                pickable: false,
                jointRounded: true,
                updateTriggers: { getColor: hoveredDroneId, getWidth: hoveredDroneId }
            }),

            // ── Bogie breadcrumb trails (unknown drones — actual observed path) ──
            // Red-orange dashed trail; each bogie's trail lives in bogieTrailRef (ring-buffer)
            new PathLayer({
                id: 'path-bogie-trail',
                data: (Array.from(bogieTrailRef.current.entries()) as any[])
                    .filter((e) => e[1].length >= 2)
                    .map((e) => ({ id: e[0] as string, path: e[1] as [number, number, number][] })),
                getPath: (d) => d.path,
                getColor: (d) => d.id === hoveredDroneId
                    ? [251, 146, 60, 255]   // orange highlight on hover
                    : [239, 68, 68, 90],    // faint red for bogie breadcrumbs
                getWidth: (d) => d.id === hoveredDroneId ? 4 : 1.5,
                widthUnits: 'pixels',
                widthMinPixels: 1,
                pickable: false,
                jointRounded: true,
                updateTriggers: {
                    getColor: hoveredDroneId,
                    getWidth: hoveredDroneId,
                    // data must update every tick because bogieTrailRef.current mutates in-place
                    data: telemetry.length,
                }
            })
        );
    }

    if (activeMode === 1 && mode1Segments.length > 0) {
        layers.push(
            new LineLayer({
                id: 'mode1-paths',
                data: mode1Segments,
                getSourcePosition: (d: any) => [(d.A0[1]) / 111000.0, (d.A0[0]) / 111000.0, d.A0[2]],
                getTargetPosition: (d: any) => [(d.A1[1]) / 111000.0, (d.A1[0]) / 111000.0, d.A1[2]],
                getColor: (d: any) => d.drone_id.toLowerCase().includes('bogie') ? [239, 68, 68, 150] : [59, 130, 246, 150],
                getWidth: 3
            })
        );

        // Render active dot at max(0, timeOffset) mapping to Mode 1 time timeline
        const scrubT = Math.max(0, timeOffset);

        const uniqueDrones = Array.from(new Set(mode1Segments.map((s: any) => s.drone_id)));
        const activeDots = uniqueDrones.map(d_id => {
            const d_segs = mode1Segments.filter((s: any) => s.drone_id === d_id);
            if (d_segs.length === 0) return null;

            let targetSeg = d_segs.find((s: any) => scrubT >= s.t_start && scrubT <= s.t_end);
            let frac = 0;

            if (!targetSeg) {
                if (scrubT < d_segs[0].t_start) {
                    targetSeg = d_segs[0];
                    frac = 0;
                } else {
                    targetSeg = d_segs[d_segs.length - 1];
                    frac = 1;
                }
            } else {
                frac = (scrubT - targetSeg.t_start) / Math.max(0.0001, (targetSeg.t_end - targetSeg.t_start));
            }

            const vx = targetSeg.A1[0] - targetSeg.A0[0];
            const vy = targetSeg.A1[1] - targetSeg.A0[1];
            const yaw = Math.atan2(vx, vy) * 180 / Math.PI;

            return {
                ...targetSeg,
                coord: [
                    (targetSeg.A0[1] + frac * (targetSeg.A1[1] - targetSeg.A0[1])) / 111000.0,
                    (targetSeg.A0[0] + frac * (targetSeg.A1[0] - targetSeg.A0[0])) / 111000.0,
                    targetSeg.A0[2] + frac * (targetSeg.A1[2] - targetSeg.A0[2])
                ],
                yaw: yaw
            };
        }).filter(Boolean);

        layers.push(
            new ScenegraphLayer({
                id: 'mode1-active-dots',
                data: activeDots,
                scenegraph: DRONE_MODEL,
                getPosition: (d: any) => d.coord,
                getColor: (d: any) => d.drone_id.toLowerCase().includes('bogie') ? [239, 68, 68, 255] : [59, 130, 246, 255],
                getOrientation: (d: any) => [0, -(d.yaw || 0), 90],
                sizeScale: 3,
                _lighting: 'pbr'
            })
        );

        if (mode1OriginalSegments.length > 0) {
            const originalActiveDots = uniqueDrones.map(d_id => {
                const d_segs = mode1OriginalSegments.filter((s: any) => s.drone_id === d_id);
                if (d_segs.length === 0) return null;

                let targetSeg = d_segs.find((s: any) => scrubT >= s.t_start && scrubT <= s.t_end);
                let frac = 0;

                if (!targetSeg) {
                    if (scrubT < d_segs[0].t_start) {
                        targetSeg = d_segs[0];
                        frac = 0;
                    } else {
                        targetSeg = d_segs[d_segs.length - 1];
                        frac = 1;
                    }
                } else {
                    frac = (scrubT - targetSeg.t_start) / Math.max(0.0001, (targetSeg.t_end - targetSeg.t_start));
                }

                const vx = targetSeg.A1[0] - targetSeg.A0[0];
                const vy = targetSeg.A1[1] - targetSeg.A0[1];
                const yaw = Math.atan2(vx, vy) * 180 / Math.PI;
                return {
                    ...targetSeg,
                    coord: [
                        (targetSeg.A0[1] + frac * (targetSeg.A1[1] - targetSeg.A0[1])) / 111000.0,
                        (targetSeg.A0[0] + frac * (targetSeg.A1[0] - targetSeg.A0[0])) / 111000.0,
                        targetSeg.A0[2] + frac * (targetSeg.A1[2] - targetSeg.A0[2])
                    ],
                    yaw: yaw
                };
            }).filter(Boolean);

            layers.push(
                new ScenegraphLayer({
                    id: 'mode1-original-ghost-dots',
                    data: originalActiveDots,
                    scenegraph: DRONE_MODEL,
                    getPosition: (d: any) => d.coord,
                    getColor: [156, 163, 175, 100], // Faded grey
                    getOrientation: (d: any) => [0, -(d.yaw || 0), 90],
                    sizeScale: 3,
                    _lighting: 'pbr'
                }),
                new LineLayer({
                    id: 'mode1-shift-tethers',
                    data: activeDots.map(ad => {
                        const ghost = originalActiveDots.find(o => o.drone_id === ad.drone_id);
                        return ghost ? { source: ghost, target: ad } : null;
                    }).filter(Boolean),
                    getSourcePosition: (d: any) => d.source.coord,
                    getTargetPosition: (d: any) => d.target.coord,
                    getColor: [156, 163, 175, 150], // Light grey tether
                    getWidth: 2
                })
            );
        }

        if (mode1Report && Array.isArray(mode1Report)) {
            layers.push(
                new ScatterplotLayer({
                    id: 'mode1-conflicts',
                    data: mode1Report,
                    getPosition: (d: any) => [(d.conflict_location[1]) / 111000.0, (d.conflict_location[0]) / 111000.0, d.conflict_location[2]],
                    getRadius: 30,
                    getFillColor: [234, 179, 8, 255] // Yellow bang
                })
            );
        }

        const currentM1Conflicts: any[] = [];
        for (let i = 0; i < activeDots.length; i++) {
            for (let j = i + 1; j < activeDots.length; j++) {
                const dA = activeDots[i];
                const dB = activeDots[j];
                const dx = (dA.A0[0] + (scrubT - dA.t_start) / Math.max(0.0001, dA.t_end - dA.t_start) * (dA.A1[0] - dA.A0[0])) - (dB.A0[0] + (scrubT - dB.t_start) / Math.max(0.0001, dB.t_end - dB.t_start) * (dB.A1[0] - dB.A0[0]));
                const dy = (dA.A0[1] + (scrubT - dA.t_start) / Math.max(0.0001, dA.t_end - dA.t_start) * (dA.A1[1] - dA.A0[1])) - (dB.A0[1] + (scrubT - dB.t_start) / Math.max(0.0001, dB.t_end - dB.t_start) * (dB.A1[1] - dB.A0[1]));
                const dz = (dA.A0[2] + (scrubT - dA.t_start) / Math.max(0.0001, dA.t_end - dA.t_start) * (dA.A1[2] - dA.A0[2])) - (dB.A0[2] + (scrubT - dB.t_start) / Math.max(0.0001, dB.t_end - dB.t_start) * (dB.A1[2] - dB.A0[2]));

                const dist_xy = Math.sqrt(dx * dx + dy * dy);
                const dist_z = Math.abs(dz);

                // Pure Cylindrical Warning Block for visual feedback
                if (dist_xy < 50.0 && dist_z < 15.0) {
                    currentM1Conflicts.push({ source: dA, target: dB, dist: dist_xy });
                }
            }
        }

        if (currentM1Conflicts.length > 0) {
            layers.push(
                new LineLayer({
                    id: 'mode1-live-conflict-lines',
                    data: currentM1Conflicts,
                    getSourcePosition: (d: any) => d.source.coord,
                    getTargetPosition: (d: any) => d.target.coord,
                    getColor: [239, 68, 68, (Date.now() % 1000 > 500 ? 255 : 50)],
                    getWidth: 6
                })
            );
        }
    }

    if (hoveredRA && timeOffset === 0) {
        const ghostDrone = telemetry.find((d: any) => d.id === hoveredRA.drone);
        if (ghostDrone) {
            const dt = -hoveredRA.suggested_delay_seconds;
            const ghostCoord: [number, number, number] = [
                (ghostDrone.y + (ghostDrone.vy || 0) * dt) / 111000.0,
                (ghostDrone.x + (ghostDrone.vx || 0) * dt) / 111000.0,
                ghostDrone.z || 50
            ];

            layers.push(
                new ScatterplotLayer({
                    id: 'ghost-layer',
                    data: [{ ...ghostDrone, coord: ghostCoord }],
                    opacity: 0.5,
                    getPosition: (d: any) => d.coord,
                    getFillColor: [156, 163, 175],
                    getRadius: () => 15
                })
            );
        }
    }


    const pauseDrone = async (id: string) => {
        try { await fetch(`http://localhost:8000/api/mode3/pause?drone_id=${id}`, { method: 'POST' }); } catch (e) { }
    };
    const resumeDrone = async (id: string) => {
        try { await fetch(`http://localhost:8000/api/mode3/resume?drone_id=${id}`, { method: 'POST' }); } catch (e) { }
    };

    const togglePlay = async () => {
        try {
            const res = await fetch('http://localhost:8000/api/sim/toggle', { method: 'POST' });
            const data = await res.json();
            setIsPlaying(data.playing);
        } catch (e) { console.error(e) }
    };

    // Smooth animated camera transition (used by CameraControls buttons)
    const smoothSetViewState = (updater: (v: any) => any) => {
        setViewState((prev: any) => {
            const next = updater(prev);
            return {
                ...next,
                transitionDuration: 350,
                transitionInterpolator: new LinearInterpolator(['bearing', 'pitch']),
            };
        });
    };

    const handleReset = async () => {
        try {
            await fetch('http://localhost:8000/api/mode3/clear', { method: 'POST' });
            setTelemetry([]);
            setConflicts([]);
            setFlightPlans([]);
            setTimeOffset(0);
            setIsApproved(false);
            setMode3Status(null);
            setIsPlaying(false);  // Auto-pause after reset
        } catch (e) { console.error(e); }
    };



    const runMode1 = async (overrideInput?: string) => {
        try {
            const parsedData = JSON.parse(overrideInput || m1Input);
            const res = await fetch('http://localhost:8000/api/mode1/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(parsedData)
            });
            const data = await res.json();
            setMode1Report(data.report || data.error);
            setMode1Segments(data.segments || []);
            setMode1OriginalSegments([]);
            setTimeOffset(0);
        } catch (e: any) { setMode1Report({ error: "Invalid JSON Format", details: e.message }) }
    };

    const autoResolveMode1 = async () => {
        try {
            setMode1OriginalSegments([...mode1Segments]); // Snapshot current bad paths as ghost origins
            const parsedData = JSON.parse(m1Input);
            const res = await fetch('http://localhost:8000/api/mode1/resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(parsedData)
            });
            const data = await res.json();
            setMode1Report(data.resolutions || data.error);
            setMode1Segments(data.segments || []);
            setTimeOffset(0);
            setIsMode1Playing(true);
        } catch (e: any) { setMode1Report({ error: "Invalid JSON Format", details: e.message }) }
    };

    const autoResolveSpatialMode1 = async () => {
        try {
            setMode1OriginalSegments([...mode1Segments]); // Snapshot current bad paths as ghost origins
            const parsedData = JSON.parse(m1Input);
            const res = await fetch('http://localhost:8000/api/mode1/resolve_spatial', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(parsedData)
            });
            const data = await res.json();
            setMode1Report(data.resolutions || data.error);
            setMode1Segments(data.segments || []);
            setTimeOffset(0);
            setIsMode1Playing(true);
        } catch (e: any) { setMode1Report({ error: "Invalid JSON Format", details: e.message }) }
    };

    const runMode2 = async () => {
        setMode2Trace("Calculating closed-form CPA partial derivatives...");
        try {
            const res = await fetch('http://localhost:8000/api/mode2/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(m2Form)
            });
            const data = await res.json();
            setMode2Trace(data.trace || data.error);
        } catch (e) { console.error(e) }
    };

    const getCenterViewState = (baseState: any) => {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        if (activeMode === 1) {
            if (mode1Segments.length > 0) {
                mode1Segments.forEach((s: any) => {
                    minX = Math.min(minX, s.A0[0], s.A1[0]);
                    maxX = Math.max(maxX, s.A0[0], s.A1[0]);
                    minY = Math.min(minY, s.A0[1], s.A1[1]);
                    maxY = Math.max(maxY, s.A0[1], s.A1[1]);
                });
            } else {
                try {
                    const parsed = JSON.parse(m1Input);
                    Object.values(parsed).forEach((drone: any) => {
                        drone.waypoints?.forEach((wp: any) => {
                            minX = Math.min(minX, wp.x);
                            maxX = Math.max(maxX, wp.x);
                            minY = Math.min(minY, wp.y);
                            maxY = Math.max(maxY, wp.y);
                        });
                    });
                } catch (e) { }
            }
        }

        if (minX !== Infinity) {
            const dx = Math.max(10, maxX - minX);
            const dy = Math.max(10, maxY - minY);
            // Empirical zoom formula: fit largest axis into view
            let rawZoom = 15.5 - Math.log2(Math.max(dx, dy) / 200);
            rawZoom = Math.min(18, Math.max(10, rawZoom)); // Clamp zoom

            return {
                ...baseState,
                longitude: ((minY + maxY) / 2) / 111000.0,
                latitude: ((minX + maxX) / 2) / 111000.0,
                zoom: rawZoom
            };
        }

        return baseState;
    };

    const handleViewStateChange = ({ viewId, viewState: newViewState }: any) => {
        if (isSplitScreen && viewId) {
            setMultiViewState((prev: any) => ({
                ...prev,
                [viewId]: newViewState
            }));
        } else {
            setViewState(newViewState);
        }
    };

    return (
        <div className="app-container">
            <DeckGL
                style={{ backgroundColor: '#000' }}
                views={isSplitScreen ? [
                    new MapView({ id: 'xy-plane', x: '0%', y: '0%', width: '23.3%', height: '100%', controller: true }),
                    new MapView({ id: 'yz-plane', x: '23.3%', y: '0%', width: '23.3%', height: '100%', controller: true }),
                    new MapView({ id: 'xz-plane', x: '46.6%', y: '0%', width: '23.4%', height: '100%', controller: true })
                ] : [
                    new MapView({ id: 'main-view', x: '0%', y: '0%', width: '100%', height: '100%', controller: true })
                ]}
                viewState={isSplitScreen ? {
                    'xy-plane': { ...multiViewState['xy-plane'], maxPitch: 90 } as any,
                    'yz-plane': { ...multiViewState['yz-plane'], maxPitch: 90 } as any,
                    'xz-plane': { ...multiViewState['xz-plane'], maxPitch: 90 } as any
                } : {
                    'main-view': { ...viewState, maxPitch: 180 } as any
                }}
                onViewStateChange={handleViewStateChange}
                onHover={({ object, layer }: any) => {
                    if (!object) { setHoveredDroneId(null); return; }
                    // object from ScenegraphLayer is the telemetry entry
                    if (layer?.id === 'drones-layer' && object.type === 'controlled') {
                        setHoveredDroneId(object.id);
                    } else {
                        setHoveredDroneId(null);
                    }
                }}
                getCursor={({ isHovering }) => isHovering ? 'crosshair' : 'default'}
                layers={layers}
            />

            {
                isSplitScreen && (
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'grid', gridTemplateColumns: '23.3% 23.3% 23.4% 30%', pointerEvents: 'none', zIndex: 5 }}>
                        <div style={{ position: 'relative', borderRight: '1px solid rgba(255,255,255,0.1)', height: '100%' }}>
                            <div style={{ position: 'absolute', top: 20, left: 20, background: 'rgba(10,15,25,0.85)', padding: '8px 16px', color: '#fff', borderRadius: '30px', border: '1px solid rgba(74, 222, 128, 0.5)', fontSize: '0.85rem', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>🗺️ Top-Down Horizon (XY)</div>
                        </div>
                        <div style={{ position: 'relative', borderRight: '1px solid rgba(255,255,255,0.1)', height: '100%' }}>
                            <div style={{ position: 'absolute', top: 20, left: 20, background: 'rgba(10,15,25,0.85)', padding: '8px 16px', color: '#fff', borderRadius: '30px', border: '1px solid rgba(96, 165, 250, 0.5)', fontSize: '0.85rem', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>⛰️ Altitude Side-View (YZ)</div>
                        </div>
                        <div style={{ position: 'relative', borderRight: '1px solid rgba(255,255,255,0.1)', height: '100%' }}>
                            <div style={{ position: 'absolute', top: 20, left: 20, background: 'rgba(10,15,25,0.85)', padding: '8px 16px', color: '#fff', borderRadius: '30px', border: '1px solid rgba(168, 85, 247, 0.5)', fontSize: '0.85rem', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>🧭 Altitude Front-View (XZ)</div>
                        </div>
                        <div style={{ position: 'relative', height: '100%' }}>
                        </div>
                    </div>
                )
            }

            <ModeSelector
                activeMode={activeMode}
                setActiveMode={setActiveMode}
                setViewState={setViewState}
                initialViewState={INITIAL_VIEW_STATE}
            />

            <CameraControls
                isSplitScreen={isSplitScreen}
                setIsSplitScreen={setIsSplitScreen}
                setMultiViewState={setMultiViewState}
                getCenterViewState={getCenterViewState}
                initialViewState={INITIAL_VIEW_STATE}
                viewState={viewState}
                setViewState={setViewState}
                smoothSetViewState={smoothSetViewState}
            >
                {/* ── Mode 1 timeline ── */}
                {activeMode === 1 && mode1Segments.length > 0 && (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <button
                                onClick={() => setIsMode1Playing(!isMode1Playing)}
                                style={{ padding: '4px 12px', background: isMode1Playing ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)', border: `1px solid ${isMode1Playing ? '#ef4444' : '#22c55e'}`, color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.75rem' }}
                            >
                                {isMode1Playing ? 'PAUSE' : 'PLAY'}
                            </button>
                            <div className="timeline-header" style={{ flex: 1 }}>
                                <span>T = 0s</span>
                                <span style={{ color: 'var(--accent)' }}>T = {timeOffset.toFixed(1)}s</span>
                                <span>Future</span>
                            </div>
                        </div>
                        <div style={{ position: 'relative', width: '100%' }}>
                            <input type="range" className="timeline-slider"
                                min="0" max={Math.max(...mode1Segments.map((s: any) => s.t_end)) + 10}
                                step="0.1" value={timeOffset}
                                onChange={e => { setTimeOffset(parseFloat(e.target.value)); setIsMode1Playing(false); }}
                                style={{ width: '100%' }}
                            />
                            {mode1Report && Array.isArray(mode1Report) && mode1Report.map((c: any, i: number) => {
                                const leftPerc = (c.exact_conflict_time / (Math.max(...mode1Segments.map((s: any) => s.t_end)) + 10)) * 100;
                                return <div key={`tick-${i}`} className="conflict-ticker" style={{ left: `${leftPerc}%`, background: '#eab308' }} title={`Conflict at T+${c.exact_conflict_time.toFixed(1)}s`} />;
                            })}
                        </div>
                    </>
                )}

                {/* ── Mode 3 timeline ── */}
                {activeMode === 3 && (
                    <>
                        <div className="timeline-header">
                            <span>T - 20s (Past)</span>
                            <span style={{ color: isReplaying ? '#a5b4fc' : 'var(--accent)' }}>
                                {isReplaying ? `⏺ ${cursorAgeSec}s ago` : `T = ${timeOffset > 0 ? '+' : ''}${timeOffset.toFixed(1)}s`}
                            </span>
                            <span>T + 60s (Future)</span>
                        </div>
                        <div style={{ position: 'relative', width: '100%' }}>
                            <input type="range" className="timeline-slider"
                                min="-20" max="60" step="0.5" value={timeOffset}
                                onChange={e => setTimeOffset(parseFloat(e.target.value))}
                                style={{ width: '100%', accentColor: isReplaying ? '#6366f1' : undefined }}
                            />
                            {activeConflicts.map((c: any, i: number) => {
                                if (c.t_cpa > 0 && c.t_cpa <= 60) {
                                    const leftPerc = ((c.t_cpa + 20) / 80) * 100;
                                    return <div key={`tick-${i}`} className="conflict-ticker" style={{ left: `${leftPerc}%` }} title={`Conflict at T+${c.t_cpa.toFixed(1)}s`} />;
                                }
                                return null;
                            })}
                        </div>
                    </>
                )}
            </CameraControls>

            {
                activeMode === 1 && (
                    <>
                        <div className="glass-panel" style={{ position: 'absolute', top: 0, right: 0, width: '30%', height: '100%', padding: '20px', overflowY: 'auto', zIndex: 10, display: 'flex', flexDirection: 'column', borderRadius: 0, borderTop: 'none', borderRight: 'none', borderBottom: 'none' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <h2 style={{ color: 'var(--accent)', margin: 0 }}>Mode 1: 4D Checker</h2>
                                <button
                                    onClick={() => {
                                        const nextIdx = (activeMissionIdx + 1) % MOCK_MISSIONS.length;
                                        const nextString = JSON.stringify(MOCK_MISSIONS[nextIdx], null, 2);
                                        setActiveMissionIdx(nextIdx);
                                        setM1Input(nextString);

                                        // Auto-Simulate as requested
                                        runMode1(nextString);
                                        setTimeOffset(0);
                                    }}
                                    style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.2rem' }}
                                    title={`Cycle Mock Missions (${activeMissionIdx + 1}/${MOCK_MISSIONS.length})`}
                                >
                                    🔄
                                </button>
                            </div>
                            <p style={{ color: 'var(--text-muted)' }}>
                                <strong>What it does:</strong> This mode visually animates overlapping schedules in 4D. Define start/end times and paths manually!
                            </p>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Edit the flight plan data below (JSON format) and run the check!</p>
                            <textarea
                                value={m1Input}
                                onChange={(e) => setM1Input(e.target.value)}
                                style={{ flex: 1, minHeight: '300px', background: 'rgba(5, 5, 5, 0.8)', color: '#a78bfa', border: '1px solid rgba(255,255,255,0.1)', padding: '15px', fontFamily: '"Fira Code", "Courier New", Courier, monospace', borderRadius: '8px', fontSize: '0.85rem', outline: 'none', lineHeight: '1.5', marginBottom: '15px' }}
                                spellCheck={false}
                            />

                            {landingConflicts.length > 0 && (
                                <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '15px', borderRadius: '4px', border: '1px solid #ef4444', marginBottom: '15px', boxShadow: '0 0 10px rgba(239, 68, 68, 0.3)' }}>
                                    <h3 style={{ color: '#ef4444', margin: '0 0 10px 0', fontSize: '1rem' }}>⚠️ LANDING CONFLICT DETECTED</h3>
                                    <p style={{ color: '#fff', fontSize: '0.85rem', margin: '0 0 10px 0' }}>
                                        Drones <strong>{landingConflicts.map(c => `${c.d1} & ${c.d2}`).join(', ')}</strong> are scheduled to land at coordinates that are critically close ({landingConflicts[0].distXY.toFixed(1)}m).
                                        This will cause a mid-air stalemate.
                                    </p>
                                    <button
                                        onClick={autoCorrectLandingConflicts}
                                        style={{ width: '100%', padding: '10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
                                        onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                                        onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                    >
                                        AUTO-CORRECT LANDING POSITIONS
                                    </button>
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: '10px', margin: '20px 0 10px 0' }}>
                                <button onClick={() => { runMode1(); setIsMode1Playing(false); }} style={{ flex: 1, padding: '12px', background: 'var(--bg-panel)', color: '#fff', fontWeight: 'bold', border: '1px solid var(--accent)', borderRadius: '4px', cursor: 'pointer' }}>VALIDATE PATHS</button>
                                <button onClick={() => { runMode1(); setIsMode1Playing(true); }} style={{ flex: 1, padding: '12px', background: 'var(--accent)', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>PLAY SIMULATION</button>
                            </div>
                            {mode1Report && Array.isArray(mode1Report) && mode1Report.length > 0 && (
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                                    <button onClick={autoResolveMode1} style={{ flex: 1, padding: '12px', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', fontWeight: 'bold', border: '1px solid #ef4444', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 0 10px rgba(239, 68, 68, 0.3)' }}>
                                        ⏱️ TIME-SHIFT DELAY
                                    </button>
                                    <button onClick={autoResolveSpatialMode1} style={{ flex: 1, padding: '12px', background: 'rgba(168, 85, 247, 0.2)', color: '#a855f7', fontWeight: 'bold', border: '1px solid #a855f7', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 0 10px rgba(168, 85, 247, 0.3)' }}>
                                        🧲 TACTICAL APF DODGE
                                    </button>
                                </div>
                            )}
                            {mode1Report && (
                                <pre style={{ background: 'rgba(0,0,0,0.7)', padding: '15px', color: mode1Report.error ? '#ef4444' : '#a78bfa', borderRadius: '4px', overflowX: 'auto', border: '1px solid #4ade80' }}>
                                    {JSON.stringify(mode1Report, null, 2)}
                                </pre>
                            )}
                        </div>

                    </>
                )
            }

            {
                activeMode === 2 && (
                    <Mode2Panel
                        runMode2={runMode2}
                        m2Form={m2Form}
                        setM2Form={setM2Form}
                        mode2Trace={mode2Trace}
                    />
                )
            }
            {
                activeMode === 3 && (
                    <>
                        <div className="glass-panel hud-overlay" style={{ display: isSplitScreen ? 'none' : 'flex', width: 400 }}>
                            {/* ── Row 1: Logo + live indicator ── */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <h1 style={{ fontSize: '0.92rem', fontWeight: 700, letterSpacing: '-0.01em', color: '#fff', whiteSpace: 'nowrap' }}>
                                        FlytBase ATC
                                    </h1>
                                    <div className="status-indicator" style={{ marginTop: 0 }}>
                                        <div className="dot" style={{
                                            backgroundColor: isPlaying ? '#30D158' : '#FF9F0A',
                                            boxShadow: `0 0 5px ${isPlaying ? '#30D158' : '#FF9F0A'}44`,
                                        }} />
                                        <span style={{ fontSize: '0.72rem', color: 'rgba(235,235,245,0.45)', fontWeight: 400 }}>
                                            {isPlaying ? 'Live' : 'Paused'}
                                        </span>
                                    </div>
                                </div>

                                {/* ── Action pills ── */}
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                                    <button
                                        onClick={togglePlay}
                                        style={{
                                            padding: '4px 12px',
                                            background: isPlaying ? 'rgba(255,69,58,0.12)' : 'rgba(48,209,88,0.12)',
                                            border: `0.5px solid ${isPlaying ? 'rgba(255,69,58,0.4)' : 'rgba(48,209,88,0.4)'}`,
                                            color: isPlaying ? '#FF453A' : '#30D158',
                                            borderRadius: 20,
                                            cursor: 'pointer',
                                            fontSize: '0.72rem',
                                            fontWeight: 500,
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {isPlaying ? 'Pause' : 'Resume'}
                                    </button>
                                    <button
                                        onClick={handleReset}
                                        style={{
                                            padding: '4px 12px',
                                            background: 'rgba(255,255,255,0.06)',
                                            border: '0.5px solid rgba(255,255,255,0.12)',
                                            color: 'rgba(235,235,245,0.6)',
                                            borderRadius: 20,
                                            cursor: 'pointer',
                                            fontSize: '0.72rem',
                                            fontWeight: 400,
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        Reset
                                    </button>
                                    <ReplayTriggerButton
                                        onActivate={activateReplay}
                                        hasBuffer={bufferDurationSec > 0}
                                        bufferDurationSec={bufferDurationSec}
                                    />
                                </div>
                            </div>

                            <div>
                                {/* Replay badge */}
                                {isReplaying && (
                                    <div style={{
                                        fontSize: '0.65rem',
                                        color: 'rgba(191,90,242,0.9)',
                                        background: 'rgba(191,90,242,0.1)',
                                        border: '0.5px solid rgba(191,90,242,0.3)',
                                        borderRadius: 20,
                                        padding: '3px 10px',
                                        marginBottom: 10,
                                        display: 'inline-block',
                                        fontWeight: 500,
                                    }}>
                                        ⏺ Replay · {cursorAgeSec}s ago
                                    </div>
                                )}

                                {activeConflicts.length === 0 ? (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 7,
                                        color: '#30D158',
                                        fontSize: '0.8rem',
                                        fontWeight: 500,
                                        padding: '4px 0',
                                    }}>
                                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#30D158' }} />
                                        Airspace clear
                                    </div>
                                ) : activeConflicts
                                    .slice()
                                    .sort((a: any, b: any) => {
                                        if (a.severity !== b.severity) return a.severity === 'CRITICAL' ? -1 : 1;
                                        return a.t_cpa - b.t_cpa;
                                    })
                                    .map((c: any, i: number) => {
                                        const isCritical = c.severity === 'CRITICAL';
                                        const accentCol = isCritical ? '#FF453A' : '#FF9F0A';
                                        const droneA = activeTelemetry.find((d: any) => d.id === c.id_A);
                                        const droneB = activeTelemetry.find((d: any) => d.id === c.id_B);
                                        const cx = droneA && droneB ? ((droneA.x + droneB.x) / 2).toFixed(0) : '?';
                                        const cy = droneA && droneB ? ((droneA.y + droneB.y) / 2).toFixed(0) : '?';
                                        const cz = droneA && droneB ? ((droneA.z + droneB.z) / 2).toFixed(0) : '?';
                                        return (
                                            <div key={i} style={{
                                                background: isCritical ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.08)',
                                                border: `1px solid ${isCritical ? 'rgba(239,68,68,0.6)' : 'rgba(245,158,11,0.5)'}`,
                                                borderLeft: `3px solid ${accentCol}`,
                                                borderRadius: 8,
                                                padding: '10px 12px',
                                                marginBottom: 6,
                                            }}>
                                                {/* Header row */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                    <span style={{ color: accentCol, fontWeight: 700, fontSize: '0.8rem' }}>
                                                        {isCritical ? '🔴' : '🟠'} {c.severity}
                                                    </span>
                                                    <span style={{ color: '#9ca3af', fontSize: '0.7rem' }}>in ~{c.t_cpa.toFixed(1)}s</span>
                                                </div>
                                                {/* Drone pair */}
                                                <div style={{ color: '#e5e7eb', fontSize: '0.78rem', marginBottom: 3 }}>
                                                    <strong style={{ color: '#60a5fa' }}>{c.id_A}</strong>
                                                    <span style={{ color: '#6b7280', margin: '0 4px' }}>⟷</span>
                                                    <strong style={{ color: '#60a5fa' }}>{c.id_B}</strong>
                                                </div>
                                                {/* Details row */}
                                                <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginBottom: 6 }}>
                                                    Sep: <strong style={{ color: '#e5e7eb' }}>{c.min_dist.toFixed(1)}m</strong>
                                                    &emsp;At: <strong style={{ color: '#e5e7eb' }}>[{cx}, {cy}, {cz}m]</strong>
                                                </div>
                                                {/* Pause buttons */}
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    {droneA?.type === 'controlled' && (
                                                        <button
                                                            onClick={() => pauseDrone(c.id_A)}
                                                            style={{ flex: 1, padding: '4px 0', fontSize: '0.68rem', background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}
                                                        >⏸ Pause {c.id_A}</button>
                                                    )}
                                                    {droneB?.type === 'controlled' && (
                                                        <button
                                                            onClick={() => pauseDrone(c.id_B)}
                                                            style={{ flex: 1, padding: '4px 0', fontSize: '0.68rem', background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}
                                                        >⏸ Pause {c.id_B}</button>
                                                    )}
                                                </div>
                                                {/* Resolution advisory */}
                                                {c.ra && (
                                                    <div
                                                        className="advisory-box"
                                                        onMouseEnter={() => setHoveredRA(c.ra)}
                                                        onMouseLeave={() => setHoveredRA(null)}
                                                    >
                                                        <strong>RA:</strong> {c.ra.message}<br />
                                                        <small>Hover to preview ghost trajectory</small>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>

                        <div style={{
                            position: 'absolute', top: 16, right: 16, width: 340,
                            background: 'rgba(18,18,20,0.92)',
                            backdropFilter: 'blur(24px)',
                            border: '0.5px solid rgba(255,255,255,0.08)',
                            borderRadius: 18,
                            padding: '18px 18px 14px',
                            display: 'flex', flexDirection: 'column', gap: 14,
                            zIndex: 10, pointerEvents: 'auto',
                            boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
                        }}>
                            {/* Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <div style={{ fontSize: '0.62rem', color: 'rgba(235,235,245,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>
                                        Mode 3
                                    </div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>
                                        ATC Supervisor
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'rgba(235,235,245,0.35)', textAlign: 'right', lineHeight: 1.5 }}>
                                    <span style={{ color: '#FF453A', fontWeight: 600 }}>
                                        {telemetry.filter(d => d.type === 'bogie').length}
                                    </span> bogies<br />
                                    <span style={{ color: '#0A84FF', fontWeight: 600 }}>
                                        {telemetry.filter(d => d.type === 'controlled').length}
                                    </span> controlled
                                </div>
                            </div>

                            {/* Step 1 — Configure */}
                            <div style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '0.5px solid rgba(255,255,255,0.07)',
                                borderRadius: 12, padding: '12px 14px',
                            }}>
                                <div style={{ fontSize: '0.6rem', color: 'rgba(235,235,245,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                                    Step 1 — Configure
                                </div>
                                <label style={{ fontSize: '0.73rem', color: 'rgba(235,235,245,0.55)', display: 'block', marginBottom: 6 }}>
                                    Unknown bogie slots (0–30)
                                </label>
                                <input
                                    type="number"
                                    min="0" max="30"
                                    value={bogieCount}
                                    onChange={(e) => setBogieCount(Math.min(30, Math.max(0, parseInt(e.target.value) || 0)))}
                                    style={{
                                        width: '100%',
                                        background: 'rgba(255,255,255,0.06)',
                                        border: '0.5px solid rgba(255,255,255,0.1)',
                                        color: '#fff',
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        outline: 'none',
                                        marginBottom: 10,
                                        fontSize: '0.85rem',
                                        fontFamily: 'inherit',
                                    }}
                                />
                                <button
                                    onClick={async () => {
                                        const mission = Object.entries(MOCK_MISSIONS_MODE3[0].drones);
                                        const controlledCount = 30 - bogieCount;
                                        const controlledDrones = mission.slice(0, controlledCount);
                                        const bogieDrones = mission.slice(controlledCount, 30);
                                        await fetch('http://localhost:8000/api/mode3/clear', { method: 'POST' });
                                        setIsApproved(false);
                                        for (const [drone_id, plan] of controlledDrones) {
                                            await fetch('http://localhost:8000/api/mode3/propose', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ drone_id, plan })
                                            });
                                        }
                                        const bogiePayload = bogieDrones.map(([id, plan]: any) => ({
                                            id: id.replace('Drone', 'Bogie'),
                                            x: plan.waypoints[0].x,
                                            y: plan.waypoints[0].y,
                                            z: 0.0
                                        }));
                                        if (bogiePayload.length > 0) {
                                            await fetch('http://localhost:8000/api/mode3/spawn_bogies', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ bogies: bogiePayload })
                                            });
                                        }
                                        await fetch('http://localhost:8000/api/mode3/broadcast_staged', { method: 'POST' });
                                        try { const r = await fetch('http://localhost:8000/api/mode3/status'); setMode3Status(await r.json()); } catch (e) { }
                                    }}
                                    style={{
                                        width: '100%', padding: '10px',
                                        background: '#0A84FF',
                                        border: 'none',
                                        color: '#fff',
                                        borderRadius: 10,
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        fontSize: '0.8rem',
                                        letterSpacing: '0.01em',
                                    }}
                                >
                                    Stage All {30} Drones
                                </button>
                            </div>

                            {/* Live status strip */}
                            {mode3Status && (
                                <div style={{
                                    display: 'flex',
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '0.5px solid rgba(255,255,255,0.07)',
                                    borderRadius: 10,
                                    overflow: 'hidden',
                                }}>
                                    {[
                                        { n: mode3Status.staged_bogies, label: 'Bogies', color: '#FF453A' },
                                        { n: mode3Status.pending_clearance?.length ?? 0, label: 'Pending', color: '#FF9F0A' },
                                        { n: mode3Status.launched?.length ?? 0, label: 'Launched', color: '#30D158' },
                                    ].map(({ n, label, color }, i) => (
                                        <div key={label} style={{
                                            flex: 1,
                                            textAlign: 'center',
                                            padding: '10px 0',
                                            borderRight: i < 2 ? '0.5px solid rgba(255,255,255,0.07)' : 'none',
                                        }}>
                                            <div style={{ fontSize: '1.35rem', fontWeight: 700, color, lineHeight: 1 }}>{n}</div>
                                            <div style={{ fontSize: '0.6rem', color: 'rgba(235,235,245,0.3)', marginTop: 3, letterSpacing: '0.04em' }}>{label}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Step 2 hint */}
                            {mode3Status && (mode3Status.staged_bogies > 0 || (mode3Status.pending_clearance?.length ?? 0) > 0) && (
                                <div style={{ fontSize: '0.72rem', color: 'rgba(235,235,245,0.35)', lineHeight: 1.5 }}>
                                    <span style={{ color: 'rgba(235,235,245,0.45)', fontWeight: 500 }}>Step 2 —</span>{' '}
                                    Press <span style={{ color: '#30D158' }}>Resume</span> (top-left) to power up all bogies.
                                </div>
                            )}

                            {/* Step 3 — ATC Approve */}
                            <div style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '0.5px solid rgba(255,255,255,0.07)',
                                borderRadius: 12, padding: '12px 14px',
                            }}>
                                <div style={{ fontSize: '0.6rem', color: 'rgba(235,235,245,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                                    Step 3 — ATC Clearance
                                </div>
                                {isApproved ? (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        color: '#30D158', fontSize: '0.8rem', fontWeight: 500,
                                    }}>
                                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#30D158' }} />
                                        All drones launched
                                    </div>
                                ) : (
                                    <button
                                        onClick={async () => {
                                            const mission = Object.entries(MOCK_MISSIONS_MODE3[0].drones);
                                            const controlledCount = 30 - bogieCount;
                                            const controlledDrones = mission.slice(0, controlledCount);
                                            for (const [drone_id,] of controlledDrones) {
                                                await fetch(`http://localhost:8000/api/mode3/launch?drone_id=${drone_id}`, { method: 'POST' });
                                            }
                                            setIsApproved(true);
                                        }}
                                        style={{
                                            width: '100%', padding: '10px',
                                            background: '#30D158',
                                            border: 'none',
                                            color: '#000',
                                            borderRadius: 10,
                                            cursor: 'pointer',
                                            fontWeight: 600,
                                            fontSize: '0.8rem',
                                        }}
                                    >
                                        Approve &amp; Launch
                                    </button>
                                )}
                            </div>

                            {/* Drone Pause/Resume Management Panel */}
                            {isApproved && (
                                <DroneControlPanel
                                    activeDrones={activeTelemetry.filter((d: any) => d.type === 'controlled').map((d: any) => d.id)}
                                    pausedDrones={pausedDrones}
                                    onPause={pauseDrone}
                                    onResume={resumeDrone}
                                />
                            )}
                        </div>
                    </>
                )
            }

            {/* System Health Badge — always visible in Mode 3 */}
            {activeMode === 3 && (
                <SystemHealthBadge
                    lastMsgAt={lastMsgAt}
                    droneCount={droneCount}
                    conflictCheckMs={conflictCheckMs}
                />
            )}

            {/* ── Incident Replay full-screen modal ── */}
            {activeMode === 3 && isReplaying && (
                <IncidentReplayPanel
                    isReplaying={true}
                    replayCursor={replayCursor}
                    setReplayCursor={setReplayCursor}
                    replaySnapshot={replaySnapshot}
                    bufferDurationSec={bufferDurationSec}
                    cursorAgeSec={cursorAgeSec}
                    onActivate={activateReplay}
                    onExit={exitReplay}
                    hasBuffer={bufferDurationSec > 0}
                    allSnapshots={allSnapshots}
                />
            )}
        </div>
    );
}
