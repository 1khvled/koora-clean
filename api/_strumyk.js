// api/_strumyk.js — shared Strumyk/flashscore-relay helpers (NOT a route;
// underscore files are excluded from the routing, like _sec.js).
// Owner-supplied 2026-10-20: their match pages are a JS shell over a
// flashscore feed relay:
//   day list : {FS_BASE}/f_1_<dayOffset>_2_en_1/  -> every football match
//              with ENGLISH names, kickoff, league, logos (one request/day)
//   per match: {FS_BASE}/dc_1_<id>   -> status / kickoff / score (277 bytes)
//              {FS_BASE}/df_sui_1_<id> -> event timeline in ENGLISH (minutes,
//              cards, subs) = an independent live-minute source
//   streams  : strumyk.pk/api/v1/match/FS:<id> -> channel tokens that point
//              at iplayer24.me/beta/<token>. Tokens are VERIFIED live before
//              we serve them (the upstream parks dead tokens on google.com,
//              and a dead token must never reach a player).
import { readCapped } from './_sec.js';

const FS_BASE = 'https://1.newsoccers.one/2/x/feed';
const FS_HDR = { 'X-Fsign': 'SW9D1eZo' };
const STRUMYK_API = 'https://strumyk.pk/api/v1';
export const IPLAYS = 'https://iplayer24.me/beta/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const _day = globalThis.__kooraStrumykDay || (globalThis.__kooraStrumykDay = new Map());
const _match = globalThis.__kooraStrumykMatch || (globalThis.__kooraStrumykMatch = new Map());

