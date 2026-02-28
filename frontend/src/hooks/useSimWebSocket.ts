import { useEffect, useRef, useState } from 'react';

const WS_URL = 'ws://localhost:8000/ws/telemetry';

/**
 * useSimWebSocket
 *
 * Manages the WebSocket connection to the backend telemetry stream.
 * Exposes:
 *   - telemetry: latest drone positions/state
 *   - conflicts: latest airspace conflict list
 *   - flightPlans: latest flight plan overlays
 *   - conflictCheckMs: last conflict checker cycle time (ms)
 *   - droneCount: total active drones in backend state
 *   - pausedDrones: list of paused controlled drones with duration
 *   - lastMsgAt: timestamp of last received WS message (for staleness check)
 *
 * The ws ref is exposed so callers can send messages if needed.
 */
export function useSimWebSocket() {
    const ws = useRef<WebSocket | null>(null);
    const [telemetry, setTelemetry] = useState<any[]>([]);
    const [conflicts, setConflicts] = useState<any[]>([]);
    const [flightPlans, setFlightPlans] = useState<any[]>([]);
    const [conflictCheckMs, setConflictCheckMs] = useState<number>(0);
    const [droneCount, setDroneCount] = useState<number>(0);
    const [pausedDrones, setPausedDrones] = useState<any[]>([]);
    const [lastMsgAt, setLastMsgAt] = useState<number | null>(null);

    useEffect(() => {
        ws.current = new WebSocket(WS_URL);

        ws.current.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'telemetry') {
                setTelemetry(msg.data);
                if (msg.conflicts) setConflicts(msg.conflicts);
                if (msg.flight_plans) setFlightPlans(msg.flight_plans);
                if (msg.conflict_check_ms != null) setConflictCheckMs(msg.conflict_check_ms);
                if (msg.drone_count != null) setDroneCount(msg.drone_count);
                if (msg.paused_drones != null) setPausedDrones(msg.paused_drones);
                setLastMsgAt(Date.now());
            }
        };

        ws.current.onerror = (e) => {
            console.warn('[SimWS] Connection error:', e);
        };

        return () => {
            ws.current?.close();
        };
    }, []);

    return {
        ws,
        telemetry, setTelemetry,
        conflicts, setConflicts,
        flightPlans, setFlightPlans,
        conflictCheckMs,
        droneCount,
        pausedDrones,
        lastMsgAt,
    };
}
