// api/_kora.js — shared Kora-API helpers (NOT a route; underscore files are
// excluded from routing, like _sec.js / _streamfree.js).
//
// Owner-supplied 2026-10-28: https://yacinews.com is the new Yacine TV
// front-end. The old yacinelive HTML chain (day page -> card -> playerv5) is
// GONE: yacinelive/yacinews now render from a JSON API, and yasirtv.com's TLS
// certificate no longer matches its host (browsers refuse it). This module is
// the replacement source.
//
// Data path: https://cdn.kora-api.org/api/v1/matches -> text starting "k1"
//   = custom base64url alphabet + character REVERSE -> AES-256-GCM payload.
//   (Recovered from their own bundle; the key is a site-wide constant.)
// Playback:  https://<live_domain>/kora.html?m=<id>&ref=<our host>
//
// IMPORTANT — why this is a new-tab source and not an in-stage iframe:
//   1. their channel player (a*.kora-plus.li/frame.php) ships
//      `Content-Security-Policy: frame-ancestors 'self' https://kora-plus.*
//      https://*.sportycos.com` — every other embedding origin is blocked by
//      the browser (measured: chrome-error inside our sandboxed stage);
//   2. the raw HLS playlist they expose has NO CORS header, so a browser
//      player on our origin could not read it even if we served the URL;
//   3. our own CSP only allows media from our media hosts.
// kora.html itself has no X-Frame-Options/CSP and plays perfectly TOP-LEVEL
// (verified: b1.m3u8 + .ts segments 200). So the player opens it in a new tab
// — same pattern as StreamFree (CONTEXT 183), sandbox untouched.

const API = 'https://cdn.kora-api.org/api/v1';
const KEY_B64 = 'vqW3n/yB1R+GwSPc4kJs2dCkV7kRmXaNy3lQ/3XkHJI=';
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const CUSTOM = 'MiljRIn9PX1o63wGBYTtFsKmEkSur-pC_U02cvzAdy5e8ZqLDgJ4OhVN7QbHxfWa';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const REF = 'kooraadz.vercel.app';

const _list = globalThis.__kooraKapiList || (globalThis.__kooraKapiList = { at: 0, data: null });

