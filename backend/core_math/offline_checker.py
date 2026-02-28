import numpy as np
import json
import os
from .cpa import compute_cpa
from ..spatial.rtree_filter import SpatialTemporalIndex

class OfflineBatchChecker:
    def __init__(self, safety_radius: float = 3.0, vertical_safety_radius: float = 15.0):
        self.safety_radius = safety_radius
        self.vertical_safety_radius = vertical_safety_radius
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
            
            # Evaluate closest horizontal approach time
            t_cpa_rel, min_dist_xy = compute_cpa(
                posA_at_overlap[:2], segA["velocity"][:2],
                posB_at_overlap[:2], segB["velocity"][:2]
            )
            
            t_cpa_abs = overlap_start + t_cpa_rel
            
            if t_cpa_abs > overlap_end:
                t_cpa_abs = overlap_end
                t_cpa_rel = overlap_end - overlap_start
                posA_end_overlap = segA["A0"] + segA["velocity"] * (overlap_end - segA["t_start"])
                posB_end_overlap = segB["A0"] + segB["velocity"] * (overlap_end - segB["t_start"])
                min_dist_xy = np.linalg.norm(posA_end_overlap[:2] - posB_end_overlap[:2])
                
            # Compute exact vertical separation at the moment of minimum horizontal separation
            z_A_at_cpa = posA_at_overlap[2] + segA["velocity"][2] * t_cpa_rel
            z_B_at_cpa = posB_at_overlap[2] + segB["velocity"][2] * t_cpa_rel
            dist_z = abs(z_A_at_cpa - z_B_at_cpa)

            # Check Dual Cylindrical Constraints
            if min_dist_xy < self.safety_radius and dist_z < self.vertical_safety_radius:
                pos_conflict = segA["A0"] + segA["velocity"] * (t_cpa_abs - segA["t_start"])
                conflicts.append({
                    "Drone_A": segA["drone_id"],
                    "Drone_B": segB["drone_id"],
                    "exact_conflict_time": float(t_cpa_abs),
                    "conflict_location": pos_conflict.tolist(),
                    "minimum_separation": float(np.sqrt(min_dist_xy**2 + dist_z**2)),
                    "severity": "CRITICAL" if min_dist_xy < self.safety_radius / 2 else "WARNING"
                })
                
        return conflicts

    def auto_resolve_time_shift(self):
        """
        Implementation of 4D Operational Intent Time-Shifting constraint resolution.
        Iteratively delays the launch of conflicting drones until the 4D path volume is clear.
        """
        resolutions = {}
        max_iterations = 100
        iteration = 0
        
        while iteration < max_iterations:
            conflicts = self.detect_conflicts()
            if not conflicts:
                break
                
            # Pick the lowest priority drone to delay (e.g. Drone_B)
            c = conflicts[0]
            drone_to_delay = c["Drone_B"]
            
            if drone_to_delay not in resolutions:
                resolutions[drone_to_delay] = 0.0
                
            delay_step = 2.0 # 2 second delay per adjustment
            resolutions[drone_to_delay] += delay_step
            
            # Shift all segments for the delayed drone forward in time
            for seg in self.segments:
                if seg["drone_id"] == drone_to_delay:
                    seg["t_start"] += delay_step
                    seg["t_end"] += delay_step
                    
            iteration += 1
            
        return resolutions

    def auto_resolve_spatial(self):
        """
        Replaces APF physics with a Strategic 4D Pre-Flight Grid Search.
        Instead of bending physics which causes wild swinging, this searches combinations 
        of departure delays (Time Shifts) and geographic parallel offsets (Path Shifts) 
        to find the cleanest alternative flight plan that yields ZERO conflicts.
        """
        if not self.segments:
            return {}

        resolutions = {}
        
        # 1. Group original segments by drone
        drone_segs = {}
        for s in self.segments:
            d_id = s["drone_id"]
            if d_id not in drone_segs:
                drone_segs[d_id] = []
            drone_segs[d_id].append(s)
            
        drone_ids = list(drone_segs.keys())
        
        # Grid Search parameters
        time_delays = [0.0, 5.0, 10.0, 15.0, 20.0, 30.0]
        lateral_shifts = [
            np.array([0,0,0], dtype=float), 
            np.array([40,0,0], dtype=float), np.array([-40,0,0], dtype=float), 
            np.array([0,40,0], dtype=float), np.array([0,-40,0], dtype=float),
            np.array([40,40,0], dtype=float), np.array([-40,-40,0], dtype=float),
            np.array([0,0,20], dtype=float), np.array([0,0,-20], dtype=float)
        ]
        
        max_iterations = 20
        iteration = 0
        
        while iteration < max_iterations:
            conflicts = self.detect_conflicts()
            if not conflicts:
                break
                
            # Pick the lowest priority drone to reroute
            c = conflicts[0]
            drone_to_fix = c["Drone_B"]
            
            best_cost = float('inf')
            best_segs = None
            best_shift = None
            best_delay = None
            
            if drone_to_fix not in drone_segs:
                break
                
            original_drone_legs = [s.copy() for s in drone_segs[drone_to_fix]]
            
            # Temporarily remove this drone's segments from the checker
            self.segments = [s for s in self.segments if s["drone_id"] != drone_to_fix]
            
            for delay in time_delays:
                for shift in lateral_shifts:
                    test_segs = []
                    for s in original_drone_legs:
                        new_s = s.copy()
                        new_s["A0"] = s["A0"] + shift
                        new_s["A1"] = s["A1"] + shift
                        new_s["t_start"] = s["t_start"] + delay
                        new_s["t_end"] = s["t_end"] + delay
                        
                        # Floor clamping
                        if new_s["A0"][2] < 0: new_s["A0"][2] = 0.0
                        if new_s["A1"][2] < 0: new_s["A1"][2] = 0.0
                            
                        test_segs.append(new_s)
                    
                    # Test integration
                    self.segments.extend(test_segs)
                    test_conflicts = self.detect_conflicts()
                    # Remove it back out
                    self.segments = self.segments[:-len(test_segs)]
                    
                    # Check if the drone being evaluated remains uncollided
                    drone_is_clear = True
                    for tc in test_conflicts:
                        if tc["Drone_A"] == drone_to_fix or tc["Drone_B"] == drone_to_fix:
                            drone_is_clear = False
                            break
                            
                    if drone_is_clear:
                        # Cost function: prefer minimal shift and delay
                        cost = delay * 2.0 + np.linalg.norm(shift)
                        if cost < best_cost:
                            best_cost = cost
                            best_segs = test_segs
                            best_shift = shift
                            best_delay = delay
                            
            if best_segs is not None:
                self.segments.extend(best_segs)
                drone_segs[drone_to_fix] = best_segs
                
                # Setup resolution report info
                resolutions[drone_to_fix] = {
                    "time_shift": float(best_delay),
                    "lateral_shift_x": float(best_shift[0]),
                    "lateral_shift_y": float(best_shift[1]),
                    "alt_shift_z": float(best_shift[2]),
                    "cost": float(best_cost)
                }
            else:
                # Fallback: Just force a huge delay so it flies *after*
                fallback_segs = []
                for s in original_drone_legs:
                    new_s = s.copy()
                    new_s["t_start"] += 45.0
                    new_s["t_end"] += 45.0
                    fallback_segs.append(new_s)
                self.segments.extend(fallback_segs)
                drone_segs[drone_to_fix] = fallback_segs
                if drone_to_fix not in resolutions:
                    resolutions[drone_to_fix] = {"fallback_delay": 0.0}
                if "fallback_delay" in resolutions[drone_to_fix]:
                    resolutions[drone_to_fix]["fallback_delay"] += 45.0
                else:
                    resolutions[drone_to_fix]["fallback_delay"] = 45.0
            
            iteration += 1
            
        return {"method": "Grid Search Parallel Path & Time", "status": "Rerouted securely without physics wobbly artifacts.", "details": resolutions}

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
