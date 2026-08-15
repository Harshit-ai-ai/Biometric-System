import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import * as faceapi from "face-api.js";

// ============================================================
// API / SECURITY CONFIGURATION
// ============================================================

const API_KEY =
  import.meta.env.VITE_API_KEY || "unity-2026-secure";

axios.defaults.headers.common["X-API-Key"] = API_KEY;

function getApiUrl() {
  return (import.meta.env.VITE_API_URL || "https://biometric-system-production.up.railway.app").replace(
    /\/+$/,
    ""
  );
}

function getWsUrl(apiUrl) {
  const configured = import.meta.env.VITE_WS_URL;

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  try {
    const url = new URL(apiUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/ws/dashboard";
    url.search = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "wss://biometric-system-production.up.railway.app/ws/dashboard";
  }
}

<<<<<<< HEAD
// ============================================================
// LEVEL 1 LIVENESS — TEMPORAL MOTION
// ============================================================
// Novel Module 11: Temporal Motion Liveness (Level 1 of a planned
// multi-level anti-spoof cascade — Level 1 looks at raw landmark motion;
// later levels can layer in texture/moire analysis, depth cues, etc.)
//
// Idea: over a short ~1 second sliding window, track the 68 face-api.js
// landmarks for a recognized face and measure how much they deform
// *relative to the face's own bounding box*. A live face is never
// perfectly still — blinks, breathing, micro head movements and small
// mouth/brow motion constantly reshuffle landmark positions relative to
// each other. A printed photo or a phone screen held up to the camera is
// a rigid 2D object: it may translate/rotate as a whole (shaky hand), but
// because we normalize every landmark by the current face box before
// comparing frames, that rigid motion is cancelled out — the landmarks'
// relative geometry stays almost perfectly frozen. Very low relative
// motion over the window is therefore a strong "this might be a photo,
// not a live person" signal.

// Keep ~1s of history; require enough spread + enough samples before
// trusting the score (a face that just entered frame hasn't had time to
// prove liveness yet).
const TEMPORAL_MOTION_WINDOW_MS = 1000;
const TEMPORAL_MOTION_MIN_SAMPLES = 4;
const TEMPORAL_MOTION_MIN_SPAN_MS = 600;
// Tunable: normalized (box-relative) average landmark displacement below
// this is treated as "suspiciously static". This is a demo-grade default,
// not empirically calibrated against real spoof/live footage — tune per
// camera/lighting setup before relying on it for access control.
const TEMPORAL_MOTION_THRESHOLD = 0.0035;

/**
 * Normalizes a face-api.js landmark set (68 {x, y} points in video pixel
 * space) into box-relative coordinates in [0, 1], so the same face at a
 * different distance/position from the camera produces comparable values.
 */
function normalizeLandmarks(landmarks, box) {
  const { x, y, width, height } = box;
  if (!width || !height) return null;
  return landmarks.positions.map((p) => [
    (p.x - x) / width,
    (p.y - y) / height,
  ]);
}

/**
 * Pushes a new normalized-landmark snapshot for `key` into `historyRef`,
 * trims anything older than the temporal window, and returns a liveness
 * verdict computed from whatever remains in the window.
 *
 * Returns:
 *   { state: 'checking' | 'live' | 'static', score, samples }
 *   - 'checking' -> not enough history yet to make a call (new arrival)
 *   - 'live'     -> relative landmark motion is above the threshold
 *   - 'static'   -> relative landmark motion is suspiciously low
 */
function updateTemporalMotionLiveness(historyRef, key, landmarks, box, now) {
  const points = normalizeLandmarks(landmarks, box);
  if (!points) return { state: "checking", score: 0, samples: 0 };

  const history = historyRef.current[key] || [];
  history.push({ t: now, points });

  const trimmed = history.filter((s) => now - s.t <= TEMPORAL_MOTION_WINDOW_MS);
  historyRef.current[key] = trimmed;

  if (trimmed.length < TEMPORAL_MOTION_MIN_SAMPLES) {
    return { state: "checking", score: 0, samples: trimmed.length };
  }
  const spanMs = trimmed[trimmed.length - 1].t - trimmed[0].t;
  if (spanMs < TEMPORAL_MOTION_MIN_SPAN_MS) {
    return { state: "checking", score: 0, samples: trimmed.length };
  }

  // Mean position of every landmark across the window...
  const numPoints = trimmed[0].points.length;
  const mean = new Array(numPoints).fill(null).map(() => [0, 0]);
  for (const sample of trimmed) {
    for (let i = 0; i < numPoints; i++) {
      mean[i][0] += sample.points[i][0] / trimmed.length;
      mean[i][1] += sample.points[i][1] / trimmed.length;
    }
  }

  // ...then the average distance of each snapshot from that mean shape.
  // Near-zero => landmarks barely move relative to one another => static.
  let totalDeviation = 0;
  for (const sample of trimmed) {
    for (let i = 0; i < numPoints; i++) {
      const dx = sample.points[i][0] - mean[i][0];
      const dy = sample.points[i][1] - mean[i][1];
      totalDeviation += Math.sqrt(dx * dx + dy * dy);
    }
  }
  const score = totalDeviation / (trimmed.length * numPoints);

  return {
    state: score >= TEMPORAL_MOTION_THRESHOLD ? "live" : "static",
    score,
    samples: trimmed.length,
  };
}

/** Drops any tracked identities we haven't seen in a while, so the history
 * map doesn't grow unbounded across a long session. */
function pruneTemporalMotionHistory(historyRef, now, staleMs = 5000) {
  for (const key of Object.keys(historyRef.current)) {
    const samples = historyRef.current[key];
    if (!samples || !samples.length || now - samples[samples.length - 1].t > staleMs) {
      delete historyRef.current[key];
    }
  }
}

=======
>>>>>>> 23dabe834c67990cb98aa994b5af7393507d14bc
function App() {
  const API_URL = getApiUrl();
  const WS_URL = getWsUrl(API_URL);

  // ==========================================================
  // AUTH STATE
  // ==========================================================

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [maheId, setMaheId] = useState("");
  const [password, setPassword] = useState("");

  // ==========================================================
  // CAMERA / VIDEO STATE
  // ==========================================================

  // IMPORTANT:
  // The old version used the SAME ref for the camera tab and
  // enrollment tab. Only one DOM element can own a ref at a time.
  // These separate refs allow both windows to receive a real
  // browser camera stream when their tab is active.
  const cameraVideoRef = useRef(null);
  const enrollmentVideoRef = useRef(null);
  const canvasRef = useRef(null);
  // Overlay canvas drawn on top of the live camera video
  const overlayCanvasRef = useRef(null);

  const mediaStreamRef = useRef(null);
  const cameraStartRequestRef = useRef(0);

  // face-api.js state
  const faceApiLoadedRef = useRef(false);
  const recognitionLoopRef = useRef(null);
  // Stores { name, descriptor } for enrolled people
  const knownDescriptorsRef = useRef([]);
  const [faceApiStatus, setFaceApiStatus] = useState("loading"); // loading | ready | error
  const [realtimeLabel, setRealtimeLabel] = useState("");
  // Cooldown to prevent duplicate attendance logs
  const lastLoggedRef = useRef({});

<<<<<<< HEAD
  // --- Level 1 Liveness: Temporal Motion (see computeTemporalMotionScore) ---
  // Rolling ~1s buffer of normalized landmark snapshots, keyed by recognized
  // label. Used to tell a live face (blinks/micro-expressions cause small
  // non-rigid landmark deformation) apart from a printed photo / phone
  // screen held up to the camera (moves rigidly, so landmarks barely shift
  // relative to each other even though the face box itself may move).
  const landmarkHistoryRef = useRef({});
  const [livenessByLabel, setLivenessByLabel] = useState({});
  // Throttle the "possible spoof" warning so it doesn't spam every frame
  const lastSpoofWarningRef = useRef({});

=======
>>>>>>> 23dabe834c67990cb98aa994b5af7393507d14bc
  const [cameraStatus, setCameraStatus] = useState("idle");
  const [cameraError, setCameraError] = useState("");

  const [dashboardStats, setDashboardStats] = useState([]);
  const [resultImage, setResultImage] = useState("");
  const [isTracking, setIsTracking] = useState(false);
  const [envData, setEnvData] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [zkStatus, setZkStatus] = useState(null);
  const [fedStatus, setFedStatus] = useState(null);
  const [attestation, setAttestation] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [recognizedEvents, setRecognizedEvents] = useState([]);

  // ==========================================================
  // RESIDENT LOOKUP STATE
  // ==========================================================

  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeProfile, setEmployeeProfile] = useState(null);
  const [residentLookupLoading, setResidentLookupLoading] = useState(false);
  const [residentLookupError, setResidentLookupError] = useState("");

  // Full directory of everyone enrolled so far (residents + non-residents),
  // shown on the Resident Lookup page so people don't have to know the
  // exact name to search for before they can find themselves.
  const [allResidents, setAllResidents] = useState([]);
  const [allResidentsLoading, setAllResidentsLoading] = useState(false);
  const [allResidentsError, setAllResidentsError] = useState("");

  const [classSummary, setAssignedAreaSummary] = useState(null);
  const [notification, setNotification] = useState(null);
  const [isDark, setIsDark] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [exportHours, setExportHours] = useState(24);

  // ==========================================================
  // ENROLLMENT STATE
  // ==========================================================

  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [isResident, setIsResident] = useState(false);
  const [flatNumber, setFlatNumber] = useState("");
  const [role, setRole] = useState("");
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [captureProgress, setCaptureProgress] = useState("");

  // ==========================================================
  // WEBSOCKET / TRACKING REFS
  // ==========================================================

  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const trackInterval = useRef(null);
  const isLoggedInRef = useRef(false);

  useEffect(() => {
    isLoggedInRef.current = isLoggedIn;
  }, [isLoggedIn]);

  // ==========================================================
  // FACE-API.JS MODEL LOADING
  // ==========================================================

  useEffect(() => {
    const loadModels = async () => {
      try {
        const MODEL_URL = "/models";
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        faceApiLoadedRef.current = true;
        setFaceApiStatus("ready");
      } catch (err) {
        console.error("face-api.js model loading failed:", err);
        setFaceApiStatus("error");
      }
    };
    loadModels();
  }, []);

  // Load enrolled descriptors from backend when entering camera tab
  const loadEnrolledDescriptors = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/enrolled-descriptors`);
      const entries = res.data?.descriptors || [];
      if (entries.length > 0) {
        // Each person can have MULTIPLE stored samples (one per enrollment
        // attempt). Passing all of them into LabeledFaceDescriptors lets
        // face-api.js compare against every sample and pick the closest
        // one, which is much more reliable than matching against a single
        // descriptor captured under one lighting condition/angle.
        const labeledDescriptors = entries
          .map(({ name, descriptor, descriptors }) => {
            const samples = descriptors && descriptors.length > 0
              ? descriptors
              : (descriptor ? [descriptor] : []);
            if (samples.length === 0) return null;
            return new faceapi.LabeledFaceDescriptors(
              name,
              samples.map((d) => new Float32Array(d))
            );
          })
          .filter(Boolean);

        knownDescriptorsRef.current = labeledDescriptors.length > 0
          ? [{ matcher: new faceapi.FaceMatcher(labeledDescriptors, 0.6) }]
          : [];
      } else {
        knownDescriptorsRef.current = [];
      }
    } catch (err) {
      console.warn("Could not load enrolled descriptors from server:", err);
    }
  }, [API_URL]);

  // ==========================================================
  // THEME
  // ==========================================================

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  // ==========================================================
  // NOTIFICATIONS
  // ==========================================================

  const showNotification = useCallback((msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  // ==========================================================
  // LOGIN
  // ==========================================================

  const handleLogin = (e) => {
    e.preventDefault();

    if (
      maheId.trim().toUpperCase().startsWith("UNITY") &&
      password.length > 3
    ) {
      setIsLoggedIn(true);
      showNotification("Authentication successful. Welcome to UNITY.");
    } else {
      showNotification(
        "Unauthorized. Valid UNITY ID required.",
        "error"
      );
    }
  };

  // ==========================================================
  // EXCEL DOWNLOAD
  // ==========================================================

  const downloadExcelReport = async (url, filename) => {
    try {
      setIsDownloading(true);
      showNotification("Generating secure Excel report...", "success");

      const res = await axios.get(url, {
        responseType: "blob",
      });

      const blobURL = window.URL.createObjectURL(
        new Blob([res.data])
      );

      const link = document.createElement("a");
      link.href = blobURL;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(blobURL);

      showNotification(
        "Report downloaded successfully!",
        "success"
      );
    } catch (e) {
      console.error("Excel download error:", e);
      showNotification("Failed to download report", "error");
    } finally {
      setIsDownloading(false);
    }
  };

  // ==========================================================
  // SYSTEM STATUS
  // ==========================================================

  const fetchSystemStatus = useCallback(async () => {
    try {
      const [
        envRes,
        zkRes,
        fedRes,
        attRes,
        summRes,
      ] = await Promise.all([
        axios.get(`${API_URL}/environment`).catch(() => null),
        axios.get(`${API_URL}/zk/status`).catch(() => null),
        axios.get(`${API_URL}/federated/status`).catch(() => null),
        axios.get(`${API_URL}/attestation`).catch(() => null),
        axios.get(`${API_URL}/teacher/summary`).catch(() => null),
      ]);

      if (envRes) setEnvData(envRes.data);
      if (zkRes) setZkStatus(zkRes.data);
      if (fedRes) setFedStatus(fedRes.data);
      if (attRes) setAttestation(attRes.data);
      if (summRes) setAssignedAreaSummary(summRes.data);
    } catch (e) {
      console.error("Status fetch error:", e);
    }
  }, [API_URL]);

  // ==========================================================
  // AUDIT LOG
  // ==========================================================

  const fetchAuditLog = async () => {
    try {
      const res = await axios.get(`${API_URL}/audit`);
      setAuditLog(res.data?.events || []);
    } catch (e) {
      console.error("Audit fetch error:", e);
      showNotification("Failed to load audit trail", "error");
    }
  };

  // ==========================================================
  // RESIDENT LOOKUP
  // ==========================================================

  const searchEmployee = async () => {
    const query = employeeSearch.trim();

    if (!query) {
      setEmployeeProfile(null);
      setResidentLookupError("Enter a resident or non-resident name.");
      return;
    }

    setResidentLookupLoading(true);
    setResidentLookupError("");
    setEmployeeProfile(null);

    try {
      // encodeURIComponent is important for names containing spaces,
      // &, /, #, etc.
      const encodedName = encodeURIComponent(query);

      const res = await axios.get(
        `${API_URL}/employee/${encodedName}`
      );

      if (!res.data) {
        throw new Error("Empty resident record");
      }

      setEmployeeProfile(res.data);
    } catch (e) {
      console.error("Resident lookup error:", e);

      const status = e?.response?.status;

      if (status === 404) {
        setResidentLookupError(
          `No resident/non-resident record found for "${query}".`
        );
      } else if (status === 401 || status === 403) {
        setResidentLookupError(
          "The backend rejected the API key or authorization."
        );
      } else {
        setResidentLookupError(
          "Resident lookup failed. Check that the backend is running and that GET /employee/{name} exists."
        );
      }

      showNotification("Resident lookup failed", "error");
    } finally {
      setResidentLookupLoading(false);
    }
  };

  // Load the full directory of everyone enrolled (resident + non-resident),
  // with flat number / role, so the Resident Lookup page shows everybody
  // by default instead of requiring an exact-name search first.
  const fetchAllResidents = useCallback(async () => {
    setAllResidentsLoading(true);
    setAllResidentsError("");
    try {
      const res = await axios.get(`${API_URL}/residents`);
      setAllResidents(res.data?.residents || []);
    } catch (e) {
      console.error("Failed to load resident directory:", e);
      setAllResidentsError(
        "Could not load the resident directory. Check that the backend is running and that GET /residents exists."
      );
    } finally {
      setAllResidentsLoading(false);
    }
  }, [API_URL]);

  // Clicking a row in the directory loads that person's full profile using
  // the existing single-name lookup flow.
  const viewResidentFromDirectory = (name) => {
    setEmployeeSearch(name);
    setResidentLookupLoading(true);
    setResidentLookupError("");
    setEmployeeProfile(null);
    axios
      .get(`${API_URL}/employee/${encodeURIComponent(name)}`)
      .then((res) => setEmployeeProfile(res.data))
      .catch((e) => {
        console.error("Resident lookup error:", e);
        setResidentLookupError(`No resident/non-resident record found for "${name}".`);
        showNotification("Resident lookup failed", "error");
      })
      .finally(() => setResidentLookupLoading(false));
  };

  // ==========================================================
  // DAY FINALIZATION
  // ==========================================================

  const finalizeDay = async () => {
    try {
      const res = await axios.post(`${API_URL}/teacher/finalize`);

      const count =
        res.data?.finalized_employees?.length ??
        res.data?.finalized ??
        0;

      showNotification(`Day finalized for ${count} residents`);
      fetchSystemStatus();
    } catch (e) {
      console.error("Finalization error:", e);
      showNotification("Finalization failed", "error");
    }
  };

  // ==========================================================
  // RESET SESSION
  // ==========================================================

  const resetSession = async () => {
    try {
      await axios.post(`${API_URL}/reset`);
      setDashboardStats([]);
      showNotification("Session reset. Ready for new class.");
    } catch (e) {
      console.error("Reset error:", e);
      showNotification("Reset failed", "error");
    }
  };

  // ==========================================================
  // WEBSOCKET
  // ==========================================================

  const disconnectWebSocket = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }

    if (ws.current) {
      try {
        ws.current.onclose = null;
        ws.current.close();
      } catch {
        // Ignore an already closed socket.
      }
      ws.current = null;
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!isLoggedInRef.current) return;

    disconnectWebSocket();

    try {
      const socket = new WebSocket(WS_URL);
      ws.current = socket;

      socket.onopen = () => {
        console.log("Connected to Dashboard WebSocket");
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (
            message.type === "init" ||
            message.type === "update"
          ) {
            if (Array.isArray(message.data)) {
              setDashboardStats(message.data);
            }

            if (message.environment) {
              setEnvData({
                valid: true,
                readings: message.environment,
              });
            }
          }
        } catch (e) {
          console.error("WebSocket message error:", e);
        }
      };

      socket.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      socket.onclose = () => {
        ws.current = null;

        if (isLoggedInRef.current) {
          reconnectTimer.current = setTimeout(
            connectWebSocket,
            3000
          );
        }
      };
    } catch (e) {
      console.error("WebSocket connection failed:", e);

      if (isLoggedInRef.current) {
        reconnectTimer.current = setTimeout(
          connectWebSocket,
          3000
        );
      }
    }
  }, [WS_URL, disconnectWebSocket]);

  // ==========================================================
  // CAMERA
  // ==========================================================

  const getActiveVideoElement = useCallback(() => {
    if (activeTab === "enrollment") {
      return enrollmentVideoRef.current;
    }

    if (activeTab === "camera") {
      return cameraVideoRef.current;
    }

    return null;
  }, [activeTab]);

  const stopCamera = useCallback(() => {
    cameraStartRequestRef.current += 1;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore already stopped tracks.
        }
      });

      mediaStreamRef.current = null;
    }

    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }

    if (enrollmentVideoRef.current) {
      enrollmentVideoRef.current.srcObject = null;
    }

    setCameraStatus("idle");
  }, []);

  const startCamera = useCallback(async () => {
    if (!isLoggedInRef.current) return;

    const targetVideo =
      activeTab === "enrollment"
        ? enrollmentVideoRef.current
        : activeTab === "camera"
          ? cameraVideoRef.current
          : null;

    if (!targetVideo) {
      // The tab has not mounted its <video> element yet.
      return;
    }

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setCameraStatus("error");
      setCameraError(
        "This browser does not provide camera access. Use HTTPS or localhost."
      );
      return;
    }

    const requestId = ++cameraStartRequestRef.current;

    setCameraStatus("requesting");
    setCameraError("");

    try {
      // Reuse an existing stream when possible.
      let stream = mediaStreamRef.current;

      if (!stream || stream.getVideoTracks().every((track) => track.readyState === "ended")) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: {
              ideal: 1280,
            },
            height: {
              ideal: 720,
            },
          },
          audio: false,
        });

        if (requestId !== cameraStartRequestRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        mediaStreamRef.current = stream;
      }

      // The user may have switched tabs while permission was being
      // requested. Always attach to the currently active video.
      const currentVideo = getActiveVideoElement();

      if (!currentVideo) {
        setCameraStatus("waiting");
        return;
      }

      currentVideo.srcObject = stream;
      currentVideo.muted = true;
      currentVideo.playsInline = true;

      try {
        await currentVideo.play();
      } catch (playError) {
        console.warn(
          "Video play() was blocked; waiting for browser playback:",
          playError
        );
      }

      setCameraStatus("live");
    } catch (err) {
      console.error("Camera unavailable:", err);

      setCameraStatus("error");

      if (err?.name === "NotAllowedError") {
        setCameraError(
          "Camera permission was denied. Allow camera access for this site and reload."
        );
      } else if (err?.name === "NotFoundError") {
        setCameraError(
          "No camera was found on this device."
        );
      } else if (err?.name === "NotReadableError") {
        setCameraError(
          "The camera is already being used by another application."
        );
      } else if (err?.name === "SecurityError") {
        setCameraError(
          "Camera access was blocked by browser security. Use HTTPS or localhost."
        );
      } else {
        setCameraError(
          err?.message || "Unable to start the camera."
        );
      }
    }
  }, [activeTab, getActiveVideoElement]);

  // Start/reattach the camera whenever the active tab changes.
  useEffect(() => {
    if (!isLoggedIn) {
      stopCamera();
      return undefined;
    }

    if (activeTab === "camera" || activeTab === "enrollment") {
      // Wait one frame so the new <video> element definitely exists.
      const timer = setTimeout(() => {
        startCamera();
      }, 50);

      return () => clearTimeout(timer);
    }

    stopCamera();

    return undefined;
  }, [
    activeTab,
    isLoggedIn,
    startCamera,
    stopCamera,
  ]);

  // ==========================================================
  // LOGIN / SESSION INITIALIZATION
  // ==========================================================

  useEffect(() => {
    if (!isLoggedIn) {
      disconnectWebSocket();

      if (trackInterval.current) {
        clearInterval(trackInterval.current);
        trackInterval.current = null;
      }

      setIsTracking(false);
      stopCamera();

      return undefined;
    }

    connectWebSocket();
    fetchSystemStatus();

    return () => {
      disconnectWebSocket();

      if (trackInterval.current) {
        clearInterval(trackInterval.current);
        trackInterval.current = null;
      }

      setIsTracking(false);
    };
  }, [
    isLoggedIn,
    connectWebSocket,
    disconnectWebSocket,
    fetchSystemStatus,
    stopCamera,
  ]);

  // ==========================================================
  // FRAME CAPTURE
  // ==========================================================

  const getBase64Frame = useCallback(() => {
    const canvas = canvasRef.current;
    const video = getActiveVideoElement();

    if (!canvas || !video) {
      return null;
    }

    if (
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      return null;
    }

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return null;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.drawImage(
      video,
      0,
      0,
      video.videoWidth,
      video.videoHeight
    );

    return canvas.toDataURL("image/jpeg", 0.8);
  }, [getActiveVideoElement]);

  // ==========================================================
  // REAL-TIME RECOGNITION LOOP (face-api.js, browser-side)
  // ==========================================================

  const stopRecognitionLoop = useCallback(() => {
    if (recognitionLoopRef.current) {
      cancelAnimationFrame(recognitionLoopRef.current);
      recognitionLoopRef.current = null;
    }
    setIsTracking(false);
    // Clear the overlay
    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext("2d");
      ctx && ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
    }
    setRealtimeLabel("");
  }, []);

  const startRecognitionLoop = useCallback(() => {
    if (!faceApiLoadedRef.current) {
      showNotification("Face recognition models still loading, please wait.", "error");
      return;
    }
    const video = cameraVideoRef.current;
    const overlay = overlayCanvasRef.current;
    if (!video || !overlay) return;

    setIsTracking(true);

    const detect = async () => {
      if (!cameraVideoRef.current || !overlayCanvasRef.current) return;
      if (video.readyState < 2 || video.videoWidth === 0) {
        recognitionLoopRef.current = requestAnimationFrame(detect);
        return;
      }

      // Resize overlay canvas to match video dimensions
      const displaySize = { width: video.videoWidth, height: video.videoHeight };
      faceapi.matchDimensions(overlay, displaySize);

      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors();

      const resized = faceapi.resizeResults(detections, displaySize);

      const ctx = overlay.getContext("2d");
      ctx.clearRect(0, 0, overlay.width, overlay.height);

      const known = knownDescriptorsRef.current;
      const now = Date.now();
      const COOLDOWN_MS = 10000; // log same person at most every 10 seconds
<<<<<<< HEAD
      const SPOOF_WARNING_COOLDOWN_MS = 8000;

      const nextLivenessByLabel = {};
=======
>>>>>>> 23dabe834c67990cb98aa994b5af7393507d14bc

      for (const det of resized) {
        const { x, y, width, height } = det.detection.box;
        let label = "Unknown";
        let color = "#ef4444"; // red

        if (known.length > 0) {
          const matcher = known[0].matcher;
          const result = matcher.findBestMatch(det.descriptor);
          
          if (result.label !== "unknown") {
            label = result.label;
            color = "#22c55e"; // green
<<<<<<< HEAD

            // --- Level 1 Liveness: Temporal Motion ---
            // Track this person's landmarks over the last ~1s before we
            // trust the recognition enough to log attendance. See
            // updateTemporalMotionLiveness() above for the full rationale.
            const liveness = updateTemporalMotionLiveness(
              landmarkHistoryRef,
              label,
              det.landmarks,
              det.detection.box,
              now
            );
            nextLivenessByLabel[label] = liveness;

            if (liveness.state === "static") {
              color = "#f59e0b"; // amber — recognized, but motion looks suspicious
              if (
                !lastSpoofWarningRef.current[label] ||
                now - lastSpoofWarningRef.current[label] > SPOOF_WARNING_COOLDOWN_MS
              ) {
                lastSpoofWarningRef.current[label] = now;
                showNotification(
                  `${label} matched, but no natural face movement was detected — looks like a photo. Attendance was not logged.`,
                  "error"
                );
              }
            } else if (
              liveness.state === "live" &&
              (!lastLoggedRef.current[label] || now - lastLoggedRef.current[label] > COOLDOWN_MS)
            ) {
              // Log attendance with cooldown — only once Level 1 liveness
              // has actually confirmed real landmark motion.
=======
            
            // Log attendance with cooldown
            if (!lastLoggedRef.current[label] || now - lastLoggedRef.current[label] > COOLDOWN_MS) {
>>>>>>> 23dabe834c67990cb98aa994b5af7393507d14bc
              lastLoggedRef.current[label] = now;
              const ts = new Date().toISOString();
              const eventKey = `${label}-${ts}`;
              setRecognizedEvents(prev => [{ name: label, timestamp: ts, key: eventKey, synced: false }, ...prev.slice(0, 199)]);
              // Also persist to the backend so the person shows up with a
              // name + timestamp in the CSV export. We track whether this
              // actually succeeded (instead of silently swallowing errors)
              // so the UI can tell the user when a scan was NOT saved.
<<<<<<< HEAD
              axios.post(`${API_URL}/log-attendance`, {
                name: label,
                liveness_score: liveness.score,
                liveness_level: "temporal_motion",
              })
=======
              axios.post(`${API_URL}/log-attendance`, { name: label })
>>>>>>> 23dabe834c67990cb98aa994b5af7393507d14bc
                .then(() => {
                  setRecognizedEvents(prev => prev.map(ev =>
                    ev.key === eventKey ? { ...ev, synced: true } : ev
                  ));
                })
                .catch((err) => {
                  console.warn("Failed to save attendance to the server:", err);
                  setRecognizedEvents(prev => prev.map(ev =>
                    ev.key === eventKey ? { ...ev, synced: "error" } : ev
                  ));
                  showNotification(`Recognized ${label}, but saving to the server failed.`, "error");
                });
            }
          }
        }

        // Draw box
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);

        // Label background
        ctx.fillStyle = color;
        const textH = 20;
        ctx.fillRect(x, y - textH, width, textH);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 13px Inter, sans-serif";
<<<<<<< HEAD
        const liveness = label !== "Unknown" ? nextLivenessByLabel[label] : null;
        const livenessTag =
          liveness?.state === "live" ? " \u2713 live" :
          liveness?.state === "static" ? " \u26a0 static" :
          liveness?.state === "checking" ? " \u22ef verifying" : "";
        ctx.fillText(`${label}${livenessTag}`, x + 4, y - 5);
      }

      pruneTemporalMotionHistory(landmarkHistoryRef, now);
      setLivenessByLabel(nextLivenessByLabel);

=======
        ctx.fillText(label, x + 4, y - 5);
      }

>>>>>>> 23dabe834c67990cb98aa994b5af7393507d14bc
      if (resized.length > 0) {
        setRealtimeLabel(resized.map(d => {
          if (known.length === 0) return "Unknown";
          const result = known[0].matcher.findBestMatch(d.descriptor);
          return result.label !== "unknown" ? result.label : "Unknown";
        }).join(", "));
      } else {
        setRealtimeLabel("");
      }

      recognitionLoopRef.current = requestAnimationFrame(detect);
    };

    detect();
  }, [showNotification, API_URL]);

  const toggleTracking = () => {
    if (isTracking) {
      stopRecognitionLoop();
      return;
    }
    if (activeTab !== "camera") {
      showNotification("Open the Live Camera tab before starting tracking.", "error");
      return;
    }
    if (cameraStatus !== "live") {
      showNotification("Enable the camera first.", "error");
      return;
    }
    loadEnrolledDescriptors().then(() => startRecognitionLoop());
  };

  // ==========================================================
  // ENROLLMENT
  // ==========================================================

  const enrollNewEmployee = async (e) => {
    e.preventDefault();

    if (!newEmployeeName.trim()) {
      showNotification("Please enter name.", "error");
      return;
    }

    if (activeTab !== "enrollment") {
      showNotification("Open the Enrollment tab before capturing a resident.", "error");
      return;
    }

    if (!faceApiLoadedRef.current) {
      showNotification("Face recognition models still loading, please wait.", "error");
      return;
    }

    const video = enrollmentVideoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) {
      showNotification("Live camera frame unavailable. Enable the webcam first.", "error");
      return;
    }

    setIsEnrolling(true);

    try {
      // Capture SEVERAL samples in one enrollment (slightly spaced out so
      // the person's pose/expression naturally varies a little between
      // frames) instead of a single snapshot. Matching against multiple
      // samples is far more reliable — a single descriptor from one angle
      // or lighting condition is why recognition used to keep failing even
      // after enrolling "multiple times" (each attempt just overwrote the
      // last one instead of adding to it).
      const SAMPLE_COUNT = 3;
      const SAMPLE_DELAY_MS = 350;
      const descriptors = [];

      for (let i = 0; i < SAMPLE_COUNT; i++) {
        setCaptureProgress(`Capturing sample ${i + 1} of ${SAMPLE_COUNT}...`);
        const detection = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection) {
          descriptors.push(Array.from(detection.descriptor));
        }

        if (i < SAMPLE_COUNT - 1) {
          await new Promise((resolve) => setTimeout(resolve, SAMPLE_DELAY_MS));
        }
      }

      setCaptureProgress("");

      if (descriptors.length === 0) {
        showNotification("No face detected. Look directly at the camera and try again.", "error");
        setIsEnrolling(false);
        return;
      }

      const res = await axios.post(`${API_URL}/enroll`, {
        employee_name: newEmployeeName.trim(),
        descriptor: descriptors[0],
        descriptors,
        is_resident: isResident,
        flat_number: isResident ? flatNumber.trim() : null,
        role: !isResident ? role.trim() : null
      });

      if (res.data?.status === "success") {
        showNotification(res.data.message || "Enrollment successful.", "success");
        setNewEmployeeName("");
        setFlatNumber("");
        setRole("");
        setIsResident(false);
        // Reload descriptors if recognition loop is running
        if (isTracking) loadEnrolledDescriptors();
        // Refresh the resident directory so the newly enrolled person
        // shows up on the Resident Lookup page immediately.
        fetchAllResidents();
      } else {
        showNotification(res.data?.message || "Enrollment failed.", "error");
      }
    } catch (err) {
      console.error("Enrollment error:", err);
      const detail = err?.response?.data?.detail || err?.response?.data?.message;
      showNotification(detail ? `Enrollment failed: ${detail}` : "Enrollment failed. API error.", "error");
    } finally {
      setCaptureProgress("");
      setIsEnrolling(false);
    }
  };

  // ==========================================================
  // TAB CHANGE
  // ==========================================================

  const handleTabChange = (tabId) => {
    if (isTracking && tabId !== "camera") {
      stopRecognitionLoop();
    }

    setActiveTab(tabId);

    if (tabId === "audit") {
      fetchAuditLog();
    }

    if (tabId === "environment") {
      fetchSystemStatus();
    }

    if (tabId === "residents") {
      setEmployeeProfile(null);
      setResidentLookupError("");
      fetchAllResidents();
    }
  };

  // ==========================================================
  // CAMERA STATUS UI
  // ==========================================================

  const cameraStatusLabel = {
    idle: "Camera idle",
    requesting: "Requesting camera...",
    waiting: "Waiting for camera preview...",
    live: "Live camera active",
    error: "Camera unavailable",
  }[cameraStatus];

  // ==========================================================
  // LOGIN SCREEN
  // ==========================================================

  if (!isLoggedIn) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center font-sans transition-colors duration-300 ${isDark ? "bg-slate-900" : "bg-slate-50"
          }`}
      >
        {/* Toast Notification */}
        {notification && (
          <div className="fixed top-4 right-4 z-50 animate-fade-in-down">
            <div
              className={`rounded-md p-4 shadow-lg ${notification.type === "success"
                ? "bg-emerald-50 dark:bg-emerald-900/90"
                : "bg-red-50 dark:bg-red-900/90"
                }`}
            >
              <p
                className={`text-sm font-medium ${notification.type === "success"
                  ? "text-emerald-800 dark:text-emerald-100"
                  : "text-red-800 dark:text-red-100"
                  }`}
              >
                {notification.msg}
              </p>
            </div>
          </div>
        )}

        <div className="absolute top-4 right-4">
          <button
            onClick={() => setIsDark(!isDark)}
            className="p-2 rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            aria-label="Toggle dark mode"
          >
            {isDark ? (
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            ) : (
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            )}
          </button>
        </div>

        <div className="max-w-md w-full px-6">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-xl bg-indigo-600 shadow-lg mb-4">
              <svg
                className="h-10 w-10 text-white"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z"
                />
              </svg>
            </div>

            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              UNITY
            </h2>

            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Society Management System
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-8 pt-8 pb-6 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white text-center">
                Resident Authentication
              </h3>
            </div>

            <div className="px-8 py-8">
              <form
                onSubmit={handleLogin}
                className="space-y-6"
              >
                <div>
                  <label className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-200">
                    Authorized ID
                  </label>

                  <div className="mt-2 relative rounded-md shadow-sm">
                    <input
                      type="text"
                      required
                      className="block w-full rounded-md border-0 py-2.5 px-3 text-slate-900 dark:text-white bg-white dark:bg-slate-900 ring-1 ring-inset ring-slate-300 dark:ring-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-colors"
                      placeholder="e.g. UNITY-2026"
                      value={maheId}
                      onChange={(e) => setMaheId(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-200">
                    Gateway Password
                  </label>

                  <div className="mt-2">
                    <input
                      type="password"
                      required
                      className="block w-full rounded-md border-0 py-2.5 px-3 text-slate-900 dark:text-white bg-white dark:bg-slate-900 ring-1 ring-inset ring-slate-300 dark:ring-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-colors"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
                  >
                    Authenticate
                  </button>
                </div>
              </form>
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-slate-500 dark:text-slate-500">
            Secured by Zero-Knowledge Attestation Protocol v2.0
          </p>
        </div>
      </div>
    );
  }

  // ==========================================================
  // DASHBOARD TABS
  // ==========================================================

  const tabs = [
    { id: "dashboard", name: "Dashboard" },
    { id: "camera", name: "Live Camera" },
    { id: "residents", name: "Resident Lookup" },
    { id: "enrollment", name: "Enrollment" },
    { id: "audit", name: "Audit Trail" },
    { id: "environment", name: "Telemetry" },
  ];

  // ==========================================================
  // DASHBOARD
  // ==========================================================

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-300">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in-down">
          <div
            className={`rounded-md p-4 shadow-lg ${notification.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-900/90"
              : "bg-red-50 dark:bg-red-900/90"
              }`}
          >
            <div className="flex">
              <div className="flex-shrink-0">
                {notification.type === "success" ? (
                  <svg
                    className="h-5 w-5 text-emerald-400 dark:text-emerald-300"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-5 w-5 text-red-400 dark:text-red-300"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>

              <div className="ml-3">
                <p
                  className={`text-sm font-medium ${notification.type === "success"
                    ? "text-emerald-800 dark:text-emerald-100"
                    : "text-red-800 dark:text-red-100"
                    }`}
                >
                  {notification.msg}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 justify-between items-center">
            <div className="flex min-w-0">
              <div className="flex flex-shrink-0 items-center">
                <svg
                  className="h-8 w-8 text-indigo-600 dark:text-indigo-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z"
                  />
                </svg>

                <div className="ml-3 hidden sm:block">
                  <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
                    UNITY
                  </h1>
                </div>
              </div>

              <div className="ml-4 sm:ml-10 flex space-x-4 sm:space-x-8 overflow-x-auto no-scrollbar">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab.id
                      ? "border-indigo-600 text-slate-900 dark:text-white dark:border-indigo-400"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:border-slate-600"
                      }`}
                  >
                    {tab.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-4 ml-4">
              <button
                onClick={() => setIsDark(!isDark)}
                className="p-2 rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors hidden sm:block"
                aria-label="Toggle dark mode"
              >
                {isDark ? (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l.707.707M6.343 17.657l.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                    />
                  </svg>
                )}
              </button>

              <div className="hidden lg:flex items-center space-x-4 border-l border-slate-200 dark:border-slate-700 pl-4">
                <div className="flex items-center space-x-2">
                  <div className="h-6 w-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      M
                    </span>
                  </div>

                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {maheId || "Resident"}
                  </span>
                </div>

                <button
                  onClick={() => {
                    setIsLoggedIn(false);
                    setMaheId("");
                    setPassword("");
                  }}
                  className="text-xs font-medium text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* =====================================================
            DASHBOARD TAB
        ====================================================== */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            <div className="md:flex md:items-center md:justify-between bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold leading-7 text-slate-900 dark:text-white sm:truncate sm:tracking-tight">
                  Assigned Area: General
                </h2>

                {classSummary && (
                  <div className="mt-1 flex flex-col sm:mt-0 sm:flex-row sm:flex-wrap sm:space-x-6">
                    <div className="mt-2 flex items-center text-sm text-slate-500 dark:text-slate-400">
                      Present:
                      <span className="ml-1 font-semibold text-slate-900 dark:text-white">
                        {classSummary.present ?? 0}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center text-sm text-slate-500 dark:text-slate-400">
                      In Progress:
                      <span className="ml-1 font-semibold text-slate-900 dark:text-white">
                        {classSummary.in_progress ?? 0}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center text-sm text-slate-500 dark:text-slate-400">
                      Total Enrolled:
                      <span className="ml-1 font-semibold text-slate-900 dark:text-white">
                        {classSummary.total_employees ?? 0}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 flex md:ml-4 md:mt-0 space-x-3">
                <button
                  type="button"
                  onClick={resetSession}
                  className="inline-flex items-center rounded-md bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400 shadow-sm ring-1 ring-inset ring-red-300 dark:ring-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                >
                  Reset Session
                </button>

                <button
                  type="button"
                  onClick={() =>
                    downloadExcelReport(
                      `${API_URL}/download`,
                      "attendance_report.xlsx"
                    )
                  }
                  disabled={isDownloading}
                  className="inline-flex items-center rounded-md bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-200 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDownloading
                    ? "Generating..."
                    : "Export Report"}
                </button>

                <button
                  type="button"
                  onClick={finalizeDay}
                  className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-all"
                >
                  Finalize Day
                </button>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
              <div className="px-4 py-5 border-b border-slate-200 dark:border-slate-700 sm:px-6">
                <h3 className="text-base font-semibold leading-6 text-slate-900 dark:text-white">
                  Live Active Presence Tracker
                </h3>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Threshold requirement: 40 minutes (2400
                  seconds)
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      {[
                        "Resident",
                        "Active Time",
                        "Progress",
                        "Status",
                        "Session UUID",
                        "Dyn Gap",
                        "Bio Score",
                        "Env",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                    {dashboardStats.length > 0 ? (
                      dashboardStats.map((stat, i) => {
                        const secs = Number(
                          stat.accumulated_seconds || 0
                        );

                        const pct = Math.min(
                          100,
                          (secs / 2400) * 100
                        ).toFixed(0);

                        let badgeClass =
                          "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-500/20";

                        if (stat.status === "Present") {
                          badgeClass =
                            "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-500/20";
                        } else if (
                          stat.status === "Partial"
                        ) {
                          badgeClass =
                            "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-500/20";
                        } else if (
                          stat.status === "Absent"
                        ) {
                          badgeClass =
                            "bg-red-50 text-red-700 ring-red-600/10 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-500/20";
                        }

                        const biometricScore = Number(
                          stat.biometric_score || 0
                        );

                        return (
                          <tr
                            key={i}
                            className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                          >
                            <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-100">
                              {stat.employee ||
                                stat.employee_name ||
                                "---"}
                            </td>

                            <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                              {Math.floor(secs / 60)}m{" "}
                              {secs % 60}s
                            </td>

                            <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                              <div className="flex items-center">
                                <div className="w-24 bg-slate-200 dark:bg-slate-700 rounded-full h-2 mr-2 overflow-hidden">
                                  <div
                                    className={`h-2 rounded-full ${Number(pct) >= 100
                                      ? "bg-emerald-500 dark:bg-emerald-400"
                                      : "bg-indigo-500 dark:bg-indigo-400"
                                      } transition-all duration-500 ease-out`}
                                    style={{
                                      width: `${pct}%`,
                                    }}
                                  />
                                </div>

                                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                  {pct}%
                                </span>
                              </div>
                            </td>

                            <td className="whitespace-nowrap px-6 py-4 text-sm">
                              <span
                                className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${badgeClass}`}
                              >
                                {stat.status || "Unknown"}
                              </span>
                            </td>

                            <td className="whitespace-nowrap px-6 py-4 text-xs font-mono text-slate-400 dark:text-slate-500">
                              {stat.session_id || "---"}
                            </td>

                            <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                              {stat.adaptive_gap ?? 10}s
                            </td>

                            <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400 font-mono">
                              {biometricScore.toFixed(2)}
                            </td>

                            <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                              <span
                                className={`inline-flex rounded-full h-2 w-2 ${stat.env_valid !== 0 &&
                                  stat.env_valid !== false
                                  ? "bg-emerald-500 dark:bg-emerald-400"
                                  : "bg-red-500 dark:bg-red-400"
                                  }`}
                              />
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan="8"
                          className="px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400"
                        >
                          No active tracking sessions
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================
            ENROLLMENT TAB
        ====================================================== */}
        {activeTab === "enrollment" && (
          <div className="max-w-3xl mx-auto">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
              <div className="px-4 py-5 border-b border-slate-200 dark:border-slate-700 sm:px-6 bg-slate-50 dark:bg-slate-800/50">
                <h3 className="text-base font-semibold leading-6 text-slate-900 dark:text-white">
                  Secure Resident Registration
                </h3>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Enroll new residents/non-residents directly
                  into the encrypted biometric database.
                </p>
              </div>

              <div className="p-6">
                <form
                  onSubmit={enrollNewEmployee}
                  className="space-y-6"
                >
                  <div>
                    <label className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-200">
                      Full Legal Name
                    </label>

                    <div className="mt-2">
                      <input
                        type="text"
                        required
                        className="block w-full rounded-md border-0 py-2.5 px-3 text-slate-900 dark:text-white bg-white dark:bg-slate-900 ring-1 ring-inset ring-slate-300 dark:ring-slate-700 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-colors"
                        placeholder="e.g. John Doe"
                        value={newEmployeeName}
                        onChange={(e) =>
                          setNewEmployeeName(e.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div className="flex items-center">
                    <input
                      id="isResident"
                      type="checkbox"
                      checked={isResident}
                      onChange={(e) => setIsResident(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    />
                    <label htmlFor="isResident" className="ml-2 block text-sm font-medium leading-6 text-slate-900 dark:text-slate-200">
                      Is this person a Resident?
                    </label>
                  </div>

                  {isResident ? (
                    <div>
                      <label className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-200">
                        Flat Number
                      </label>
                      <div className="mt-2">
                        <input
                          type="text"
                          required
                          className="block w-full rounded-md border-0 py-2.5 px-3 text-slate-900 dark:text-white bg-white dark:bg-slate-900 ring-1 ring-inset ring-slate-300 dark:ring-slate-700 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-colors"
                          placeholder="e.g. 101"
                          value={flatNumber}
                          onChange={(e) => setFlatNumber(e.target.value)}
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium leading-6 text-slate-900 dark:text-slate-200">
                        Role / Purpose
                      </label>
                      <div className="mt-2">
                        <input
                          type="text"
                          required
                          className="block w-full rounded-md border-0 py-2.5 px-3 text-slate-900 dark:text-white bg-white dark:bg-slate-900 ring-1 ring-inset ring-slate-300 dark:ring-slate-700 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-colors"
                          placeholder="e.g. Plumber, Security, Guest"
                          value={role}
                          onChange={(e) => setRole(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg bg-slate-100 dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Identity Capture
                      </span>

                      <span
                        className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${cameraStatus === "live"
                          ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 ring-emerald-600/20 dark:ring-emerald-500/20"
                          : "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 ring-indigo-600/20 dark:ring-indigo-500/20"
                          }`}
                      >
                        {cameraStatus === "live"
                          ? "Camera Live"
                          : "Local Camera Required"}
                      </span>
                    </div>

                    <div className="aspect-video w-full bg-black rounded-md overflow-hidden relative border border-slate-300 dark:border-slate-600">
                      <video
                        ref={enrollmentVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />

                      {cameraStatus !== "live" && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                          <div className="text-center px-6">
                            <p className="text-sm font-medium text-white">
                              {cameraStatusLabel}
                            </p>

                            {cameraError && (
                              <p className="mt-2 text-xs text-red-200">
                                {cameraError}
                              </p>
                            )}

                            <button
                              type="button"
                              onClick={startCamera}
                              className="mt-3 rounded-md bg-white/90 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-white"
                            >
                              Start Camera
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Aiming Guide Overlay */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-48 h-64 border-2 border-dashed border-emerald-500 rounded-full opacity-50" />
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">
                      Ensure the person's face is clearly visible
                      inside the guide.
                    </p>
                  </div>

                  <div className="pt-2 flex flex-col items-end gap-2">
                    {captureProgress && (
                      <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                        {captureProgress}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={
                        isEnrolling ||
                        cameraStatus !== "live"
                      }
                      className="inline-flex items-center rounded-md bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isEnrolling
                        ? "Processing Deep Learning Registration..."
                        : "Extract Face & Enroll Resident/Non-Resident"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================
            CAMERA TAB
        ====================================================== */}
        {activeTab === "camera" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col transition-colors">
              <div className="px-4 py-5 border-b border-slate-200 dark:border-slate-700 sm:px-6 flex justify-between items-center">
                <div>
                  <h3 className="text-base font-semibold leading-6 text-slate-900 dark:text-white">
                    Local Camera Feed
                  </h3>

                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Raw capture stream for fallback edge inference
                  </p>
                </div>

                <span
                  className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${cameraStatus === "live"
                    ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 ring-emerald-600/20 dark:ring-emerald-500/20"
                    : "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 ring-indigo-600/20 dark:ring-indigo-500/20"
                    }`}
                >
                  {cameraStatus === "live"
                    ? "Live Camera Active"
                    : "Local Mode"}
                </span>
              </div>

              <div className="p-4 flex-1">
                <div className="relative">
                  <video
                    ref={cameraVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-auto rounded-lg bg-slate-900 border border-slate-200 dark:border-slate-700 object-cover aspect-video"
                  />
                  {/* Real-time recognition overlay canvas */}
                  <canvas
                    ref={overlayCanvasRef}
                    className="absolute inset-0 w-full h-full rounded-lg"
                    style={{ pointerEvents: "none" }}
                  />

                  {cameraStatus !== "live" && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                      <div className="text-center max-w-md px-6">
                        <p className="text-sm font-medium text-white">
                          {cameraStatusLabel}
                        </p>

                        {cameraError && (
                          <p className="mt-2 text-xs text-red-200">
                            {cameraError}
                          </p>
                        )}

                        <button
                          type="button"
                          onClick={startCamera}
                          className="mt-3 rounded-md bg-white px-4 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100"
                        >
                          Enable Camera
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Live recognition label badge */}
                  {isTracking && (
                    <div className="absolute bottom-2 left-2 right-2">
                      <div className={`rounded-md px-3 py-1.5 text-sm font-semibold text-white shadow-lg ${realtimeLabel && realtimeLabel !== "Unknown"
                        ? "bg-emerald-600/90"
                        : realtimeLabel === "Unknown"
                          ? "bg-red-600/90"
                          : "bg-slate-700/80"
                        }`}>
                        {realtimeLabel
                          ? realtimeLabel === "Unknown"
                            ? "⚠ Unrecognized Person"
                            : `✓ Recognized: ${realtimeLabel}`
                          : "Scanning…"}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-4 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
                {/* Models status pill */}
                <div className="mb-3 flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${faceApiStatus === "ready" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : faceApiStatus === "error" ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                    }`}>
                    {faceApiStatus === "ready" ? "● Models Ready" : faceApiStatus === "error" ? "● Model Error" : "● Loading Models…"}
                  </span>
                </div>

                <button
                  onClick={toggleTracking}
                  disabled={cameraStatus !== "live" || faceApiStatus !== "ready"}
                  className={`w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isTracking
                    ? "bg-red-600 hover:bg-red-700 focus:ring-red-500"
                    : "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500"
                    }`}
                >
                  {isTracking
                    ? "Stop Real-Time Recognition"
                    : "Start Real-Time Recognition"}
                </button>

                {/* Live event log */}
                {recognizedEvents.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Recent detections (this session)</p>
                    <div className="max-h-32 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700">
                      {recognizedEvents.slice(0, 20).map((ev, i) => (
                        <div key={ev.key || i} className="flex items-center justify-between px-3 py-1.5 text-xs">
                          <span className="font-medium text-slate-800 dark:text-white">{ev.name}</span>
                          <span className="flex items-center gap-1.5">
                            <span className="text-slate-400">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                            {ev.synced === true && (
                              <span className="text-emerald-500" title="Saved to server">✓</span>
                            )}
                            {ev.synced === "error" && (
                              <span className="text-red-500" title="Failed to save to server">⚠</span>
                            )}
                            {ev.synced === false && (
                              <span className="text-slate-300 dark:text-slate-600" title="Saving...">•</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-2">Export Attendance Data</h4>
                  <div className="flex items-center gap-3">
                    <select
                      value={exportHours}
                      onChange={(e) => setExportHours(Number(e.target.value))}
                      className="block w-full rounded-md border-0 py-1.5 pl-3 pr-10 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6 dark:bg-slate-900 dark:text-white dark:ring-slate-700"
                    >
                      <option value={1}>Last 1 Hour</option>
                      <option value={12}>Last 12 Hours</option>
                      <option value={24}>Last 24 Hours</option>
                      <option value={168}>Last 7 Days</option>
                      <option value={720}>Last 30 Days</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => downloadExcelReport(`${API_URL}/export?hours=${exportHours}`, `attendance_export_${exportHours}h.csv`)}
                      disabled={isDownloading}
                      className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap dark:bg-slate-800 dark:text-white dark:ring-slate-600 dark:hover:bg-slate-700"
                    >
                      {isDownloading ? "Downloading..." : "Download CSV"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col transition-colors">
              <div className="px-4 py-5 border-b border-slate-200 dark:border-slate-700 sm:px-6">
                <h3 className="text-base font-semibold leading-6 text-slate-900 dark:text-white">
                  ONNX Vision Output
                </h3>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Live bounding box and facial encoding visualization
                </p>
              </div>

              <div className="p-4 flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-900/50">
                {resultImage ? (
                  <img
                    src={resultImage}
                    alt="vision result"
                    className="w-full h-auto rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm aspect-video object-contain bg-white dark:bg-slate-900"
                  />
                ) : (
                  <div className="text-center text-slate-400 dark:text-slate-500 py-12">
                    <p>Awaiting inference frame...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =====================================================
            RESIDENT LOOKUP TAB
        ====================================================== */}
        {activeTab === "residents" && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
              <div className="px-4 py-5 border-b border-slate-200 dark:border-slate-700 sm:px-6">
                <h3 className="text-base font-semibold leading-6 text-slate-900 dark:text-white">
                  Resident Profiles &amp; Analytics
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Search the biometric database by resident or
                  non-resident name.
                </p>
              </div>

              <div className="p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <div className="max-w-xl flex rounded-md shadow-sm">
                  <input
                    type="text"
                    className="block w-full rounded-none rounded-l-md border-0 py-2.5 px-3 text-slate-900 dark:text-white ring-1 ring-inset ring-slate-300 dark:ring-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 bg-white dark:bg-slate-900"
                    placeholder="Search resident/non-resident globally by name (e.g. Alice)..."
                    value={employeeSearch}
                    onChange={(e) =>
                      setEmployeeSearch(e.target.value)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchEmployee();
                      }
                    }}
                  />

                  <button
                    type="button"
                    onClick={searchEmployee}
                    disabled={residentLookupLoading}
                    className="relative -ml-px inline-flex items-center gap-x-1.5 rounded-r-md px-4 py-2 text-sm font-semibold text-slate-900 dark:text-slate-200 ring-1 ring-inset ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 bg-white dark:bg-slate-900 transition-colors disabled:opacity-50"
                  >
                    {residentLookupLoading
                      ? "Searching..."
                      : "Lookup Record"}
                  </button>
                </div>

                {residentLookupError && (
                  <div className="mt-4 max-w-xl rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-4 py-3">
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {residentLookupError}
                    </p>
                  </div>
                )}
              </div>

              {/* Helpful empty state instead of a completely blank page */}
              {!employeeProfile &&
                !residentLookupLoading &&
                !residentLookupError && (
                  <div className="p-12 text-center">
                    <div className="mx-auto h-12 w-12 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                      <svg
                        className="h-6 w-6 text-indigo-600 dark:text-indigo-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.5"
                          d="M15 19.128a9.38 9.38 0 002.625.372 9.375 9.375 0 004.125-.948M15 19.128v-3.87m0 3.87a9.375 9.375 0 01-4.125-.948M15 15.258a3.375 3.375 0 100-6.75 3.375 3.375 0 000 6.75zM4.5 19.128a9.375 9.375 0 01-4.125-.948m4.125.948v-3.87m0 3.87a9.375 9.375 0 004.125-.948M4.5 15.258a3.375 3.375 0 100-6.75 3.375 3.375 0 000 6.75z"
                        />
                      </svg>
                    </div>

                    <h4 className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">
                      Resident lookup ready
                    </h4>

                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Enter a registered resident or non-resident
                      name above to load their profile.
                    </p>
                  </div>
                )}

              {residentLookupLoading && (
                <div className="p-12 text-center">
                  <div className="mx-auto h-8 w-8 rounded-full border-2 border-slate-300 border-t-indigo-600 animate-spin" />
                  <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                    Loading resident record...
                  </p>
                </div>
              )}

              {employeeProfile && (
                <div className="p-6">
                  {/* Resident Summary Cards */}
                  <dl className="mt-2 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
                    <div className="overflow-hidden rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm px-4 py-5 sm:p-6 transition-colors">
                      <dt className="truncate text-sm font-medium text-slate-500 dark:text-slate-400">
                        Resident/Non-Resident Identity
                      </dt>

                      <dd className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white break-words">
                        {employeeProfile.employee_name ||
                          employeeProfile.name ||
                          "Unknown"}
                      </dd>
                    </div>

                    <div className="overflow-hidden rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm px-4 py-5 sm:p-6 transition-colors">
                      <dt className="truncate text-sm font-medium text-slate-500 dark:text-slate-400">
                        Profile Type
                      </dt>

                      <dd
                        className={`mt-2 text-3xl font-semibold tracking-tight ${
                          employeeProfile.is_resident
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-blue-600 dark:text-blue-400"
                        }`}
                      >
                        {employeeProfile.is_resident ? "Resident" : "Non-Resident"}
                      </dd>
                    </div>

                    <div className="overflow-hidden rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm px-4 py-5 sm:p-6 transition-colors">
                      <dt className="truncate text-sm font-medium text-slate-500 dark:text-slate-400">
                        {employeeProfile.is_resident ? "Flat Number" : "Role / Purpose"}
                      </dt>

                      <dd className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                        {employeeProfile.is_resident ? (employeeProfile.flat_number || "---") : (employeeProfile.role || "---")}
                      </dd>
                    </div>

                    <div className="overflow-hidden rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm px-4 py-5 sm:p-6 flex flex-col justify-center transition-colors">
                      <button
                        onClick={() =>
                          downloadExcelReport(
                            `${API_URL}/employee/${encodeURIComponent(
                              employeeProfile.employee_name ||
                              employeeProfile.name ||
                              employeeSearch.trim()
                            )}/download`,
                            `attendance_${(
                              employeeProfile.employee_name ||
                              employeeProfile.name ||
                              employeeSearch.trim()
                            ).replace(/[^a-z0-9_-]+/gi, "_")}.xlsx`
                          )
                        }
                        disabled={isDownloading}
                        className="w-full inline-flex justify-center items-center rounded-md bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-slate-200 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isDownloading
                          ? "Generating..."
                          : "Download Excel"}
                      </button>
                    </div>
                  </dl>

                  {/* Resident/Non-Resident History Table */}
                  {Array.isArray(employeeProfile.history) &&
                    employeeProfile.history.length > 0 ? (
                    <div className="ring-1 ring-slate-200 dark:ring-slate-700 rounded-lg overflow-hidden transition-colors">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                          <thead className="bg-slate-50 dark:bg-slate-800/50">
                            <tr>
                              {[
                                "Date",
                                "Assigned Area",
                                "First Seen",
                                "Last Seen",
                                "Active Time",
                                "Status",
                                "Bio Score",
                              ].map((h) => (
                                <th
                                  key={h}
                                  className="px-6 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>

                          <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                            {employeeProfile.history.map(
                              (rec, i) => {
                                let badgeClass =
                                  "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-500/20";

                                if (
                                  rec.status === "Present"
                                ) {
                                  badgeClass =
                                    "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-500/20";
                                } else if (
                                  rec.status === "Partial"
                                ) {
                                  badgeClass =
                                    "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-500/20";
                                } else if (
                                  rec.status === "Absent"
                                ) {
                                  badgeClass =
                                    "bg-red-50 text-red-700 ring-red-600/10 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-500/20";
                                }

                                return (
                                  <tr
                                    key={i}
                                    className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                  >
                                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-100">
                                      {rec.date || "---"}
                                    </td>

                                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                                      {rec.class_name ||
                                        rec.assigned_area ||
                                        "---"}
                                    </td>

                                    <td className="whitespace-nowrap px-6 py-4 text-xs font-mono text-slate-400 dark:text-slate-500">
                                      {rec.first_seen || "---"}
                                    </td>

                                    <td className="whitespace-nowrap px-6 py-4 text-xs font-mono text-slate-400 dark:text-slate-500">
                                      {rec.last_seen || "---"}
                                    </td>

                                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400">
                                      {Math.floor(
                                        Number(
                                          rec.accumulated_seconds ||
                                          0
                                        ) / 60
                                      )}
                                      m
                                    </td>

                                    <td className="whitespace-nowrap px-6 py-4 text-sm">
                                      <span
                                        className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${badgeClass}`}
                                      >
                                        {rec.status ||
                                          "Unknown"}
                                      </span>
                                    </td>

                                    <td className="whitespace-nowrap px-6 py-4 text-sm font-mono text-slate-500 dark:text-slate-400">
                                      {Number(
                                        rec.biometric_score || 0
                                      ).toFixed(2)}
                                    </td>
                                  </tr>
                                );
                              }
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Resident record found, but no attendance
                        history is available yet.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ================================================
                FULL DIRECTORY — everyone enrolled so far, with
                resident/non-resident info, so people can find
                themselves without knowing the exact search term.
            ================================================= */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
              <div className="px-4 py-5 border-b border-slate-200 dark:border-slate-700 sm:px-6 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold leading-6 text-slate-900 dark:text-white">
                    Everyone Enrolled
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Every enrolled resident and non-resident, and whether
                    they're a resident (flat number) or non-resident (what
                    they do in the society).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchAllResidents}
                  disabled={allResidentsLoading}
                  className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap dark:bg-slate-800 dark:text-white dark:ring-slate-600 dark:hover:bg-slate-700"
                >
                  {allResidentsLoading ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              {allResidentsError && (
                <div className="mx-4 mt-4 sm:mx-6 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 px-4 py-3">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {allResidentsError}
                  </p>
                </div>
              )}

              {allResidentsLoading && allResidents.length === 0 && !allResidentsError && (
                <div className="p-12 text-center">
                  <div className="mx-auto h-8 w-8 rounded-full border-2 border-slate-300 border-t-indigo-600 animate-spin" />
                  <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                    Loading everyone enrolled...
                  </p>
                </div>
              )}

              {!allResidentsLoading && !allResidentsError && allResidents.length === 0 && (
                <div className="p-12 text-center">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Nobody enrolled yet
                  </h4>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Enroll someone from the Enrollment tab and they'll
                    appear here automatically.
                  </p>
                </div>
              )}

              {allResidents.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                      <tr>
                        <th scope="col" className="py-3 pl-4 pr-3 text-left text-sm font-semibold text-slate-900 dark:text-white sm:pl-6">
                          Name
                        </th>
                        <th scope="col" className="px-3 py-3 text-left text-sm font-semibold text-slate-900 dark:text-white">
                          Type
                        </th>
                        <th scope="col" className="px-3 py-3 text-left text-sm font-semibold text-slate-900 dark:text-white">
                          Flat Number / Role
                        </th>
                        <th scope="col" className="px-3 py-3 text-left text-sm font-semibold text-slate-900 dark:text-white">
                          Face Samples
                        </th>
                        <th scope="col" className="relative py-3 pl-3 pr-4 sm:pr-6">
                          <span className="sr-only">View</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                      {allResidents.map((person, i) => (
                        <tr
                          key={person.name + i}
                          className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                          onClick={() => viewResidentFromDirectory(person.name)}
                        >
                          <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-slate-900 dark:text-white sm:pl-6">
                            {person.name}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm">
                            <span
                              className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                                person.is_resident
                                  ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-500/20"
                                  : "bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-500/20"
                              }`}
                            >
                              {person.is_resident ? "Resident" : "Non-Resident"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
                            {person.is_resident
                              ? (person.flat_number || "---")
                              : (person.role || "---")}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
                            {person.face_samples ?? 0}
                          </td>
                          <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                            <span className="text-indigo-600 dark:text-indigo-400">View &rarr;</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =====================================================
            AUDIT TAB
        ====================================================== */}
        {activeTab === "audit" && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
            <div className="px-4 py-5 border-b border-slate-200 dark:border-slate-700 sm:px-6 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <div>
                <h3 className="text-base font-semibold leading-6 text-slate-900 dark:text-white">
                  Blockchain Audit Trail
                </h3>

                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Immutable cryptographic ledger of system state
                  changes
                </p>
              </div>
            </div>

            <div
              className="p-6 bg-white dark:bg-slate-800 overflow-y-auto"
              style={{ maxHeight: "400px" }}
            >
              <ul className="-mb-8">
                {auditLog.length > 0 ? (
                  auditLog
                    .slice()
                    .reverse()
                    .map((event, eventIdx) => (
                      <li key={eventIdx}>
                        <div className="relative pb-8">
                          {eventIdx !==
                            auditLog.length - 1 ? (
                            <span
                              className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-slate-200 dark:bg-slate-700"
                              aria-hidden="true"
                            />
                          ) : null}

                          <div className="relative flex space-x-3">
                            <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                              <div>
                                <p className="text-sm text-slate-900 dark:text-slate-100 font-medium">
                                  {event.event_type ||
                                    "Event"}{" "}
                                  <span className="font-normal text-slate-500 dark:text-slate-400">
                                    for
                                  </span>{" "}
                                  {event.employee || "---"}
                                </p>

                                <p className="mt-1 flex text-xs text-slate-400 dark:text-slate-500 font-mono">
                                  Hash:{" "}
                                  {event.hash?.slice(
                                    0,
                                    32
                                  ) || "---"}
                                  ...
                                </p>
                              </div>

                              <div className="whitespace-nowrap text-right text-sm text-slate-500 dark:text-slate-400">
                                <time>
                                  {event.timestamp || "---"}
                                </time>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))
                ) : (
                  <p className="text-center text-slate-500 dark:text-slate-400 py-10">
                    No events logged yet.
                  </p>
                )}
              </ul>
            </div>
          </div>
        )}

        {/* =====================================================
            ENVIRONMENT / TELEMETRY TAB
        ====================================================== */}
        {activeTab === "environment" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Environmental Sensors */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
              <div className="px-4 py-5 border-b border-slate-200 dark:border-slate-700 sm:px-6 bg-slate-50 dark:bg-slate-800/50">
                <h3 className="text-base font-semibold leading-6 text-slate-900 dark:text-white">
                  IoT Environmental Gating
                </h3>
              </div>

              <div className="p-6">
                <dl className="grid grid-cols-1 gap-5">
                  <div className="overflow-hidden rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-5 shadow-sm sm:p-6 transition-colors">
                    <dt className="truncate text-sm font-medium text-slate-500 dark:text-slate-400">
                      Ambient Light Level
                    </dt>

                    <dd className="mt-2 text-3xl font-semibold tracking-tight text-amber-500 dark:text-amber-400">
                      {envData?.readings?.light_lux != null
                        ? Number(
                          envData.readings.light_lux
                        ).toFixed(0)
                        : "---"}{" "}
                      lux
                    </dd>

                    <dd className="mt-1 flex items-baseline text-xs text-slate-500 dark:text-slate-400">
                      Valid Range:{" "}
                      {envData?.readings?.bounds?.light?.[0] ??
                        "---"}{" "}
                      -{" "}
                      {envData?.readings?.bounds?.light?.[1] ??
                        "---"}{" "}
                      lux
                    </dd>
                  </div>

                  <div className="overflow-hidden rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-4 py-5 shadow-sm sm:p-6 transition-colors">
                    <dt className="truncate text-sm font-medium text-slate-500 dark:text-slate-400">
                      Room Temperature
                    </dt>

                    <dd className="mt-2 text-3xl font-semibold tracking-tight text-indigo-600 dark:text-indigo-400">
                      {envData?.readings?.temperature_celsius !=
                        null
                        ? Number(
                          envData.readings
                            .temperature_celsius
                        ).toFixed(1)
                        : "---"}{" "}
                      °C
                    </dd>

                    <dd className="mt-1 flex items-baseline text-xs text-slate-500 dark:text-slate-400">
                      Valid Range:{" "}
                      {envData?.readings?.bounds?.temperature?.[
                        0
                      ] ?? "---"}{" "}
                      -{" "}
                      {envData?.readings?.bounds?.temperature?.[
                        1
                      ] ?? "---"}{" "}
                      °C
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Telemetry / Attestation */}
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
                <div className="px-4 py-5 border-b border-slate-200 dark:border-slate-700 sm:px-6 bg-slate-50 dark:bg-slate-800/50">
                  <h3 className="text-base font-semibold leading-6 text-slate-900 dark:text-white">
                    Zero-Knowledge Telemetry
                  </h3>
                </div>

                <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        Proofs Generated
                      </p>

                      <p className="mt-1 text-3xl font-semibold text-purple-600 dark:text-purple-400">
                        {zkStatus?.proof_count || 0}
                      </p>
                    </div>

                    <span className="inline-flex items-center rounded-md bg-purple-50 dark:bg-purple-900/30 px-2 py-1 text-xs font-medium text-purple-700 dark:text-purple-400 ring-1 ring-inset ring-purple-600/20 dark:ring-purple-500/20">
                      Pedersen Commitment v1
                    </span>
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        Federated Samples Validated
                      </p>

                      <p className="mt-1 text-3xl font-semibold text-cyan-600 dark:text-cyan-400">
                        {fedStatus?.client_samples || 0}
                      </p>
                    </div>

                    <span className="inline-flex items-center rounded-md bg-cyan-50 dark:bg-cyan-900/30 px-2 py-1 text-xs font-medium text-cyan-700 dark:text-cyan-400 ring-1 ring-inset ring-cyan-600/20 dark:ring-cyan-500/20">
                      FedAvg Ready
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
                <div className="px-4 py-5 border-b border-slate-200 dark:border-slate-700 sm:px-6 bg-slate-50 dark:bg-slate-800/50">
                  <h3 className="text-base font-semibold leading-6 text-slate-900 dark:text-white">
                    Model Attestation
                  </h3>
                </div>

                <div className="p-4">
                  <ul className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {attestation?.models ? (
                      Object.entries(attestation.models).map(
                        ([name, info]) => (
                          <li
                            key={name}
                            className="flex items-center justify-between py-3"
                          >
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                {name}
                              </span>

                              <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                                SHA256 verified
                              </span>
                            </div>

                            <span
                              className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${info?.status === "OK"
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-500/20"
                                : "bg-red-50 text-red-700 ring-red-600/10 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-500/20"
                                }`}
                            >
                              {info?.status || "UNKNOWN"}
                            </span>
                          </li>
                        )
                      )
                    ) : (
                      <p className="text-sm text-slate-500 dark:text-slate-400 py-2">
                        Loading attestation signatures...
                      </p>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Hidden canvas used to turn the live camera frame into JPEG. */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

export default App;
