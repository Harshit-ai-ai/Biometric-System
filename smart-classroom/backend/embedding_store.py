import pickle
import os
import face_recognition
import numpy as np
import datetime

ENCODINGS_FILE = "encodings.pkl"
ATTENDANCE_FILE = "attendance_log.pkl"

# How many face samples we keep per enrolled person. Recognition against a
# single sample is fragile (one bad angle/lighting condition and the person
# is never matched again), so every enrollment ADDS a sample instead of
# replacing the previous one, and matching is done against all stored
# samples. Older samples are dropped once this cap is reached so the file
# doesn't grow unbounded.
MAX_SAMPLES_PER_PERSON = 8

def load_encodings():
    """Returns {name: [encoding, encoding, ...]}.

    Older versions of this file stored a single encoding per name
    (``{name: encoding}``). Those entries are transparently upgraded to the
    list format so previously enrolled people aren't lost.
    """
    if not os.path.exists(ENCODINGS_FILE):
        return {}
    with open(ENCODINGS_FILE, "rb") as f:
        try:
            raw = pickle.load(f)
        except Exception:
            return {}

    upgraded = {}
    for name, value in raw.items():
        if isinstance(value, list):
            upgraded[name] = value
        else:
            # legacy single-encoding format
            upgraded[name] = [value]
    return upgraded

def save_encoding(name: str, encoding: np.ndarray):
    """Append a new sample for `name`, keeping at most the most recent
    MAX_SAMPLES_PER_PERSON samples."""
    encodings = load_encodings()
    samples = encodings.get(name, [])
    samples.append(np.asarray(encoding))
    if len(samples) > MAX_SAMPLES_PER_PERSON:
        samples = samples[-MAX_SAMPLES_PER_PERSON:]
    encodings[name] = samples
    with open(ENCODINGS_FILE, "wb") as f:
        pickle.dump(encodings, f)

def get_face_encoding(image_array: np.ndarray):
    import cv2
    rgb_image = cv2.cvtColor(image_array, cv2.COLOR_BGR2RGB)
    face_locations = face_recognition.face_locations(rgb_image, number_of_times_to_upsample=2)
    if not face_locations:
        return None
    encodings = face_recognition.face_encodings(rgb_image, face_locations)
    if encodings:
        return encodings[0]
    return None

def match_face(image_array: np.ndarray):
    encodings = load_encodings()
    
    import cv2
    rgb_image = cv2.cvtColor(image_array, cv2.COLOR_BGR2RGB)
    face_locations = face_recognition.face_locations(rgb_image, number_of_times_to_upsample=1)
    
    if not face_locations:
        return None, None
        
    face_encs = face_recognition.face_encodings(rgb_image, face_locations)
    if not face_encs:
        return None, None
        
    if not encodings:
        return None, face_locations[0]
        
    face_enc = face_encs[0]
    face_loc = face_locations[0]

    # Compare against every stored sample for every person, and pick the
    # closest match overall (rather than stopping at the first person who
    # has ANY sample within tolerance). This makes recognition much more
    # reliable when a person has enrolled multiple times.
    best_name = None
    best_distance = None
    for name, samples in encodings.items():
        if not samples:
            continue
        distances = face_recognition.face_distance(samples, face_enc)
        min_distance = float(np.min(distances))
        if min_distance <= 0.6 and (best_distance is None or min_distance < best_distance):
            best_distance = min_distance
            best_name = name

    return best_name, face_loc

def log_attendance(name: str):
    """Append an attendance entry and return it, so callers can confirm
    exactly what name/timestamp was persisted."""
    log = []
    if os.path.exists(ATTENDANCE_FILE):
        with open(ATTENDANCE_FILE, "rb") as f:
            try:
                log = pickle.load(f)
            except:
                pass
    entry = {"name": name, "timestamp": datetime.datetime.now().isoformat()}
    log.append(entry)
    with open(ATTENDANCE_FILE, "wb") as f:
        pickle.dump(log, f)
    return entry

def get_recent_attendance(hours: int):
    if not os.path.exists(ATTENDANCE_FILE):
        return []
    with open(ATTENDANCE_FILE, "rb") as f:
        try:
            log = pickle.load(f)
        except:
            return []
    
    now = datetime.datetime.now()
    cutoff = now - datetime.timedelta(hours=hours)
    
    filtered_log = []
    for entry in log:
        try:
            dt = datetime.datetime.fromisoformat(entry["timestamp"])
            if dt >= cutoff:
                filtered_log.append(entry)
        except:
            continue
    return filtered_log
