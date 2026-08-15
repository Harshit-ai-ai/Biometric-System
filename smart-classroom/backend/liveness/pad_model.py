"""
Novel Module 13: Dedicated Presentation-Attack Detection Model — Level 4.

Final stage of the anti-spoof cascade. Levels 1-3 (temporal motion,
federated on-device classifier, screen-spoof heuristics) are all built
from classical signals that are each individually beatable — which is
exactly why they're combined rather than trusted alone. Level 4 is the
intended long-term upgrade: a small dedicated model trained specifically
to classify a face crop into:

    0. live            - a real face in front of the camera
    1. printed_photo   - a paper printout held up to the camera
    2. phone_screen    - a phone/tablet screen held up to the camera
    3. replayed_video  - a looping video of the person played back

This module is a *scaffold*, not a trained model: it defines the exact
preprocessing, input/output contract, and inference path a 4-class ONNX
classifier should plug into (see `scripts/export_pad_model.py` for the
matching export-side contract), and loads a model from `PAD_MODEL_PATH`
(default `exports/pad_model.onnx`) if one has been placed there.

No trained weights ship with this repo — a real presentation-attack
classifier needs a labelled live/photo/screen/replay-attack dataset this
project doesn't have, and shipping an untrained or token model would just
produce a false sense of security. Until a real model is exported here,
every call returns `loaded: False` and `state: "model_not_loaded"`
instead of a fabricated prediction, and callers are expected to treat
that as "no opinion" (fail open) rather than a denial — so Levels 1-3
keep doing all the actual gating exactly as before, and Level 4 slots in
automatically the moment a model file shows up at PAD_MODEL_PATH, with no
other code changes required.
"""

import os
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

try:
    import onnxruntime as ort
except ImportError:  # onnxruntime is already a project dependency (requirements.txt),
    ort = None        # but guard anyway so a stripped-down install doesn't crash on import.


