interface PausedDrone { id: string; paused_for: number; }

interface Props {
    activeDrones: string[];
    pausedDrones: PausedDrone[];
    onPause: (id: string) => void;
    onResume: (id: string) => void;
}

const WARN_SECS = 30;

// ── Tiny label component ────────────────────────────────────────────────
function SectionLabel({ children, color = 'rgba(235,235,245,0.35)' }: { children: React.ReactNode; color?: string }) {
    return (
        <div style={{
            fontSize: '0.62rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color,
            marginBottom: 7,
        }}>
            {children}
        </div>
    );
}

export function DroneControlPanel({ activeDrones, pausedDrones, onPause, onResume }: Props) {
    const pausedIds = new Set(pausedDrones.map(d => d.id));
    const flyingIds = activeDrones.filter(id => !pausedIds.has(id));

    if (activeDrones.length === 0 && pausedDrones.length === 0) return null;

    return (
        <div style={{
            background: 'rgba(28,28,30,0.6)',
            border: '0.5px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            padding: '14px 16px',
            marginTop: 10,
            backdropFilter: 'blur(12px)',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 12,
            }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
                    Drone Control
                </span>
                <span style={{ fontSize: '0.68rem', color: 'rgba(235,235,245,0.35)' }}>
                    {activeDrones.length} active · {pausedDrones.length} paused
                </span>
            </div>

            {/* Paused (priority — needs action) */}
            {pausedDrones.length > 0 && (
                <div style={{ marginBottom: flyingIds.length > 0 ? 12 : 0 }}>
                    <SectionLabel color="#FF9F0A">Paused</SectionLabel>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {pausedDrones.map(d => {
                            const overdue = d.paused_for > WARN_SECS;
                            const borderCol = overdue ? '#FF453A' : '#FF9F0A';
                            return (
                                <div key={d.id} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    background: overdue ? 'rgba(255,69,58,0.07)' : 'rgba(255,159,10,0.07)',
                                    border: `0.5px solid ${borderCol}40`,
                                    borderLeft: `2.5px solid ${borderCol}`,
                                    borderRadius: 8,
                                    padding: '6px 10px',
                                }}>
                                    <div>
                                        <span style={{ fontSize: '0.76rem', fontWeight: 600, color: borderCol }}>
                                            {d.id}
                                        </span>
                                        <span style={{ fontSize: '0.68rem', color: 'rgba(235,235,245,0.4)', marginLeft: 8 }}>
                                            {Math.round(d.paused_for)}s{overdue ? ' — resume!' : ''}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => onResume(d.id)}
                                        style={{
                                            padding: '4px 12px',
                                            background: 'rgba(48,209,88,0.15)',
                                            border: '0.5px solid rgba(48,209,88,0.4)',
                                            color: '#30D158',
                                            borderRadius: 20,
                                            cursor: 'pointer',
                                            fontSize: '0.68rem',
                                            fontWeight: 600,
                                        }}
                                    >
                                        Resume
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Flying drone chips */}
            {flyingIds.length > 0 && (
                <div>
                    <SectionLabel>Flying — tap to pause</SectionLabel>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {flyingIds.map(id => (
                            <button
                                key={id}
                                onClick={() => onPause(id)}
                                title={`Pause ${id}`}
                                style={{
                                    padding: '4px 10px',
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '0.5px solid rgba(255,255,255,0.1)',
                                    color: 'rgba(235,235,245,0.75)',
                                    borderRadius: 20,
                                    cursor: 'pointer',
                                    fontSize: '0.7rem',
                                    fontWeight: 500,
                                }}
                            >
                                {id}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// React import needed for JSX
import React from 'react';
