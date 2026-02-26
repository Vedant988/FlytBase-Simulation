import asyncio
import json
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from backend.core_math.telemetry import TelemetryEngine
from backend.core_math.realtime_checker import RealTimeATC
import math
from pydantic import BaseModel
from backend.core_math.offline_checker import OfflineBatchChecker
from backend.core_math.physics_proof import PhysicsProofEngine
import io
import contextlib
import os

app = FastAPI(title="FlytBase Real-Time ATC Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

telemetry_engine = TelemetryEngine()
atc_math = RealTimeATC(telemetry_engine)
active_connections = []
is_playing = True

from backend.atc.manager import ATCManager
from backend.simulators.bogie_generator import BogieGenerator
from backend.simulators.controlled_generator import ControlledGenerator
import random

atc_manager = ATCManager()

def handle_telemetry(drone_id: str, data: dict):
    if is_playing:
        telemetry_engine.ingest_telemetry(drone_id, data)

bogie_sim = BogieGenerator(handle_telemetry)
controlled_sim = ControlledGenerator(handle_telemetry)

class BogieSpawnData(BaseModel):
    id: str
    x: float
    y: float
    z: float

class SpawnBogiesRequest(BaseModel):
    bogies: list[BogieSpawnData]

@app.post("/api/mode3/spawn_bogies")
def spawn_bogies(req: SpawnBogiesRequest):
    for b in req.bogies:
        bogie_sim.add_bogie(
            b.id, 
            x=b.x, 
            y=b.y, 
            z=b.z,
            vx=random.uniform(-10, 10),
            vy=random.uniform(-10, 10),
            vz=random.uniform(2, 5), # Taking off
            hz=random.uniform(0.5, 2.0)
        )
    return {"status": "success", "spawned": len(req.bogies)}

@app.post("/api/mode3/clear")
def clear_mode3():
    atc_manager.active_controlled.clear()
    atc_manager.pending_clearance.clear()
    atc_manager.active_uncontrolled.clear()
    controlled_sim.drones.clear()
    bogie_sim.drones.clear()
    telemetry_engine.rolling_buffers.clear()
    telemetry_engine.bogie_estimators.clear()
    return {"status": "success"}

@app.post("/api/sim/toggle")
def toggle_sim():
    global is_playing
    is_playing = not is_playing
    return {"status": "success", "playing": is_playing}

@app.post("/api/mode1/run")
def run_mode1(data: dict = None):
    checker = OfflineBatchChecker(safety_radius=10.0)
    if data is None or len(data) == 0:
        pass # Handle natively in frontend now
    else:
        checker.parse_mission_data(data)
        
    conflicts = checker.detect_conflicts()
    segments = []
    for s in checker.segments:
        segments.append({
            "drone_id": s["drone_id"],
            "A0": s["A0"].tolist(),
            "A1": s["A1"].tolist(),
            "velocity": s["velocity"].tolist(),
            "t_start": s["t_start"],
            "t_end": s["t_end"]
        })
    return {"status": "success", "report": conflicts, "segments": segments}

class ProofRequest(BaseModel):
    p0_A: list
    v_A: list
    p0_B: list
    v_B: list
    t_start: float
    t_end: float

@app.post("/api/mode2/run")
def run_mode2(req: ProofRequest):
    engine = PhysicsProofEngine(safety_radius=10.0)
    f = io.StringIO()
    with contextlib.redirect_stdout(f):
        engine.generate_proof(req.p0_A, req.v_A, req.p0_B, req.v_B, req.t_start, req.t_end)
    return {"status": "success", "trace": f.getvalue()}

@app.post("/api/mode3/propose")
def propose_flight(data: dict):
    # Expects {"drone_id": "ID", "plan": {"waypoints": [], ...}}
    drone_id = data.get("drone_id", f"Controlled_{random.randint(100,999)}")
    plan = data.get("plan", {})
    return atc_manager.propose_flight_plan(drone_id, plan)

@app.post("/api/mode3/launch")
def launch_flight(drone_id: str):
    if atc_manager.launch_flight(drone_id):
        plan = atc_manager.active_controlled[drone_id]
        controlled_sim.add_controlled_drone(drone_id, plan["waypoints"], plan.get("velocity", 10))
        return {"status": "success"}
    return {"error": "Drone not found in pending queue"}

@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        active_connections.remove(websocket)

async def broadcast_telemetry():
    while True:
        if is_playing:
            states = telemetry_engine.get_latest_state()
            if states and active_connections:
                conflicts = atc_math.monitor_airspace()
                message = json.dumps({
                    "type": "telemetry", 
                    "data": list(states.values()),
                    "conflicts": conflicts,
                    "flight_plans": []
                })
                for connection in active_connections:
                    try:
                        await connection.send_text(message)
                    except:
                        pass
        await asyncio.sleep(0.5)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(broadcast_telemetry())
    asyncio.create_task(bogie_sim.simulate_loop())
    asyncio.create_task(controlled_sim.simulate_loop())
    
@app.get("/")
def root():
    return {"status": "FlytBase ATC Backend V2.0 Running"}
