import numpy as np
from typing import Dict, Any

class IdentityMatcher:
    def __init__(self):
        # Weights for the dual embedding system
        self.w_face = 0.6
        self.w_peri = 0.4
        self.threshold = 0.75

    def compute_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Compute cosine similarity between two vectors."""
        dot = np.dot(vec1, vec2)
        norm = np.linalg.norm(vec1) * np.linalg.norm(vec2)
        if norm == 0:
            return 0.0
        return float(dot / norm)

    def generate_identity_score(self, 
                                face_sim: float, 
                                peri_sim: float, 
                                liveness_score: float, 
                                quality_score: float) -> Dict[str, Any]:
        """
        Fuses the metrics into a final Identity Score.
        Identity Score = (w1*Face + w2*Periocular) * Liveness Penalty
        If quality is very low, confidence is reduced.
        """
        base_score = (self.w_face * face_sim) + (self.w_peri * peri_sim)
        
        # Liveness penalty: if liveness is below 0.5, heavily penalize the match
        if liveness_score < 0.5:
            final_score = base_score * (liveness_score * 2) 
        else:
            final_score = base_score

        # Quality penalty: if quality is terrible, reduce score slightly
        if quality_score < 0.3:
            final_score *= 0.9

        is_match = final_score >= self.threshold

        return {
            "is_match": is_match,
            "identity_score": final_score,
            "components": {
                "face_similarity": face_sim,
                "periocular_similarity": peri_sim,
                "liveness": liveness_score,
                "quality": quality_score
            }
        }

identity_matcher = IdentityMatcher()
