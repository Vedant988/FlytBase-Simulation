import collections
import time
import numpy as np

class TelemetryEngine:
    def __init__(self):
        self.rolling_buffers = collections.defaultdict(lambda: collections.deque(maxlen=40))
        self.bogie_estimators = {}
        
    def ingest_telemetry(self, drone_id: str, data: dict):
        data["timestamp"] = time.time()
        self.rolling_buffers[drone_id].append(data)
        
        if data.get("type") == "bogie":
            self.update_bogie_estimate(drone_id, data)
            
    def update_bogie_estimate(self, drone_id: str, data: dict):
        if drone_id not in self.bogie_estimators:
            self.bogie_estimators[drone_id] = {
                "state": np.array([data["x"], data["y"], data["z"], 
                                   data.get("vx", 0), data.get("vy", 0), data.get("vz", 0)]),
                "covariance": np.eye(6) * 5.0,
                "last_update": data["timestamp"]
            }
        else:
            dt = data["timestamp"] - self.bogie_estimators[drone_id]["last_update"]
            est = self.bogie_estimators[drone_id]
            
            F = np.eye(6)
            F[0,3] = dt
            F[1,4] = dt
            F[2,5] = dt
            
            est["state"] = F.dot(est["state"])
            est["covariance"] += np.eye(6) * 0.1 * dt
            
            meas = np.array([data["x"], data["y"], data["z"]])
            est["state"][0:3] = 0.8 * est["state"][0:3] + 0.2 * meas
            
            est["last_update"] = data["timestamp"]
            
    def get_latest_state(self):
        states = {}
        for d_id, buffer in self.rolling_buffers.items():
            if not buffer:
                continue
            latest = buffer[-1]
            if latest.get("type") == "bogie" and d_id in self.bogie_estimators:
                est = self.bogie_estimators[d_id]
                states[d_id] = {
                    "id": d_id,
                    "x": est["state"][0], "y": est["state"][1], "z": est["state"][2],
                    "vx": est["state"][3], "vy": est["state"][4], "vz": est["state"][5],
                    "type": "bogie",
                    "uncertainty_radius": float(np.trace(est["covariance"][:3,:3]))
                }
            else:
                states[d_id] = {
                    "id": d_id,
                    "x": latest["x"], "y": latest["y"], "z": latest["z"],
                    "vx": latest.get("vx", 0), "vy": latest.get("vy", 0), "vz": 0,
                    "type": "controlled",
                    "uncertainty_radius": 3.0
                }
        return states
