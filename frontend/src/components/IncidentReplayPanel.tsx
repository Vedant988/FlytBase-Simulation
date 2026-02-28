import type { ReplaySnapshot } from '../hooks/useReplayBuffer';

interface Props {
    isReplaying: boolean;
    replayCursor: number;
    setReplayCursor: (v: number) => void;
    replaySnapshot: ReplaySnapshot | null;
    bufferDurationSec: number;
    cursorAgeSec: string | number;
    onActivate: () => void;
    onExit: () => void;
    hasBuffer: boolean;
    allSnapshots: ReplaySnapshot[];
}

// ── Floating trigger button (shown when NOT replaying) ─────────────────────
export function ReplayTriggerButton({ onActivate, hasBuffer, bufferDurationSec }: Pick<Props, 'onActivate' | 'hasBuffer' | 'bufferDurationSec'>) {
    return (
        <button
            onClick={onActivate}
            disabled={!hasBuffer}
            title={hasBuffer ? `Replay last ${bufferDurationSec}s of telemetry` : 'Building replay buffer…'}
            style={{
                padding: '5px 14px',
                background: hasBuffer ? 'rgba(191,90,242,0.12)' : 'rgba(255,255,255,0.04)',
                border: `0.5px solid ${hasBuffer ? 'rgba(191,90,242,0.4)' : 'rgba(255,255,255,0.08)'}`,
                color: hasBuffer ? '#BF5AF2' : 'rgba(235,235,245,0.25)',
                borderRadius: 20,
                cursor: hasBuffer ? 'pointer' : 'default',
                fontSize: '0.73rem',
                fontWeight: 500,
                whiteSpace: 'nowrap',
            }}
        >
            Replay {hasBuffer ? `· ${bufferDurationSec}s` : ''}
        </button>
    );
}