async function fetchT(url, opts = {}, ms = 4000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, redirect: 'manual', signal: ctrl.signal });
  } catch { return null; }
  finally { clearTimeout(t); }
}
const numOrNull = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isFinite(n) ? n : null;
};
// Day index in the feed's own timezone (flashscore lists by CET day).
export function cetDay(ms) {
  try {
    const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
    return Math.floor(Date.parse(s + 'T00:00:00Z') / 86400000);
  } catch { return Math.floor(ms / 86400000); }
}
function parseFsDay(txt) {
  const out = [];
  let league = '';
  for (const rec of String(txt || '').split('~')) {
    if (!rec) continue;
    const d = {};
    for (const part of rec.split('¬')) {
      const i = part.indexOf('÷');
      if (i > 0) { const k = part.slice(0, i); if (!(k in d)) d[k] = part.slice(i + 1); }
    }
    if (d.ZA && !d.AA) { league = d.ZA; continue; }
    const id = d.AA;
    if (!id || id.length < 6) continue;
    const h = d.AE || d.FH || '';
    const a = d.AF || d.FK || '';
    if (!h || !a) continue;
    const ko = parseInt(d.AD || '0', 10) || 0;
    if (!ko) continue;
    out.push({ id, h, a, ko, lg: league, hs: d.WU || '', as: d.WV || '' });
  }
  return out;
}
function parseFsKv(txt) {
  const d = {};
  for (const part of String(txt || '').split('¬')) {
    const i = part.indexOf('÷');
    if (i > 0) { const k = part.slice(0, i); if (!(k in d)) d[k] = part.slice(i + 1); }
  }
  return d;
}
function parseFsEvents(txt) {
  const out = [];
  let half = 1;
  for (const rec of String(txt || '').split('~')) {
    if (!rec) continue;
    const d = {};
    for (const part of rec.split('¬')) {
      const i = part.indexOf('÷');
      if (i > 0) { const k = part.slice(0, i); if (!(k in d)) d[k] = part.slice(i + 1); }
    }
    if (d.AC && /half/i.test(d.AC)) { half = /2nd|second/i.test(d.AC) ? 2 : 1; continue; }
    const m = String(d.IB || '').match(/^(\d{1,3})(?:\s*\+\s*(\d{1,2}))?'/);
    if (!m) continue;
    const base = parseInt(m[1], 10);
    const plus = m[2] ? parseInt(m[2], 10) : 0;
    if (!isFinite(base) || base < 1 || base > 130) continue;
    out.push({ min: base, plus, half, type: String(d.IK || ''), player: String(d.IF || '') });
  }
  return out;
}
export async function strumykDay(offset) {
  const key = 'd' + offset;
  try {
    const hit = _day.get(key);
    if (hit && Date.now() - hit.at < 600000) return hit.list;
    const r = await fetchT(`${FS_BASE}/f_1_${offset}_2_en_1/`, { headers: { 'User-Agent': UA, Accept: '*/*', ...FS_HDR } }, 6000);
    if (!r || !r.ok) return null;
    const list = parseFsDay(await readCapped(r, 1500000));
    if (!list.length) return null;
    _day.set(key, { at: Date.now(), list });
    return list;
  } catch { return null; }
}
// Our fixture -> their match. English names + kickoff proximity, scored with
// the same MAX-of-sides name gate as every other resolver (never a wrong
// match). arToksOf/enToksOf/streamScore are injected by the caller.
export async function strumykMatch(scorers, home, away, startIso) {
  const qStartMs = Date.parse(startIso || '') || 0;
  if (!qStartMs) return null;
  const qStartSec = qStartMs / 1000;   // feed kickoffs are SECONDS
  const { arToksOf, enToksOf } = scorers;
  const arH = arToksOf(home), arA = arToksOf(away);
  if (!arH.length || !arA.length) return null;
  const list = await strumykDay(cetDay(qStartMs) - cetDay(Date.now()));
  if (!list || !list.length) return null;
  const enH = (n) => enToksOf(n);
  const cands = [];
  for (const m of list) {
    if (Math.abs(m.ko - qStartSec) > 90 * 60) continue;
    const eh = enH(m.h), ea = enH(m.a);
    const sd = (at, et) => {
      if (!at.length || !et.length) return 99;
      let tot = 0;
      for (const t of at) {
        let best = Infinity;
        for (const e of et) {
          const d = scorers.editDist(t, e) / Math.max(t.length, e.length);
          if (d < best) best = d;
        }
        tot += best;
      }
      return tot / at.length;
    };
    const sc = Math.min(Math.max(sd(arH, eh), sd(arA, ea)), Math.max(sd(arH, ea), sd(arA, eh)));
    cands.push({ m, sc });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.sc - b.sc);
  const b0 = cands[0];
  if (!(b0.sc <= 0.55)) return null;
  return b0.m;
}
// A token is only usable if the upstream actually serves a player for it.
async function streamAlive(url) {
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout ? AbortSignal.timeout(1800) : undefined,
    });
    if (!r || !r.ok) return false;
    const fin = String(r.url || url);
    if (/google|doubleclick|adservice|adsystem|blogspot/i.test(fin)) return false;
    try { if (r.body && r.body.cancel) r.body.cancel(); } catch {}
    return true;
  } catch { return false; }
}
// Per-match detail: status, score, live minute (+ English events) and -- when
// asked for -- the verified English stream tokens.
export async function strumykDetail(m, wantStreams) {
  if (!m || !m.id) return null;
  const hit = (() => { try { return _match.get(m.id) || null; } catch { return null; } })();
  const fresh = !!(hit && Date.now() - hit.at < 600000);
  const out = fresh ? { ...hit.d } : { id: m.id, status: '', ko: m.ko, hs: null, as: null, min: null, plus: 0, half: 1, streams: [] };
  if (!fresh) {
    const dcP = (async () => {
      try {
        const r = await fetchT(`${FS_BASE}/dc_1_${m.id}`, { headers: { 'User-Agent': UA, Accept: '*/*', ...FS_HDR } }, 4000);
        if (!r || !r.ok) return null;
        return parseFsKv(await readCapped(r, 40000));
      } catch { return null; }
    })();
    const evP = (async () => {
      try {
        const r = await fetchT(`${FS_BASE}/df_sui_1_${m.id}`, { headers: { 'User-Agent': UA, Accept: '*/*', ...FS_HDR } }, 4500);
        if (!r || !r.ok) return null;
        return parseFsEvents(await readCapped(r, 500000));
      } catch { return null; }
    })();
    const [d, evs] = await Promise.all([dcP, evP]);
    if (d) {
      out.status = String(d.DA || '');
      out.hs = numOrNull(d.DE);
      out.as = numOrNull(d.DF);
      if (d.DC) out.ko = parseInt(d.DC, 10) || out.ko;
    }
    if (evs && evs.length) {
      let best = null;
      for (const e of evs) {
        const v = e.min + (e.plus || 0);
        if (!best || v > best.min + (best.plus || 0)) best = e;
      }
      if (best) { out.min = best.min; out.plus = best.plus || 0; out.half = best.half || 1; }
    }
  }
  const probed = !!(hit && hit.probed);
  if (wantStreams && !probed && out.streams.length === 0 && out.status === '2') {
    try {
      const r = await fetchT(`${STRUMYK_API}/match/${encodeURIComponent('FS:' + m.id)}`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      }, 2200);
      if (r && r.ok) {
        const j = JSON.parse(await readCapped(r, 200000));
        const toks = (j && j.custom_urls) || [];
        const alive = await Promise.all(toks.slice(0, 3).map(async (u) => {
          try {
            if (!u || !u.url) return null;
            const tok = String(u.url).replace(/[^a-f0-9]/gi, '').toLowerCase();
            if (!/^[a-f0-9]{32}$/.test(tok)) return null;
            const url = IPLAYS + tok;
            if (!(await streamAlive(url))) return null;
            return { url, name: String(u.name || 'EN') };
          } catch { return null; }
        }));
        out.streams = alive.filter(Boolean);
      }
    } catch {}
  }
  try { _match.set(m.id, { at: Date.now(), d: out, probed: probed || (wantStreams && out.status === '2') }); } catch {}
  return out;
}
export function sfAnchor(d) {
  return (d && d.min && d.status === '2')
    ? { min: d.min, plus: d.plus || 0, half: d.half || 1, at: Date.now() }
    : null;
}
