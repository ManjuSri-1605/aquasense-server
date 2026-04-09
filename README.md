# AquaSense — AI-Based Microplastic Detection System

ESP8266 + LDR optical sensor → FastAPI backend → React dashboard

---

## Project Structure

```
microplastic-project/
├── frontend/          React dashboard (deploy → Vercel)
├── backend/           FastAPI server  (deploy → Render)
├── ml/                ML model training script
└── arduino/           ESP8266 Arduino sketch
```

---

## 1. Train the ML Model (optional)

```bash
cd ml
pip install scikit-learn joblib numpy
python train_model.py
# → saves backend/model/rf_model.joblib
```

If you skip this, the backend falls back to threshold logic automatically.

---

## 2. Run the Backend Locally

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API endpoints:
- `POST /data`      — receive `{ "ldr": 750 }` from ESP8266
- `GET  /latest`    — latest reading
- `GET  /history?n=20` — last N readings
- `GET  /health`    — server health check

---

## 3. Run the Frontend Locally

```bash
cd frontend
cp .env.example .env          # set REACT_APP_API_URL=http://localhost:8000
npm install
npm start
```

---

## 4. Flash the ESP8266

1. Open `arduino/esp8266_ldr.ino` in Arduino IDE
2. Install board: **ESP8266 by ESP8266 Community** (Board Manager)
3. Install libraries: `ArduinoJson` (v6)
4. Edit the sketch:
   - `WIFI_SSID` / `WIFI_PASSWORD`
   - `SERVER_URL` → your Render URL, e.g. `https://aquasense-api.onrender.com/data`
5. Select board: **NodeMCU 1.0 (ESP-12E Module)**
6. Upload and open Serial Monitor (115200 baud)

### Wiring

```
ESP8266 A0  ←── LDR ──┬── 3.3V
                       └── 10kΩ ── GND

ESP8266 D1  ──── 220Ω ──── LED(+) ──── LED(-) ── GND
```

---

## 5. Deploy Backend → Render

1. Push `backend/` to a GitHub repo
2. Go to [render.com](https://render.com) → New Web Service
3. Connect repo, set:
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Copy the service URL (e.g. `https://aquasense-api.onrender.com`)

> **Note:** Render free tier spins down after inactivity. First request may take ~30s.

---

## 6. Deploy Frontend → Vercel

1. Push `frontend/` to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import repo
3. Set environment variable:
   - `REACT_APP_API_URL` = `https://aquasense-api.onrender.com`
4. Deploy — Vercel auto-detects Create React App

---

## Classification Logic

| LDR Value | Label | Meaning              |
|-----------|-------|----------------------|
| ≥ 700     | Clean | High light → clear water |
| 450–699   | Low   | Moderate attenuation |
| < 450     | High  | Heavy microplastic contamination |

The Random Forest model (if trained) overrides threshold logic.

---

## Dashboard Features

- Live LDR value with auto-refresh every 5s
- Contamination status badge (Clean / Low / High)
- Real-time line chart (last 20 readings via Recharts)
- Session statistics + class probability bars
- Alert log with high-contamination warnings
- Dark mode toggle
- CSV export
- Configurable backend API URL
