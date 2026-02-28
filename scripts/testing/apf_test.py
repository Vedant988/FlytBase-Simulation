import json
import numpy as np
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from backend.core_math.offline_checker import OfflineBatchChecker

def run_test():
    data = {
      'DroneA': {
        'waypoints': [
          {'x': 50, 'y': 50, 'z': 0}, {'x': 50, 'y': 50, 'z': 40}, {'x': 150, 'y': 150, 'z': 45}, {'x': 250, 'y': 250, 'z': 50}, {'x': 350, 'y': 350, 'z': 55}, {'x': 350, 'y': 350, 'z': 0}
        ],
        'velocity': 10
      },
      'DroneB': {
        'waypoints': [
          {'x': 50, 'y': 350, 'z': 0}, {'x': 50, 'y': 350, 'z': 120}, {'x': 150, 'y': 250, 'z': 65}, {'x': 250, 'y': 150, 'z': 70}, {'x': 350, 'y': 50, 'z': 135}, {'x': 350, 'y': 50, 'z': 0}
        ],
        'velocity': 10
      }
    }

    checker_test = OfflineBatchChecker(safety_radius=35.0, vertical_safety_radius=15.0)
    checker_test.parse_mission_data(data)
    checker_test.auto_resolve_spatial()
    resolved_segs = checker_test.segments
    
    resolved_data = {}
    for s in resolved_segs:
        d = s['drone_id']
        if d not in resolved_data: 
            resolved_data[d] = []
        resolved_data[d].append(s)

    def get_pos(d_id, t):
        segs = resolved_data[d_id]
        for s in segs:
            if s['t_start'] <= t <= s['t_end']:
                time_range = max(0.0001, s['t_end'] - s['t_start'])
                frac = (t - s['t_start']) / time_range
                return s['A0'] + frac * (s['A1'] - s['A0'])
        if t >= segs[-1]['t_end']: return segs[-1]['A1'].copy()
        return segs[0]['A0'].copy()

    T_max = max(s['t_end'] for s in resolved_segs)
    t = 0.0
    
    min_d_overall = 9999
    
    while t <= T_max:
        pA = get_pos('DroneA', t)
        pB = get_pos('DroneB', t)
        
        dist_xy = ((pA-pB)[:2]**2).sum()**0.5
        dist_z = abs(pA[2] - pB[2])
        
        if dist_z < 15.0 and dist_xy < min_d_overall:
            min_d_overall = dist_xy
            
        t += 0.5

    print(f"Minimum XY distance achieved while vertically conflicting (<15m): {min_d_overall:.2f} meters")

if __name__ == "__main__":
    run_test()
