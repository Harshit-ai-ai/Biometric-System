from fastapi import FastAPI, Depends, HTTPException, Security, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
import os
import cv2
import numpy as np
import base64
from datetime import datetime

from db.session import SessionLocal, init_db, get_db
from db.schema import Person, BiometricEvent, Zone, MovementEvent, AccessDecision
from identity.face_periocular import face_periocular_engine
from identity.matching import identity_matcher
from authorization.engine import authorization_engine
from integration.dwaar_client import dwaar_client
from analytics.movement import anomaly_engine

# --- API Security Layer ---
API_KEY_NAME = "X-API-Key"
API_KEY = os.getenv("API_KEY", "amaryllis-secure-token")
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

def get_api_key(api_key: str = Security(api_key_header)):
    if api_key == API_KEY:
        return api_key
    raise HTTPException(status_code=403, detail="Could not validate API Key")

app = FastAPI(
    title="Amaryllis Biometric Access Engine",
    description="Spatial-Temporal Identity & Authorization Engine",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://biometric-system-rho.vercel.app/"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    init_db()
    print("[System] Database initialized.")

# --- Request Models ---
class AccessRequest(BaseModel):
    terminal_id: str
    image_base64: str

# --- Helper Functions ---
def decode_image(b64_str: str) -> np.ndarray:
    if "," in b64_str:
        b64_str = b64_str.split(",")[1]
    img_bytes = base64.b64decode(b64_str)
    np_arr = np.frombuffer(img_bytes, np.uint8)
    return cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

# =============================================
# CORE ENDPOINTS
# =============================================

@app.post("/checkpoint/scan", dependencies=[Depends(get_api_key)])
def process_scan(req: AccessRequest, db = Depends(get_db)):
    """
    Unified endpoint for any biometric checkpoint (Gate, Lift, Clubhouse)
    """
    # 1. Image Quality & Periocular Extraction
    frame = decode_image(req.image_base64)
    quality = face_periocular_engine.assess_quality(frame)
    
    if quality < 0.2:
        frame = face_periocular_engine.restore_image(frame)
        
    periocular_crop = face_periocular_engine.extract_periocular(frame)
    face_vec, peri_vec = face_periocular_engine.generate_embeddings(frame)
    
    # 2. Identity Matching (Mocked for now: assume we match against a known DB)
    # In production, we'd query FAISS or a Vector DB. 
    # For simulation, we pretend we identified "HH_0234"
    mock_identified_id = "HH_0234"
    person = db.query(Person).filter(Person.person_id == mock_identified_id).first()
    
    if not person:
        # Create mock person if they don't exist in our empty SQLite for demo purposes
        return {"status": "error", "message": "Person not enrolled."}
        
    # Generate match scores for the audit log
    match_result = identity_matcher.generate_identity_score(0.9, 0.95, 0.99, quality)
    
    # 3. Zone & Policy Resolution
    zone = db.query(Zone).filter(Zone.terminal_id == req.terminal_id).first()
    if not zone:
        return {"status": "error", "message": "Unknown Terminal."}
        
    # 4. Dwaar AI ABAC integration
    dwaar_approval = dwaar_client.check_active_approval(person.person_id, zone.zone_id)
    
    # Get the specific policy for this person/zone (Mocking a policy fetch)
    policy = person.policies[0] if person.policies else None
    
    auth_result = authorization_engine.evaluate_access(
        person=person,
        zone=zone,
        policy=policy,
        dwaar_approval_valid=dwaar_approval
    )
    
    # 5. Spatial-Temporal Audit & Anomaly detection
    event_id = f"evt_{datetime.utcnow().timestamp()}"
    bio_evt = BiometricEvent(
        event_id=event_id,
        person_id=person.person_id,
        terminal_id=zone.terminal_id,
        event_type="SCAN",
        match_score=match_result["identity_score"],
        quality_score=quality,
        liveness_score=0.99
    )
    db.add(bio_evt)
    
    decision = AccessDecision(
        event_id=event_id,
        decision="ALLOW" if auth_result["allow"] else "DENY",
        reason=auth_result["reason"],
        approved_by="Dwaar AI" if (auth_result["allow"] and policy and policy.requires_approval) else "System"
    )
    db.add(decision)
    
    # Add to movement tracking
    mov_evt = MovementEvent(
        person_id=person.person_id,
        destination_zone=zone.zone_id
    )
    db.add(mov_evt)
    
    # Optional: fetch last movements for anomaly scoring
    past_movements = db.query(MovementEvent).filter(
        MovementEvent.person_id == person.person_id
    ).order_by(MovementEvent.timestamp.asc()).all()
    
    anomaly = anomaly_engine.analyze_movement(past_movements, mov_evt)
    
    db.commit()

    return {
        "status": "ALLOW" if auth_result["allow"] else "DENY",
        "person": {"id": person.person_id, "name": person.name, "type": person.person_type.name},
        "reason": auth_result["reason"],
        "anomaly_score": anomaly["anomaly_score"]
    }

@app.post("/admin/enroll", dependencies=[Depends(get_api_key)])
def enroll_person(req: Request):
    return {"status": "Enrolled (Mock)"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)