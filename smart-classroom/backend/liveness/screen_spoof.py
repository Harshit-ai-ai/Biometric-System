"""
Novel Module 12: Screen-Spoof Detection — Level 3.

Third stage of the anti-spoof cascade started by Level 1 (temporal motion,
see `temporal_motion.py`). Where Level 1 asks "does this face move like a
live face over time?", Level 3 asks a different, single-frame question:
"does this image itself look like a photograph of a *display* (monitor,
tablet, phone) rather than a photograph of a real face?" — i.e. it's aimed
squarely at the classic attack of holding a phone or tablet playing a
photo/video of the enrolled person up to the camera.

It combines five cheap, classical computer-vision signals, each scored
0.0 ("looks natural") to 1.0 ("looks like a screen"), and rolled up into
one weighted `spoof_score`:

  1. moire        — FFT of the face crop: re-photographing a pixel grid
                     (a screen) through a camera sensor grid produces
                     interference/aliasing energy concentrated in
                     specific mid/high spatial frequencies that a real
                     face's smoothly-decaying spectrum doesn't have.
  2. screen_edges  — Canny + Hough line detection on a padded region
                     around the face: monitor/tablet/phone bezels show up
                     as long, straight, axis-aligned edges framing the
                     face at a fairly consistent distance — something a
                     natural background rarely produces by coincidence.
  3. reflections   — HSV analysis of the face crop: glass/screen surfaces
                     produce small, sharp, desaturated (low-saturation,
                     near-white) specular highlights that read
                     differently from the warmer, softer highlights real
                     skin produces.
  4. texture       — Laplacian variance ("blurriness") of the face crop:
                     a screen recapture is very often either markedly
                     softer than real skin detail (double compression /
                     refocus) or unnaturally uniform.
  5. illumination  — Luminance (Lab L-channel) variance/gradient
                     complexity across the face crop: a self-lit display
                     tends to look flatter than a real 3D face shaded by
                     ambient light (nose bridge / cheekbone highlights,
                     soft shadows).

None of these signals is reliable alone (bright rooms, glasses, studio
lighting etc. can all trip one or two of them) — that's *why* they're
combined into a weighted score here, and why this is meant to sit
alongside Level 1 rather than replace it. As with Level 1's motion
threshold, the weights/thresholds below are reasonable demo-grade
defaults, not values tuned against a labelled spoof/live dataset — tune
them for your own camera/lighting before relying on this for access
control.
"""

from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np


