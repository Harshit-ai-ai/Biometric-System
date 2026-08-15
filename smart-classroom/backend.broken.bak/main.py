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
from liveness.temporal_motion import temporal_motion_engine
from liveness.screen_spoof import screen_spoof_engine
from liveness.pad_model import pad_detector

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
    # Optional Level 1 (temporal motion) liveness signal computed client-side
    # by tracking face-api.js landmark deformation over a ~1s window. Kept
    # optional so older frontend builds that don't send it still work.
    liveness_score: Optional[float] = None
    liveness_level: Optional[str] = None

# AttendanceRequest kept for legacy/checkpoint use
class AttendanceRequest(BaseModel):
    image: str

class TemporalMotionLivenessRequest(BaseModel):
    # A short burst of base64 frames (e.g. 5-10 frames) captured roughly
    # 1 second apart-to-apart in total for a single person — see
    # liveness/temporal_motion.py for how this Level 1 check works and why.
    frames: list

class ScreenSpoofCheckRequest(BaseModel):
    # One or more base64 frames of a single person's face. A single frame
    # is enough (this is a single-frame technique) but 2-3 are recommended
    # to average out one noisy/blurry frame — see liveness/screen_spoof.py.
    frames: list

class PADModelCheckRequest(BaseModel):
    # One or more base64 frames of a single person's face, scored by the
    # Level 4 dedicated presentation-attack model if one has been exported
    # to PAD_MODEL_PATH — see liveness/pad_model.py. Returns
    # state="model_not_loaded" (not an error) until a model is present.
    frames: list

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

@app.post("/liveness/temporal-motion")
def check_temporal_motion_liveness(req: TemporalMotionLivenessRequest):
    """
    Level 1 liveness check: temporal motion of facial landmarks.

    Server-side entry point for terminals that can't run the browser
    (face-api.js) liveness check directly — e.g. a CCTV/kiosk terminal that
    streams a short burst of raw frames to the backend instead. Send
    several frames (roughly spanning ~1 second) of the same person and
    this reports whether their facial landmarks showed the kind of
    relative motion a live face has, as opposed to the near-frozen
    landmark geometry of a printed photo or phone screen held up to the
    camera. See liveness/temporal_motion.py for the full rationale.
    """
    if not req.frames:
        raise HTTPException(status_code=400, detail="No frames provided.")

    frames = []
    for b64 in req.frames:
        frame = decode_image(b64)
        if frame is not None:
            frames.append(frame)

    result = temporal_motion_engine.score_sequence(frames)
    return {
        "liveness_level": "temporal_motion",
        **result,
    }

@app.post("/liveness/screen-spoof")
def check_screen_spoof(req: ScreenSpoofCheckRequest):
    """
    Level 3 liveness check: screen-spoof detection.

    Looks for the visual fingerprints of a *displayed* image rather than a
    real face in front of the camera: screen/bezel edges around the face,
    glass-style specular reflections, moire/aliasing from re-photographing
    a pixel grid, unnaturally smooth or grid-like texture, and flat
    display-style illumination. See liveness/screen_spoof.py for the full
    breakdown of each signal and how they're combined.
    """
    if not req.frames:
        raise HTTPException(status_code=400, detail="No frames provided.")

    frames = []
    for b64 in req.frames:
        frame = decode_image(b64)
        if frame is not None:
            frames.append(frame)

    result = screen_spoof_engine.score_sequence(frames)
    return {
        "liveness_level": "screen_spoof",
        **result,
    }

@app.post("/liveness/pad-model")
def check_pad_model(req: PADModelCheckRequest):
    """
    Level 4 liveness check: dedicated presentation-attack detection model.

    Scores a burst of frames with a dedicated 4-class classifier
    (live / printed_photo / phone_screen / replayed_video) if one has
    been exported to PAD_MODEL_PATH. See liveness/pad_model.py for the
    full model contract and scripts/export_pad_model.py for how to plug a
    trained model in.

    Until a model is exported, this returns `loaded: false` and
    `state: "model_not_loaded"` rather than an error or a guessed
    prediction — Levels 1-3 remain the active anti-spoof gates in the
    meantime.
    """
    if not req.frames:
        raise HTTPException(status_code=400, detail="No frames provided.")

    frames = []
    for b64 in req.frames:
        frame = decode_image(b64)
        if frame is not None:
            frames.append(frame)

    result = pad_detector.score_sequence(frames)
    return {
        "liveness_level": "pad_model",
        **result,
    }

@app.post("/liveness/check")
def check_liveness_cascade(req: TemporalMotionLivenessRequest):
    """
    Runs the full anti-spoof cascade against the same burst of frames and
    returns a combined verdict. Level 2 (federated, device-local
    classifier — see Novel Module 7) is intentionally not run here since
    it doesn't operate on raw frames the same way; this endpoint is for
    terminals that want one call covering the frame-based checks
    (Levels 1, 3, and 4).

    Level 1 (temporal motion) and Level 3 (screen-spoof heuristics) remain
    the checks that actively gate the verdict, exactly as before this
    endpoint gained Level 4 — either one flagging a problem is enough to
    deny. Level 4 (the dedicated PAD model) is included for visibility and
    only tightens the verdict when it is BOTH loaded (a real model has
    been exported — see liveness/pad_model.py) AND confident; when no
    model is loaded it stays purely informational (`loaded: false`) and
    never denies on its own, so behavior is unchanged for deployments that
    haven't trained/exported a Level 4 model yet.
    """
    if not req.frames:
        raise HTTPException(status_code=400, detail="No frames provided.")

    frames = []
    for b64 in req.frames:
        frame = decode_image(b64)
        if frame is not None:
            frames.append(frame)

    motion_result = temporal_motion_engine.score_sequence(frames)
    spoof_result = screen_spoof_engine.score_sequence(frames)
    pad_result = pad_detector.score_sequence(frames)

    still_checking = motion_result["state"] == "checking" or spoof_result["state"] == "checking"
    motion_flagged = motion_result["state"] == "static"
    spoof_flagged = spoof_result["state"] == "screen_spoof_suspected"
    # Only ever contributes when a real model is loaded and confident —
    # see docstring above for why this stays informational otherwise.
    pad_flagged = pad_result.get("loaded") and pad_result["state"] == "spoof_suspected"

    if still_checking:
        verdict = "checking"
    elif motion_flagged or spoof_flagged or pad_flagged:
        verdict = "spoof_suspected"
    else:
        verdict = "live"

    return {
        "verdict": verdict,
        "temporal_motion": motion_result,
        "screen_spoof": spoof_result,
        "pad_model": pad_result,
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
    """Called by browser when a face is recognized; records timestamp to attendance log.

    If the browser included a Level 1 (temporal motion) liveness score
    (see analytics/temporal_motion.py), it's persisted alongside the entry
    so audits can distinguish attendance confirmed via real landmark
    motion from older/legacy log calls that didn't check liveness."""
    entry = embedding_store.log_attendance(
        req.name,
        liveness_score=req.liveness_score,
        liveness_level=req.liveness_level,
    )
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