class PresentationAttackDetector:
    # Order MUST match the output layer of any exported model — see
    # scripts/export_pad_model.py, which trains/exports against this same
    # ordering.
    CLASS_LABELS = ["live", "printed_photo", "phone_screen", "replayed_video"]
    INPUT_SIZE = 224
    # Below this confidence, the prediction is treated as too uncertain to
    # act on rather than forced into a label.
    CONFIDENCE_THRESHOLD = 0.6

    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or os.getenv("PAD_MODEL_PATH", "exports/pad_model.onnx")
        self.session = None
        self._input_name = None
        self._try_load()

    def _try_load(self):
        if ort is None:
            print("[Level 4 PAD] onnxruntime not available - dedicated PAD model disabled "
                  "(Levels 1-3 are unaffected).")
            return
        if not os.path.exists(self.model_path):
            print(
                f"[Level 4 PAD] No model found at '{self.model_path}'. "
                f"Level 4 will report 'model_not_loaded' until a trained model is exported "
                f"there (see scripts/export_pad_model.py). Levels 1-3 keep working as-is."
            )
            return
        try:
            self.session = ort.InferenceSession(self.model_path, providers=["CPUExecutionProvider"])
            self._input_name = self.session.get_inputs()[0].name
            print(f"[Level 4 PAD] Loaded presentation-attack model from '{self.model_path}'.")
        except Exception as e:
            print(f"[Level 4 PAD] Failed to load model at '{self.model_path}': {e}")
            self.session = None

    @property
    def is_loaded(self) -> bool:
        return self.session is not None

    def _largest_face_box(self, frame_bgr: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
        import face_recognition

        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        locations = face_recognition.face_locations(rgb, model="hog")
        if not locations:
            return None

        def area(loc):
            top, right, bottom, left = loc
            return max(0, bottom - top) * max(0, right - left)

        return max(locations, key=area)

    def _preprocess(self, face_bgr: np.ndarray) -> np.ndarray:
        """Resize + ImageNet-normalize + CHW + batch dim — the standard
        input a small CNN backbone (e.g. a MobileNet/ResNet-18-sized PAD
        model) expects. Adjust here (and in the matching export script) if
        a differently-trained model is plugged in."""
        resized = cv2.resize(face_bgr, (self.INPUT_SIZE, self.INPUT_SIZE))
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        normalized = (rgb - mean) / std
        chw = normalized.transpose(2, 0, 1)
        return np.expand_dims(chw, axis=0).astype(np.float32)

    def _empty_result(self, state: str) -> Dict:
        return {
            "loaded": self.is_loaded,
            "state": state,
            "label": None,
            "confidence": 0.0,
            "probabilities": {},
        }

    def predict_face_box(self, frame_bgr: np.ndarray, box: Tuple[int, int, int, int]) -> Dict:
        """Runs the model on a face box already known to the caller (e.g.
        a recognition pipeline that already ran face detection) — avoids
        detecting faces twice. `box` is (top, right, bottom, left),
        matching face_recognition's convention."""
        top, right, bottom, left = box
        h, w = frame_bgr.shape[:2]
        crop = frame_bgr[max(0, top) : min(h, bottom), max(0, left) : min(w, right)]
        if crop.size == 0:
            return self._empty_result("no_face")

        if not self.is_loaded:
            return self._empty_result("model_not_loaded")

        try:
            input_tensor = self._preprocess(crop)
            outputs = self.session.run(None, {self._input_name: input_tensor})
            logits = np.asarray(outputs[0]).reshape(-1)[: len(self.CLASS_LABELS)]

            # Softmax defensively, in case the exported model returns raw
            # logits rather than already-normalized probabilities.
            exp = np.exp(logits - np.max(logits))
            probs = exp / exp.sum()

            idx = int(np.argmax(probs))
            label = self.CLASS_LABELS[idx]
            confidence = float(probs[idx])

            if confidence < self.CONFIDENCE_THRESHOLD:
                state = "uncertain"
            elif label == "live":
                state = "live"
            else:
                state = "spoof_suspected"

            return {
                "loaded": True,
                "state": state,
                "label": label,
                "confidence": confidence,
                "probabilities": {cls: float(p) for cls, p in zip(self.CLASS_LABELS, probs)},
            }
        except Exception as e:
            print(f"[Level 4 PAD] Inference error: {e}")
            return self._empty_result("error")

    def predict_frame(self, frame_bgr: np.ndarray) -> Dict:
        """Same as predict_face_box, but detects the largest face itself
        first. Convenience entry point for callers that don't already
        have a box."""
        if not self.is_loaded:
            return self._empty_result("model_not_loaded")
        box = self._largest_face_box(frame_bgr)
        if box is None:
            return self._empty_result("no_face")
        return self.predict_face_box(frame_bgr, box)

    def score_sequence(self, frames_bgr: List[np.ndarray]) -> Dict:
        """Averages class probabilities across a burst of frames for a
        more stable verdict than any single frame. Mirrors the
        score_sequence() shape of the Level 1/Level 3 engines so callers
        (main.py) can treat all three the same way."""
        if not self.is_loaded:
            result = self._empty_result("model_not_loaded")
            result["samples"] = 0
            return result

        results = [self.predict_frame(f) for f in frames_bgr]
        results = [r for r in results if r["state"] not in ("no_face", "error")]

        if not results:
            result = self._empty_result("no_face")
            result["samples"] = 0
            return result

        avg_probs = {
            cls: float(np.mean([r["probabilities"].get(cls, 0.0) for r in results]))
            for cls in self.CLASS_LABELS
        }
        label = max(avg_probs, key=avg_probs.get)
        confidence = avg_probs[label]

        if confidence < self.CONFIDENCE_THRESHOLD:
            state = "uncertain"
        elif label == "live":
            state = "live"
        else:
            state = "spoof_suspected"

        return {
            "loaded": True,
            "state": state,
            "label": label,
            "confidence": confidence,
            "probabilities": avg_probs,
            "samples": len(results),
        }


# Loaded once at import time, same pattern as the other liveness engines.
# Safe to import even with no model file present — see class docstring.
pad_detector = PresentationAttackDetector()
