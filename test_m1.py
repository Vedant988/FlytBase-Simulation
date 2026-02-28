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
  },
  "WingRight": {
    "waypoints": [
      {"x": 60, "y": 50, "z": 0},
      {"x": 60, "y": 50, "z": 60},
      {"x": 210, "y": 210, "z": 60},
      {"x": 360, "y": 360, "z": 60},
      {"x": 360, "y": 360, "z": 0}
    ],
    "velocity": 12
  }
}

checker = OfflineBatchChecker(safety_radius=25.0)
checker.parse_mission_data(data)

for segA in checker.segments:
    print(segA)

conflicts = checker.detect_conflicts()
print(f"Conflicts detected: {len(conflicts)}")
for c in conflicts:
    print(c)
