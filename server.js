const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

const readings = [];
const MAX = 200;

// ── Classification ────────────────────────────────────────────
function classify(ldr) {
  if (ldr >= 700) return { label: 'Clean', confidence: 0.90 };
  if (ldr >= 450) return { label: 'Low',   confidence: 0.80 };
  return              { label: 'High',  confidence: 0.85 };
}

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
