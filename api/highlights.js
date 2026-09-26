import { rl, cap } from './_sec.js';
// Post-match highlights via Dailymotion public API (no key).
// Clients call only for finished matches; the server picks the freshest
// video matching both teams (+score boost). Fail-open. Same-origin only.
const DM = 'https://api.dailymotion.com';

async function dfetch(path, ms, maxBytes) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(DM + path, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
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
function toks(s) {
  return String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ')
    .split(' ').map(w => w.trim()).filter(w => w.length >= 4);
}
function imgOk(u) {
  const s = String(u || '');
  return /^https:\/\//i.test(s) && !/[\s<>"]/.test(s) ? s.slice(0, 200) : '';
}
function idOk(id) {
  return /^[a-z0-9]{6,12}$/i.test(String(id || '')) ? String(id) : '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!rl(req, res, 'highlights', 120, 60000)) return;
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ found: false });
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=1800');
  try {
    const home = cap(req.query.home || '', 60).trim();
    const away = cap(req.query.away || '', 60).trim();
    const hs = cap(req.query.hs || '', 4).trim();
    const as = cap(req.query.as || '', 4).trim();
    if (!home || !away) throw 0;
    const hT = toks(home), aT = toks(away);
    if (!hT.length || !aT.length) throw 0;
    const q = '/videos?' + new URLSearchParams({
      search: (home + ' ' + away + ' goals').slice(0, 120),
      fields: 'id,title,duration,thumbnail_480_url,created_time',
      limit: '12',
    }).toString();
    const data = await dfetch(q, 7000, 500000);
    const list = data && Array.isArray(data.list) ? data.list : [];
    const nowS = Date.now() / 1000;
    const hn = parseInt(hs, 10), an = parseInt(as, 10);
    const hasScore = isFinite(hn) && isFinite(an);
    let best = null, bestS = -1;
    for (const v of list) {
      const id = idOk(v && v.id);
      const title = String((v && v.title) || '');
      if (!id || !title) continue;
      const dur = +((v && v.duration) || 0);
      if (!(dur >= 45 && dur <= 1500)) continue;
      const created = +((v && v.created_time) || 0);
      if (!created || nowS - created > 21 * 86400) continue;
      const tl = title.toLowerCase();
      if (!hT.some(w => tl.includes(w)) || !aT.some(w => tl.includes(w))) continue;
      if (!/(goal|highlight)/i.test(tl)) continue;
      let s = created;
      if (hasScore) {
        const forms = [hn + '-' + an, hn + ' - ' + an, hn + ':' + an,
                       an + '-' + hn, an + ' - ' + hn, an + ':' + hn];
        if (forms.some(f => tl.includes(f))) s += 1e12;
        if (dur >= 120 && dur <= 600) s += 1e9;
      }
      if (s > bestS) { bestS = s; best = v; }
    }
    if (!best) throw 0;
    const id = idOk(best.id);
    return res.status(200).json({ found: true, id,
      title: String(best.title || '').slice(0, 100),
      dur: +best.duration || 0,
      thumb: imgOk(best.thumbnail_480_url),
      url: 'https://www.dailymotion.com/video/' + id,
      embed: 'https://geo.dailymotion.com/player.html?video=' + id });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ found: false });
  }
}
