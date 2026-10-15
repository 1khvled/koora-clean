import { rl, cap, readCapped } from './_sec.js';
// League tables via ESPN core API (free, no key): standings $ref chain ->
// team objects (names, logos, form) -> record details (W/D/L/GF/GA).
// GET ?lg=eng.1 -> trimmed groups/rows. Fail-open {found:false} everywhere;
// edge-cached (tables move slowly). Not routed on worker.js — clients call
// same-origin /api/standings only.
const LEAGUES = ['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'ned.1', 'por.1',
  'tur.1', 'usa.1', 'ksa.1', 'uefa.champions', 'uefa.europa'];
const CORE = 'https://sports.core.api.espn.com/v2/sports/soccer';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';

async function cfetch(url, ms, maxBytes) {
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
// Football season year: Aug–May leagues flip in July; spring–fall (MLS) uses
// the calendar year. July+ -> current year, else previous year.
function seasonYear(now) {
  const d = now || new Date();
  const y = d.getFullYear();
  return (d.getMonth() + 1) >= 7 ? y : y - 1;
}
const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isFinite(n) ? n : null;
};
function statsOf(items) {
  const m = {};
  for (const s of (items || [])) {
    const k = String((s && (s.abbreviation || s.shortDisplayName || s.name)) || '').toUpperCase();
    const v = num(s && (s.value !== undefined ? s.value : s.displayValue));
    if (k && v !== null && !(k in m)) m[k] = v;
  }
  const W = m.W ?? null, D = (m.D ?? m.T) ?? null, L = m.L ?? null;
  const GF = (m.GF ?? m.F) ?? null, GA = (m.GA ?? m.A) ?? null;
  const P = m.GP ?? m.P ?? ((W ?? 0) + (D ?? 0) + (L ?? 0)) ?? null;
  let Pts = m.PTS ?? null;
  if (Pts === null && W !== null && D !== null) Pts = 3 * W + D;
  let GD = m.GD ?? null;
  if (GD === null && GF !== null && GA !== null) GD = GF - GA;
  return { P, W, D, L, GF, GA, GD, Pts };
}

export default async function handler(req, res) {
  const lg = cap(String(req.query.lg || req.query.league || '').toLowerCase(), 24);
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!rl(req, res, 'standings')) return;
  res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=600, stale-while-revalidate=300');
  const fail = () => { res.setHeader('Cache-Control', 'no-store'); return res.status(200).json({ found: false }); };
  if (!LEAGUES.includes(lg)) return fail();
  try {
    const yr = seasonYear();
    const root = await cfetch(`${CORE}/leagues/${lg}/standings?season=${yr}&lang=en&region=us`, 7000, 60000);
    // First hop is usually a bare {$ref} (sometimes an items[] of $refs).
    const grefs = [];
    if (root) {
      if (typeof root.$ref === 'string') grefs.push(root.$ref);
      for (const g of (root.items || [])) {
        if (g && typeof g.$ref === 'string') grefs.push(g.$ref);
      }
    }
    const gud = [...new Set(grefs.filter(u => u.startsWith('http')))];
    if (!gud.length) return fail();
    // groups -> standings detail (usually 1; UCL-style multi-group handled)
    const gdots = await Promise.all(gud.slice(0, 8).map(u =>
      cfetch(u.replace(/^http:/, 'https:') + (u.includes('?') ? '' : '?lang=en&region=us'), 7000, 60000)));
    const groups = [];
    // groups doc holds items[] of $refs to standings detail docs (one more hop)
    const details = [];
    for (const gd of gdots) {
      if (!gd) continue;
      if (Array.isArray(gd.standings) && gd.standings.length) {
        details.push({ label: String(gd.displayName || gd.name || 'Table'), entries: gd.standings });
        continue;
      }
      for (const it of (gd.items || [])) {
        if (it && typeof it.$ref === 'string') details.push({ ref: it.$ref });
      }
    }
    for (const d of details.slice(0, 8)) {
      let entries = d.entries || null, label = 'Table';
      if (!entries) {
        const dd = await cfetch(String(d.ref).replace(/^http:/, 'https:'), 7000, 60000);
        if (!dd) continue;
        entries = Array.isArray(dd.standings) ? dd.standings : [];
        label = String(dd.displayName || dd.name || 'Table');
      }
      if (!entries.length) continue;
      // team objects in parallel (names, logos, form string)
      const teams = await Promise.all(entries.slice(0, 40).map(async (e) => {
        const ref = e && e.team && e.team.$ref;
        if (typeof ref !== 'string') return null;
        const t = await cfetch(ref.replace(/^http:/, 'https:'), 7000, 40000);
        if (!t || !t.id) return null;
        return t;
      }));
      // record details in parallel (W/D/L/GF/GA)
      const recs = await Promise.all(teams.map(async (t) => {
        if (!t) return null;
        const rr = t.record && t.record.$ref;
        if (typeof rr !== 'string') return null;
        const rj = await cfetch(rr.replace(/^http:/, 'https:'), 7000, 20000);
        const items = rj && Array.isArray(rj.items) ? rj.items : [];
        const tot = items.find(x => x && (x.type === 'total' || x.abbreviation === 'Total')) || items[0];
        return tot && Array.isArray(tot.stats) ? statsOf(tot.stats) : null;
      }));
      const rows = [];
      for (let i = 0; i < teams.length; i++) {
        const t = teams[i], st = recs[i];
        if (!t || !st || st.Pts === null) continue;
        const logos = Array.isArray(t.logos) ? t.logos : [];
        const logo = (logos.find(l => l && l.href) || {}).href || '';
        rows.push({
          id: String(t.id || ''), name: String(t.displayName || t.name || ''),
          short: String(t.shortDisplayName || ''), abbr: String(t.abbreviation || ''),
          logo: /^https:\/\//i.test(logo || '') ? logo : '',
          form: String(t.form || '').slice(0, 5),
          P: st.P, W: st.W, D: st.D, L: st.L, GF: st.GF, GA: st.GA, GD: st.GD, Pts: st.Pts,
        });
      }
      if (!rows.length) continue;
      rows.sort((a, b) => (b.Pts - a.Pts) || ((b.GD ?? -9999) - (a.GD ?? -9999)) ||
        ((b.GF ?? -9999) - (a.GF ?? -9999)) || String(a.name).localeCompare(String(b.name)));
      groups.push({ name: label, rows });
      if (groups.length >= 8) break;
    }
    if (!groups.length) return fail();
    return res.status(200).json({ found: true, lg, season: yr, groups });
  } catch { return fail(); }
}
