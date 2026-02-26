import asyncio
import random
import time
from typing import Dict, Any, Callable

class TelemetryGenerator:
    """
    Base class for asynchronous drone simulators. 
    Can generate dropouts and noisy telemetry.
    """
    def __init__(self, callback: Callable[[str, Dict[str, float]], None]):
        self.callback = callback
        self.drones = {}

    def apply_noise(self, val: float, magnitude: float = 0.5) -> float:
        return val + random.uniform(-magnitude, magnitude)
        
    async def simulate_loop(self):
        while True:
            # Subclasses override this loop to update their drone states
            await asyncio.sleep(0.5)

class BogieGenerator(TelemetryGenerator):
    """
    Generates uncontrollable, unpredictable 'rogue' drones.
    Their frequency might stutter, and their paths can curve randomly.
    """
    def _assign_takeoff_target(self, state: Dict[str, Any]):
        state["target_x"] = state["x"]
        state["target_y"] = state["y"]
        state["target_z"] = random.uniform(50, 200) # Vertical climb to random altitude
        
        speed = random.uniform(5, 10) # Ascent speed
        state["vx"] = 0.0
        state["vy"] = 0.0
        state["vz"] = speed

    def _assign_new_target(self, state: Dict[str, Any]):
        # Pick a random point 1km to 3km away
        dx = random.uniform(-3000, 3000)
        dy = random.uniform(-3000, 3000)
        state["target_x"] = state["x"] + dx
        state["target_y"] = state["y"] + dy
        state["target_z"] = state["z"] + random.uniform(-20, 20)
        
        # Calculate velocity vector to reach target at 10-20 m/s
        dist = (dx**2 + dy**2 + (state["target_z"] - state["z"])**2)**0.5 or 1
        speed = random.uniform(10, 20)
        state["vx"] = (dx / dist) * speed
        state["vy"] = (dy / dist) * speed
        state["vz"] = ((state["target_z"] - state["z"]) / dist) * speed

    def add_bogie(self, bogie_id: str, x: float, y: float, z: float, vx: float, vy: float, vz: float, hz: float = 1.0):
        state = {
            "x": x, "y": y, "z": z,
            "vx": vx, "vy": vy, "vz": vz,
            "hz": hz,
            "last_tick": time.time(),
            "status": "taking_off"
        }
        self._assign_takeoff_target(state)
        self.drones[bogie_id] = state

    async def simulate_loop(self):
        while True:
            now = time.time()
            for bogie_id, state in self.drones.items():
                period = 1.0 / state["hz"]
                if now - state["last_tick"] >= period:
                    # Check if reached target (3D distance)
                    dist_to_target = ((state["target_x"] - state["x"])**2 + (state["target_y"] - state["y"])**2 + (state["target_z"] - state["z"])**2)**0.5
                    
                    if dist_to_target < 50:
                        if state.get("status") == "taking_off":
                            state["status"] = "cruising"
                        self._assign_new_target(state)
                        
                    # 5% chance of dropping a packet
                    if random.random() > 0.05:
                        state["x"] += state["vx"] * period
                        state["y"] += state["vy"] * period
                        state["z"] += state["vz"] * period
                        
                        noisy_telemetry = {
                            "type": "bogie",
                            "x": self.apply_noise(state["x"]),
                            "y": self.apply_noise(state["y"]),
                            "z": self.apply_noise(state["z"]),
                            "vx": state["vx"], "vy": state["vy"], "vz": state["vz"],
                            "target_x": state["target_x"],
                            "target_y": state["target_y"],
                            "target_z": state["target_z"]
                        }
                        self.callback(bogie_id, noisy_telemetry)
                        
                    state["last_tick"] = now
            await asyncio.sleep(0.1) # Check frequencies 10 times a second
