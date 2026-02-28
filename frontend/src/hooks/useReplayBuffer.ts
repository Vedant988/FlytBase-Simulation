import { useEffect, useRef, useState } from 'react';

export interface ReplaySnapshot {
    timestamp: number;       // ms epoch
    telemetry: any[];
    conflicts: any[];
}

const BUFFER_SECONDS = 20;
const TICK_MS = 500; // matches WS broadcast period
const MAX_SNAPSHOTS = Math.ceil((BUFFER_SECONDS * 1000) / TICK_MS); // 40 frames

/**
 * useReplayBuffer
 *
 * Records every incoming telemetry frame into a rolling ring-buffer.
 * When replay mode is active, exposes a selected historical snapshot
 * instead of the live feed.
 *
 * Usage:
 *   const { activatReplay, exitReplay, replayState, isReplaying,
 *           replayCursor, setReplayCursor, bufferDuration } = useReplayBuffer(telemetry, conflicts);
 */
export function useReplayBuffer(telemetry: any[], conflicts: any[]) {
    const ringBuffer = useRef<ReplaySnapshot[]>([]);
    const [isReplaying, setIsReplaying] = useState(false);
    const [replayCursor, setReplayCursor] = useState(0);       // 0 = oldest, max = newest
    const [replaySnapshot, setReplaySnapshot] = useState<ReplaySnapshot | null>(null);

    // --- Record every live frame ---
    useEffect(() => {
        if (telemetry.length === 0) return;       // nothing to record yet
        const snap: ReplaySnapshot = {
            timestamp: Date.now(),
            telemetry: telemetry.map(d => ({ ...d })),   // shallow clone each drone
            conflicts: conflicts.map(c => ({ ...c })),
        };
        const buf = ringBuffer.current;
        buf.push(snap);
        if (buf.length > MAX_SNAPSHOTS) buf.shift();   // evict oldest
    }, [telemetry, conflicts]);

    // --- When scrubbing, pick the right snapshot ---
    useEffect(() => {
        if (!isReplaying) return;
        const buf = ringBuffer.current;
        if (buf.length === 0) return;
        const idx = Math.round((replayCursor / 100) * (buf.length - 1));
        setReplaySnapshot(buf[Math.max(0, Math.min(idx, buf.length - 1))]);
    }, [replayCursor, isReplaying]);

    const activateReplay = () => {
        const buf = ringBuffer.current;
        if (buf.length === 0) return;
        setReplayCursor(100);   // start at "now" (newest frame)
        setReplaySnapshot(buf[buf.length - 1]);
        setIsReplaying(true);
    };

    const exitReplay = () => {
        setIsReplaying(false);
        setReplaySnapshot(null);
        setReplayCursor(100);
    };

    const bufferDurationSec = (ringBuffer.current.length * TICK_MS) / 1000;

    // How many seconds ago does the current cursor point to?
    const cursorAgeSec = (() => {
        const buf = ringBuffer.current;
        if (!isReplaying || buf.length === 0 || !replaySnapshot) return 0;
        return ((Date.now() - replaySnapshot.timestamp) / 1000).toFixed(1);
    })();

    return {
        isReplaying,
        replayCursor,
        setReplayCursor,
        replaySnapshot,
        activateReplay,
        exitReplay,
        bufferDurationSec: Math.round(bufferDurationSec),
        cursorAgeSec,
        allSnapshots: ringBuffer.current,   // full buffer for conflict timeline view
    };
}
