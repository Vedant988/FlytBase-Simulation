import numpy as np

def compute_cpa(p0_A: np.ndarray, v_A: np.ndarray, p0_B: np.ndarray, v_B: np.ndarray):
    """
    Compute EXACT Closest Point of Approach (CPA) time between two parametric lines:
    P_A(t) = p0_A + v_A * t
    P_B(t) = p0_B + v_B * t
    Returns (t_cpa, min_dist)
    """
    w0 = p0_A - p0_B
    v = v_A - v_B
    
    a = np.dot(v, v)
    b = np.dot(w0, v)
    
    if a == 0:
        return 0.0, np.linalg.norm(w0)
        
    t_cpa = -b / a
    t_cpa = max(0.0, t_cpa)
    
    min_dist_vec = w0 + v * t_cpa
    min_dist = np.linalg.norm(min_dist_vec)
    
    return t_cpa, min_dist
