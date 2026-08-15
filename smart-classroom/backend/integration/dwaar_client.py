from typing import List, Dict

class DwaarAIClient:
    def __init__(self):
        # In production, this would initialize HTTP clients and API keys
        pass

    def fetch_resident_mapping(self, person_id: str) -> List[Dict]:
        """
        Mocks an API call to Dwaar AI to fetch which flats a person is associated with.
        """
        # Hardcoded mock for HH_0234 based on the spec
        if person_id == "HH_0234":
            return [
                {"tower": "Tower A", "flat": "1204"},
                {"tower": "Tower A", "flat": "1506"},
                {"tower": "Tower B", "flat": "2103"}
            ]
        return []

    def request_approval(self, person_id: str, person_name: str, flat: str) -> bool:
        """
        Mocks sending a notification to a specific flat via Dwaar AI.
        In reality, this would send a push notification and wait for a webhook.
        For demonstration, we'll auto-approve.
        """
        print(f"[Dwaar AI] Notification sent to {flat}: {person_name} ({person_id}) has arrived at the Main Gate.")
        # Auto-approve for demo
        return True

    def check_active_approval(self, person_id: str, zone_id: str) -> bool:
        """
        Check if there's an active, unexpired approval for this person in this zone.
        """
        # Mock logic
        return True

dwaar_client = DwaarAIClient()