// ── Full-screen overlay (shown when replaying) ──────────────────────────────
export function IncidentReplayPanel({
    isReplaying, replayCursor, setReplayCursor,
    replaySnapshot, bufferDurationSec, cursorAgeSec,
    onExit, allSnapshots,
}: Props) {
    if (!isReplaying) return null;

    const snap = replaySnapshot;
    const conflicts = snap?.conflicts ?? [];
    const tel = snap?.telemetry ?? [];

    // Build a summary of every frame that had conflicts
    const conflictEvents: { idx: number; pct: number; ageSec: number; count: number; severity: string }[] = [];
    const now = Date.now();
    allSnapshots.forEach((s, idx) => {
        if (s.conflicts.length > 0) {
            const hasCritical = s.conflicts.some((c: any) => c.severity === 'CRITICAL');
            conflictEvents.push({
                idx,
                pct: (idx / Math.max(allSnapshots.length - 1, 1)) * 100,
                ageSec: parseFloat(((now - s.timestamp) / 1000).toFixed(1)),
                count: s.conflicts.length,
                severity: hasCritical ? 'CRITICAL' : 'WARNING',
            });
        }
    });

    return (
        // Full-screen backdrop
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9000,
            background: 'rgba(0,0,8,0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            flexDirection: 'column',
        }}>
            {/* ── Top bar ── */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 28px',
                background: 'rgba(8,12,28,0.95)',
                borderBottom: '1px solid rgba(99,102,241,0.4)',
                flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#a5b4fc', letterSpacing: '0.06em' }}>
                        🎬 INCIDENT REPLAY
                    </span>
                    <span style={{
                        background: 'rgba(99,102,241,0.2)',
                        border: '1px solid rgba(99,102,241,0.5)',
                        borderRadius: 20,
                        padding: '2px 10px',
                        fontSize: '0.7rem',
                        color: '#a5b4fc',
                    }}>
                        ⏺ LIVE PAUSED — reviewing last {bufferDurationSec}s
                    </span>
                </div>
                <button
                    onClick={onExit}
                    style={{
                        padding: '6px 18px',
                        background: 'rgba(239,68,68,0.2)',
                        border: '1px solid #ef4444',
                        color: '#ef4444',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                    }}
                >
                    ✕ EXIT REPLAY
                </button>
            </div>

            {/* ── Main content ── */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* LEFT — Conflict event log */}
                <div style={{
                    width: 320,
                    flexShrink: 0,
                    background: 'rgba(5,8,20,0.9)',
                    borderRight: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.65rem', color: '#6366f1', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                            Conflict Events — last {bufferDurationSec}s
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 2 }}>
                            {conflictEvents.length} frame{conflictEvents.length !== 1 ? 's' : ''} with conflicts recorded
                        </div>
                    </div>

                    <div style={{ overflowY: 'auto', flex: 1, padding: '8px' }}>
                        {conflictEvents.length === 0 ? (
                            <div style={{ color: '#22c55e', fontSize: '0.8rem', padding: '16px 8px' }}>
                                ✅ No conflicts in recorded buffer
                            </div>
                        ) : (
                            conflictEvents.map((ev, i) => {
                                const isCritical = ev.severity === 'CRITICAL';
                                const isActive = Math.abs(replayCursor - ev.pct) < 3;
                                return (
                                    <button
                                        key={i}
                                        onClick={() => setReplayCursor(ev.pct)}
                                        style={{
                                            width: '100%',
                                            textAlign: 'left',
                                            background: isActive
                                                ? (isCritical ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.15)')
                                                : 'rgba(255,255,255,0.02)',
                                            border: `1px solid ${isActive ? (isCritical ? '#ef4444' : '#f59e0b') : 'rgba(255,255,255,0.06)'}`,
                                            borderLeft: `3px solid ${isCritical ? '#ef4444' : '#f59e0b'}`,
                                            borderRadius: 6,
                                            padding: '8px 10px',
                                            marginBottom: 4,
                                            cursor: 'pointer',
                                            transition: 'all 0.15s',
                                            color: '#e5e7eb',
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                            <span style={{ color: isCritical ? '#ef4444' : '#f59e0b', fontWeight: 700, fontSize: '0.72rem' }}>
                                                {isCritical ? '🔴' : '🟠'} {ev.severity}
                                            </span>
                                            <span style={{ color: '#6b7280', fontSize: '0.65rem' }}>
                                                {ev.ageSec}s ago
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.68rem', color: '#9ca3af' }}>
                                            {ev.count} conflict pair{ev.count > 1 ? 's' : ''} detected
                                        </div>
                                        {isActive && (
                                            <div style={{ fontSize: '0.62rem', color: '#a5b4fc', marginTop: 2 }}>
                                                ← viewing this moment
                                            </div>
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* RIGHT — Current snapshot details */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '20px 24px' }}>

                    {/* Scrubber */}
                    <div style={{ marginBottom: 20, flexShrink: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#4b5563', marginBottom: 6 }}>
                            <span>← {bufferDurationSec}s ago (oldest)</span>
                            <span style={{ color: '#a5b4fc', fontWeight: 700 }}>
                                {snap ? `${cursorAgeSec}s ago · ${new Date(snap.timestamp).toLocaleTimeString()}` : 'No snapshot'}
                            </span>
                            <span>Now →</span>
                        </div>

                        {/* Track with event markers */}
                        <div style={{ position: 'relative', height: 36, display: 'flex', alignItems: 'center' }}>
                            <input
                                type="range"
                                min={0} max={100}
                                value={replayCursor}
                                onChange={e => setReplayCursor(Number(e.target.value))}
                                style={{ width: '100%', accentColor: '#6366f1', cursor: 'pointer' }}
                            />
                            {/* Conflict event dots on track */}
                            {conflictEvents.map((ev, i) => (
                                <div
                                    key={i}
                                    onClick={() => setReplayCursor(ev.pct)}
                                    title={`${ev.severity} — ${ev.ageSec}s ago`}
                                    style={{
                                        position: 'absolute',
                                        left: `${ev.pct}%`,
                                        top: 0,
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        background: ev.severity === 'CRITICAL' ? '#ef4444' : '#f59e0b',
                                        transform: 'translateX(-50%)',
                                        cursor: 'pointer',
                                        boxShadow: `0 0 6px ${ev.severity === 'CRITICAL' ? '#ef4444' : '#f59e0b'}`,
                                        zIndex: 2,
                                    }}
                                />
                            ))}
                        </div>
                        <div style={{ fontSize: '0.62rem', color: '#4b5563', marginTop: 4 }}>
                            {conflictEvents.length > 0
                                ? `🔴 ${conflictEvents.filter(e => e.severity === 'CRITICAL').length} critical  🟠 ${conflictEvents.filter(e => e.severity !== 'CRITICAL').length} warning events marked on scrubber`
                                : 'No conflict events in buffer'}
                        </div>
                    </div>

                    {/* Stats row */}
                    <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexShrink: 0 }}>
                        {[
                            { label: 'Drones at this moment', value: tel.length, color: '#a78bfa' },
                            { label: 'Active conflicts', value: conflicts.length, color: conflicts.length > 0 ? '#ef4444' : '#22c55e' },
                            { label: 'Critical', value: conflicts.filter((c: any) => c.severity === 'CRITICAL').length, color: '#ef4444' },
                            { label: 'Warnings', value: conflicts.filter((c: any) => c.severity !== 'CRITICAL').length, color: '#f59e0b' },
                        ].map(({ label, value, color }) => (
                            <div key={label} style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.07)',
                                borderRadius: 8,
                                padding: '8px 14px',
                                minWidth: 90,
                            }}>
                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color }}>{value}</div>
                                <div style={{ fontSize: '0.62rem', color: '#6b7280', marginTop: 2 }}>{label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Conflict detail cards at this moment */}
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {conflicts.length === 0 ? (
                            <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                height: 160, color: '#22c55e', fontSize: '1rem', gap: 8,
                            }}>
                                <span style={{ fontSize: '2rem' }}>✅</span>
                                Airspace was clear at this moment
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                                {conflicts
                                    .slice()
                                    .sort((a: any, b: any) => a.t_cpa - b.t_cpa)
                                    .map((c: any, i: number) => {
                                        const isCritical = c.severity === 'CRITICAL';
                                        const col = isCritical ? '#ef4444' : '#f59e0b';
                                        const dA = tel.find((d: any) => d.id === c.id_A);
                                        const dB = tel.find((d: any) => d.id === c.id_B);
                                        const cx = dA && dB ? ((dA.x + dB.x) / 2).toFixed(0) : '?';
                                        const cy = dA && dB ? ((dA.y + dB.y) / 2).toFixed(0) : '?';
                                        const cz = dA && dB ? ((dA.z + dB.z) / 2).toFixed(0) : '?';
                                        return (
                                            <div key={i} style={{
                                                background: isCritical ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.07)',
                                                border: `1px solid ${col}50`,
                                                borderLeft: `4px solid ${col}`,
                                                borderRadius: 10,
                                                padding: '14px 16px',
                                            }}>
                                                {/* Header */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                                    <span style={{ color: col, fontWeight: 800, fontSize: '0.85rem' }}>
                                                        {isCritical ? '🔴' : '🟠'} {c.severity}
                                                    </span>
                                                    <span style={{ color: '#6b7280', fontSize: '0.72rem' }}>
                                                        CPA in {c.t_cpa.toFixed(1)}s
                                                    </span>
                                                </div>

                                                {/* Drone pair */}
                                                <div style={{ marginBottom: 8, fontSize: '0.9rem' }}>
                                                    <span style={{ color: '#60a5fa', fontWeight: 700 }}>{c.id_A}</span>
                                                    <span style={{ color: '#4b5563', margin: '0 8px', fontSize: '1rem' }}>⟷</span>
                                                    <span style={{ color: '#60a5fa', fontWeight: 700 }}>{c.id_B}</span>
                                                </div>

                                                {/* Metrics grid */}
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: '0.72rem' }}>
                                                    <div style={{ color: '#6b7280' }}>
                                                        Min Separation: <strong style={{ color: '#e5e7eb' }}>{c.min_dist.toFixed(1)}m</strong>
                                                    </div>
                                                    <div style={{ color: '#6b7280' }}>
                                                        Location: <strong style={{ color: '#e5e7eb' }}>[{cx},{cy},{cz}m]</strong>
                                                    </div>
                                                    {dA && (
                                                        <div style={{ color: '#6b7280' }}>
                                                            {c.id_A} type: <strong style={{ color: dA.type === 'controlled' ? '#22c55e' : '#ef4444' }}>{dA.type}</strong>
                                                        </div>
                                                    )}
                                                    {dB && (
                                                        <div style={{ color: '#6b7280' }}>
                                                            {c.id_B} type: <strong style={{ color: dB.type === 'controlled' ? '#22c55e' : '#ef4444' }}>{dB.type}</strong>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* RA if present */}
                                                {c.ra && (
                                                    <div style={{ marginTop: 8, fontSize: '0.7rem', color: '#a78bfa', background: 'rgba(99,102,241,0.1)', borderRadius: 4, padding: '5px 8px' }}>
                                                        💡 {c.ra.message}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
