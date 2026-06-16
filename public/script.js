// ================================================
// Smart Sprinkler — Moisture Dashboard | script.js
// ================================================

let history     = [];
let chartRange  = 20;
let totalCount  = 0;
let chart       = null;
let evtSrc      = null;
let rTimer      = null;

// ── Droplets ──────────────────────────────────
(function() {
  const wrap = document.getElementById('bg-particles');
  for (let i = 0; i < 30; i++) {
    const d = document.createElement('div');
    d.className = 'drop';
    const size = Math.random() * 6 + 3;
    d.style.cssText = `left:${Math.random()*100}%;bottom:${Math.random()*-20}%;width:${size}px;height:${size}px;animation-duration:${8+Math.random()*14}s;animation-delay:${Math.random()*12}s;`;
    wrap.appendChild(d);
  }
})();

// ── Clock ─────────────────────────────────────
(function() {
  const el = document.getElementById('clock');
  const tick = () => { el.textContent = new Date().toLocaleTimeString('en-GB'); };
  tick(); setInterval(tick, 1000);
})();

function setStatus(state) {
  document.getElementById('status-dot').className = `dot ${state}`;
  document.getElementById('status-txt').textContent = state === 'online' ? 'Live ✓' : state === 'offline' ? 'Disconnected' : 'Connecting…';
}

function setSoilLevel(l) {
  document.getElementById('soil-icon').textContent  = l.icon;
  document.getElementById('soil-label').textContent = l.label;
  document.getElementById('soil-banner').style.borderColor = l.color + '66';
  document.getElementById('soil-banner').style.color       = l.color;
}

// ── Ring ───────────────────────────────────────
const RING_CIRC = 502;
function updateRing(pct, color) {
  const arc = document.getElementById('ring-arc');
  const val = document.getElementById('moist-val');
  arc.style.strokeDashoffset = RING_CIRC - (pct / 100) * (RING_CIRC * 0.75);
  arc.style.stroke = color;
  val.textContent = pct;
  val.style.color = color;
  document.getElementById('moist-fill').style.width      = pct + '%';
  document.getElementById('moist-fill').style.background = `linear-gradient(90deg,${color},#00d2ff)`;
  document.getElementById('moist-fill').style.boxShadow  = `0 0 12px ${color}66`;
  document.getElementById('moist-thumb').style.left        = pct + '%';
  document.getElementById('moist-thumb').style.borderColor = color;
}

// ── Valve ─────────────────────────────────────
function updateValve(valve) {
  const circle = document.getElementById('valve-circle');
  const emoji  = document.getElementById('valve-emoji');
  const status = document.getElementById('valve-status');
  const sub    = document.getElementById('valve-sub');
  const ripple = document.getElementById('valve-ripple');
  const wrap   = document.getElementById('valve-icon-wrap');
  const isOpen = valve === 'OPEN';

  status.textContent = isOpen ? 'OPEN' : 'CLOSED';
  status.style.color = isOpen ? '#2ed573' : '#ff4757';
  emoji.textContent  = isOpen ? '💦' : '🚫';
  circle.style.background = isOpen ? 'linear-gradient(135deg,#2ed573,#00d2ff)' : 'linear-gradient(135deg,#ff4757,#ff6b35)';
  circle.style.boxShadow  = isOpen ? '0 0 30px rgba(46,213,115,.5)' : '0 0 30px rgba(255,71,87,.3)';
  sub.textContent = isOpen ? 'Watering in progress...' : 'Idle — waiting for dry soil';

  if (isOpen) { ripple.classList.add('active'); wrap.classList.add('watering'); }
  else        { ripple.classList.remove('active'); wrap.classList.remove('watering'); }
}

function updateRaw(raw) {
  document.getElementById('raw-val').textContent = raw !== null ? raw : '--';
}

// ── Mini Stats ────────────────────────────────
function updateMini(reading) {
  document.getElementById('mini-device-val').textContent = reading.device;
  document.getElementById('mini-count-val').textContent  = totalCount;
  const d = new Date(reading.timestamp);
  document.getElementById('mini-last-val').textContent = d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const slice = history.slice(0, 10);
  if (slice.length) {
    const avg = (slice.reduce((s, r) => s + parseFloat(r.moisture), 0) / slice.length).toFixed(1);
    document.getElementById('mini-avg-val').textContent = avg + '%';
  }
}

