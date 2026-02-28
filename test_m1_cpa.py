import sys
sys.path.append('.')

from backend.core_math.offline_checker import OfflineBatchChecker

data = {
  "Lead": {
    "waypoints": [
      {"x": 50, "y": 50, "z": 0},
      {"x": 50, "y": 50, "z": 60},
      {"x": 200, "y": 200, "z": 60},
      {"x": 350, "y": 350, "z": 60},
      {"x": 350, "y": 350, "z": 0}
    ],
    "velocity": 12
  },
  "WingLeft": {
    "waypoints": [
      {"x": 40, "y": 50, "z": 0},
      {"x": 40, "y": 50, "z": 60},
      {"x": 190, "y": 190, "z": 60},
      {"x": 340, "y": 340, "z": 60},
      {"x": 340, "y": 340, "z": 0}
    ],
    "velocity": 12
  }
}

import numpy as np
from backend.core_math.cpa import compute_cpa

checker = OfflineBatchChecker(safety_radius=1000.0)
checker.parse_mission_data(data)

min_distances = []
for segA in checker.segments:
    for segB in checker.segments:
        if segA["drone_id"] >= segB["drone_id"]: continue
        
        overlap_start = max(segA["t_start"], segB["t_start"])
        overlap_end = min(segA["t_end"], segB["t_end"])
        if overlap_start >= overlap_end: continue
            
        t_offset_A = overlap_start - segA["t_start"]
        t_offset_B = overlap_start - segB["t_start"]
        
        posA_at_overlap = segA["A0"] + segA["velocity"] * t_offset_A
        posB_at_overlap = segB["A0"] + segB["velocity"] * t_offset_B
        
        t_cpa_rel, min_dist = compute_cpa(
            posA_at_overlap, segA["velocity"],
            posB_at_overlap, segB["velocity"]
        )
        t_cpa_abs = overlap_start + t_cpa_rel
        
        computed_min_dist = min_dist
        if t_cpa_abs > overlap_end:
            posA_end_overlap = segA["A0"] + segA["velocity"] * (overlap_end - segA["t_start"])
            posB_end_overlap = segB["A0"] + segB["velocity"] * (overlap_end - segB["t_start"])
            computed_min_dist = np.linalg.norm(posA_end_overlap - posB_end_overlap)
        
        min_distances.append(computed_min_dist)
        print(f"Overlap {overlap_start:.2f}-{overlap_end:.2f} | CPA t={t_cpa_abs:.2f} | Dist={computed_min_dist:.2f}")

print("Absolute minimum distance reached between Lead and WingLeft:", min(min_distances))

