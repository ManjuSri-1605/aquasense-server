"""
AquaSense Backend — Flask server
Receives LDR readings from ESP8266 via HTTP POST,
classifies contamination level, stores last 100 readings,
serves JSON API to the dashboard.

Deploy on Render.com (free tier) — see README below.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from collections import deque
import time, math

app = Flask(__name__)
CORS(app)  # allow dashboard (different domain) to fetch data

# ── In-memory ring buffer — last 100 readings ──────────────────
readings = deque(maxlen=100)

# ── Classification thresholds ───────────────────────────────────
# IMPORTANT: Calibrate these against YOUR actual sensor readings.
# Run the ESP8266 test sketch, note the ADC values for:
#   clean tap water, milky water (low), very milky water (high)
# Then adjust CLEAN_MIN and LOW_MIN accordingly.
CLEAN_MIN = 650   # ADC >= 650  → Clean
LOW_MIN   = 350   # ADC 350–649 → Low contamination
                  # ADC < 350   → High contamination

def classify(adc_value):
    if adc_value >= CLEAN_MIN:
        p_clean = min(0.95, 0.70 + (adc_value - CLEAN_MIN) / 1000)
        p_low   = round((1 - p_clean) * 0.7, 3)
        p_high  = round((1 - p_clean) * 0.3, 3)
        p_clean = round(p_clean, 3)
        return "Clean", p_clean, p_low, p_high
    elif adc_value >= LOW_MIN:
        ratio   = (adc_value - LOW_MIN) / (CLEAN_MIN - LOW_MIN)
        p_low   = round(0.60 + ratio * 0.20, 3)
        p_clean = round((1 - p_low) * 0.5, 3)
        p_high  = round(1 - p_low - p_clean, 3)
        return "Low", p_clean, p_low, p_high
    else:
        p_high  = min(0.95, 0.65 + (LOW_MIN - adc_value) / 700)
        p_low   = round((1 - p_high) * 0.6, 3)
        p_clean = round(1 - p_high - p_low, 3)
        p_high  = round(p_high, 3)
        return "High", p_clean, p_low, p_high


# ── POST /data — ESP8266 sends readings here ────────────────────
@app.route("/data", methods=["POST"])
def receive_data():
    try:
        body = request.get_json(force=True)
        adc  = int(body.get("adc", 0))
        led  = bool(body.get("led", True))   # whether LED is on

        label, p_clean, p_low, p_high = classify(adc)

        entry = {
            "ts":      int(time.time() * 1000),   # ms epoch
            "adc":     adc,
            "led":     led,
            "label":   label,
            "p_clean": p_clean,
            "p_low":   p_low,
            "p_high":  p_high,
        }
        readings.append(entry)
        return jsonify({"ok": True, "label": label}), 200

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400


# ── GET /latest — dashboard polls this ─────────────────────────
@app.route("/latest", methods=["GET"])
def get_latest():
    if not readings:
        return jsonify({"ok": False, "msg": "no data yet"}), 204

    last  = readings[-1]
    hist  = list(readings)

    # Session stats
    total  = len(hist)
    counts = {"Clean": 0, "Low": 0, "High": 0}
    adc_sum = 0
    for r in hist:
        counts[r["label"]] += 1
        adc_sum += r["adc"]

    avg_adc = round(adc_sum / total)

    # Contamination index 0–100
    adc_val = last["adc"]
    if adc_val >= CLEAN_MIN:
        index = max(0, round(40 - (adc_val - CLEAN_MIN) / 15))
    elif adc_val >= LOW_MIN:
        span  = CLEAN_MIN - LOW_MIN
        index = round(40 + (1 - (adc_val - LOW_MIN) / span) * 35)
    else:
        index = round(75 + min(25, (LOW_MIN - adc_val) / 14))

    return jsonify({
        "ok":       True,
        "latest":   last,
        "history":  hist[-40:],   # last 40 for chart
        "stats": {
            "total":   total,
            "counts":  counts,
            "avg_adc": avg_adc,
            "index":   index,
        }
    })


# ── GET / — health check ────────────────────────────────────────
@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "AquaSense API running", "readings": len(readings)})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