// ── Table ─────────────────────────────────────
function updateTable() {
  const body = document.getElementById('tbl-body');
  const rows = history.slice(0, 15).map((r, i) => {
    const t = new Date(r.timestamp).toLocaleTimeString('en-GB');
    const vc = r.valve === 'OPEN' ? '#2ed573' : '#ff4757';
    return `<tr class="${i===0?'new-row':''}">
      <td class="mono">${totalCount-i}</td><td>${r.device}</td>
      <td style="font-weight:800;color:${r.level.color}">${r.moisture}%</td>
      <td class="mono">${r.raw??'--'}</td>
      <td><span class="pill" style="color:${vc};background:${vc}15;border-color:${vc}44">${r.valve==='OPEN'?'💦':'🚫'} ${r.valve}</span></td>
      <td><span class="pill" style="color:${r.level.color};background:${r.level.color}15;border-color:${r.level.color}44">${r.level.icon} ${r.level.label}</span></td>
      <td class="mono">${t}</td></tr>`;
  }).join('');
  body.innerHTML = rows || '<tr class="empty"><td colspan="7">Waiting for ESP32 data…</td></tr>';
}

// ── Chart ─────────────────────────────────────
function initChart() {
  const ctx = document.getElementById('mainChart').getContext('2d');
  const gM = ctx.createLinearGradient(0,0,0,250);
  gM.addColorStop(0,'rgba(46,213,115,.3)'); gM.addColorStop(1,'rgba(46,213,115,0)');
  const gR = ctx.createLinearGradient(0,0,0,250);
  gR.addColorStop(0,'rgba(0,210,255,.3)'); gR.addColorStop(1,'rgba(0,210,255,0)');

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label:'Moisture %', data:[], borderColor:'#2ed573', backgroundColor:gM, borderWidth:2.5, pointRadius:3, tension:.4, pointBackgroundColor:'#2ed573', fill:true, yAxisID:'y' },
        { label:'Raw ADC', data:[], borderColor:'#00d2ff', backgroundColor:gR, borderWidth:2.5, pointRadius:3, tension:.4, pointBackgroundColor:'#00d2ff', fill:true, yAxisID:'y1', hidden:true }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction:{intersect:false,mode:'index'},
      plugins:{legend:{display:false},tooltip:{backgroundColor:'#0b0f1e',borderColor:'rgba(0,210,255,.3)',borderWidth:1,titleColor:'#4a6070',bodyColor:'#ddeeff',padding:12}},
      scales:{
        x:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#4a6070',font:{size:10},maxTicksLimit:8,maxRotation:0}},
        y:{min:0,max:100,position:'left',grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#2ed573',font:{size:10},callback:v=>v+'%'}},
        y1:{min:0,max:4095,position:'right',grid:{drawOnChartArea:false},ticks:{color:'#00d2ff',font:{size:10}}}
      },
      animation:{duration:500}
    }
  });
}

function updateChart() {
  const slice = [...history].reverse().slice(-chartRange);
  chart.data.labels = slice.map(r => new Date(r.timestamp).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'}));
  chart.data.datasets[0].data = slice.map(r => parseFloat(r.moisture));
  chart.data.datasets[1].data = slice.map(r => r.raw !== null ? parseInt(r.raw) : null);
  chart.update('none');
}

// ── Toast ─────────────────────────────────────
let tTimer = null;
function showToast(title, msg, icon='⚠️') {
  document.getElementById('toast-title').textContent = title;
  document.getElementById('toast-msg').textContent   = msg;
  document.getElementById('toast-icon').textContent  = icon;
  const t = document.getElementById('toast');
  t.classList.add('show');
  clearTimeout(tTimer);
  tTimer = setTimeout(() => t.classList.remove('show'), 5000);
}

function flashCard(id) {
  const c = document.getElementById(id);
  if (!c) return;
  c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash');
}

// ── Process Reading ───────────────────────────
function processReading(reading) {
  totalCount++;
  history.unshift(reading);
  if (history.length > 200) history.pop();

  updateRing(parseFloat(reading.moisture), reading.level.color);
  updateValve(reading.valve);
  updateRaw(reading.raw);
  setSoilLevel(reading.level);
  updateMini(reading);
  updateTable();
  updateChart();
  flashCard('card-moisture');
  flashCard('card-valve');
}

// ── SSE ───────────────────────────────────────
function connectSSE() {
  setStatus('connecting');
  if (evtSrc) evtSrc.close();
  evtSrc = new EventSource('/api/events');

  evtSrc.onopen = () => { setStatus('online'); clearTimeout(rTimer); };

  evtSrc.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'init') {
        if (msg.data.history && msg.data.history.length) {
          history = msg.data.history;
          totalCount = history.length;
          const r = history[0];
          updateRing(parseFloat(r.moisture), r.level.color);
          updateValve(r.valve);
          updateRaw(r.raw);
          setSoilLevel(r.level);
          updateMini(r);
          updateTable();
          updateChart();
        }
        if (msg.data.config) handleConfigUpdate(msg.data.config);
      } else if (msg.type === 'reading') {
        processReading(msg.data);
        if (msg.data.config) handleConfigUpdate(msg.data.config);
      } else if (msg.type === 'config') {
        handleConfigUpdate(msg.data);
      }
    } catch(err) { console.warn(err); }
  };

  evtSrc.onerror = () => { setStatus('offline'); evtSrc.close(); rTimer = setTimeout(connectSSE, 5000); };
}

