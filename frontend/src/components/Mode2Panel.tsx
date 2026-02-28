import React from 'react';

interface Props {
    runMode2: () => void;
    m2Form: any;
    setM2Form: React.Dispatch<React.SetStateAction<any>>;
    mode2Trace: string;
}

export function Mode2Panel({ runMode2, m2Form, setM2Form, mode2Trace }: Props) {
    return (
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
    );
}

