import { useEffect, useState, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, TextLayer, LineLayer, GridCellLayer } from '@deck.gl/layers';
import { SimpleMeshLayer } from '@deck.gl/mesh-layers';
import { SphereGeometry } from '@luma.gl/engine';
import { MapView } from '@deck.gl/core';

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

export default function Dashboard() {
    const [telemetry, setTelemetry] = useState<any[]>([]);
    const [conflicts, setConflicts] = useState<any[]>([]);
    const [timeOffset, setTimeOffset] = useState(0);
    const [predictedPositions, setPredictedPositions] = useState<Float32Array | null>(null);
    const [hoveredRA, setHoveredRA] = useState<any>(null);
    const [isPlaying, setIsPlaying] = useState(true);
    const [flightPlans, setFlightPlans] = useState<any[]>([]);



    const [activeMode, setActiveMode] = useState<1 | 2 | 3>(3);
    const [isSplitScreen, setIsSplitScreen] = useState(false);
    const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
    const [multiViewState, setMultiViewState] = useState<any>({
        'xy-plane': { ...INITIAL_VIEW_STATE, pitch: 0, bearing: 0 },
        'yz-plane': { ...INITIAL_VIEW_STATE, pitch: 85, bearing: 90 }
    });
    const [mode1Segments, setMode1Segments] = useState<any[]>([]);
    const [mode1Report, setMode1Report] = useState<any>(null);
    const [isMode1Playing, setIsMode1Playing] = useState(false);
    const [mode2Trace, setMode2Trace] = useState<string>("");
    const [m2Form, setM2Form] = useState({
        p0_A: [0, 0, 50], v_A: [5, 5, 0],
        p0_B: [0, 100, 50], v_B: [5, -5, 0],
        t_start: 0, t_end: 20
    });

    const [activeMissionIdx, setActiveMissionIdx] = useState(0);

    const [bogieCount, setBogieCount] = useState(25);
    const [m1Input, setM1Input] = useState(JSON.stringify(MOCK_MISSIONS[0], null, 2));

    const ws = useRef<WebSocket | null>(null);

    useEffect(() => {
        ws.current = new WebSocket('ws://localhost:8000/ws/telemetry');
        ws.current.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'telemetry') {
                setTelemetry(msg.data);
                if (msg.conflicts) setConflicts(msg.conflicts);
                if (msg.flight_plans) setFlightPlans(msg.flight_plans);
            }
        };
        return () => ws.current?.close();
    }, []);

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
            new SimpleMeshLayer({
                id: 'drones-layer',
                data: telemetry,
                mesh: new SphereGeometry({ radius: 1, nlat: 16, nlong: 32 }),
                getPosition: (d: any, { index }) => getCoordinates(d, index),
                getColor: (d: any) => d.type === 'bogie' ? [239, 68, 68] : [59, 130, 246],
                getOrientation: [0, 0, 0],
                getScale: [15, 15, 15],
                wireframe: false,
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
        const activeDots = mode1Segments.filter((s: any) => scrubT >= s.t_start && scrubT <= s.t_end).map((s: any) => {
            const frac = (scrubT - s.t_start) / Math.max(0.0001, (s.t_end - s.t_start));
            return {
                ...s,
                coord: [
                    (s.A0[1] + frac * (s.A1[1] - s.A0[1])) / 111000.0,
                    (s.A0[0] + frac * (s.A1[0] - s.A0[0])) / 111000.0,
                    s.A0[2] + frac * (s.A1[2] - s.A0[2])
                ]
            };
        });

        layers.push(
            new SimpleMeshLayer({
                id: 'mode1-active-dots',
                data: activeDots,
                mesh: new SphereGeometry({ radius: 1, nlat: 16, nlong: 32 }),
                getPosition: (d: any) => d.coord,
                getColor: (d: any) => d.drone_id.toLowerCase().includes('bogie') ? [239, 68, 68, 255] : [59, 130, 246, 255],
                getScale: [15, 15, 15],
                wireframe: false
            })
        );

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

    const togglePlay = async () => {
        try {
            const res = await fetch('http://localhost:8000/api/sim/toggle', { method: 'POST' });
            const data = await res.json();
            setIsPlaying(data.playing);
        } catch (e) { console.error(e) }
    };

    const handleReset = async () => {
        try {
            await fetch('http://localhost:8000/api/sim/reset', { method: 'POST' });
            setTelemetry([]);
            setConflicts([]);
            setFlightPlans([]);
            setTimeOffset(0);
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
            setTimeOffset(0);
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
                    new MapView({ id: 'xy-plane', x: '0%', y: '0%', width: '35%', height: '100%', controller: true }),
                    new MapView({ id: 'yz-plane', x: '35%', y: '0%', width: '35%', height: '100%', controller: true })
                ] : [
                    new MapView({ id: 'main-view', x: '0%', y: '0%', width: '100%', height: '100%', controller: true })
                ]}
                viewState={isSplitScreen ? {
                    'xy-plane': { ...multiViewState['xy-plane'], maxPitch: 89 } as any,
                    'yz-plane': { ...multiViewState['yz-plane'], maxPitch: 89 } as any
                } : {
                    'main-view': { ...viewState, maxPitch: 89 } as any
                }}
                onViewStateChange={handleViewStateChange}
                layers={layers}
            />

            {
                isSplitScreen && (
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'grid', gridTemplateColumns: '35% 35% 30%', pointerEvents: 'none', zIndex: 5 }}>
                        <div style={{ position: 'relative', borderRight: '1px solid rgba(255,255,255,0.1)', height: '100%' }}>
                            <div style={{ position: 'absolute', top: 20, left: 20, background: 'rgba(10,15,25,0.85)', padding: '8px 16px', color: '#fff', borderRadius: '30px', border: '1px solid rgba(74, 222, 128, 0.5)', fontSize: '0.85rem', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>🗺️ Top-Down Horizon (XY Plane)</div>
                        </div>
                        <div style={{ position: 'relative', borderRight: '1px solid rgba(255,255,255,0.1)', height: '100%' }}>
                            <div style={{ position: 'absolute', top: 20, left: 20, background: 'rgba(10,15,25,0.85)', padding: '8px 16px', color: '#fff', borderRadius: '30px', border: '1px solid rgba(96, 165, 250, 0.5)', fontSize: '0.85rem', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>⛰️ Altitude Side-View (YZ Plane)</div>
                        </div>
                        <div style={{ position: 'relative', height: '100%' }}>
                        </div>
                    </div>
                )
            }

            <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 100, display: 'flex', gap: '5px', background: 'rgba(0,0,0,0.6)', padding: '5px', borderRadius: '30px', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                <button onClick={() => { setActiveMode(1); setViewState(INITIAL_VIEW_STATE); }} style={{ padding: '8px 20px', fontWeight: 'bold', background: activeMode === 1 ? 'var(--accent)' : 'transparent', color: activeMode === 1 ? '#fff' : 'var(--text-muted)', borderRadius: '25px', cursor: 'pointer', border: 'none', transition: 'all 0.2s' }}>M1: BATCH CHECK</button>
                <button onClick={() => { setActiveMode(2); setViewState(INITIAL_VIEW_STATE); }} style={{ padding: '8px 20px', fontWeight: 'bold', background: activeMode === 2 ? 'var(--accent)' : 'transparent', color: activeMode === 2 ? '#fff' : 'var(--text-muted)', borderRadius: '25px', cursor: 'pointer', border: 'none', transition: 'all 0.2s' }}>M2: MATH PROOF</button>
                <button onClick={() => { setActiveMode(3); setViewState(INITIAL_VIEW_STATE); }} style={{ padding: '8px 20px', fontWeight: 'bold', background: activeMode === 3 ? 'var(--accent)' : 'transparent', color: activeMode === 3 ? '#fff' : 'var(--text-muted)', borderRadius: '25px', cursor: 'pointer', border: 'none', transition: 'all 0.2s' }}>M3: LIVE ATC</button>
            </div>

            <div style={{ position: 'absolute', bottom: 20, left: 20, zIndex: 100, display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(10,15,25,0.6)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Camera Controls</span>
                <button onClick={() => {
                    if (!isSplitScreen) {
                        setMultiViewState({
                            'xy-plane': { ...getCenterViewState(INITIAL_VIEW_STATE), pitch: 0, bearing: 0 },
                            'yz-plane': { ...getCenterViewState(INITIAL_VIEW_STATE), pitch: 85, bearing: 90 }
                        });
                    }
                    setIsSplitScreen(!isSplitScreen);
                }} style={{ padding: '8px 14px', background: isSplitScreen ? 'var(--accent)' : 'rgba(255,255,255,0.1)', color: '#fff', outline: 'none', border: isSplitScreen ? '1px solid var(--accent)' : '1px solid transparent', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', transition: 'all 0.2s' }}>{isSplitScreen ? 'DISABLE SPLIT SCREEN' : 'ENABLE SPLIT SCREEN'}</button>
                {isSplitScreen && (
                    <button onClick={() => setMultiViewState({
                        'xy-plane': { ...getCenterViewState(INITIAL_VIEW_STATE), pitch: 0, bearing: 0 },
                        'yz-plane': { ...getCenterViewState(INITIAL_VIEW_STATE), pitch: 85, bearing: 90 }
                    })} style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.1)', color: '#fff', outline: 'none', border: '1px solid transparent', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', transition: 'all 0.2s' }}>Reset Focus To Trace</button>
                )}
                {!isSplitScreen && (
                    <>
                        <button onClick={() => setViewState(INITIAL_VIEW_STATE)} style={{ padding: '8px 14px', background: viewState.pitch === 45 ? 'var(--accent)' : 'rgba(255,255,255,0.1)', color: '#fff', outline: 'none', border: '1px solid transparent', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', transition: 'all 0.2s' }}>Default 3D Perspective</button>
                        <button onClick={() => setViewState({ ...viewState, pitch: 0, bearing: 0 })} style={{ padding: '8px 14px', background: viewState.pitch === 0 ? 'var(--accent)' : 'rgba(255,255,255,0.1)', color: '#fff', outline: 'none', border: '1px solid transparent', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', transition: 'all 0.2s' }}>Top-Down (XY Plane)</button>
                        <button onClick={() => setViewState({ ...viewState, pitch: 60, bearing: 90 })} style={{ padding: '8px 14px', background: viewState.bearing === 90 ? 'var(--accent)' : 'rgba(255,255,255,0.1)', color: '#fff', outline: 'none', border: '1px solid transparent', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', transition: 'all 0.2s' }}>Side View (YZ Plane)</button>
                    </>
                )}
            </div>

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
                                style={{ flex: 1, minHeight: '300px', background: 'rgba(5, 5, 5, 0.8)', color: '#a78bfa', border: '1px solid rgba(255,255,255,0.1)', padding: '15px', fontFamily: '"Fira Code", "Courier New", Courier, monospace', borderRadius: '8px', fontSize: '0.85rem', outline: 'none', lineHeight: '1.5' }}
                                spellCheck={false}
                            />
                            <div style={{ display: 'flex', gap: '10px', margin: '20px 0' }}>
                                <button onClick={() => { runMode1(); setIsMode1Playing(false); }} style={{ flex: 1, padding: '12px', background: 'var(--bg-panel)', color: '#fff', fontWeight: 'bold', border: '1px solid var(--accent)', borderRadius: '4px', cursor: 'pointer' }}>VALIDATE PATHS</button>
                                <button onClick={() => { runMode1(); setIsMode1Playing(true); }} style={{ flex: 1, padding: '12px', background: 'var(--accent)', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>PLAY SIMULATION</button>
                            </div>
                            {mode1Report && (
                                <pre style={{ background: 'rgba(0,0,0,0.7)', padding: '15px', color: mode1Report.error ? '#ef4444' : '#a78bfa', borderRadius: '4px', overflowX: 'auto', border: '1px solid #4ade80' }}>
                                    {JSON.stringify(mode1Report, null, 2)}
                                </pre>
                            )}
                        </div>

                        {mode1Segments.length > 0 && (
                            <div className="glass-panel timeline-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <button
                                        onClick={() => setIsMode1Playing(!isMode1Playing)}
                                        style={{ padding: '8px 16px', background: isMode1Playing ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)', border: `1px solid ${isMode1Playing ? '#ef4444' : '#22c55e'}`, color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                                    >
                                        {isMode1Playing ? 'PAUSE' : 'PLAY'}
                                    </button>
                                    <div className="timeline-header" style={{ flex: 1 }}>
                                        <span>T = 0s (Mission Start)</span>
                                        <span>T = {timeOffset.toFixed(1)}s (Scrubbing)</span>
                                        <span>Future</span>
                                    </div>
                                </div>
                                <div style={{ position: 'relative', width: '100%', height: '30px' }}>
                                    <input
                                        type="range"
                                        className="timeline-slider"
                                        min="0"
                                        max={Math.max(...mode1Segments.map((s: any) => s.t_end)) + 10}
                                        step="0.1"
                                        value={timeOffset}
                                        onChange={(e) => {
                                            setTimeOffset(parseFloat(e.target.value));
                                            setIsMode1Playing(false); // Stop playing if user manually scrubs
                                        }}
                                        style={{ width: '100%' }}
                                    />
                                    {mode1Report && Array.isArray(mode1Report) && mode1Report.map((c: any, i) => {
                                        const leftPerc = (c.exact_conflict_time / (Math.max(...mode1Segments.map((s: any) => s.t_end)) + 10)) * 100;
                                        return (
                                            <div
                                                key={`tick-${i}`}
                                                className="conflict-ticker"
                                                style={{ left: `${leftPerc}%`, background: '#eab308' }}
                                                title={`Conflict at T+${c.exact_conflict_time.toFixed(1)}s`}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )
            }

            {
                activeMode === 2 && (
                    <div className="glass-panel" style={{ position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)', width: '80%', height: '80%', padding: '25px', zIndex: 10, display: 'flex', gap: '25px' }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <h2 style={{ color: 'var(--accent)', marginBottom: 5 }}>Mode 2: Physics Proof</h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                                <strong>What it does:</strong> This exposes the raw mathematical engine. Given two starting positions and speeds, it algebraically calculates the <em>exact</em> minimum distance they will ever achieve.
                            </p>

                            <h4 style={{ marginTop: 10, color: '#60a5fa' }}>Friendly Drone variables</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                <label style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Start Position [X, Y, Z] (meters, e.g. 0, 0, 50)</label>
                                <div style={{ display: 'flex', gap: 5 }}>
                                    <input type={"number"} value={m2Form.p0_A[0]} onChange={e => setM2Form({ ...m2Form, p0_A: [parseFloat(e.target.value), m2Form.p0_A[1], m2Form.p0_A[2]] })} style={{ width: '30%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid #555', padding: '5px' }} placeholder="X" />
                                    <input type={"number"} value={m2Form.p0_A[1]} onChange={e => setM2Form({ ...m2Form, p0_A: [m2Form.p0_A[0], parseFloat(e.target.value), m2Form.p0_A[2]] })} style={{ width: '30%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid #555', padding: '5px' }} placeholder="Y" />
                                    <input type={"number"} value={m2Form.p0_A[2]} onChange={e => setM2Form({ ...m2Form, p0_A: [m2Form.p0_A[0], m2Form.p0_A[1], parseFloat(e.target.value)] })} style={{ width: '30%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid #555', padding: '5px' }} placeholder="Z" />
                                </div>
                                <label style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Constant Speed [Vx, Vy, Vz] (meters/sec)</label>
                                <div style={{ display: 'flex', gap: 5 }}>
                                    <input type={"number"} value={m2Form.v_A[0]} onChange={e => setM2Form({ ...m2Form, v_A: [parseFloat(e.target.value), m2Form.v_A[1], m2Form.v_A[2]] })} style={{ width: '30%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid #555', padding: '5px' }} placeholder="Vx (Speed X)" />
                                    <input type={"number"} value={m2Form.v_A[1]} onChange={e => setM2Form({ ...m2Form, v_A: [m2Form.v_A[0], parseFloat(e.target.value), m2Form.v_A[2]] })} style={{ width: '30%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid #555', padding: '5px' }} placeholder="Vy (Speed Y)" />
                                    <input type={"number"} value={m2Form.v_A[2]} onChange={e => setM2Form({ ...m2Form, v_A: [m2Form.v_A[0], m2Form.v_A[1], parseFloat(e.target.value)] })} style={{ width: '30%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid #555', padding: '5px' }} placeholder="Vz (Speed Z)" />
                                </div>
                            </div>

                            <h4 style={{ marginTop: 10, color: '#f87171' }}>Intruder Drone variables</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                <label style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Start Position [X, Y, Z] (meters, e.g. 0, 100, 50)</label>
                                <div style={{ display: 'flex', gap: 5 }}>
                                    <input type={"number"} value={m2Form.p0_B[0]} onChange={e => setM2Form({ ...m2Form, p0_B: [parseFloat(e.target.value), m2Form.p0_B[1], m2Form.p0_B[2]] })} style={{ width: '30%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid #555', padding: '5px' }} placeholder="X" />
                                    <input type={"number"} value={m2Form.p0_B[1]} onChange={e => setM2Form({ ...m2Form, p0_B: [m2Form.p0_B[0], parseFloat(e.target.value), m2Form.p0_B[2]] })} style={{ width: '30%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid #555', padding: '5px' }} placeholder="Y" />
                                    <input type={"number"} value={m2Form.p0_B[2]} onChange={e => setM2Form({ ...m2Form, p0_B: [m2Form.p0_B[0], m2Form.p0_B[1], parseFloat(e.target.value)] })} style={{ width: '30%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid #555', padding: '5px' }} placeholder="Z" />
                                </div>
                                <label style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Constant Speed [Vx, Vy, Vz] (meters/sec)</label>
                                <div style={{ display: 'flex', gap: 5 }}>
                                    <input type={"number"} value={m2Form.v_B[0]} onChange={e => setM2Form({ ...m2Form, v_B: [parseFloat(e.target.value), m2Form.v_B[1], m2Form.v_B[2]] })} style={{ width: '30%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid #555', padding: '5px' }} placeholder="Vx (Speed X)" />
                                    <input type={"number"} value={m2Form.v_B[1]} onChange={e => setM2Form({ ...m2Form, v_B: [m2Form.v_B[0], parseFloat(e.target.value), m2Form.v_B[2]] })} style={{ width: '30%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid #555', padding: '5px' }} placeholder="Vy (Speed Y)" />
                                    <input type={"number"} value={m2Form.v_B[2]} onChange={e => setM2Form({ ...m2Form, v_B: [m2Form.v_B[0], m2Form.v_B[1], parseFloat(e.target.value)] })} style={{ width: '30%', background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid #555', padding: '5px' }} placeholder="Vz (Speed Z)" />
                                </div>
                            </div>

                            <button onClick={runMode2} style={{ padding: '15px 0', background: 'var(--accent)', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: '4px', cursor: 'pointer', margin: '20px 0', width: '100%' }}>EXECUTE MATHEMATICAL PROOF</button>
                        </div>
                        <div style={{ flex: 2 }}>
                            {mode2Trace && (
                                <pre style={{ background: 'rgba(0,0,0,0.85)', padding: '20px', color: '#4ade80', fontSize: '0.9rem', borderRadius: '4px', overflowY: 'auto', height: '100%', border: '1px solid #333' }}>
                                    {mode2Trace}
                                </pre>
                            )}
                        </div>
                    </div>
                )
            }

            {
                activeMode === 3 && (
                    <>
                        <div className="glass-panel hud-overlay" style={{ display: isSplitScreen ? 'none' : 'flex' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h1>FlytBase ATC V2.0</h1>
                                    <div className="status-indicator">
                                        <div className="dot" style={{ backgroundColor: isPlaying ? '#22c55e' : '#f59e0b', boxShadow: `0 0 8px ${isPlaying ? '#22c55e' : '#f59e0b'}` }} />
                                        {isPlaying ? 'Live Telemetry Active' : 'Simulation Paused'}
                                    </div>
                                    <div style={{ marginTop: 15, background: 'rgba(0,0,0,0.6)', padding: '10px', borderRadius: '4px', maxWidth: '350px' }}>
                                        <h4 style={{ margin: '0 0 5px 0', color: 'var(--accent)', fontSize: '0.9rem' }}>4D SPATIAL-TEMPORAL VIEW</h4>
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#ccc', lineHeight: '1.4' }}>
                                            <strong>Altitude Lines:</strong> Vertical white lines drop from each drone to the ground (Z=0), anchoring their 3D physical position.<br />
                                            <strong>Timeline Waypoints:</strong> Predicted 4D temporal positions are marked along the flight trajectory at 10-second (T+10s) intervals.
                                        </p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button
                                        onClick={togglePlay}
                                        style={{ padding: '8px 16px', background: isPlaying ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)', border: `1px solid ${isPlaying ? '#ef4444' : '#22c55e'}`, color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
                                    >
                                        {isPlaying ? 'PAUSE SIM' : 'PLAY SIM'}
                                    </button>
                                    <button
                                        onClick={handleReset}
                                        style={{ padding: '8px 16px', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid #3b82f6', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
                                    >
                                        RESET
                                    </button>
                                </div>
                            </div>

                            <div className="conflict-panel">
                                {conflicts.map((c: any, i) => (
                                    <div key={i} className={`conflict-card ${c.severity === 'WARNING' ? 'warning' : ''}`}>
                                        <h3>{c.severity} CONFLICT</h3>
                                        <p>Drones: {c.id_A} ⚡ {c.id_B}</p>
                                        <p>T-Minus CPA: {c.t_cpa.toFixed(1)}s</p>
                                        <p>Min Separation: {c.min_dist.toFixed(1)}m</p>

                                        {c.ra && (
                                            <div
                                                className="advisory-box"
                                                onMouseEnter={() => setHoveredRA(c.ra)}
                                                onMouseLeave={() => setHoveredRA(null)}
                                            >
                                                <strong>Resolution Advisory (RA)</strong><br />
                                                {c.ra.message}<br />
                                                <small>Hover to view Ghost Trajectory</small>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {conflicts.length === 0 && (
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Airspace Clear</div>
                                )}
                            </div>
                        </div>

                        <div className="glass-panel" style={{ position: 'absolute', top: '20px', right: '20px', width: '350px', padding: '15px', display: 'flex', flexDirection: 'column', gap: '15px', zIndex: 10, pointerEvents: 'auto' }}>
                            <h3 style={{ margin: 0, color: 'var(--accent)', fontSize: '1rem', textTransform: 'uppercase' }}>Mode 3: ATC Supervisor</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0, lineHeight: '1.4' }}>
                                <strong>Airspace Load:</strong> {telemetry.filter(d => d.type === 'bogie').length} Unknown Bogies currently tracking.<br />
                                Propose flight plans below. ATC must evaluate and approve.
                            </p>

                            <div style={{ background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <label style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'block', marginBottom: 5 }}>1. Ground Grid Configuration:</label>
                                <p style={{ fontSize: '0.8rem', color: '#fff', margin: '0 0 10px 0' }}>30-Drone Real-World Ground Operation</p>

                                <label style={{ fontSize: '0.75rem', color: '#ef4444' }}>Random Bogie Slots (Max 30):</label>
                                <input
                                    type="number"
                                    min="0" max="30"
                                    value={bogieCount}
                                    onChange={(e) => setBogieCount(Math.min(30, Math.max(0, parseInt(e.target.value) || 0)))}
                                    style={{ width: '100%', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '8px', borderRadius: '4px', outline: 'none', marginBottom: '10px' }}
                                />

                                <button
                                    onClick={async () => {
                                        const mission = Object.entries(MOCK_MISSIONS_MODE3[0].drones);
                                        const controlledCount = 30 - bogieCount;

                                        const controlledDrones = mission.slice(0, controlledCount);
                                        const bogieDrones = mission.slice(controlledCount, 30);

                                        await fetch('http://localhost:8000/api/mode3/clear', { method: 'POST' });

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
                                            z: plan.waypoints[0].z
                                        }));

                                        if (bogiePayload.length > 0) {
                                            await fetch('http://localhost:8000/api/mode3/spawn_bogies', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ bogies: bogiePayload })
                                            });
                                        }
                                        alert(`Configured! ${controlledCount} proposed for clearance, ${bogieCount} bogies staged on ground.`);
                                    }}
                                    style={{ width: '100%', padding: '10px', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid #3b82f6', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
                                >
                                    📥 1. STAGE DRONES ON GROUND
                                </button>
                            </div>

                            <div style={{ background: 'rgba(0,0,0,0.5)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(74, 222, 128, 0.3)' }}>
                                <label style={{ fontSize: '0.75rem', color: '#4ade80', display: 'block', marginBottom: 5 }}>2. ATC Clearance Authority:</label>
                                <button
                                    onClick={async () => {
                                        const mission = Object.entries(MOCK_MISSIONS_MODE3[0].drones);
                                        const controlledCount = 30 - bogieCount;
                                        const controlledDrones = mission.slice(0, controlledCount);

                                        for (const [drone_id,] of controlledDrones) {
                                            await fetch(`http://localhost:8000/api/mode3/launch?drone_id=${drone_id}`, { method: 'POST' });
                                        }
                                    }}
                                    style={{ width: '100%', padding: '12px', background: '#22c55e', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 0 10px rgba(34, 197, 94, 0.4)', transition: 'all 0.2s' }}
                                >
                                    ✈️ APPROVE & LAUNCH ALL
                                </button>
                            </div>
                        </div>

                        <div className="glass-panel timeline-container">
                            <div className="timeline-header">
                                <span>T - 20s (Past)</span>
                                <span>T = {timeOffset > 0 ? '+' : ''}{timeOffset.toFixed(1)}s (Now)</span>
                                <span>T + 60s (Future)</span>
                            </div>
                            <input
                                type="range"
                                className="timeline-slider"
                                min="-20"
                                max="60"
                                step="0.5"
                                value={timeOffset}
                                onChange={(e) => setTimeOffset(parseFloat(e.target.value))}
                            />
                            {conflicts.map((c: any, i) => {
                                if (c.t_cpa > 0 && c.t_cpa <= 60) {
                                    const leftPerc = ((c.t_cpa + 20) / 80) * 100;
                                    return (
                                        <div
                                            key={`tick-${i}`}
                                            className="conflict-ticker"
                                            style={{ left: `${leftPerc}%` }}
                                            title={`Conflict at T+${c.t_cpa.toFixed(1)}s`}
                                        />
                                    );
                                }
                                return null;
                            })}
                        </div>
                    </>
                )
            }
        </div>
    );
}
