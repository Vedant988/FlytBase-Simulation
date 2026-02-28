import asyncio
import time
import math
from typing import Dict, Any, Callable
from backend.simulators.bogie_generator import TelemetryGenerator

def interpolate_3d(p1, p2, ratio):
    return {
        "x": p1["x"] + (p2["x"] - p1["x"]) * ratio,
        "y": p1["y"] + (p2["y"] - p1["y"]) * ratio,
        "z": p1["z"] + (p2["z"] - p1["z"]) * ratio
    }

class ControlledGenerator(TelemetryGenerator):
    """
    Simulates cooperative/controlled drones flying strict 3D paths 
    based on approved flight plans.
    Can be paused by the ATC. Updates consistently at 2Hz.
    """
    def add_controlled_drone(self, drone_id: str, waypoints: list, velocity: float):
        if len(waypoints) < 2:
            return
            
        self.drones[drone_id] = {
            "id": drone_id,
            "waypoints": waypoints,
            "velocity": velocity,
            "current_wp_idx": 0,
            "pos": waypoints[0].copy(),
            "paused": False,
            "paused_at": None,
            "hz": 2.0,
            "last_tick": time.time()
        }

    def pause(self, drone_id: str):
        if drone_id in self.drones and not self.drones[drone_id]["paused"]:
            self.drones[drone_id]["paused"] = True
            self.drones[drone_id]["paused_at"] = time.time()

    def resume(self, drone_id: str):
        if drone_id in self.drones:
            self.drones[drone_id]["paused"] = False
            self.drones[drone_id]["paused_at"] = None

    def get_paused_status(self) -> list:
        """Returns list of paused drones with pause duration in seconds."""
        now = time.time()
        return [
            {
                "id": did,
                "paused_for": round(now - s["paused_at"], 1) if s.get("paused_at") else 0,
                "pos": s["pos"]
            }
            for did, s in self.drones.items() if s["paused"]
        ]

    def remove_drone(self, drone_id: str):
        if drone_id in self.drones:
            del self.drones[drone_id]

    async def simulate_loop(self):
        while True:
            now = time.time()
            completed_drones = []
            
            for drone_id, state in self.drones.items():
                period = 1.0 / state["hz"]
                if now - state["last_tick"] >= period:
                    state["last_tick"] = now
                    
                    if not state["paused"] and state["current_wp_idx"] < len(state["waypoints"]) - 1:
                        # Move drone physically forward by elapsed time
                        p_curr = state["pos"]
                        p_target = state["waypoints"][state["current_wp_idx"] + 1]
                        
                        dx = p_target["x"] - p_curr["x"]
                        dy = p_target["y"] - p_curr["y"]
                        dz = p_target["z"] - p_curr["z"]
                        dist = math.sqrt(dx*dx + dy*dy + dz*dz)
                        
                        # Distance to travel this tick
                        move_dist = state["velocity"] * period
                        
                        if dist <= move_dist:
                            # Reached WP
                            state["pos"] = p_target.copy()
                            state["current_wp_idx"] += 1
                            vx, vy, vz = 0, 0, 0 # Will recalculate next tick
                        else:
                            ratio = move_dist / dist
                            state["pos"]["x"] += dx * ratio
                            state["pos"]["y"] += dy * ratio
                            state["pos"]["z"] += dz * ratio
                            
                            vx = (dx / dist) * state["velocity"]
                            vy = (dy / dist) * state["velocity"]
                            vz = (dz / dist) * state["velocity"]
                            
                        # Send Telemetry explicitly via callback (no noise for controlled drops)
                        self.callback(drone_id, {
                            "type": "controlled",
                            "x": state["pos"]["x"],
                            "y": state["pos"]["y"],
                            "z": state["pos"]["z"],
                            "vx": vx, "vy": vy, "vz": vz
                        })
                    elif state["current_wp_idx"] >= len(state["waypoints"]) - 1:
                        completed_drones.append(drone_id)
            
            for d in completed_drones:
                self.remove_drone(d)
                
            await asyncio.sleep(0.1) # polling resolution
