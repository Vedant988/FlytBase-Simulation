const generate30DroneMission = () => {
    const drones: Record<string, any> = {};
    for (let i = 0; i < 30; i++) {
        // Grid pattern: 6 columns, 5 rows on the ground, spaced out safely
        const col = i % 6;
        const row = Math.floor(i / 6);
        const startX = col * 150;
        const startY = row * 150;

        // Takeoff to a random cruising altitude between 50m and 200m
        const cruiseZ = Math.floor(50 + Math.random() * 150);

        // Calculate anomalous radial outward direction from center of grid
        const centerX = 375;
        const centerY = 300;
        let dx = startX - centerX;
        let dy = startY - centerY;

        // If it's exactly center, give it a random push
        if (dx === 0 && dy === 0) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
        }

        // Add some random divergence to their paths
        dx += (Math.random() - 0.5) * 50;
        dy += (Math.random() - 0.5) * 50;

        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const dirX = dx / len;
        const dirY = dy / len;

        // Create very long waypoints spreading out over 5km distance
        const wp2X = Math.floor(startX + dirX * 2000);
        const wp2Y = Math.floor(startY + dirY * 2000);
        const wp3X = Math.floor(startX + dirX * 5000);
        const wp3Y = Math.floor(startY + dirY * 5000);

        drones[`Drone_${i + 1}`] = {
            velocity: parseFloat((10 + Math.random() * 10).toFixed(1)), // random velocity 10-20m/s
            waypoints: [
                { x: startX, y: startY, z: 0 },                       // Ground Start
                { x: startX, y: startY, z: cruiseZ },                 // Vertical Takeoff
                { x: wp2X, y: wp2Y, z: cruiseZ },                     // Mid-point Cruise
                { x: wp3X, y: wp3Y, z: cruiseZ + (Math.random() * 50) } // Long-range destination w/ minor alt change
            ]
        };
    }
    return drones;
};

export const MOCK_MISSIONS_MODE3 = [
    {
        name: "30-Drone Real-World Ground Operation",
        drones: generate30DroneMission()
    }
];
