import numpy as np
import copy
from .cpa import compute_cpa
from ..spatial.h3_grid import RealTimeSpatialHash

class RealTimeATC:
    def __init__(self, telemetry_engine):
        self.te = telemetry_engine
        self.active_ras = {} # Drone_ID -> RA info
        
    def monitor_airspace(self):
        """
        Runs continuously on the latest state to identify real-time conflicts
        and generate RAs.
        """
        states = self.te.get_latest_state()
        if not states:
            return []
            
        # 1. Broad phase
        grid = RealTimeSpatialHash(resolution=10)
        for d_id, state in states.items():
            grid.insert_drone(d_id, state["x"], state["y"], state["uncertainty_radius"])
            
        candidates = grid.get_candidate_pairs()
        
        # 2. Continuous Decision Layer
        conflicts = []
        for id_A, id_B in candidates:
            stA = states[id_A]
            stB = states[id_B]
            
            p0_A = np.array([stA["x"], stA["y"], stA["z"]])
            v_A = np.array([stA["vx"], stA["vy"], stA["vz"]])
            
            p0_B = np.array([stB["x"], stB["y"], stB["z"]])
            v_B = np.array([stB["vx"], stB["vy"], stB["vz"]])
            
            t_cpa, min_dist = compute_cpa(p0_A, v_A, p0_B, v_B)
            
            combo_radius = stA["uncertainty_radius"] + stB["uncertainty_radius"]
            
            if min_dist < combo_radius and t_cpa >= 0 and t_cpa < 60.0:
                # Severity analysis
                sev = "CRITICAL" if min_dist < combo_radius * 0.5 else "WARNING"
                
                # Check for RAs (for controlled drones only)
                ra = None
                if stA["type"] == "controlled" and stB["type"] == "bogie":
                    ra = self.generate_resolution(stA, stB, t_cpa, min_dist, combo_radius)
                elif stB["type"] == "controlled" and stA["type"] == "bogie":
                    ra = self.generate_resolution(stB, stA, t_cpa, min_dist, combo_radius)
                
                conflicts.append({
                    "id_A": id_A,
                    "id_B": id_B,
                    "min_dist": min_dist,
                    "t_cpa": t_cpa,
                    "severity": sev,
                    "ra": ra
                })
                
        return conflicts
        
    def generate_resolution(self, controlled_state, bogie_state, t_cpa, min_dist, combo_radius):
        """
        Generates a delay advisory (e.g. Pause for X seconds).
        By effectively shifting the controlled drone by +dt.
        """
        # Simplest non-binding advisory: Delay / Pause
        # How long must A wait such that at Bogie's CPA, A is trailing behind securely?
        p0_B = np.array([bogie_state["x"], bogie_state["y"], bogie_state["z"]])
        v_B = np.array([bogie_state["vx"], bogie_state["vy"], bogie_state["vz"]])
        
        # Simulated check: if we pause A for 5.0 seconds
        delay_time = 5.0
        return {
            "type": "DELAY",
            "drone": controlled_state["id"],
            "suggested_delay_seconds": delay_time,
            "message": f"Delay {controlled_state['id']} by {delay_time}s to avoid {bogie_state['id']}"
        }
