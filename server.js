const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

const readings = [];
const MAX = 200;

// ── Classification ────────────────────────────────────────────
// Uses percentage of max observed value so it works for any LDR range.
// Higher LDR = more light passing through = cleaner water.
let maxObserved = 0;

function classify(ldr) {
  // Track the highest reading seen (= cleanest / most light)
  if (ldr > maxObserved) maxObserved = ldr;

  // Use absolute thresholds if we have enough data, else use raw value
  // Based on typical LDR in water: clean ~80-120, low ~40-79, high ~0-39
  // These are auto-scaled based on your sensor's actual max
  const baseline = Math.max(maxObserved, 100); // at least 100 to avoid div/0
  const pct = (ldr / baseline) * 100;

  if (pct >= 70) return { label: 'Clean', confidence: 0.90 };
  if (pct >= 40) return { label: 'Low',   confidence: 0.80 };
  return              { label: 'High',  confidence: 0.85 };
}

// ── GET / (homepage so Render URL looks good) ────────────────
app.get('/', (req, res) => {
  res.json({
    name: 'AquaSense API',
    status: 'running',
    version: '1.0.0',
    endpoints: {
      'POST /data':       'Send LDR reading from ESP8266',
      'GET  /latest':     'Get latest reading',
      'GET  /history?n=': 'Get last N readings',
      'GET  /stats':      'Get session statistics',
      'GET  /health':     'Health check',
    }
  });
});

// ── POST /data  (ESP8266 sends here) ─────────────────────────
app.post('/data', (req, res) => {
  const ldr = parseFloat(req.body.ldr);
  if (isNaN(ldr) || ldr < 0 || ldr > 1023)
    return res.status(422).json({ error: 'LDR value must be 0–1023' });

  const { label, confidence } = classify(ldr);
  const entry = { ldr, label, confidence, timestamp: new Date().toISOString() };
  readings.push(entry);
  if (readings.length > MAX) readings.shift();

  console.log(`[${entry.timestamp}] LDR=${ldr}  →  ${label} (${Math.round(confidence*100)}%)`);
  res.json(entry);
});

// ── GET /latest ───────────────────────────────────────────────
app.get('/latest', (req, res) => {
  if (!readings.length) return res.status(404).json({ error: 'No readings yet' });
  res.json(readings[readings.length - 1]);
});

// ── GET /history ──────────────────────────────────────────────
app.get('/history', (req, res) => {
  const n = Math.min(parseInt(req.query.n) || 30, MAX);
  res.json(readings.slice(-n));
});

// ── GET /stats ────────────────────────────────────────────────
app.get('/stats', (req, res) => {
  if (!readings.length) return res.json({ total: 0 });
  const ldrs = readings.map(r => r.ldr);
  const counts = { Clean: 0, Low: 0, High: 0 };
  readings.forEach(r => counts[r.label]++);
  res.json({
    total: readings.length,
    counts,
    min: Math.min(...ldrs),
    max: Math.max(...ldrs),
    avg: Math.round(ldrs.reduce((a, b) => a + b, 0) / ldrs.length),
    maxObserved,
  });
});

// ── GET /health ───────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', readings: readings.length });
});

app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  AquaSense API → http://localhost:${PORT}  ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
});