class ScreenSpoofDetectionEngine:
    # Above this combined score, we call it a likely screen recapture.
    SPOOF_THRESHOLD = 0.55

    # How each of the five signals contributes to the combined score.
    # Moire + screen edges are the most specific/diagnostic signals for a
    # "photo of a display" attack in particular, so they carry more
    # weight; texture/illumination/reflections are supporting evidence.
    WEIGHTS = {
        "moire": 0.30,
        "screen_edges": 0.25,
        "reflections": 0.15,
        "texture": 0.15,
        "illumination": 0.15,
    }

    FFT_SIZE = 256
    # Fraction of FFT_SIZE treated as "low frequency" (real image content)
    # and excluded from the moire energy calculation.
    FFT_DC_RADIUS_FRAC = 0.08

    def _largest_face_box(self, frame_bgr: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
        import face_recognition

        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        locations = face_recognition.face_locations(rgb, model="hog")
        if not locations:
            return None

        def area(loc):
            top, right, bottom, left = loc
            return max(0, bottom - top) * max(0, right - left)

        return max(locations, key=area)  # (top, right, bottom, left)

    # ---------- individual signals ----------

    def _score_moire(self, face_gray: np.ndarray) -> float:
        resized = cv2.resize(face_gray, (self.FFT_SIZE, self.FFT_SIZE))
        f = np.fft.fft2(resized.astype(np.float32))
        f_shift = np.fft.fftshift(f)
        magnitude = np.abs(f_shift)
        log_mag = np.log1p(magnitude)

        center = self.FFT_SIZE // 2
        yy, xx = np.ogrid[: self.FFT_SIZE, : self.FFT_SIZE]
        dist = np.sqrt((yy - center) ** 2 + (xx - center) ** 2)
        dc_radius = self.FFT_SIZE * self.FFT_DC_RADIUS_FRAC
        band_mask = dist > dc_radius

        band = log_mag[band_mask]
        if band.size == 0:
            return 0.0

        # Moire shows up as a handful of unusually bright peaks against an
        # otherwise low, smooth background in this frequency band — so we
        # compare how much energy the brightest few percent of the band
        # accounts for against the band's overall energy. A natural image
        # spreads energy more evenly; a small number of dominant peaks
        # pushes this ratio up.
        band_sorted = np.sort(band)[::-1]
        top_k = max(1, int(0.02 * band_sorted.size))
        peak_energy = band_sorted[:top_k].sum()
        total_energy = band_sorted.sum() + 1e-6
        peak_ratio = peak_energy / total_energy

        # Empirically, natural mid/high-frequency spectra keep the top 2%
        # of bins under roughly 15-20% of the band's total energy; screen
        # moire tends to push well past that. Map [0.15, 0.45] -> [0, 1].
        score = (peak_ratio - 0.15) / 0.30
        return float(np.clip(score, 0.0, 1.0))

    def _score_screen_edges(self, region_gray: np.ndarray) -> float:
        h, w = region_gray.shape[:2]
        if h < 10 or w < 10:
            return 0.0

        edges = cv2.Canny(region_gray, 60, 150)
        min_len = 0.35 * min(h, w)
        lines = cv2.HoughLinesP(
            edges, 1, np.pi / 180, threshold=60, minLineLength=min_len, maxLineGap=8
        )
        if lines is None:
            return 0.0

        axis_aligned_long = 0
        for line in lines:
            x1, y1, x2, y2 = line[0]
            length = np.hypot(x2 - x1, y2 - y1)
            if length < min_len:
                continue
            angle = abs(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
            # Close to horizontal (~0/180) or vertical (~90) => bezel-like.
            is_axis_aligned = angle < 8 or angle > 172 or 82 < angle < 98
            if is_axis_aligned:
                axis_aligned_long += 1

        # A handful of long straight axis-aligned edges around a face
        # (especially forming a rectangle) is unusual for organic
        # backgrounds but exactly what a monitor/tablet/phone bezel
        # produces. Cap the contribution so a cluttered but innocent
        # background (window frames, bookshelves) doesn't saturate this.
        score = axis_aligned_long / 6.0
        return float(np.clip(score, 0.0, 1.0))

    def _score_reflections(self, face_bgr: np.ndarray) -> float:
        hsv = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2HSV)
        h_ch, s_ch, v_ch = cv2.split(hsv)

        # Bright + desaturated pixels: the signature of a specular
        # highlight off glass/a screen surface, as opposed to skin's
        # warmer, less saturated-but-not-this-desaturated highlights.
        glare_mask = (v_ch > 235) & (s_ch < 40)
        glare_ratio = float(np.count_nonzero(glare_mask)) / glare_mask.size

        # A tiny highlight on the nose/forehead is normal; broad or
        # multiple hard glare patches are not. 3% coverage is already a
        # lot for a face crop.
        score = glare_ratio / 0.03
        return float(np.clip(score, 0.0, 1.0))

    def _score_texture(self, face_gray: np.ndarray) -> float:
        laplacian_var = cv2.Laplacian(face_gray, cv2.CV_64F).var()

        # Heuristic natural range for a reasonably-sized, in-focus face
        # crop. Recaptured screens tend to fall noticeably below this
        # (softened by double-compression/refocus); very low variance is
        # treated as spoof-leaning. We intentionally do NOT penalize high
        # variance (sharp real faces are common and shouldn't be flagged).
        natural_floor = 60.0
        if laplacian_var >= natural_floor:
            return 0.0
        score = 1.0 - (laplacian_var / natural_floor)
        return float(np.clip(score, 0.0, 1.0))

    def _score_illumination(self, face_bgr: np.ndarray) -> float:
        lab = cv2.cvtColor(face_bgr, cv2.COLOR_BGR2LAB)
        l_channel = lab[:, :, 0].astype(np.float32)

        grad_x = cv2.Sobel(l_channel, cv2.CV_32F, 1, 0, ksize=3)
        grad_y = cv2.Sobel(l_channel, cv2.CV_32F, 0, 1, ksize=3)
        gradient_complexity = float(np.hypot(grad_x, grad_y).std())

        # Real faces under ambient/directional light show meaningfully
        # more shading gradient variation (nose bridge, cheekbones, soft
        # shadow edges) than the flatter luminance of a self-lit screen
        # reproducing the same face. Below this floor is treated as
        # spoof-leaning.
        natural_floor = 18.0
        if gradient_complexity >= natural_floor:
            return 0.0
        score = 1.0 - (gradient_complexity / natural_floor)
        return float(np.clip(score, 0.0, 1.0))

    # ---------- public API ----------

    def analyze_frame(self, frame_bgr: np.ndarray) -> Optional[Dict]:
        """Runs all five checks on the largest face in a single frame.
        Returns None if no face was found."""
        box = self._largest_face_box(frame_bgr)
        if box is None:
            return None
        return self.analyze_face_box(frame_bgr, box)

    def analyze_face_box(
        self, frame_bgr: np.ndarray, box: Tuple[int, int, int, int]
    ) -> Optional[Dict]:
        """Same as analyze_frame, but for a face box already known to the
        caller (e.g. a recognition pipeline that already ran face
        detection) — avoids detecting faces twice when scoring several
        faces in one frame or reusing a box from an earlier step.
        `box` is (top, right, bottom, left), matching face_recognition's
        convention."""
        top, right, bottom, left = box
        h, w = frame_bgr.shape[:2]

        face_crop = frame_bgr[max(0, top) : min(h, bottom), max(0, left) : min(w, right)]
        if face_crop.size == 0:
            return None
        face_gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)

        # Pad out around the face for the edge/bezel check, since a
        # screen's bezel is typically well outside the face itself.
        pad_y = int((bottom - top) * 0.6)
        pad_x = int((right - left) * 0.6)
        region = frame_bgr[
            max(0, top - pad_y) : min(h, bottom + pad_y),
            max(0, left - pad_x) : min(w, right + pad_x),
        ]
        region_gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY) if region.size else face_gray

        components = {
            "moire": self._score_moire(face_gray),
            "screen_edges": self._score_screen_edges(region_gray),
            "reflections": self._score_reflections(face_crop),
            "texture": self._score_texture(face_gray),
            "illumination": self._score_illumination(face_crop),
        }
        spoof_score = sum(components[k] * self.WEIGHTS[k] for k in self.WEIGHTS)

        return {"spoof_score": spoof_score, "components": components}

    def score_sequence(self, frames_bgr: List[np.ndarray]) -> Dict:
        """Analyzes one or more frames and averages the result. Level 3 is
        a single-frame technique in principle, but averaging over a short
        burst (e.g. the same frames used for Level 1) smooths out a single
        noisy/blurry frame giving a false reading."""
        results = [self.analyze_frame(f) for f in frames_bgr]
        results = [r for r in results if r is not None]

        if not results:
            return {"state": "checking", "spoof_score": 0.0, "components": {}, "samples": 0}

        component_keys = self.WEIGHTS.keys()
        avg_components = {
            k: float(np.mean([r["components"][k] for r in results])) for k in component_keys
        }
        avg_score = float(np.mean([r["spoof_score"] for r in results]))

        state = "screen_spoof_suspected" if avg_score >= self.SPOOF_THRESHOLD else "no_screen_artifacts_detected"
        return {
            "state": state,
            "spoof_score": avg_score,
            "components": avg_components,
            "samples": len(results),
        }


screen_spoof_engine = ScreenSpoofDetectionEngine()
