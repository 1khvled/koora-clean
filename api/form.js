import { rl, cap, readCapped } from './_sec.js';
// Recent form + head-to-head via ESPN site API (free, no key).
// GET ?slug=eng.1&eid=401878775 -> {found, h:{...form}, a:{...}, h2h:[...]}.
// Flow: event summary gives both team ids; each team's schedule gives
// completed results (last-5 form) and shared fixtures (H2H).
// Fail-open {found:false}. Not routed on worker.js — same-origin only.
const LEAGUES = ['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'ned.1', 'por.1',
  'tur.1', 'eng.2', 'usa.1', 'ksa.1', 'uefa.champions', 'uefa.europa'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const DONE = new Set(['STATUS_FULL_TIME', 'STATUS_FINAL']);

async function efetch(url, ms, maxBytes) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': 'https://www.espn.com/' },
    });
    if (!r.ok) return null;
    try { return JSON.parse(await readCapped(r, maxBytes)); } catch { return null; }
  } catch { return null; }
  finally { clearTimeout(to); }
}
const snum = (s) => {
  if (s == null) return null;
  const v = (typeof s === 'object') ? s.value : s;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isFinite(n) ? n : null;
};
// Completed fixtures newest-first from a team schedule payload.
function resultsOf(sched, teamId) {
  const out = [];
  for (const e of ((sched && sched.events) || [])) {
    try {
      const c = (e.competitions || [])[0] || {};
      const st = ((c.status || {}).type || {}).name || '';
      if (!DONE.has(st)) continue;
      const sides = c.competitors || [];
      if (sides.length < 2) continue;
      const me = sides.find(x => String((x.team || {}).id || '') === String(teamId));
      const op = sides.find(x => String((x.team || {}).id || '') !== String(teamId));
      if (!me || !op) continue;
      const ms = snum(me.score), os = snum(op.score);
      if (ms === null || os === null) continue;
      const dt = Date.parse(e.date || c.date || '');
      out.push({
        d: isFinite(dt) ? new Date(dt).toISOString() : String(e.date || ''),
        opp: String((op.team || {}).shortDisplayName || op.team || {}.displayName || ''),
        hs: ms, as: os, home: me.homeAway === 'home',
        res: me.winner === true ? 'W' : (op.winner === true ? 'L' : (ms === os ? 'D' : (ms > os ? 'W' : 'L'))),
      });
    } catch {}
  }
  out.sort((a, b) => String(b.d).localeCompare(String(a.d)));
  return out;
}

export default async function handler(req, res) {
  const slug = cap(String(req.query.slug || '').toLowerCase(), 24);
  const eid = cap(String(req.query.eid || '').replace(/[^0-9]/g, ''), 16);
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!rl(req, res, 'form')) return;
  res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=600, stale-while-revalidate=300');
  const fail = () => { res.setHeader('Cache-Control', 'no-store'); return res.status(200).json({ found: false }); };
  if (!LEAGUES.includes(slug) || !eid) return fail();
  try {
    const sum = await efetch(`${SITE}/${slug}/summary?event=${encodeURIComponent(eid)}`, 8000, 700000);
    const sides = (((sum && sum.header && sum.header.competitions) || [])[0] || {}).competitors || [];
    if (sides.length < 2) return fail();
    const T = sides.slice(0, 2).map(s => ({
      id: String((s.team || {}).id || ''),
      name: String((s.team || {}).displayName || (s.team || {}).name || ''),
      short: String((s.team || {}).shortDisplayName || (s.team || {}).abbreviation || ''),
      home: s.homeAway === 'home',
    }));
    if (!T[0].id || !T[1].id) return fail();
    const [s0, s1] = await Promise.all([
      efetch(`${SITE}/${slug}/teams/${encodeURIComponent(T[0].id)}/schedule`, 8000, 160000),
      efetch(`${SITE}/${slug}/teams/${encodeURIComponent(T[1].id)}/schedule`, 8000, 160000),
    ]);
    const r0 = resultsOf(s0, T[0].id).slice(0, 5);
    const r1 = resultsOf(s1, T[1].id).slice(0, 5);
    // H2H: completed fixtures featuring both sides (from either schedule).
    const seen = new Set(), h2h = [];
    const both = [T[0].id, T[1].id].sort().join('|');
    const collect = (sched) => {
      const out = [];
      for (const e of ((sched && sched.events) || [])) {
        try {
          const c = (e.competitions || [])[0] || {};
          const st = ((c.status || {}).type || {}).name || '';
          if (!DONE.has(st)) continue;
          const sides2 = c.competitors || [];
          const ids = sides2.map(x => String((x.team || {}).id || '')).sort().join('|');
          if (ids !== both) continue;
          const h = sides2.find(x => x.homeAway === 'home');
          const a = sides2.find(x => x.homeAway === 'away');
          if (!h || !a) continue;
          const hs = snum(h.score), as = snum(a.score);
          if (hs === null || as === null) continue;
          const dt = Date.parse(e.date || c.date || '');
          const key = String(e.id || dt) + hs + '-' + as;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            d: isFinite(dt) ? new Date(dt).toISOString().slice(0, 10) : '',
            hn: String((h.team || {}).shortDisplayName || (h.team || {}).displayName || ''),
            hs, an: String((a.team || {}).shortDisplayName || (a.team || {}).displayName || ''), as,
          });
        } catch {}
      }
      return out;
    };
    const h2hAll = [...collect(s0), ...collect(s1)];
    h2hAll.sort((a, b) => String(b.d).localeCompare(String(a.d)));
    for (const m of h2hAll.slice(0, 5)) h2h.push(m);
    if (!r0.length && !r1.length && !h2h.length) return fail();
    return res.status(200).json({
      found: true, slug, eid,
      h: { id: T[0].id, name: T[0].name, short: T[0].short, form: r0.map(x => x.res) },
      a: { id: T[1].id, name: T[1].name, short: T[1].short, form: r1.map(x => x.res) },
      h2h,
    });
  } catch { return fail(); }
}
