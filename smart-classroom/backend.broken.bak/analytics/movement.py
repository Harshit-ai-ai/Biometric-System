from typing import List, Dict
from datetime import datetime
from db.schema import MovementEvent

class SpatialTemporalAnomalyEngine:
    def __init__(self):
        # Define expected logical flows (e.g. Gate -> Tower -> Lift)
        self.expected_routes = {
            "entry_flow": ["MAIN_GATE", "TOWER_LOBBY", "TOWER_LIFT", "FLOOR"],
            "exit_flow": ["FLOOR", "TOWER_LIFT", "TOWER_LOBBY", "MAIN_GATE"]
        }

    def analyze_movement(self, events: List[MovementEvent], current_event: MovementEvent) -> Dict[str, float]:
        """
        Calculates a Risk Score for a given sequence of movements.
        Expects `events` to be sorted chronologically.
        """
        if not events:
            return {"anomaly_score": 0.0, "reason": "First event"}

        route_consistency = self._check_route(events, current_event)
        temporal_consistency = self._check_time_gap(events[-1], current_event)
        
        # We can weigh these depending on strictness
        anomaly_score = ( (1.0 - route_consistency) * 0.6 ) + ( (1.0 - temporal_consistency) * 0.4 )
        
        return {
            "anomaly_score": anomaly_score,
            "components": {
                "route_consistency": route_consistency,
                "temporal_consistency": temporal_consistency
            }
        }

    def _check_route(self, past_events: List[MovementEvent], current: MovementEvent) -> float:
        """
        Simplified route check. E.g., if you jump from MAIN_GATE straight to FLOOR without LOBBY/LIFT,
        consistency is lower.
        """
        last_zone = past_events[-1].destination_zone
        curr_zone = current.destination_zone
        
        # A simple adjacency matrix mock
        valid_transitions = [
            ("MAIN_GATE", "TOWER_LOBBY"),
            ("TOWER_LOBBY", "TOWER_LIFT"),
            ("TOWER_LIFT", "FLOOR"),
            ("FLOOR", "TOWER_LIFT"),
            ("TOWER_LIFT", "TOWER_LOBBY"),
            ("TOWER_LOBBY", "MAIN_GATE"),
            ("MAIN_GATE", "CLUBHOUSE"),
            ("CLUBHOUSE", "MAIN_GATE")
        ]
        
        # Strip specific tower/floor IDs for generic transition check
        # e.g., "TOWER_A_LOBBY" -> "TOWER_LOBBY"
        def _genericize(zone: str):
            if "GATE" in zone: return "MAIN_GATE"
            if "LOBBY" in zone: return "TOWER_LOBBY"
            if "LIFT" in zone: return "TOWER_LIFT"
            if "FLOOR" in zone: return "FLOOR"
            if "CLUB" in zone: return "CLUBHOUSE"
            return zone
            
        transition = (_genericize(last_zone), _genericize(curr_zone))
        if transition in valid_transitions:
            return 1.0
        
        return 0.5 # Missing checkpoint or unusual route

    def _check_time_gap(self, last_event: MovementEvent, current: MovementEvent) -> float:
        """
        Check if the time gap is realistic.
        Too fast = physical impossibility (0.0 consistency).
        Too slow = lingering (lower consistency).
        """
        delta_seconds = (current.timestamp - last_event.timestamp).total_seconds()
        
        if delta_seconds < 5:
            # Teleportation! Impossible unless tailgating immediately
            return 0.2
        elif delta_seconds > 1800: # > 30 minutes
            # Might be lingering, but maybe they were hanging out in a permitted area
            return 0.8
        
        return 1.0

anomaly_engine = SpatialTemporalAnomalyEngine()
