const express = require('express');
const cors    = require('cors');
const path    = require('path');
const os      = require('os');

const app  = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Data Store ────────────────────────────────
const MAX_HISTORY = 200;
let store = {
  latest:  null,
  history: [],
  devices: {}
};

// ── Watering Config (editable from dashboard) ─
let config = {
  openThreshold:   40,
  wateringMinutes: 3
};

// ── SSE Clients ───────────────────────────────
let clients = [];
function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  clients = clients.filter(c => { try { c.write(msg); return true; } catch { return false; } });
}

// ── Soil Moisture Level ───────────────────────
function soilLevel(moisture) {
  if (moisture < 20)                         return { label: 'Very Dry',    color: '#ff4757', icon: '🏜️'  };
  if (moisture >= 20 && moisture < 40)       return { label: 'Dry',         color: '#ff6b35', icon: '☀️'  };
  if (moisture >= 40 && moisture < 60)       return { label: 'Good',        color: '#2ed573', icon: '✅'  };
  if (moisture >= 60 && moisture < 80)       return { label: 'Moist',       color: '#00d2ff', icon: '💧'  };
  return                                            { label: 'Saturated',   color: '#7b2ff7', icon: '🌊' };
}

// ── GET /api/config ───────────────────────────
app.get('/api/config', (req, res) => {
  res.json(config);
});

// ── POST /api/config — Dashboard updates ──────
app.post('/api/config', (req, res) => {
  const { openThreshold, wateringMinutes } = req.body;

  if (openThreshold !== undefined)   config.openThreshold   = Math.max(5, Math.min(95, parseInt(openThreshold)));
  if (wateringMinutes !== undefined) config.wateringMinutes  = Math.max(1, Math.min(60, parseInt(wateringMinutes)));

  console.log(`[CONFIG] Open <${config.openThreshold}% | Water ${config.wateringMinutes} min`);

  broadcast({ type: 'config', data: config });
  res.json({ ok: true, config });
});

// ── POST /api/sensor — receive from ESP32 ─────
app.post('/api/sensor', (req, res) => {
  const { raw, moisture, valve, device, threshold, wateringMinutes: wm } = req.body;

  if (moisture === undefined) {
    return res.status(400).json({ error: 'Missing moisture' });
  }

  const id      = device || 'ESP32';
  const ts      = new Date().toISOString();
  const level   = soilLevel(parseFloat(moisture));
  const reading = {
    device:    id,
    raw:       raw !== undefined ? parseInt(raw) : null,
    moisture:  parseFloat(moisture).toFixed(1),
    valve:     valve || 'CLOSE',
    level:     level,
    config:    { ...config },
    timestamp: ts
  };

  store.latest = reading;
  store.history.unshift(reading);
  if (store.history.length > MAX_HISTORY) store.history.pop();

  if (!store.devices[id]) store.devices[id] = { count: 0 };
  store.devices[id].count++;
  store.devices[id].lastSeen = ts;
  store.devices[id].latest   = reading;

  console.log(`[${ts}] ${id} — Moisture: ${moisture}% | Raw: ${raw} | Valve: ${valve} | ${level.label}`);

  broadcast({ type: 'reading', data: reading });
  res.json({ ok: true, reading, config });
});

// ── GET /api/data ─────────────────────────────
app.get('/api/data', (req, res) => res.json({ ...store, config }));

// ── SSE stream ────────────────────────────────
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type',                'text/event-stream');
  res.setHeader('Cache-Control',               'no-cache');
  res.setHeader('Connection',                  'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'init', data: { ...store, config } })}\n\n`);
  clients.push(res);

  const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 20000);
  req.on('close', () => { clearInterval(hb); clients = clients.filter(c => c !== res); });
});

// ── Local IP ──────────────────────────────────
function localIP() {
  for (const ifaces of Object.values(os.networkInterfaces()))
    for (const i of ifaces)
      if (i.family === 'IPv4' && !i.internal) return i.address;
  return 'localhost';
}

app.listen(PORT, '0.0.0.0', () => {
  const ip = localIP();
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   🌱 Smart Sprinkler — Moisture Server 🌱       ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Dashboard : http://localhost:${PORT}                ║`);
  console.log(`║  Network   : http://${ip}:${PORT}             ║`);
  console.log(`║  ESP32 URL : POST /api/sensor                   ║`);
  console.log(`║  Config    : GET  /api/config                   ║`);
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log(`👉 ESP32 serverUrl = "http://${ip}:${PORT}/api/sensor"`);
  console.log(`📋 Config: Open <${config.openThreshold}% | Water ${config.wateringMinutes} min`);
  console.log('');
});
