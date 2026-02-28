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
                "covariance": np.eye(6) * 1.0,   # Start near converged steady-state (trace[:3,:3]=3 ≈ controlled radius)
                "last_update": data["timestamp"]
            }
        else:
            dt = max(0.001, data["timestamp"] - self.bogie_estimators[drone_id]["last_update"])
            est = self.bogie_estimators[drone_id]
            
            # Prediction step: propagate state and covariance forward
            F = np.eye(6)
            F[0,3] = dt
            F[1,4] = dt
            F[2,5] = dt
            
            Q = np.eye(6) * 0.1 * dt   # Process noise
            est["state"] = F.dot(est["state"])
            P_pred = F.dot(est["covariance"]).dot(F.T) + Q
            
            # Measurement update: full Kalman correction to prevent unbounded growth
            H = np.zeros((3, 6))        # Observation matrix (x, y, z only measured)
            H[0,0] = H[1,1] = H[2,2] = 1.0
            R = np.eye(3) * 2.0         # Measurement noise (2m GPS noise)
            
            S = H.dot(P_pred).dot(H.T) + R
            K = P_pred.dot(H.T).dot(np.linalg.inv(S))  # Kalman gain
            
            meas = np.array([data["x"], data["y"], data["z"]])
            innovation = meas - H.dot(est["state"])
            est["state"] = est["state"] + K.dot(innovation)
            est["covariance"] = (np.eye(6) - K.dot(H)).dot(P_pred)  # Corrected covariance
            
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
                    "uncertainty_radius": min(30.0, float(np.trace(est["covariance"][:3,:3])))
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
