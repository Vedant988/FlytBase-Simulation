import { useEffect, useState } from 'react';

interface Props {
    lastMsgAt: number | null;
    droneCount: number;
    conflictCheckMs: number;
}

export function SystemHealthBadge({ lastMsgAt, droneCount, conflictCheckMs }: Props) {
    const [ageMs, setAgeMs] = useState(0);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        const id = setInterval(() => {
            setAgeMs(lastMsgAt ? Date.now() - lastMsgAt : 9_999_999);
        }, 250);
        return () => clearInterval(id);
    }, [lastMsgAt]);

    const ageSec = (ageMs / 1000).toFixed(1);

    const status =
        lastMsgAt === null ? 'connecting'
            : ageMs > 3000 ? 'dead'
                : ageMs > 1200 ? 'stale'
                    : 'live';

    const dot = status === 'live' ? '#30D158'
        : status === 'stale' ? '#FF9F0A'
            : status === 'dead' ? '#FF453A'
                : '#636366';

    const label = status === 'live' ? 'Live'
        : status === 'stale' ? 'Stale'
            : status === 'dead' ? 'Offline'
                : 'Connecting';

    const perf = conflictCheckMs > 50 ? '#FF9F0A' : '#30D158';

    return (
        <div
            onClick={() => setExpanded(e => !e)}
            style={{
                position: 'absolute',
                bottom: 76,
                left: 16,
                zIndex: 20,
                cursor: 'pointer',
                userSelect: 'none',
            }}
        >
            {/* ── Collapsed pill ── */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                background: 'rgba(28,28,30,0.88)',
                backdropFilter: 'blur(20px)',
                border: '0.5px solid rgba(255,255,255,0.1)',
                borderRadius: 20,
                padding: '5px 12px',
                fontSize: '0.72rem',
                color: 'rgba(235,235,245,0.7)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
            }}>
                <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: dot,
                    animation: status === 'live' ? 'pulse 2s ease-in-out infinite' : 'none',
                    flexShrink: 0,
                }} />
                <span style={{ color: dot, fontWeight: 500 }}>{label}</span>
                <span style={{ color: 'rgba(235,235,245,0.35)', margin: '0 2px' }}>·</span>
                <span>{droneCount} drones</span>
                <span style={{ color: 'rgba(235,235,245,0.35)', margin: '0 2px' }}>·</span>
                <span style={{ color: perf }}>{conflictCheckMs}ms</span>
                <span style={{ color: 'rgba(235,235,245,0.3)', fontSize: '0.6rem', marginLeft: 2 }}>
                    {expanded ? '▲' : '▼'}
                </span>
            </div>

            {/* ── Expanded detail card ── */}
            {expanded && (
                <div style={{
                    marginTop: 6,
                    background: 'rgba(28,28,30,0.95)',
                    backdropFilter: 'blur(24px)',
                    border: '0.5px solid rgba(255,255,255,0.1)',
                    borderRadius: 12,
                    padding: '12px 14px',
                    fontSize: '0.72rem',
                    lineHeight: 1.8,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                    minWidth: 200,
                }}>
                    <div style={{ color: 'rgba(235,235,245,0.45)', fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                        System Health
                    </div>
                    <Row label="WebSocket" value={`${label} · ${lastMsgAt === null ? '—' : ageSec + 's ago'}`} color={dot} />
                    <Row label="Drones" value={`${droneCount} tracked`} color="rgba(235,235,245,0.7)" />
                    <Row label="Conflict check" value={`${conflictCheckMs}ms/cycle`} color={perf} />
                </div>
            )}
        </div>
    );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ color: 'rgba(235,235,245,0.4)' }}>{label}</span>
            <span style={{ color }}>{value}</span>
        </div>
    );
}
