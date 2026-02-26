import time
from typing import Dict, List, Any

class ATCManager:
    """
    Mode 3 Advanced ATC Supervisor
    Maintains the state of the airspace, separating:
    1. active_controlled: Drones we control (have flight plans, can pause)
    2. active_uncontrolled: Bogies/Rogue drones (only have telemetry history, unpredictable futures)
    3. pending_clearance: Flight plans approved but not yet launched
    """
    def __init__(self):
        # Drone_ID -> { waypoints, velocity, t_start, segments, paused }
        self.active_controlled: Dict[str, Any] = {}
        
        # Drone_ID -> { current_pos, history, estimated_velocity (Kalman), last_seen }
        self.active_uncontrolled: Dict[str, Any] = {}
        
        # Drone_ID -> { waypoints, velocity, requested_t_start, segments }
        self.pending_clearance: Dict[str, Any] = {}
        
    def propose_flight_plan(self, drone_id: str, plan: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluate a submitted flight plan against:
        - currently flying drones (extrapolated futures)
        - approved-but-not-launched flights
        """
        # TODO: Implement pre-flight collision check (Mode 1 logic re-used over future horizon)
        
        # For now, auto-approve everything into the pending queue
        self.pending_clearance[drone_id] = plan
        return {
            "status": "APPROVED",
            "message": "Flight plan logically accepted into pending queue.",
            "conflicts": []
        }
        
    def launch_flight(self, drone_id: str):
        """Moves a flight from pending_clearance to active_controlled"""
        if drone_id in self.pending_clearance:
            plan = self.pending_clearance.pop(drone_id)
            plan['t_start'] = time.time()
            plan['paused'] = False
            self.active_controlled[drone_id] = plan
            return True
        return False
        
    def register_bogie(self, bogie_id: str, pos: Dict[str, float]):
        """Registers a new uncooperative drone from raw telemetry"""
        if bogie_id not in self.active_uncontrolled:
            self.active_uncontrolled[bogie_id] = {
                "history": [],
                "current_pos": pos,
                "estimated_velocity": {"vx": 0, "vy": 0, "vz": 0},
                "last_seen": time.time()
            }
            
    def pause_drone(self, drone_id: str):
        """Issues a hold command to a controlled drone"""
        if drone_id in self.active_controlled:
            self.active_controlled[drone_id]['paused'] = True
            
    def resume_drone(self, drone_id: str):
        """Resumes a held controlled drone"""
        if drone_id in self.active_controlled:
            self.active_controlled[drone_id]['paused'] = False
