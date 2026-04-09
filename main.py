from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
from collections import deque
import os, joblib, numpy as np

app = FastAPI(title="AquaSense API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory store (last 100 readings) ──────────────────────
readings: deque = deque(maxlen=100)

# ── Optional ML model ────────────────────────────────────────
MODEL_PATH = os.getenv("MODEL_PATH", "model/rf_model.joblib")
model = None
try:
    model = joblib.load(MODEL_PATH)
    print(f"[ML] Model loaded from {MODEL_PATH}")
except Exception as e:
    print(f"[ML] No model found ({e}), using threshold logic")


# ── Threshold classification (fallback) ──────────────────────
def classify_threshold(ldr: float) -> tuple[str, float]:
    if ldr >= 700:
        return "Clean", 0.90
    elif ldr >= 450:
        return "Low", 0.80
    else:
        return "High", 0.85


def classify(ldr: float) -> tuple[str, float]:
    if model:
        features = np.array([[ldr, ldr * 0.96, ldr * 0.91]])  # simulate 3-distance features
        pred = model.predict(features)[0]
        proba = model.predict_proba(features)[0]
        label_map = {0: "Clean", 1: "Low", 2: "High"}
        label = label_map.get(int(pred), "Unknown")
        confidence = float(max(proba))
        return label, confidence
    return classify_threshold(ldr)


# ── Schemas ───────────────────────────────────────────────────
class SensorPayload(BaseModel):
    ldr: float


class Reading(BaseModel):
    ldr: float
    label: str
    confidence: float
    timestamp: str


# ── Endpoints ─────────────────────────────────────────────────
@app.post("/data", response_model=Reading)
def receive_data(payload: SensorPayload):
    if not (0 <= payload.ldr <= 1023):
        raise HTTPException(status_code=422, detail="LDR value must be 0–1023")
    label, confidence = classify(payload.ldr)
    entry = {
        "ldr": payload.ldr,
        "label": label,
        "confidence": round(confidence, 3),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
    readings.append(entry)
    return entry


@app.get("/latest", response_model=Reading)
def get_latest():
    if not readings:
        raise HTTPException(status_code=404, detail="No readings yet")
    return readings[-1]


@app.get("/history")
def get_history(n: int = 20):
    n = min(n, 100)
    return list(readings)[-n:]


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": model is not None, "readings": len(readings)}
