import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import './App.css';

const API = process.env.REACT_APP_API_URL || 'https://aquasense-server-1-nc1c.onrender.com';
const MAX_HIST = 30;

// ── Classification zones ──────────────────────────────────────
const ZONES = {
  Clean: { color: '#10b981', bg: '#ecfdf5', border: '#6ee7b7', icon: '💧', glow: '#10b98133' },
  Low:   { color: '#f59e0b', bg: '#fffbeb', border: '#fcd34d', icon: '⚠️', glow: '#f59e0b33' },
  High:  { color: '#ef4444', bg: '#fef2f2', border: '#fca5a5', icon: '🚨', glow: '#ef444433' },
};

// ── Custom Tooltip ────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const z = ZONES[d.label] || ZONES.Clean;
  return (
    <div style={{ background: '#1e293b', border: `1px solid ${z.color}44`, borderRadius: 10, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ color: '#94a3b8', marginBottom: 4 }}>{d.time}</div>
      <div style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>{d.ldr} <span style={{ fontSize: 11, color: '#94a3b8' }}>ADC</span></div>
      <div style={{ marginTop: 4 }}>
        <span style={{ background: z.bg, color: z.color, border: `1px solid ${z.border}`, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>
          {z.icon} {d.label}
        </span>
      </div>
    </div>
  );
}

// ── Gauge SVG ─────────────────────────────────────────────────
function Gauge({ value, label, color }) {
  const pct = Math.min(100, Math.max(0, value / 1023 * 100));
  const angle = -135 + (pct / 100) * 270;
  const r = 54, cx = 70, cy = 70;
  const toXY = (deg) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const arcPath = (startDeg, endDeg, col) => {
    const s = toXY(startDeg), e = toXY(endDeg);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return <path d={`M${s.x},${s.y} A${r},${r} 0 ${large},1 ${e.x},${e.y}`} fill="none" stroke={col} strokeWidth="10" strokeLinecap="round" />;
  };
  const needle = toXY(angle);
  return (
    <svg viewBox="0 0 140 100" width="160" height="115">
      {arcPath(-135, 45, '#1e293b')}
      {arcPath(-135, -135 + (pct / 100) * 270, color)}
      <line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="5" fill={color} />
      <text x={cx} y={cy + 22} textAnchor="middle" fill="#fff" fontSize="16" fontWeight="700">{value}</text>
      <text x={cx} y={cy + 34} textAnchor="middle" fill="#64748b" fontSize="8">ADC (0–1023)</text>
      <text x="14" y="90" fill="#64748b" fontSize="8">0</text>
      <text x="118" y="90" fill="#64748b" fontSize="8">1023</text>
    </svg>
  );
}

// ── Water Quality Bar ─────────────────────────────────────────
function QualityBar({ ldr }) {
  const pct = (ldr / 1023) * 100;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 4 }}>
        <span>High Contamination</span><span>Clean Water</span>
      </div>
      <div style={{ height: 12, borderRadius: 6, background: 'linear-gradient(to right, #ef4444, #f59e0b, #10b981)', position: 'relative', overflow: 'visible' }}>
        <div style={{
          position: 'absolute', top: '50%', left: `${pct}%`,
          transform: 'translate(-50%, -50%)',
          width: 18, height: 18, borderRadius: '50%',
          background: '#fff', border: '3px solid #1e293b',
          boxShadow: '0 0 8px rgba(0,0,0,0.4)',
          transition: 'left 0.6s ease'
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginTop: 4 }}>
        <span>0</span><span>512</span><span>1023</span>
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color, glow }) {
  return (
    <div className="stat-card" style={{ '--glow': glow, '--accent': color }}>
      <div className="stat-icon" style={{ background: `${color}22`, color }}>{icon}</div>
      <div className="stat-body">
        <div className="stat-value" style={{ color }}>{value}</div>
        <div className="stat-label">{label}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function App() {
  const [latest, setLatest]   = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats]     = useState({ Clean: 0, Low: 0, High: 0 });
  const [alerts, setAlerts]   = useState([{ icon: '🔵', msg: 'System initialised — awaiting sensor data', type: 'info', time: new Date().toLocaleTimeString() }]);
  const [online, setOnline]   = useState(null);
  const [apiUrl, setApiUrl]   = useState(API);
  const [apiInput, setApiInput] = useState(API);
  const [clock, setClock]     = useState('');
  const [blink, setBlink]     = useState(false);
  const prevLabel = useRef(null);
  const statsRef  = useRef({ Clean: 0, Low: 0, High: 0 });

  useEffect(() => {
    const id = setInterval(() => setClock(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(id);
  }, []);

  const pushAlert = useCallback((icon, msg, type) => {
    setAlerts(p => [{ icon, msg, type, time: new Date().toLocaleTimeString() }, ...p].slice(0, 8));
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [lr, hr] = await Promise.all([
        axios.get(`${apiUrl}/latest`),
        axios.get(`${apiUrl}/history?n=${MAX_HIST}`),
      ]);
      setOnline(true);
      const l = lr.data;
      setLatest(l);
      setBlink(true);
      setTimeout(() => setBlink(false), 400);

      if (prevLabel.current !== l.label) {
        if (l.label === 'High') pushAlert('🚨', `High contamination! LDR = ${l.ldr}`, 'danger');
        else if (l.label === 'Low') pushAlert('⚠️', `Low contamination detected. LDR = ${l.ldr}`, 'warn');
        else if (prevLabel.current === 'High' || prevLabel.current === 'Low')
          pushAlert('✅', 'Water quality restored to Clean', 'info');
        prevLabel.current = l.label;
      }

      const mapped = hr.data.map((r, i) => ({
        ...r,
        idx: i + 1,
        time: new Date(r.timestamp).toLocaleTimeString(),
      }));
      setHistory(mapped);

      statsRef.current[l.label] = (statsRef.current[l.label] || 0) + 1;
      setStats({ ...statsRef.current });
    } catch {
      setOnline(false);
    }
  }, [apiUrl, pushAlert]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 5000);
    return () => clearInterval(id);
  }, [fetchData]);

  const exportCSV = () => {
    const rows = history.map(r => `${r.idx},${r.timestamp},${r.ldr},${r.label},${r.confidence}`);
    const blob = new Blob(['#,Timestamp,LDR,Label,Confidence\n' + rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `aquasense_${Date.now()}.csv`; a.click();
  };

  const lbl   = latest?.label ?? 'Clean';
  const z     = ZONES[lbl];
  const ldr   = latest?.ldr ?? 0;
  const conf  = latest ? Math.round(latest.confidence * 100) : 0;
  const total = (stats.Clean || 0) + (stats.Low || 0) + (stats.High || 0) || 1;

  // Bar chart data for distribution
  const distData = [
    { name: 'Clean', count: stats.Clean || 0, fill: '#10b981' },
    { name: 'Low',   count: stats.Low   || 0, fill: '#f59e0b' },
    { name: 'High',  count: stats.High  || 0, fill: '#ef4444' },
  ];

  return (
    <div className="app">
      {/* ── NAV ── */}
      <nav className="nav">
        <div className="nav-brand">
          <div className="nav-logo">💧</div>
          <div>
            <div className="nav-title">AquaSense</div>
            <div className="nav-sub">Microplastic Detection · ESP8266 + LDR</div>
          </div>
        </div>
        <div className="nav-right">
          <div className={`online-dot ${online === true ? 'green' : online === false ? 'red' : 'amber'}`} />
          <span className="nav-meta">{online === true ? 'Server Online' : online === false ? 'Offline' : 'Connecting…'}</span>
          <div className="live-pill"><span className="pulse-dot" />LIVE</div>
          <span className="nav-clock">{clock}</span>
        </div>
      </nav>

      <main className="main">
        {/* ── API BAR ── */}
        <div className="api-bar">
          <span className="api-label">🔗 Backend URL</span>
          <input className="api-input" value={apiInput} onChange={e => setApiInput(e.target.value)} placeholder="http://localhost:8000" />
          <button className="btn-connect" onClick={() => setApiUrl(apiInput)}>Connect</button>
          <button className="btn-csv" onClick={exportCSV}>⬇ CSV</button>
        </div>

        {/* ── HERO BANNER ── */}
        <div className={`hero ${lbl.toLowerCase()} ${blink ? 'blink' : ''}`}>
          <div className="hero-left">
            <div className="hero-icon-wrap" style={{ background: z.glow }}>
              <span className="hero-icon">{z.icon}</span>
            </div>
            <div>
              <div className="hero-eyebrow">Water Contamination Status</div>
              <div className="hero-status" style={{ color: z.color }}>{lbl.toUpperCase()}</div>
              <div className="hero-conf" style={{ color: z.color }}>
                {conf}% confidence · {latest ? new Date(latest.timestamp).toLocaleTimeString() : '—'}
              </div>
            </div>
          </div>
          <div className="hero-right">
            <Gauge value={ldr} label={lbl} color={z.color} />
          </div>
        </div>

        {/* ── STAT CARDS ── */}
        <div className="stat-grid">
          <StatCard icon="📡" label="LDR Reading" value={ldr || '—'} sub="ADC units (0–1023)" color="#6366f1" glow="#6366f133" />
          <StatCard icon="🧪" label="Status" value={lbl} sub={`${conf}% confidence`} color={z.color} glow={z.glow} />
          <StatCard icon="📊" label="Total Readings" value={total} sub="this session" color="#06b6d4" glow="#06b6d433" />
          <StatCard icon="⚡" label="Last Updated" value={latest ? new Date(latest.timestamp).toLocaleTimeString() : '—'} sub="auto-refresh 5s" color="#8b5cf6" glow="#8b5cf633" />
        </div>

        {/* ── QUALITY BAR ── */}
        <div className="card">
          <div className="card-head">
            <span className="card-title">💡 Light Intensity Scale</span>
            <span className="card-badge" style={{ background: `${z.color}22`, color: z.color, border: `1px solid ${z.color}44` }}>{lbl}</span>
          </div>
          <QualityBar ldr={ldr} />
          <div className="zone-legend">
            <span style={{ color: '#ef4444' }}>■ High (0–449)</span>
            <span style={{ color: '#f59e0b' }}>■ Low (450–699)</span>
            <span style={{ color: '#10b981' }}>■ Clean (700–1023)</span>
          </div>
        </div>

        {/* ── CHARTS ROW ── */}
        <div className="charts-row">
          {/* Area chart */}
          <div className="card chart-card">
            <div className="card-head">
              <span className="card-title">📈 LDR Trend (last {MAX_HIST} readings)</span>
              <span className="card-badge">{history.length} pts</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="ldrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#475569' }} interval="preserveStartEnd" />
                <YAxis domain={[0, 1023]} tick={{ fontSize: 9, fill: '#475569' }} />
                <ReferenceLine y={700} stroke="#10b981" strokeDasharray="4 4" label={{ value: 'Clean', fill: '#10b981', fontSize: 9 }} />
                <ReferenceLine y={450} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'Low', fill: '#f59e0b', fontSize: 9 }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="ldr" stroke="#6366f1" strokeWidth={2.5} fill="url(#ldrGrad)" dot={false} activeDot={{ r: 5, fill: '#6366f1' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Bar chart distribution */}
          <div className="card chart-card-sm">
            <div className="card-head">
              <span className="card-title">📊 Distribution</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={distData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 9, fill: '#475569' }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {distData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Manual colored bars since recharts Bar cell needs Cell */}
            <div className="dist-bars">
              {distData.map(d => (
                <div key={d.name} className="dist-row">
                  <span style={{ color: d.fill, width: 44, fontSize: 12, fontWeight: 600 }}>{d.name}</span>
                  <div className="dist-track">
                    <div className="dist-fill" style={{ width: `${(d.count / total) * 100}%`, background: d.fill }} />
                  </div>
                  <span style={{ color: '#94a3b8', fontSize: 12, width: 28, textAlign: 'right' }}>{d.count}</span>
                  <span style={{ color: '#475569', fontSize: 11, width: 36, textAlign: 'right' }}>{Math.round((d.count / total) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── ALERTS + TABLE ── */}
        <div className="bottom-row">
          {/* Alerts */}
          <div className="card">
            <div className="card-head">
              <span className="card-title">🔔 Alerts</span>
              <button className="btn-clear" onClick={() => setAlerts([])}>Clear</button>
            </div>
            <div className="alert-list">
              {alerts.map((a, i) => (
                <div key={i} className={`alert-item alert-${a.type}`}>
                  <span className="alert-icon">{a.icon}</span>
                  <div>
                    <div className="alert-msg">{a.msg}</div>
                    <div className="alert-time">{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* History table */}
          <div className="card">
            <div className="card-head">
              <span className="card-title">📋 Reading Log</span>
              <span className="card-badge">{history.length} entries</span>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>{['#', 'Time', 'LDR', 'Status', 'Conf'].map(h => <th key={h}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {[...history].reverse().slice(0, 10).map((r, i) => {
                    const rz = ZONES[r.label] || ZONES.Clean;
                    return (
                      <tr key={i} className={i === 0 ? 'row-new' : ''}>
                        <td>{r.idx}</td>
                        <td>{r.time}</td>
                        <td style={{ fontWeight: 700, color: rz.color }}>{r.ldr}</td>
                        <td>
                          <span className="badge" style={{ background: `${rz.color}22`, color: rz.color, border: `1px solid ${rz.color}44` }}>
                            {rz.icon} {r.label}
                          </span>
                        </td>
                        <td>{Math.round(r.confidence * 100)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      <footer className="footer">
        AquaSense · ESP8266 + LDR Optical Microplastic Detector · Auto-refresh every 5s
      </footer>
    </div>
  );
}
