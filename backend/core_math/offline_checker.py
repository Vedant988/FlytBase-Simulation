import numpy as np
import json
import os
from .cpa import compute_cpa
from ..spatial.rtree_filter import SpatialTemporalIndex

class OfflineBatchChecker:
    def __init__(self, safety_radius: float = 3.0):
        self.safety_radius = safety_radius
        self.segments = []
        
    def parse_mission_file(self, filepath: str):
        with open(filepath, 'r') as f:
            data = json.load(f)
        self.parse_mission_data(data)
            
    def parse_mission_data(self, data: dict):
        for drone_id, info in data.items():
            self.parse_mission(
                drone_id, 
                info.get("waypoints", []), 
                info.get("start_time", 0.0), 
                info.get("end_time"), 
                info.get("velocity")
            )
            
    def parse_mission(self, drone_id: str, waypoints: list, start_time: float, end_time: float = None, velocity: float = None):
        if not waypoints or len(waypoints) < 2:
            return
            
        total_dist = 0.0
        dists = []
        vecs = []
        for i in range(len(waypoints) - 1):
            w0 = np.array([waypoints[i]["x"], waypoints[i]["y"], waypoints[i].get("z", 50.0)], dtype=float)
            w1 = np.array([waypoints[i+1]["x"], waypoints[i+1]["y"], waypoints[i+1].get("z", 50.0)], dtype=float)
            dist = np.linalg.norm(w1 - w0)
            dists.append(dist)
            total_dist += dist
            vecs.append((w0, w1))
            
        if end_time is not None and total_dist > 0:
            velocity = total_dist / (end_time - start_time)
        elif velocity is None:
            velocity = 5.0
            
        current_time = start_time
        for i in range(len(vecs)):
            w0, w1 = vecs[i]
            dist = dists[i]
            if dist == 0:
                continue
                
            time_duration = dist / velocity
            seg_end_time = current_time + time_duration
            
            v_vec = (w1 - w0) / time_duration
            
            self.segments.append({
                "drone_id": drone_id,
                "A0": w0,
                "A1": w1,
                "velocity": v_vec,
                "t_start": current_time,
                "t_end": seg_end_time
            })
            current_time = seg_end_time

    def detect_conflicts(self):
        conflicts = []
        
        index = SpatialTemporalIndex(self.safety_radius)
        for seg in self.segments:
            index.insert_segment(seg)
            
        candidates = index.query_candidates()
        
        for segA, segB in candidates:
            overlap_start = max(segA["t_start"], segB["t_start"])
            overlap_end = min(segA["t_end"], segB["t_end"])
            
            if overlap_start >= overlap_end:
                continue
            
            t_offset_A = overlap_start - segA["t_start"]
            t_offset_B = overlap_start - segB["t_start"]
            
            posA_at_overlap = segA["A0"] + segA["velocity"] * t_offset_A
            posB_at_overlap = segB["A0"] + segB["velocity"] * t_offset_B
            
            t_cpa_rel, min_dist = compute_cpa(
                posA_at_overlap, segA["velocity"],
                posB_at_overlap, segB["velocity"]
            )
            
            t_cpa_abs = overlap_start + t_cpa_rel
            
            if t_cpa_abs > overlap_end:
                posA_end_overlap = segA["A0"] + segA["velocity"] * (overlap_end - segA["t_start"])
                posB_end_overlap = segB["A0"] + segB["velocity"] * (overlap_end - segB["t_start"])
                min_dist = np.linalg.norm(posA_end_overlap - posB_end_overlap)
                t_cpa_abs = overlap_end
                
            if min_dist < self.safety_radius:
                pos_conflict = segA["A0"] + segA["velocity"] * (t_cpa_abs - segA["t_start"])
                conflicts.append({
                    "Drone_A": segA["drone_id"],
                    "Drone_B": segB["drone_id"],
                    "exact_conflict_time": float(t_cpa_abs),
                    "conflict_location": pos_conflict.tolist(),
                    "minimum_separation": float(min_dist),
                    "severity": "CRITICAL" if min_dist < self.safety_radius / 2 else "WARNING"
                })
                
        return conflicts

    def run_pipeline(self, input_filepath: str, output_filepath: str):
        self.parse_mission_file(input_filepath)
        conflicts = self.detect_conflicts()
        
        os.makedirs(os.path.dirname(output_filepath), exist_ok=True)
        with open(output_filepath, 'w') as f:
            json.dump(conflicts, f, indent=4)
        print(f"Mode 1 Batch Check Complete. Found {len(conflicts)} conflicts. Report: {output_filepath}")
        
if __name__ == "__main__":
    checker = OfflineBatchChecker(safety_radius=3.0)
    checker.run_pipeline("mock_data/mission.json", "mock_data/report.json")
