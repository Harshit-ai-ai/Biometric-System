"""
Novel Module 11: Temporal Motion Liveness — Level 1.

Server-side twin of the browser implementation in
`smart-classroom/frontend/src/App.jsx` (see `updateTemporalMotionLiveness`).
Both implementations answer the same question the same way, just with a
different landmark detector (dlib's 68-point model here, via
`face_recognition`, vs. face-api.js's 68-point model in the browser):

    "Over a short (~1 second) burst of frames, do this face's landmarks
    deform relative to one another, or does the whole face move as one
    rigid unit?"

A live face is never perfectly still: blinks, breathing and small
mouth/brow movements constantly reshuffle landmark positions *relative to
each other*. A printed photo or a phone screen held up to the camera is a
rigid 2D object — it can translate or rotate as a whole (a shaky hand),
but because every landmark is normalized against the face's own bounding
box before comparing frames, that whole-face motion is cancelled out. What
remains is close to zero for a photo, and clearly non-zero for a real
face.

This is "Level 1" of what should become a layered anti-spoof cascade —
later levels can add texture/moire analysis, blink-specific eye-aspect-
-ratio checks, depth cues, etc. Level 1 alone is a useful cheap first
gate: it needs nothing but the frames already being captured for
recognition, no extra hardware or models.

Use this for pipelines that can't run face-api.js in a browser (CCTV
terminals, kiosks streaming raw frames straight to the backend). The
existing browser-based dashboard uses the JS twin instead, since it
already computes landmarks every frame for recognition and doesn't need a
round-trip to the server to do liveness too.
"""

from typing import Dict, List, Optional, Tuple

import face_recognition
import numpy as np


class TemporalMotionLivenessEngine:
    # Require at least this many usable frames in the burst before trusting
    # the score at all — a couple of frames aren't enough to tell "posed
    # still for a split second" apart from "genuinely static".
    MIN_SAMPLES = 4

    # Normalized (box-relative) average landmark displacement below this is
    # treated as suspiciously static. This is a demo-grade default mirroring
    # the frontend's threshold, not empirically calibrated against real
    # spoof/live footage for this specific detector — tune per
    # camera/lighting setup before relying on it for access control.
    MOTION_THRESHOLD = 0.0035

    def _extract(self, frame_bgr: np.ndarray) -> Optional[Dict]:
        """Runs face + landmark detection on a single frame and returns the
        largest face's landmarks normalized to its own bounding box, or
        None if no face was found."""
        import cv2

        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        locations = face_recognition.face_locations(rgb, model="hog")
        if not locations:
            return None

        # If multiple faces are in frame, track the largest one (closest to
        # camera / most likely to be the person being checked-in).
        def area(loc: Tuple[int, int, int, int]) -> int:
            top, right, bottom, left = loc
            return max(0, bottom - top) * max(0, right - left)

        top, right, bottom, left = max(locations, key=area)
        width = right - left
        height = bottom - top
        if width <= 0 or height <= 0:
            return None

        landmark_sets = face_recognition.face_landmarks(rgb, [(top, right, bottom, left)])
        if not landmark_sets:
            return None

        # Flatten the named landmark groups (chin, eyes, eyebrows, nose,
        # lips) into one ordered point list, normalized into the face box.
        points = []
        for group in sorted(landmark_sets[0].keys()):
            for (x, y) in landmark_sets[0][group]:
                points.append(((x - left) / width, (y - top) / height))

        return {"points": points}

    def score_sequence(self, frames_bgr: List[np.ndarray]) -> Dict:
        """Scores a burst of frames (ideally spanning ~1 second) captured
        for a single person, e.g. from a short CCTV/kiosk clip.

        Returns:
            {
              "state": "checking" | "live" | "static",
              "score": float,   # average box-relative landmark deviation
              "samples": int,   # frames a face was actually found in
            }
        """
        samples = []
        for frame in frames_bgr:
            extracted = self._extract(frame)
            if extracted is not None:
                samples.append(extracted)

        if len(samples) < self.MIN_SAMPLES:
            return {"state": "checking", "score": 0.0, "samples": len(samples)}

        # Different frames can, in principle, yield different landmark
        # counts if detection is imperfect; only compare frames that match
        # the most common point count so the averaging below stays valid.
        point_count = max(
            (len(s["points"]) for s in samples),
            key=lambda n: sum(1 for s in samples if len(s["points"]) == n),
        )
        samples = [s for s in samples if len(s["points"]) == point_count]
        if len(samples) < self.MIN_SAMPLES:
            return {"state": "checking", "score": 0.0, "samples": len(samples)}

        pts = np.array([s["points"] for s in samples])  # (frames, points, 2)
        mean_shape = pts.mean(axis=0)  # (points, 2)
        deviations = np.linalg.norm(pts - mean_shape, axis=2)  # (frames, points)
        score = float(deviations.mean())

        state = "live" if score >= self.MOTION_THRESHOLD else "static"
        return {"state": state, "score": score, "samples": len(samples)}


temporal_motion_engine = TemporalMotionLivenessEngine()
