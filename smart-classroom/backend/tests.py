import unittest
from identity.matching import identity_matcher
from authorization.engine import authorization_engine
from db.schema import Person, AccessPolicy, Zone, PersonStatus, PersonType
import numpy as np

class TestIdentityMatching(unittest.TestCase):
    def test_similarity(self):
        vec1 = np.array([1.0, 0.0])
        vec2 = np.array([1.0, 0.0])
        sim = identity_matcher.compute_similarity(vec1, vec2)
        self.assertAlmostEqual(sim, 1.0)
        
    def test_identity_score_fusion(self):
        # Good face, good periocular, good liveness
        result = identity_matcher.generate_identity_score(0.9, 0.9, 0.99, 0.9)
        self.assertTrue(result["is_match"])
        self.assertGreater(result["identity_score"], 0.8)
        
        # Good face, good periocular, spoofing (low liveness)
        spoof_result = identity_matcher.generate_identity_score(0.9, 0.9, 0.2, 0.9)
        self.assertFalse(spoof_result["is_match"])
        self.assertLess(spoof_result["identity_score"], 0.75)
        
        # Terrible quality
        quality_result = identity_matcher.generate_identity_score(0.8, 0.8, 0.99, 0.1)
        self.assertLess(quality_result["identity_score"], 0.8)

class TestAuthorizationEngine(unittest.TestCase):
    def setUp(self):
        self.admin = Person(person_id="ADMIN_1", name="Admin", person_type=PersonType.ADMIN, status=PersonStatus.ACTIVE)
        self.help = Person(person_id="HH_01", name="Help", person_type=PersonType.DOMESTIC_HELP, status=PersonStatus.ACTIVE)
        self.revoked_help = Person(person_id="HH_02", name="BadHelp", person_type=PersonType.DOMESTIC_HELP, status=PersonStatus.REVOKED)
        
        self.gate_zone = Zone(zone_id="MAIN_GATE", terminal_id="T_GATE")
        self.pool_zone = Zone(zone_id="POOL", terminal_id="T_POOL")
        
        self.help_policy = AccessPolicy(
            person_id="HH_01",
            zone_id="MAIN_GATE",
            days="Mon,Tue,Wed,Thu,Fri,Sat,Sun", # Include all days for tests
            start_time="00:00",
            end_time="23:59",
            requires_approval=True
        )

    def test_admin_access(self):
        res = authorization_engine.evaluate_access(self.admin, self.gate_zone, None)
        self.assertTrue(res["allow"])
        
    def test_revoked_access(self):
        res = authorization_engine.evaluate_access(self.revoked_help, self.gate_zone, self.help_policy)
        self.assertFalse(res["allow"])
        self.assertIn("not active", res["reason"])

    def test_dwaar_approval_required(self):
        # Dwaar approval not given
        res_no = authorization_engine.evaluate_access(self.help, self.gate_zone, self.help_policy, False)
        self.assertFalse(res_no["allow"])
        self.assertIn("Requires active Dwaar AI approval", res_no["reason"])
        
        # Dwaar approval given
        res_yes = authorization_engine.evaluate_access(self.help, self.gate_zone, self.help_policy, True)
        self.assertTrue(res_yes["allow"])

if __name__ == '__main__':
    unittest.main()
