import json
import os

def generate_offline_mission():
    mission = {
        "drone_A": {
            "velocity": 5.0,
            "waypoints": [
                {"x": 0.0, "y": 0.0, "z": 50.0},
                {"x": 100.0, "y": 100.0, "z": 50.0}
            ]
        },
        "drone_B": {
            "velocity": 5.0,
            "waypoints": [
                {"x": 0.0, "y": 100.0, "z": 50.0},
                {"x": 100.0, "y": 0.0, "z": 50.0}
            ]
        }
    }
    
    os.makedirs("mock_data", exist_ok=True)
    with open("mock_data/mission.json", "w") as f:
        json.dump(mission, f, indent=4)
        
if __name__ == "__main__":
    generate_offline_mission()
    print("Generated mock_data/mission.json")
