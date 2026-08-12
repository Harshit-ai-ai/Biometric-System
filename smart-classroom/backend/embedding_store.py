import pickle
import os
import face_recognition
import numpy as np
import datetime

ENCODINGS_FILE = "encodings.pkl"
ATTENDANCE_FILE = "attendance_log.pkl"

def load_encodings():
    if not os.path.exists(ENCODINGS_FILE):
        return {}
    with open(ENCODINGS_FILE, "rb") as f:
        try:
            return pickle.load(f)
        except:
            return {}

def save_encoding(name: str, encoding: np.ndarray):
    encodings = load_encodings()
    encodings[name] = encoding
    with open(ENCODINGS_FILE, "wb") as f:
        pickle.dump(encodings, f)

def get_face_encoding(image_array: np.ndarray):
    import cv2
    rgb_image = cv2.cvtColor(image_array, cv2.COLOR_BGR2RGB)
    encodings = face_recognition.face_encodings(rgb_image)
    if encodings:
        return encodings[0]
    return None

def match_face(image_array: np.ndarray):
    encodings = load_encodings()
    if not encodings:
        return None
        
    known_names = list(encodings.keys())
    known_encs = list(encodings.values())
    
    face_enc = get_face_encoding(image_array)
    if face_enc is None:
        return None
        
    matches = face_recognition.compare_faces(known_encs, face_enc, tolerance=0.6)
    if True in matches:
        first_match_index = matches.index(True)
        return known_names[first_match_index]
    return None

def log_attendance(name: str):
    log = []
    if os.path.exists(ATTENDANCE_FILE):
        with open(ATTENDANCE_FILE, "rb") as f:
            try:
                log = pickle.load(f)
            except:
                pass
    log.append({"name": name, "timestamp": datetime.datetime.now().isoformat()})
    with open(ATTENDANCE_FILE, "wb") as f:
        pickle.dump(log, f)

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
