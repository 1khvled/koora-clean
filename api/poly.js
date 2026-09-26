import { rl, cap } from './_sec.js';
// Polymarket odds bridge (public Gamma API, no key): Ballon d'Or board +
// per-match 1X2 for fixtures that have a market. Fail-open everywhere;
// trimmed, display-ready JSON only. NOTE: not routed on worker.js —
// clients call same-origin /api/poly only.
const GAMMA = 'https://gamma-api.polymarket.com';
const BALLON_SLUG = 'ballon-dor-winner-2026';
const BALLON_URL = 'https://polymarket.com/event/' + BALLON_SLUG;

async function gfetch(path, ms, maxBytes) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(GAMMA + path, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });
    if (!r.ok) return null;
    const cl = +(r.headers.get('content-length') || 0);
    if (cl > maxBytes) return null;
    const tx = await r.text();
    if (!tx || tx.length > maxBytes) return null;
    try { return JSON.parse(tx); } catch { return null; }
  } catch { return null; }
  finally { clearTimeout(to); }
}
// YES price 0..1 or null (some payloads are malformed — never throw).
function yesPrice(m) {
  try {
    let op = m && m.outcomePrices;
    if (typeof op === 'string') op = JSON.parse(op);
    const v = parseFloat(op && op[0]);
    return isFinite(v) ? v : null;
  } catch { return null; }
}
const STOP = new Set(['fc', 'cf', 'sc', 'ac', 'as', 'club', 'deportivo', 'real', 'olympic']);
export function toks(s) {
  return String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ')
    .split(' ').map(w => w.trim()).filter(w => w.length >= 4 && !STOP.has(w));
}
export function scoreEvents(evs, hT, aT, qT) {
  const hit = (arr, title) => arr.some(w => title.includes(w));
  const out = [];
  for (const e of evs) {
    if (!e || e.closed) continue;
    const mks = Array.isArray(e.markets) ? e.markets : [];
    if (mks.length < 3) continue;
    const title = String(e.title || '').toLowerCase();
    if (!hit(hT, title) || !hit(aT, title)) continue;
    const tagStr = [...(Array.isArray(e.tags) ? e.tags : [])]
      .map(t => String((t && t.slug) || '') + ' ' + String((t && t.label) || '')).join(' ').toLowerCase();
    const soccer = /soccer|football/.test(tagStr) ? 1 : 0;
    const ed = Date.parse(e.endDate || '');
    const dd = (isFinite(qT) && isFinite(ed)) ? Math.abs(ed - qT) : null;
    if (dd != null && dd > 36 * 3600000) continue;
    out.push({ e, s: soccer * 1e15 - (dd == null ? 36 * 3600000 : dd) });
  }
  out.sort((a, b) => b.s - a.s);
  return out;
}
const WIN_RE = /(win|beat)/;
export function classifyMarkets(e, hT, aT) {
  let H = null, D = null, A = null;
  const hit = (arr, title) => arr.some(w => title.includes(w));
  for (const m of (e.markets || [])) {
    if (!m || !m.active || m.closed) continue;
    const p = yesPrice(m);
    if (p == null || p <= 0 || p >= 1) continue;
    const ql = String(m.question || '').toLowerCase();
    if (ql.includes('draw')) { if (D == null) D = p; }
    else if (hit(hT, ql) && WIN_RE.test(ql)) { if (H == null) H = p; }
    else if (hit(aT, ql) && WIN_RE.test(ql)) { if (A == null) A = p; }
  }
  if (H == null || D == null || A == null) return null;
  const pct = v => Math.round(v * 1000) / 10;
  return { H: pct(H), D: pct(D), A: pct(A) };
}
function imgOk(u) {
  const s = String(u || '');
  return /^https:\/\//i.test(s) && !/[\s<>"]/.test(s) ? s.slice(0, 200) : '';
}
function parseName(q) {
  const m = String(q || '').match(/will (.+?) win/i);
  return m ? m[1].trim().slice(0, 40) : '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!rl(req, res, 'poly', 120, 60000)) return;
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ found: false });
  const type = cap(req.query.type || 'match', 16);

  if (type === 'ballon') {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600');
    try {
      const evs = await gfetch('/events?slug=' + BALLON_SLUG, 6000, 900000);
      const ev = Array.isArray(evs) && evs[0] ? evs[0] : null;
      if (!ev || !Array.isArray(ev.markets)) throw 0;
      const rows = [];
      for (const m of ev.markets) {
        if (!m || !m.active || m.closed) continue;
        const p = yesPrice(m);
        if (p == null || p <= 0) continue;
        const name = String(m.groupItemTitle || parseName(m.question) || '').trim().slice(0, 40);
        if (!name) continue;
        let chg = null;
        const c = parseFloat(m.oneDayPriceChange);
        if (isFinite(c)) chg = Math.round(c * 1000) / 10;
        rows.push({ name, pct: Math.round(p * 1000) / 10, chg, img: imgOk(m.image) });
      }
      rows.sort((a, b) => b.pct - a.pct);
      if (!rows.length) throw 0;
      return res.status(200).json({
        found: true, title: String(ev.title || "Ballon d'Or Winner 2026").slice(0, 80),
        slug: BALLON_SLUG, url: BALLON_URL, top: rows.slice(0, 5),
      });
    } catch { return res.status(200).json({ found: false }); }
  }

  // Per-match 1X2. Expects Latin team names (clients send translated ones).
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=120');
  try {
    const home = cap(req.query.home || '', 60).trim();
    const away = cap(req.query.away || '', 60).trim();
    const start = cap(req.query.start || '', 64);
    if (!home || !away) throw 0;
    const qT = Date.parse(start);
    const data = await gfetch('/public-search?q=' + encodeURIComponent((home + ' ' + away).slice(0, 120)), 6000, 900000);
    const evs = data && Array.isArray(data.events) ? data.events : [];
    const hT = toks(home), aT = toks(away);
    if (!hT.length || !aT.length) throw 0;
    const scored = scoreEvents(evs, hT, aT, qT);
    for (const { e } of scored) {
      const r = classifyMarkets(e, hT, aT);
      if (r) {
        return res.status(200).json({ found: true, slug: String(e.slug || '').slice(0, 120),
          url: 'https://polymarket.com/event/' + String(e.slug || ''), home: r.H, draw: r.D, away: r.A });
      }
    }
    throw 0;
  } catch { return res.status(200).json({ found: false }); }
}
