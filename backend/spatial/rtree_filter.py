from rtree import index
import numpy as np

class SpatialTemporalIndex:
    def __init__(self, safety_radius: float):
        p = index.Property()
        p.dimension = 4
        self.idx = index.Index(properties=p)
        self.safety_radius = safety_radius
        self.segment_map = {}
        self.counter = 0

    def insert_segment(self, segment: dict):
        A0 = segment["A0"]
        A1 = segment["A1"]
        
        min_x = min(A0[0], A1[0]) - self.safety_radius
        max_x = max(A0[0], A1[0]) + self.safety_radius
        min_y = min(A0[1], A1[1]) - self.safety_radius
        max_y = max(A0[1], A1[1]) + self.safety_radius
        min_z = min(A0[2], A1[2]) - self.safety_radius
        max_z = max(A0[2], A1[2]) + self.safety_radius
        
        t_start = segment["t_start"]
        t_end = segment["t_end"]

        bounds = (min_x, min_y, min_z, t_start, max_x, max_y, max_z, t_end)
        
        self.idx.insert(self.counter, bounds)
        self.segment_map[self.counter] = segment
        self.counter += 1

    def query_candidates(self):
        candidates = set()
        
        for i in range(self.counter):
            segment = self.segment_map[i]
            A0 = segment["A0"]
            A1 = segment["A1"]
            
            min_x = min(A0[0], A1[0]) - self.safety_radius
            max_x = max(A0[0], A1[0]) + self.safety_radius
            min_y = min(A0[1], A1[1]) - self.safety_radius
            max_y = max(A0[1], A1[1]) + self.safety_radius
            min_z = min(A0[2], A1[2]) - self.safety_radius
            max_z = max(A0[2], A1[2]) + self.safety_radius
            t_start = segment["t_start"]
            t_end = segment["t_end"]
            
            bounds = (min_x, min_y, min_z, t_start, max_x, max_y, max_z, t_end)
            
            matches = list(self.idx.intersection(bounds))
            for match in matches:
                if match != i:
                    pair = tuple(sorted((i, match)))
                    
                    if self.segment_map[i]["drone_id"] != self.segment_map[match]["drone_id"]:
                        candidates.add(pair)
                        
        return [(self.segment_map[p[0]], self.segment_map[p[1]]) for p in candidates]
