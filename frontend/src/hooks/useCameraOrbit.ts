import { useEffect, useRef, useState } from 'react';

/**
 * useCameraOrbit
 * 
 * Encapsulates all camera orbit logic:
 * - Arrow key listeners (with form element guard and preventDefault)
 * - Physics-based velocity/inertia animation loop (RAF-based, dt-scaled)
 * - Auto-orbit toggle via 'O' key
 * 
 * Returns: { isAutoOrbiting, setIsAutoOrbiting }
 * Side-effects: calls setViewState every RAF tick when bearing/pitch is changing.
 */
export function useCameraOrbit(
    isSplitScreen: boolean,
    setViewState: (updater: (prev: any) => any) => void
) {
    const [isAutoOrbiting, setIsAutoOrbiting] = useState(false);
    const activeKeysRef = useRef<Set<string>>(new Set());
    const bearingVelRef = useRef(0);  // deg/s
    const pitchVelRef = useRef(0);  // deg/s

    // Key listeners
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'o') {
                setIsAutoOrbiting(prev => !prev);
            }
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                // Don't steal arrow keys from focused inputs (prevents timeline scrubbing)
                const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
                if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
                e.preventDefault();
                activeKeysRef.current.add(e.key);
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                activeKeysRef.current.delete(e.key);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // Physics-based RAF orbit loop
    useEffect(() => {
        let animationFrame: number;
        let lastTime = performance.now();

        // Tuning constants
        const BEARING_ACCEL = 320;  // deg/s²
        const PITCH_ACCEL = 220;  // deg/s²
        const MAX_BEARING = 150;  // deg/s top speed
        const MAX_PITCH = 100;
        const DECAY = 0.88; // exponential frame-rate-normalised decay
        const ORBIT_VEL = 18;   // deg/s auto-orbit constant speed

        const rotate = () => {
            const now = performance.now();
            const dt = Math.min((now - lastTime) / 1000, 0.05); // seconds; capped at 50ms
            lastTime = now;

            if (!isSplitScreen) {
                const keys = activeKeysRef.current;
                let bVel = bearingVelRef.current;
                let pVel = pitchVelRef.current;

                // Accelerate while key held
                if (keys.has('ArrowLeft')) bVel = Math.max(-MAX_BEARING, bVel - BEARING_ACCEL * dt);
                if (keys.has('ArrowRight')) bVel = Math.min(MAX_BEARING, bVel + BEARING_ACCEL * dt);
                if (keys.has('ArrowUp')) pVel = Math.max(-MAX_PITCH, pVel - PITCH_ACCEL * dt);
                if (keys.has('ArrowDown')) pVel = Math.min(MAX_PITCH, pVel + PITCH_ACCEL * dt);

                // Auto-orbit blends toward constant velocity
                if (isAutoOrbiting && !keys.has('ArrowLeft') && !keys.has('ArrowRight')) {
                    bVel += (ORBIT_VEL - bVel) * (1 - Math.pow(DECAY, dt * 60));
                }

                // Exponential inertia decay when no key pressed
                const df = Math.pow(DECAY, dt * 60);
                if (!keys.has('ArrowLeft') && !keys.has('ArrowRight') && !isAutoOrbiting) bVel *= df;
                if (!keys.has('ArrowUp') && !keys.has('ArrowDown')) pVel *= df;

                // Dead-zone to prevent micro-drift
                if (Math.abs(bVel) < 0.05) bVel = 0;
                if (Math.abs(pVel) < 0.05) pVel = 0;

                bearingVelRef.current = bVel;
                pitchVelRef.current = pVel;

                if (bVel !== 0 || pVel !== 0) {
                    setViewState((prev: any) => ({
                        ...prev,
                        bearing: (prev.bearing + bVel * dt + 360) % 360,
                        pitch: Math.max(0, Math.min(180, prev.pitch + pVel * dt)),
                    }));
                }
            }

            animationFrame = requestAnimationFrame(rotate);
        };
        animationFrame = requestAnimationFrame(rotate);
        return () => { if (animationFrame) cancelAnimationFrame(animationFrame); };
    }, [isAutoOrbiting, isSplitScreen, setViewState]);

    return { isAutoOrbiting, setIsAutoOrbiting };
}
