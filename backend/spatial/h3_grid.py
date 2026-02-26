import h3
import math

class RealTimeSpatialHash:
    def __init__(self, resolution: int = 10):
        # Resolution 10 is ~66m edge length, suitable for drones
        self.resolution = resolution
        self.grid = {}

    def insert_drone(self, drone_id: str, x: float, y: float, r: float):
        """
        Since real-time drones broadcast GPS, we map (x,y) to H3 cells.
        For exactness, x/y are treated as meters relative to a mock origin.
        We convert (x,y) to lat/lon for H3. 1 deg lat ~ 111km.
        """
        # Hacky meters-to-lat/lon mapping for testing
        lat = 0.0 + (y / 111000.0)
        lon = 0.0 + (x / 111000.0)
        
        cell = h3.latlng_to_cell(lat, lon, self.resolution)
        
        # In real-time, also get k-ring to handle border crossings and dynamic radius
        k = math.ceil(r / 66.0) # r in meters
        cells = h3.grid_disk(cell, k)
        
        for c in cells:
            if c not in self.grid:
                self.grid[c] = []
            self.grid[c].append(drone_id)

    def get_candidate_pairs(self):
        """
        Returns set of drone pair tuples that are in the same grid cell.
        """
        pairs = set()
        for cell, drones in self.grid.items():
            n = len(drones)
            for i in range(n):
                for j in range(i + 1, n):
                    if drones[i] != drones[j]:
                        pairs.add(tuple(sorted((drones[i], drones[j]))))
        return list(pairs)
        
    def clear(self):
        self.grid = {}