// ── Toggles ───────────────────────────────────
document.querySelectorAll('.tog').forEach(btn => {
  btn.addEventListener('click', () => {
    const ds = parseInt(btn.dataset.ds);
    btn.classList.toggle('active');
    chart.data.datasets[ds].hidden = !btn.classList.contains('active');
    chart.update();
  });
});
document.querySelectorAll('.rbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.rbtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    chartRange = parseInt(btn.dataset.n);
    updateChart();
  });
});

// ── Config UI ───────────────────────────────────
let saveTimer = null;
function loadConfig() {
  fetch('/api/config').then(r => r.json()).then(cfg => {
    document.getElementById('cfg-threshold').value = cfg.openThreshold;
    document.getElementById('cfg-threshold-val').textContent = cfg.openThreshold;
    document.getElementById('cfg-duration').value = cfg.wateringMinutes;
    document.getElementById('cfg-duration-val').textContent = cfg.wateringMinutes;
  }).catch(() => {});
}

function saveConfig(data) {
  const statusEl = document.getElementById('config-save-status');
  const textEl = document.getElementById('config-save-text');
  statusEl.classList.add('saving');
  statusEl.classList.remove('saved');
  textEl.textContent = 'Saving…';

  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  .then(r => r.json())
  .then(res => {
    if (res.ok) {
      statusEl.classList.remove('saving');
      statusEl.classList.add('saved');
      textEl.textContent = 'Saved';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        statusEl.classList.remove('saved');
        textEl.textContent = 'Synced';
      }, 2000);
    }
  })
  .catch(() => {
    statusEl.classList.remove('saving');
    textEl.textContent = 'Error';
  });
}

document.getElementById('cfg-threshold').addEventListener('input', e => {
  document.getElementById('cfg-threshold-val').textContent = e.target.value;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveConfig({ openThreshold: parseInt(e.target.value) }), 500);
});

document.getElementById('cfg-duration').addEventListener('input', e => {
  document.getElementById('cfg-duration-val').textContent = e.target.value;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveConfig({ wateringMinutes: parseInt(e.target.value) }), 500);
});

// Handle SSE config updates from other clients
function handleConfigUpdate(cfg) {
  document.getElementById('cfg-threshold').value = cfg.openThreshold;
  document.getElementById('cfg-threshold-val').textContent = cfg.openThreshold;
  document.getElementById('cfg-duration').value = cfg.wateringMinutes;
  document.getElementById('cfg-duration-val').textContent = cfg.wateringMinutes;
}

// ── Guide ─────────────────────────────────────
document.getElementById('guide-btn').addEventListener('click', () => document.getElementById('guide-modal').classList.add('open'));
document.getElementById('guide-close').addEventListener('click', () => document.getElementById('guide-modal').classList.remove('open'));
document.getElementById('guide-modal').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('open'); });
fetch('/api/data').then(r=>r.json()).then(()=>{
  const host = location.hostname;
  document.querySelectorAll('#guide-ip,#guide-ep').forEach(el => el.textContent = host);
}).catch(()=>{});

// ── Init ──────────────────────────────────────
initChart();
connectSSE();
loadConfig();
