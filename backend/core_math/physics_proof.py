import numpy as np
from .cpa import compute_cpa

class PhysicsProofEngine:
    def __init__(self, safety_radius: float = 3.0):
        self.safety_radius = safety_radius
        
    def generate_proof(self, p0_A: list, v_A: list, p0_B: list, v_B: list, t_start: float, t_end: float):
        """
        Mode 2: V1.1 Continuous Physics Proof
        """
        print("ASSUMPTIONS:")
        print("- Constant velocity per segment")
        print("- Straight-line motion")
        print("- No GPS noise")
        print("- No wind")
        print("- No acceleration\n")
        
        P0_A = np.array(p0_A, dtype=float)
        V_A = np.array(v_A, dtype=float)
        P0_B = np.array(p0_B, dtype=float)
        V_B = np.array(v_B, dtype=float)
        
        print("Phase 2: Parametric Modeling")
        print(f"P_A(t) = {P0_A} + {V_A} * t")
        print(f"P_B(t) = {P0_B} + {V_B} * t\n")
        
        print("Phase 3: Analytic Optimization")
        w0 = P0_A - P0_B
        v = V_A - V_B
        print(f"Relative Motion D(t) = {w0} + {v} * t")
        print(f"Minimizing Square Distance: D^2(t)\n")
        
        t_cpa, min_dist = compute_cpa(P0_A, V_A, P0_B, V_B)
        
        if t_cpa < t_start:
            t_cpa = t_start
            min_dist = np.linalg.norm(w0 + v * t_cpa)
        elif t_cpa > t_end:
            t_cpa = t_end
            min_dist = np.linalg.norm(w0 + v * t_cpa)
            
        print("Phase 4: Exact Evaluation")
        print(f"CPA Time: {t_cpa:.3f}s")
        print(f"Min Distance: {min_dist:.3f}m")
        print(f"Threshold: {self.safety_radius:.1f}m")
        
        status = "VIOLATION" if min_dist < self.safety_radius else "SAFE"
        print(f"STATUS: {status}\n")
        
        print("Phase 5: Proof Output")
        print("Final Conclusion:")
        if status == "VIOLATION":
            print(f"The mathematical bounds predict a critically severe minimum distance of {min_dist:.3f}m at exactly t={t_cpa:.3f}s.")
        else:
            print(f"The planned trajectory is mathematically guaranteed to maintain at least {min_dist:.3f}m separation within the evaluation window.")

if __name__ == "__main__":
    p_A = [0.0, 0.0, 50.0]
    vec_A = [5.0, 5.0, 0.0]
    p_B = [0.0, 100.0, 50.0]
    vec_B = [5.0, -5.0, 0.0]
    proof_engine = PhysicsProofEngine(safety_radius=3.0)
    proof_engine.generate_proof(p_A, vec_A, p_B, vec_B, t_start=0.0, t_end=20.0)
