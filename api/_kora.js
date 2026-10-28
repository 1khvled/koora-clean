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
    // Channel list (AR/EN, Custom/Frame) — the resolver turns the Frame ones
    // into in-page sources through /api/kora-stream (see koraPlaylist).
    channels: Array.isArray(best.channels) ? best.channels : [],
  };
}

// ---- In-page playback (owner 2026-10-28) --------------------------------
// "Frame" channels (Live 1..N) are thin wrappers around
// a*.kora-plus.li/framestream.php. The page mints a token that decodes to a
// playlist path; the SEGMENTS live on a.refram1.space and DO send
// `Access-Control-Allow-Origin: *` (measured on framestream + framelatin).
// Only the tiny playlist is CORS-closed — so we fetch it server-side and hand
// it to our own hls.js. Video bytes come straight from their CDN: in-page
// playback with no bandwidth through us. Custom channels (b1/alwan1/main)
// serve segments from kora-plus.li with NO CORS at all, so they stay newTab.
const KEDGE = ['a11', 'a12', 'a13', 'a14', 'a15', 'a16'];
const SEG_OK = /(^|\.)refram1\.space$/i;
const _mCache = globalThis.__koraMatchCache || (globalThis.__koraMatchCache = new Map());
const _pCache = globalThis.__koraStreamCache || (globalThis.__koraStreamCache = new Map());

async function aGet(url, ms, headers, max) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers, redirect: 'follow' });
    if (!r.ok) return null;
    const txt = await r.text();
    if (!txt || (max && txt.length > max)) return null;
    return txt;
  } catch { return null; }
  finally { clearTimeout(to); }
}

async function matchChannels(id) {
  const hit = _mCache.get(id);
  if (hit && Date.now() - hit.at < 45000) return hit.data;
  const d = await getJson('/matche/' + id + '?t=' + Date.now(), 3500, true);
  const m = d && (d.match || d);
  const data = m && Array.isArray(m.channels) ? m : null;
  if (data) {
    if (_mCache.size > 60) _mCache.clear();
    _mCache.set(id, { at: Date.now(), data });
  }
  return data;
}

// Provider wrapper -> the frame page that mints the token. strict allowlist,
// so a tampered payload can never point us at an arbitrary host.
function frameFor(link) {
  try {
    const u = new URL(String(link || ''));
    if (u.protocol !== 'https:') return null;
    if (!/(^|\.)sportiskos\.space$/i.test(u.hostname)) return null;
    const id = u.searchParams.get('id') || '';
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(id)) return null;
    if (u.pathname === '/streameast.html') return { page: 'framestream.php', q: 'id', id };
    if (u.pathname === '/streamlat.html') return { page: 'framelatin.php', q: 'ch', id };
    return null;
  } catch { return null; }
}

async function mint(edge, f) {
  const url = 'https://' + edge + '.kora-plus.li/' + f.page + '?' + f.q + '=' + encodeURIComponent(f.id);
  const html = await aGet(url, 3500, {
    'User-Agent': UA,
    Referer: 'https://sportiskos.space/',
    Origin: 'https://sportiskos.space',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Dest': 'iframe',
    'Sec-Fetch-User': '?1',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  }, 80000);
  if (!html) return null;
  const tok = (html.match(/token:\s*"([^"]+)"/) || [])[1];
  if (!tok) return null;
  let dec = '';
  try { dec = atob(String(tok).replace(/-/g, '+').replace(/_/g, '/')); } catch { return null; }
  let purl = null;
  try { purl = new URL(dec, 'https://' + edge + '.kora-plus.li/'); } catch { return null; }
  if (!/(^|\.)kora-plus\.(li|app|mov)$/i.test(purl.hostname)) return null;
  const exp = Number((html.match(/exp:\s*(\d+)/) || [])[1] || 0);
  return { purl: purl.href, exp };
}

// Playlist body for our hls.js, or null when the channel cannot play in-page.
export async function koraPlaylist(matchId, idx) {
  const id = String(matchId || '').replace(/[^0-9]/g, '').slice(0, 12);
  const i = Number(idx);
  if (!id || !Number.isInteger(i) || i < 0 || i > 23) return null;
  const ck = id + ':' + i;
  const ok = _pCache.get(ck);
  if (ok && Date.now() - ok.at < 2500) return ok.body;
  const m = await matchChannels(id);
  if (!m) return null;
  const ch = (m.channels || [])[i];
  if (!ch || String(ch.type) !== 'Frame' || !ch.link) return null;
  const f = frameFor(ch.link);
  if (!f) return null;
  const tk = 'tok:' + ck;
  let hit = _pCache.get(tk);
  if (!hit || !hit.purl || (hit.exp && hit.exp * 1000 - Date.now() < 120000)) {
    const edge = KEDGE[(Number(id) + i) % KEDGE.length] || 'a13';
    const minted = await mint(edge, f);
    if (!minted) return null;
    hit = minted;
    if (_pCache.size > 80) _pCache.clear();
    _pCache.set(tk, hit);
  }
  const pl = await aGet(hit.purl, 3500, { 'User-Agent': UA }, 400000);
  if (!pl || !pl.startsWith('#EXTM3U')) { _pCache.delete(tk); return null; }
  // Absolute segment URLs on the allowlisted CDN only — anything else would
  // be CORS-closed for a browser player, so refuse instead of dead button.
  const out = [];
  for (const line of pl.split(/\r?\n/)) {
    if (!line || line[0] === '#') { out.push(line); continue; }
    let u;
    try { u = new URL(line, hit.purl); } catch { return null; }
    if (!SEG_OK.test(u.hostname)) return null;
    out.push(u.href);
  }
  const body = out.join('\n');
  if (_pCache.size > 80) _pCache.clear();
  _pCache.set(ck, { at: Date.now(), body });
  return body;
}
