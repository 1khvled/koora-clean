// api/_sec.js — shared server-side guards for koora-clean Vercel functions.
// Best-effort + fail-closed helpers: input caps, generous per-IP rate limits,
// SSRF gates (private-network fetch refusal), Host-header validation.
// No dependencies. Imported as: import { rl, cap, selfOrigin, fetchableUrl } from './_sec.js';

// Cap user-controlled strings (length only — content is matched/escaped downstream).
export const cap = (v, max) => String(v == null ? '' : v).slice(0, max);

// Generous sliding-window rate limit: 300 req / 60s per (endpoint, IP).
// Deliberately lenient: mobile carrier NAT shares IPs across users, and every
// client call fail-opens on non-2xx. Only scripted floods ever see 429.
const buckets = globalThis.__kooraRl || (globalThis.__kooraRl = new Map());
export function rl(req, res, name, max = 300, windowMs = 60000) {
  try {
    const fwd = (req.headers['x-forwarded-for'] || '').toString().split(',').filter(Boolean);
    // Vercel appends the real client IP, so trust the LAST entry, not the first.
    const sock = (req.socket && req.socket.remoteAddress) || '';
    const ip = (fwd.length ? fwd[fwd.length - 1] : sock).toString().trim().slice(0, 64) || 'unknown';
    const now = Date.now();
    const key = name + '|' + ip;
    let arr = buckets.get(key);
    if (!arr) { arr = []; buckets.set(key, arr); }
    while (arr.length && arr[0] <= now - windowMs) arr.shift();
    if (arr.length >= max) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      res.status(429).json({ error: 'rate limited' });
      return false;
    }
    arr.push(now);
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) {
        if (!v.length || v[v.length - 1] <= now - windowMs) buckets.delete(k);
        if (buckets.size <= 4000) break;
      }
    }
    return true;
  } catch { return true; } // limiter must never break legit traffic
}

// True when a hostname (or IP literal) points at non-public space.
// Blocks: loopback, RFC1918, link-local (incl. cloud metadata 169.254.x),
// 0.0.0.0, ::, multicast, .local/.internal/.lan/.home/.corp, 'localhost',
// single-label names. NOTE: DNS-rebinding hostnames can't be caught here.
// Expand an IPv6 literal to 8 numeric groups (null when invalid).
// Handles :: compression plus embedded tails in both dotted form
// (::ffff:127.0.0.1) and hex form (::ffff:7f00:1).
function v6groups(h) {
  try {
    let s = String(h);
    let tail = null;
    const v4m = s.match(/:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (v4m) {
      const pp = v4m[1].split('.').map(Number);
      if (pp.some((n) => !(n >= 0 && n <= 255))) return null;
      tail = [((pp[0] << 8) | pp[1]) & 0xffff, ((pp[2] << 8) | pp[3]) & 0xffff];
      s = s.slice(0, s.length - v4m[0].length);
    }
    const parts = s.split('::');
    if (parts.length > 2) return null;
    const L = parts[0] ? parts[0].split(':') : [];
    const R = (parts.length === 2 && parts[1]) ? parts[1].split(':') : [];
    for (const gg of [...L, ...R]) if (!/^[0-9a-f]{1,4}$/i.test(gg)) return null;
    const ln = L.map((gg) => parseInt(gg, 16));
    const rn = R.map((gg) => parseInt(gg, 16));
    if (tail) {
      if (ln.length + rn.length > 6) return null;
      if (parts.length === 1 && ln.length !== 6) return null;
      const zeros = new Array(6 - ln.length - rn.length).fill(0);
      return [...ln, ...zeros, ...rn, ...tail];
    }
    if (parts.length === 2) {
      const zeros = 8 - ln.length - rn.length;
      if (zeros < 0) return null;
      return [...ln, ...new Array(zeros).fill(0), ...rn];
    }
    if (ln.length !== 8) return null;
    return ln;
  } catch { return null; }
}

export function hostBlocked(host) {
  try {
    let h = String(host || '').toLowerCase().trim();
    if (!h) return true;
    if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1); // IPv6 literal
    // Numeric IPv6 gate first: expanded comparison so 0:0:0:0:0:0:0:1 and
    // ::ffff:7f00:1 are refused exactly like ::1 / 127.0.0.1. Non-blocking
    // results fall through to the string checks below (never weakens them).
    if (h.includes(':')) {
      const g = v6groups(h);
      if (!g) return true; // colon host that is no valid literal: refuse
      if (g.every((v) => v === 0)) return true; // ::
      if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0 && g[6] === 0 && g[7] === 1) return true; // ::1
      if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
      if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
      if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
      if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) {
        const a = (g[6] >> 8) & 255, b = g[6] & 255, c = (g[7] >> 8) & 255, d = g[7] & 255;
        if (a === 0 && b === 0 && c === 0 && d === 0) return true;
        if (a === 10 || a === 127) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 169 && b === 254) return true;
        if (a >= 224) return true;
      }
    }
    if (h === 'localhost' || h.endsWith('.localhost')) return true;
    if (h === '0.0.0.0' || h === '::' || h === '::1' || h === '::ffff:0:0:0:0') return true;
    if (/^(10|127)\./.test(h)) return true;
    let m = h.match(/^172\.(1[6-9]|2\d|3[01])\./);
    if (m) return true;
    if (/^192\.168\./.test(h)) return true;
    if (/^169\.254\./.test(h)) return true;
    if (/^::ffff:(10|127)\./.test(h)) return true;
    m = h.match(/^::ffff:(172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/);
    if (m) return true;
    if (/^224\./.test(h) || /^ff/i.test(h)) return true; // multicast
    if (/\.local$|\.localdomain$|\.internal$|\.lan$|\.home$|\.corp$|\.test$|\.example$|\.invalid$/.test(h)) return true;
    if (!h.includes('.') && !h.includes(':')) return true; // single-label
    return false;
  } catch { return true; }
}

// Gate for server-side fetches of upstream-discovered URLs:
// absolute https only, no userinfo, default port, public host.
export function fetchableUrl(u) {
  try {
    const x = new URL(String(u || '').trim());
    if (x.protocol !== 'https:') return null;
    if (x.username || x.password) return null;
    if (x.port && x.port !== '443') return null;
    if (hostBlocked(x.hostname)) return null;
    return x.toString();
  } catch { return null; }
}

// Validate the Host header before using it to call ourselves (poisoned Host
// would turn the self-lookup into a request to an attacker host).
// Falls back to the production origin — match data is identical there.
export function selfOrigin(req) {
  try {
    const h = ((req.headers.host || '').toString().toLowerCase().split(':')[0] || '').trim();
    if (h === 'kooraadz.vercel.app') return 'https://kooraadz.vercel.app';
    if (/^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?\.vercel\.app$/.test(h)) return 'https://' + h;
  } catch {}
  return 'https://kooraadz.vercel.app';
}

// Bounded body read: refuse absurd content-lengths up front, enforce after.
export async function readCapped(res, maxBytes) {
  const clen = +((res.headers && res.headers.get('content-length')) || 0);
  if (clen > maxBytes) throw new Error('body too large');
  const text = await res.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new Error('body too large');
  return text;
}
