from fastapi import FastAPI, Depends, HTTPException, Security, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os
import cv2
import numpy as np
import base64
from datetime import datetime

from sqlalchemy import func

from db.session import SessionLocal, init_db, get_db
from db.schema import Person, BiometricEvent, Zone, MovementEvent, AccessDecision, PersonType, Residence, PersonResidence
from identity.face_periocular import face_periocular_engine
from identity.matching import identity_matcher
from authorization.engine import authorization_engine
from integration.dwaar_client import dwaar_client
from analytics.movement import anomaly_engine

from fastapi import WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
import io
import csv
import embedding_store


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

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

from typing import Optional

class EnrollRequest(BaseModel):
    employee_name: str
    descriptor: list  # 128-float array computed by face-api.js in the browser (kept for backward compatibility)
    descriptors: Optional[list] = None  # optional list of multiple 128-float samples captured in one enrollment
    is_resident: bool = False
    flat_number: Optional[str] = None
    role: Optional[str] = None

class LogAttendanceRequest(BaseModel):
    name: str

# AttendanceRequest kept for legacy/checkpoint use
class AttendanceRequest(BaseModel):
    image: str

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
def admin_enroll_person(req: Request):
    return {"status": "Enrolled (Mock)"}

@app.post("/enroll")
def enroll(req: EnrollRequest, db = Depends(get_db)):
    """Store one or more face descriptors (128-float arrays) computed by
    face-api.js in the browser. Every enrollment ADDS a sample for this
    person (rather than replacing the previous one), so re-enrolling the
    same person under different lighting/angles genuinely improves
    recognition instead of just overwriting the last attempt."""
    employee_name = req.employee_name.strip()

    # Accept either the new multi-sample field, or fall back to the single
    # `descriptor` field for backward compatibility.
    raw_samples = req.descriptors if req.descriptors else [req.descriptor]
    samples_saved = 0
    for raw in raw_samples:
        if not raw:
            continue
        descriptor = np.array(raw, dtype=np.float64)
        if descriptor.size == 0:
            continue
        embedding_store.save_encoding(employee_name, descriptor)
        samples_saved += 1

    if samples_saved == 0:
        raise HTTPException(status_code=400, detail="No valid face descriptor was provided.")

    person_id = f"P_{employee_name.replace(' ', '_')}"
    person = db.query(Person).filter(Person.person_id == person_id).first()
    
    person_type = PersonType.RESIDENT if req.is_resident else PersonType.GUEST
    
    if not person:
        person = Person(
            person_id=person_id,
            name=employee_name,
            person_type=person_type,
            phone=req.role if not req.is_resident else None
        )
        db.add(person)
    else:
        person.person_type = person_type
        person.phone = req.role if not req.is_resident else None
        
    if req.is_resident and req.flat_number:
        res = db.query(Residence).filter(Residence.flat_number == req.flat_number).first()
        if not res:
            res = Residence(residence_id=f"R_{req.flat_number}", tower="Default", flat_number=req.flat_number)
            db.add(res)
            db.flush()
            
        pr = db.query(PersonResidence).filter(PersonResidence.person_id == person_id).first()
        if not pr:
            pr = PersonResidence(person_id=person.person_id, residence_id=res.residence_id, relationship_type="resident")
            db.add(pr)
    
    db.commit()
    total_samples = len(embedding_store.load_encodings().get(employee_name, []))
    return {
        "status": "success",
        "message": f"{employee_name} enrolled successfully ({samples_saved} face sample(s) captured, {total_samples} total on file).",
    }

@app.get("/employee/{name}")
def get_employee(name: str, db = Depends(get_db)):
    # Case/whitespace-insensitive lookup: names typed in the search box
    # (different casing, stray spaces) should still resolve to the person
    # that was enrolled.
    needle = name.strip().lower()
    person = db.query(Person).filter(func.lower(Person.name) == needle).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
        
    flat_number = None
    if person.residences and len(person.residences) > 0:
        flat_number = person.residences[0].residence.flat_number
        
    # Mocking attendance stats for UI compatibility
    return {
        "name": person.name,
        "is_resident": person.person_type == PersonType.RESIDENT,
        "flat_number": flat_number,
        "role": person.phone if person.person_type != PersonType.RESIDENT else None,
        "attendance_rate": 100,
        "classes_present": 1,
        "total_classes": 1,
        "history": []
    }

@app.get("/enrolled-descriptors")
def get_enrolled_descriptors():
    """Return all stored face descriptors so the browser can do real-time
    matching. Each person may have multiple samples (one per enrollment
    attempt); all of them are returned so the browser's FaceMatcher can
    compare against every sample and pick the closest one, which is far
    more reliable than matching against a single descriptor."""
    encodings = embedding_store.load_encodings()
    result = [
        {"name": name, "descriptors": [enc.tolist() for enc in samples]}
        for name, samples in encodings.items()
        if samples
    ]
    return {"descriptors": result}

@app.get("/residents")
def list_residents(db = Depends(get_db)):
    """Return every enrolled person (resident or non-resident) with their
    flat number / role, so the Resident Lookup page can show a full
    directory instead of requiring an exact-name search."""
    people = db.query(Person).order_by(Person.name.asc()).all()
    encodings = embedding_store.load_encodings()

    result = []
    for person in people:
        flat_number = None
        if person.residences and len(person.residences) > 0:
            flat_number = person.residences[0].residence.flat_number

        result.append({
            "name": person.name,
            "is_resident": person.person_type == PersonType.RESIDENT,
            "flat_number": flat_number,
            "role": person.phone if person.person_type != PersonType.RESIDENT else None,
            "person_type": person.person_type.name,
            "face_samples": len(encodings.get(person.name, [])),
        })

    return {"residents": result}

@app.post("/log-attendance")
def log_attendance_endpoint(req: LogAttendanceRequest):
    """Called by browser when a face is recognized; records timestamp to attendance log."""
    entry = embedding_store.log_attendance(req.name)
    return {"status": "logged", "entry": entry}

dashboard_clients = []

@app.websocket("/ws/dashboard")
async def websocket_dashboard(websocket: WebSocket):
    await websocket.accept()
    dashboard_clients.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in dashboard_clients:
            dashboard_clients.remove(websocket)

@app.get("/attendance")
def get_attendance(hours: int = 24):
    """JSON version of the same data /export produces as a CSV, so the
    frontend can show recently-logged names/timestamps inline (useful for
    confirming a scan was actually persisted, without downloading a file)."""
    log = embedding_store.get_recent_attendance(hours)
    # Most recent first
    log = sorted(log, key=lambda e: e.get("timestamp", ""), reverse=True)
    return {"entries": log}

@app.get("/export")
def export_csv(hours: int = 24):
    log = embedding_store.get_recent_attendance(hours)
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "Timestamp"])
    for entry in log:
        writer.writerow([entry["name"], entry["timestamp"]])
        
    response = StreamingResponse(iter([output.getvalue()]), media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename=attendance_export_{hours}h.csv"
    return response

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port)