
interface Props {
    activeMode: 1 | 2 | 3;
    setActiveMode: (mode: 1 | 2 | 3) => void;
    setViewState: (state: any) => void;
    initialViewState: any;
}

export function ModeSelector({ activeMode, setActiveMode, setViewState, initialViewState }: Props) {
    return (
        <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 100, display: 'flex', gap: '5px', background: 'rgba(0,0,0,0.6)', padding: '5px', borderRadius: '30px', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
            <button onClick={() => { setActiveMode(1); setViewState(initialViewState); }} style={{ padding: '8px 20px', fontWeight: 'bold', background: activeMode === 1 ? 'var(--accent)' : 'transparent', color: activeMode === 1 ? '#fff' : 'var(--text-muted)', borderRadius: '25px', cursor: 'pointer', border: 'none', transition: 'all 0.2s' }}>M1: BATCH CHECK</button>
            <button onClick={() => { setActiveMode(2); setViewState(initialViewState); }} style={{ padding: '8px 20px', fontWeight: 'bold', background: activeMode === 2 ? 'var(--accent)' : 'transparent', color: activeMode === 2 ? '#fff' : 'var(--text-muted)', borderRadius: '25px', cursor: 'pointer', border: 'none', transition: 'all 0.2s' }}>M2: MATH PROOF</button>
            <button onClick={() => { setActiveMode(3); setViewState(initialViewState); }} style={{ padding: '8px 20px', fontWeight: 'bold', background: activeMode === 3 ? 'var(--accent)' : 'transparent', color: activeMode === 3 ? '#fff' : 'var(--text-muted)', borderRadius: '25px', cursor: 'pointer', border: 'none', transition: 'all 0.2s' }}>M3: LIVE ATC</button>
        </div>
    );
}

