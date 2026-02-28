/* eslint-disable no-restricted-globals */

self.onmessage = (e) => {
    const { type, payload } = e.data;

    if (type === 'SCRUB_FUTURE') {
        // Dual-Directional Predictive Timeline Optimization
        // Payload: { timeOffset, activeDrones }
        const dt = payload.timeOffset;
        const drones = payload.activeDrones;
        const count = drones.length;

        // Generate a Float32Array to pass back with zero-copy
        const positions = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            const d = drones[i];
            // P(t) = P0 + v * t
            positions[i * 3] = d.x + (d.vx || 0) * dt;
            positions[i * 3 + 1] = d.y + (d.vy || 0) * dt;
            positions[i * 3 + 2] = d.z + (d.vz || 0) * dt;
        }

        self.postMessage({
            type: 'FUTURE_CALCULATED',
            payload: positions
        }, { transfer: [positions.buffer] }); // Transferable
    }
    else if (type === 'SHADOW_MODE_CHECK') {
        // Paused drone background math check...
    }
};

export { };
