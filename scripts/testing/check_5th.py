from backend.core_math.offline_checker import OfflineBatchChecker
import json
import numpy as np

data = {
    'DeliveryDrone_Slow': {
        'waypoints': [
            { 'x': 100, 'y': 100, 'z': 0 },
            { 'x': 100, 'y': 100, 'z': 50 },
            { 'x': 400, 'y': 100, 'z': 50 },
            { 'x': 400, 'y': 100, 'z': 0 }
        ],
        'velocity': 5
    },
    'MedicalDrone_Fast': {
        'waypoints': [
            { 'x': 0, 'y': 100, 'z': 0 },
            { 'x': 0, 'y': 100, 'z': 50 },
            { 'x': 500, 'y': 100, 'z': 50 },
            { 'x': 500, 'y': 100, 'z': 0 }
        ],
        'velocity': 15
    }
}

checker = OfflineBatchChecker(safety_radius=35.0, vertical_safety_radius=15.0)
checker.segments = []
checker.parse_mission_data(data)
checker.auto_resolve_spatial()
resolved_segs = checker.segments

for seg in resolved_segs:
    if seg['A1'][2] < 0:
        print(f"Drone underground! {seg['drone_id']} at t={seg['t_end']} Z={seg['A1'][2]}")
    if seg['A0'][2] < 0:
        print(f"Drone underground! {seg['drone_id']} at t={seg['t_start']} Z={seg['A0'][2]}")
print("Check complete.")
