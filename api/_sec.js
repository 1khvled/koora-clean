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
export function hostBlocked(host) {
  try {
    let h = String(host || '').toLowerCase().trim();
    if (!h) return true;
    if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1); // IPv6 literal
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
  if (text.length > maxBytes) throw new Error('body too large');
  return text;
}