const b64bytes = (b64) => {
  const bin = atob(String(b64 || '').replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

let _keyP = null;
const aesKey = () => {
  if (!_keyP) {
    _keyP = crypto.subtle.importKey('raw', b64bytes(KEY_B64), 'AES-GCM', false, ['decrypt'])
      .catch(() => { _keyP = null; return null; });
  }
  return _keyP;
};

// Their payload: drop the "k1" prefix, reverse the characters, map the custom
// alphabet back to base64url, then AES-GCM (iv = first 12 bytes).
export async function koraDecode(text) {
  const s = String(text == null ? '' : text);
  if (!s.startsWith('k1')) return JSON.parse(s);
  let mapped = '';
  const body = s.slice(2);
  for (let i = body.length - 1; i >= 0; i--) {
    const idx = CUSTOM.indexOf(body[i]);
    if (idx < 0) throw new Error('kora: bad payload');
    mapped += ALPHA[idx];
  }
  const b64 = mapped.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = b64bytes(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const key = await aesKey();
  if (!key) throw new Error('kora: no key');
  const iv = bytes.subarray(0, 12);
  const data = bytes.subarray(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return JSON.parse(new TextDecoder().decode(plain));
}

async function getJson(path, ms, needOrigin) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const headers = { 'User-Agent': UA, Accept: 'application/json' };
    // The list endpoint answers without Referer; the per-match endpoint only
    // returns data when Origin/Referer look like a real player.
    if (needOrigin) {
      headers.Origin = 'https://robotiva.online';
      headers.Referer = 'https://robotiva.online/kora.html';
    }
    const r = await fetch(API + path, { signal: ctrl.signal, headers, redirect: 'follow' });
    if (!r.ok) return null;
    const txt = await r.text();
    if (!txt || txt.length > 200000) return null;
    return await koraDecode(txt);
  } catch { return null; }
  finally { clearTimeout(t); }
}

// Day list (their day window, ~1-2 days). Cached 2 min: every fixture on the
// site resolves from the same snapshot, so a busy evening costs one fetch.
export async function koraList(ms) {
  if (_list.data && Date.now() - _list.at < 120000) return _list.data;
  const d = await getJson('/matches', ms || 4500, false);
  const list = d && Array.isArray(d.matches) ? d : null;
  if (list) { _list.at = Date.now(); _list.data = list; }
  return _list.data;
}

// Arabic-loose normalize (same rules as player.js normAr) so the API's names
// ("الرجاء", "مان سيتي") still line up with ours ("الرجاء البيضاوي",
// "مانشستر سيتي").
const normAr = (s) => (s || '').toString()
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[ً-ْٰ]/g, '').replace(/\s+/g, ' ').trim();

const teamScore = (q, c) => {
  if (!q || !c) return 0;
  if (q === c) return 2;
  if (q.includes(c) || c.includes(q)) return 1.5;
  const qt = q.split(' ').filter(t => t.length > 1);
  const ct = c.split(' ').filter(t => t.length > 1);
  if (!qt.length || !ct.length) return 0;
  let hit = 0;
  for (const t of qt) {
    if (ct.some(u => u === t || (u.length > 2 && t.length > 2 && (u.includes(t) || t.includes(u))))) hit++;
  }
  return hit / Math.max(qt.length, ct.length);
};

// Our fixture -> their player page URL, or null. Same strict gate as Arena:
// BOTH sides must add up to >= 2.5 of 4 and the kickoff must be within 90
// minutes — a miss stays a miss, never another game's stream.
export async function koraMatch(home, away, startIso, opts) {
  const en = !!(opts && opts.en);
  const nH = normAr(home), nA = normAr(away);
  if (!nH || !nA) return null;
  const qMs = Date.parse(startIso || '') || 0;
  const d = await koraList();
  if (!d) return null;
  const list = d.matches || [];
  let best = null, bestScore = -1, bestDt = null;
  for (const m of list) {
    if (!m || m.active !== 1 || m.has_channels !== 1) continue;
    // stream_open = their own "the feed is live right now" flag: a future or
    // finished fixture never becomes a dead button.
    if (m.stream_open !== true) continue;
    if (en && m.en_display === 0) continue;
    if (!en && m.ar_display === 0) continue;
    const t1 = normAr(m.home && (m.home.name_ar || m.home.name));
    const t2 = normAr(m.away && (m.away.name_ar || m.away.name));
    if (!t1 || !t2) continue;
    const straight = teamScore(nH, t1) + teamScore(nA, t2);
    const swapped = teamScore(nH, t2) + teamScore(nA, t1);
    const score = Math.max(straight, swapped);
    if (score < 2.5) continue;
    const kMs = Date.parse(String(m.date || '') + 'T' + String(m.time || '') + ':00Z') || 0;
    const dt = qMs && kMs ? Math.abs(kMs - qMs) / 60000 : null;
    if (dt != null && dt > 90) continue;
    if (score > bestScore || (score === bestScore && dt != null && bestDt != null && dt < bestDt)) {
      best = m; bestScore = score; bestDt = dt;
    }
  }
  if (!best) return null;
  const dom = String((en && d.en_live_domain) || d.live_domain || '').trim();
  if (!/^[a-z0-9.-]+$/i.test(dom)) return null;
  const id = String(best.id || '').replace(/[^0-9]/g, '');
  if (!id) return null;
  return {
    id,
    url: 'https://' + dom + '/kora.html?m=' + id + '&ref=' + REF,
    score: bestScore,
    dt: bestDt,
    league: (best.league && (best.league.name_ar || best.league.name)) || '',
  };
}
