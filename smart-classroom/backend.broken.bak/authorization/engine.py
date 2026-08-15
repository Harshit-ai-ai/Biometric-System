from datetime import datetime
from typing import Optional
from db.schema import Person, AccessPolicy, Zone, PersonStatus

class AuthorizationEngine:
    def __init__(self):
        pass

    def evaluate_access(self, 
                        person: Person, 
                        zone: Zone, 
                        policy: Optional[AccessPolicy],
                        dwaar_approval_valid: bool = False) -> dict:
        """
        Evaluate if a person is allowed into a specific zone at the current time.
        Implements ABAC (Attribute-Based Access Control) + RBAC.
        """
        now = datetime.now()
        current_time_str = now.strftime("%H:%M")
        current_day_str = now.strftime("%a") # e.g., "Mon"

        # 1. IdentityActive
        if person.status != PersonStatus.ACTIVE:
            return {"allow": False, "reason": "Person identity is not active (Revoked/Inactive)."}

        # 2. Baseline Role checks
        if person.person_type.name == "ADMIN":
            return {"allow": True, "reason": "ADMIN baseline policy overrides."}

        # 3. Policy Exists (Facility Permitted)
        if not policy:
            return {"allow": False, "reason": f"No access policy found for {person.person_type.name} at {zone.zone_id}."}

        # 4. Time & Day Permitted
        if policy.days and current_day_str not in policy.days:
            return {"allow": False, "reason": f"Not permitted on {current_day_str}."}

        if policy.start_time and policy.end_time:
            if not (policy.start_time <= current_time_str <= policy.end_time):
                return {"allow": False, "reason": f"Outside permitted hours ({policy.start_time} - {policy.end_time})."}

        # 5. CurrentApprovalValid
        if policy.requires_approval and not dwaar_approval_valid:
            return {"allow": False, "reason": "Requires active Dwaar AI approval for this visit."}

        return {"allow": True, "reason": "Authorized via ABAC rules."}

authorization_engine = AuthorizationEngine()
