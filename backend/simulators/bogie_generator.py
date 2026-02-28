import asyncio
import random
import math
import time
from typing import Dict, Any, Callable

class TelemetryGenerator:
    """
    Base class for asynchronous drone simulators. 
    Can generate dropouts and noisy telemetry.
    """
    def __init__(self, callback: Callable[[str, Dict[str, float]], None], staged_callback: Callable = None):
        self.callback = callback
        self.staged_callback = staged_callback or callback  # Fallback to main callback if not provided
        self.drones = {}

    def apply_noise(self, val: float, magnitude: float = 0.5) -> float:
        return val + random.uniform(-magnitude, magnitude)
        
    async def simulate_loop(self):
        while True:
            # Subclasses override this loop to update their drone states
            await asyncio.sleep(0.5)

class BogieGenerator(TelemetryGenerator):
    """
    Generates uncontrollable, unpredictable rogue drones.
    Each bogie gets a randomized personality on first spawn defining its:
    - Takeoff speed
    - Cruise speed
    - Preferred altitude band
    - Lateral roaming range
    """

    # (profile_name, takeoff_speed_range, cruise_speed_range, altitude_range_m, lateral_range_km)
    PROFILES = [
        ("slow_creeper", (2,   6),   (6,  15),  (20,  80),  (0.2, 0.8)),
        ("normal",       (6,  14),   (12, 24),  (40,  160), (0.5, 2.0)),
        ("fast_racer",   (18, 35),   (30, 55),  (80,  250), (1.5, 4.0)),
        ("erratic",      (4,  20),   (5,  40),  (10,  300), (0.1, 5.0)),
    ]

    def _get_profile(self, state: Dict[str, Any]) -> tuple:
        """Lazily assign a personality to this bogie on first access."""
        if "profile" not in state:
            state["profile"] = random.choice(self.PROFILES)
        return state["profile"]

    def _assign_takeoff_target(self, state: Dict[str, Any]):
        name, takeoff_rng, _, alt_rng, lat_rng = self._get_profile(state)

        # Choose a target altitude based on personality
        target_z = random.uniform(*alt_rng)
        state["target_z"] = target_z

        # Erratic bogies and 40% of others drift laterally while climbing
        if name == "erratic" or random.random() < 0.4:
            drift = random.uniform(lat_rng[0] * 100, lat_rng[1] * 200)
            state["target_x"] = state["x"] + drift * (random.random() - 0.5) * 2
            state["target_y"] = state["y"] + drift * (random.random() - 0.5) * 2
        else:
            state["target_x"] = state["x"]
            state["target_y"] = state["y"]

        dx = state["target_x"] - state["x"]
        dy = state["target_y"] - state["y"]
        dz = target_z - state["z"]
        dist = (dx**2 + dy**2 + dz**2)**0.5 or 1
        speed = random.uniform(*takeoff_rng)
        state["vx"] = (dx / dist) * speed
        state["vy"] = (dy / dist) * speed
        state["vz"] = (dz / dist) * speed

    def _assign_new_target(self, state: Dict[str, Any]):
        name, _, cruise_rng, alt_rng, lat_rng = self._get_profile(state)

        # Lateral displacement in a random direction, scaled by personality range
        dist_h = random.uniform(lat_rng[0] * 1000, lat_rng[1] * 1000)
        angle  = random.uniform(0, math.tau)
        dx = dist_h * math.cos(angle)
        dy = dist_h * math.sin(angle)
        state["target_x"] = state["x"] + dx
        state["target_y"] = state["y"] + dy

        # Altitude: erratic can jump anywhere in range; others change gradually
        if name == "erratic":
            state["target_z"] = random.uniform(*alt_rng)
        else:
            swing = (alt_rng[1] - alt_rng[0]) * 0.3
            state["target_z"] = max(alt_rng[0], min(alt_rng[1],
                state["z"] + random.uniform(-swing, swing)))

        dz   = state["target_z"] - state["z"]
        dist = (dx**2 + dy**2 + dz**2)**0.5 or 1
        speed = random.uniform(*cruise_rng)
        state["vx"] = (dx / dist) * speed
        state["vy"] = (dy / dist) * speed
        state["vz"] = (dz / dist) * speed

    def add_bogie(self, bogie_id: str, x: float, y: float, z: float, vx: float, vy: float, vz: float, hz: float = 1.0, staged: bool = False):
        state = {
            "x": x, "y": y, "z": z,
            "vx": vx, "vy": vy, "vz": vz,
            "hz": hz,
            "last_tick": time.time(),
            "status": "staged" if staged else "taking_off",
            "staged": staged,
            # Placeholder target so the dict keys are always consistent
            "target_x": x, "target_y": y, "target_z": z
        }
        if not staged:
            self._assign_takeoff_target(state)
        self.drones[bogie_id] = state

    async def simulate_loop(self):
        # Import is_playing at runtime to avoid circular imports
        import backend.api.main as api_module

        while True:
            now = time.time()
            is_playing = getattr(api_module, "is_playing", True)

            for bogie_id, state in list(self.drones.items()):
                period = 1.0 / state["hz"]

                # Staged bogies: emit static ground telemetry, begin takeoff when play is pressed
                if state.get("staged", False):
                    if is_playing:
                        state["staged"] = False
                        state["status"] = "taking_off"
                        self._assign_takeoff_target(state)
                    else:
                        if now - state["last_tick"] >= period:
                            state["last_tick"] = now
                            self.staged_callback(bogie_id, {
                                "type": "bogie",
                                "x": state["x"], "y": state["y"], "z": 0.0,
                                "vx": 0.0, "vy": 0.0, "vz": 0.0,
                                "target_x": state["x"], "target_y": state["y"], "target_z": 0.0
                            })
                    continue

                if now - state["last_tick"] >= period:
                    dist_to_target = (
                        (state["target_x"] - state["x"])**2 +
                        (state["target_y"] - state["y"])**2 +
                        (state["target_z"] - state["z"])**2
                    )**0.5

                    if dist_to_target < 50:
                        if state.get("status") == "taking_off":
                            state["status"] = "cruising"
                        self._assign_new_target(state)

                    # 5% chance of dropping a telemetry packet (realistic noise)
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
            await asyncio.sleep(0.1)  # Check frequencies 10 times per second
