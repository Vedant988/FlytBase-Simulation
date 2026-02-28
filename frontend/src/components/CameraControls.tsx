import React from 'react';

interface Props {
    isSplitScreen: boolean;
    setIsSplitScreen: (val: boolean) => void;
    setMultiViewState: (val: any) => void;
    getCenterViewState: (baseState: any) => any;
    initialViewState: any;
    viewState: any;
    setViewState: React.Dispatch<React.SetStateAction<any>>;
    smoothSetViewState: (updater: (v: any) => any) => void;
    children?: React.ReactNode;
}

const pill = (active: boolean): React.CSSProperties => ({
    padding: '4px 14px',
    background: active ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.07)',
    color: active ? '#000' : 'rgba(235,235,245,0.6)',
    border: 'none',
    borderRadius: 20,
    cursor: 'pointer',
    fontSize: '0.72rem',
    fontWeight: active ? 600 : 400,
    transition: 'background 0.15s, color 0.15s',
    whiteSpace: 'nowrap',
});

export function CameraControls({
    isSplitScreen, setIsSplitScreen,
    setMultiViewState, getCenterViewState,
    initialViewState, viewState, setViewState, smoothSetViewState,
    children,
}: Props) {
    const splitViewState = {
        'xy-plane': { ...getCenterViewState(initialViewState), pitch: 0, bearing: 0 },
        'yz-plane': { ...getCenterViewState(initialViewState), pitch: 89.9, bearing: 90 },
        'xz-plane': { ...getCenterViewState(initialViewState), pitch: 89.9, bearing: 0 },
    };

    return (
        <div style={{
            position: 'absolute',
            bottom: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
            background: 'rgba(18,18,20,0.90)',
            padding: '9px 18px 10px',
            borderRadius: 18,
            border: '0.5px solid rgba(255,255,255,0.09)',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 2px 20px rgba(0,0,0,0.6)',
            pointerEvents: 'auto',
            minWidth: 560,
        }}>
            {/* Timeline slot */}
            {children && (
                <div style={{ width: '100%' }}>
                    {children}
                </div>
            )}

            {/* Hairline divider */}
            {children && (
                <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.07)', margin: '1px -4px' }} />
            )}

            {/* Controls row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                <span style={{
                    fontSize: '0.62rem',
                    fontWeight: 500,
                    color: 'rgba(235,235,245,0.28)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                }}>
                    Camera&nbsp;·&nbsp;
                    <span style={{ color: 'rgba(10,132,255,0.7)' }}>↑↓←→ POI</span>
                </span>

                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'nowrap' }}>
                    <button
                        style={pill(isSplitScreen)}
                        onClick={() => { if (!isSplitScreen) setMultiViewState(splitViewState); setIsSplitScreen(!isSplitScreen); }}
                    >
                        {isSplitScreen ? 'Exit Split' : 'Split'}
                    </button>

                    {isSplitScreen && (
                        <button style={pill(false)} onClick={() => setMultiViewState(splitViewState)}>Reset</button>
                    )}

                    {!isSplitScreen && (
                        <>
                            <button
                                style={pill(viewState.pitch >= 40 && viewState.pitch <= 50)}
                                onClick={() => setViewState(initialViewState)}
                            >3D</button>
                            <button
                                style={pill(viewState.pitch === 0)}
                                onClick={() => smoothSetViewState((v: any) => ({ ...v, pitch: 0, bearing: 0 }))}
                            >Top</button>
                            <button
                                style={pill(viewState.bearing === 90)}
                                onClick={() => smoothSetViewState((v: any) => ({ ...v, pitch: 60, bearing: 90 }))}
                            >Side</button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
