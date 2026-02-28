"""
FlytBase Performance Stress Tester
====================================
Spawns bogies in batches via the API, then directly times the core
conflict-checker loop at each scale level.

Run from project root:
    python scripts/testing/perf_test.py
"""

import requests
import time
import sys
import os
import random

# Add project root to path so we can import backend modules directly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from backend.core_math.telemetry import TelemetryEngine
from backend.core_math.realtime_checker import RealTimeATC

BASE_URL = "http://localhost:8000"

def reset():
    try:
        requests.post(f"{BASE_URL}/api/mode3/clear", timeout=5)
        time.sleep(0.3)
    except Exception as e:
        print(f"[WARN] reset failed: {e}")

def spawn_bogies(n: int):
    bogies = [
        {
            "id": f"B_perf_{i:03d}",
            "x": random.uniform(-3000, 3000),
            "y": random.uniform(-3000, 3000),
            "z": 0.0
        }
        for i in range(n)
    ]
    r = requests.post(f"{BASE_URL}/api/mode3/spawn_bogies", json={"bogies": bogies}, timeout=10)
    return r.status_code == 200

def spawn_controlled(n: int):
    """Propose N controlled drones to the ATC queue."""
    for i in range(n):
        plan = {
            "waypoints": [
                {"x": random.uniform(-500, 500), "y": random.uniform(-500, 500), "z": 50},
                {"x": random.uniform(-2000, 2000), "y": random.uniform(-2000, 2000), "z": random.uniform(50, 200)},
                {"x": random.uniform(-3000, 3000), "y": random.uniform(-3000, 3000), "z": random.uniform(50, 200)},
            ],
            "velocity": random.uniform(8, 20)
        }
        try:
            requests.post(f"{BASE_URL}/api/mode3/propose",
                         json={"drone_id": f"C_perf_{i:03d}", "plan": plan},
                         timeout=5)
        except Exception:
            pass

def time_conflict_checker_in_process(n_drones: int, n_samples: int = 20) -> dict:
    """
    Builds a synthetic TelemetryEngine + RealTimeATC in-process
    with n_drones active states, then times monitor_airspace() N times.
    This isolates ONLY the conflict-check cost, not network/WS overhead.
    """
    te = TelemetryEngine()
    atc = RealTimeATC(te)

    # Inject synthetic telemetry for n_drones
    for i in range(n_drones):
        drone_id = f"stress_{i:04d}"
        dtype = "bogie" if i % 2 == 0 else "controlled"
        data = {
            "type": dtype,
            "x": random.uniform(-3000, 3000),
            "y": random.uniform(-3000, 3000),
            "z": random.uniform(20, 250),
            "vx": random.uniform(-20, 20),
            "vy": random.uniform(-20, 20),
            "vz": random.uniform(-5, 5),
        }
        te.ingest_telemetry(drone_id, data)
        # Second ingestion to prime the Kalman filter for bogies
        if dtype == "bogie":
            data2 = dict(data)
            data2["x"] += data["vx"] * 0.5
            data2["y"] += data["vy"] * 0.5
            te.ingest_telemetry(drone_id, data2)

    # Warm up
    atc.monitor_airspace()
    atc.monitor_airspace()

    # Time it
    times_ms = []
    for _ in range(n_samples):
        t0 = time.perf_counter()
        conflicts = atc.monitor_airspace()
        t1 = time.perf_counter()
        times_ms.append((t1 - t0) * 1000)

    return {
        "n_drones": n_drones,
        "min_ms": round(min(times_ms), 2),
        "avg_ms": round(sum(times_ms) / len(times_ms), 2),
        "max_ms": round(max(times_ms), 2),
        "n_samples": n_samples,
        "conflicts_found": len(conflicts)
    }


def time_ws_broadcast() -> dict:
    """
    Times a full end-to-end GET cycle: /api/mode3/status
    as a proxy for backend broadcast latency.
    """
    times_ms = []
    for _ in range(20):
        t0 = time.perf_counter()
        requests.get(f"{BASE_URL}/api/mode3/status", timeout=5)
        t1 = time.perf_counter()
        times_ms.append((t1 - t0) * 1000)
    return {
        "min_ms": round(min(times_ms), 2),
        "avg_ms": round(sum(times_ms) / len(times_ms), 2),
        "max_ms": round(max(times_ms), 2),
    }


if __name__ == "__main__":
    print("\n" + "="*65)
    print("  FlytBase ATC — Real Performance Benchmark")
    print("="*65)

    # Check backend is reachable
    try:
        r = requests.get(f"{BASE_URL}/", timeout=3)
        print(f"[OK] Backend reachable: {r.json()}")
    except Exception as e:
        print(f"[FAIL] Backend not reachable: {e}")
        sys.exit(1)

    # Measure WS/REST baseline
    print("\n[1] Measuring REST round-trip (proxy for WS latency)...")
    ws = time_ws_broadcast()
    print(f"    avg={ws['avg_ms']}ms  min={ws['min_ms']}ms  max={ws['max_ms']}ms")

    # In-process conflict checker benchmark at different scales
    print("\n[2] Timing conflict-checker (in-process, isolated from network):")
    print(f"\n{'Drones':>8}  {'Min ms':>8}  {'Avg ms':>8}  {'Max ms':>8}  {'Conflicts':>10}")
    print("-" * 50)

    results = []
    for n in [10, 20, 30, 50, 75, 100, 150, 200, 300, 500]:
        r = time_conflict_checker_in_process(n, n_samples=30)
        results.append(r)
        print(f"{n:>8}  {r['min_ms']:>8}  {r['avg_ms']:>8}  {r['max_ms']:>8}  {r['conflicts_found']:>10}")

    print("\n[DONE] Copy these numbers into the README performance table.")
    print("Note: UI FPS must be measured separately via browser DevTools.\n")
