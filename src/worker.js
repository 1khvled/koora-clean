/**
 * Cloudflare Worker — single entry point for koora-clean (Vercel replacement).
 *
 * 1. Serves every existing static file from Workers Assets (./public/).
 * 2. Dispatches /api/<name> to the UNCHANGED api/<name>.js Vercel handlers
 *    through a small req/res shim (req.query, req.socket, res.setHeader,
 *    res.status().json()/.send()/.end()).
 * 3. Replays vercel.json's security headers on every response.
 * 4. Replays vercel.json's rewrites/redirects (/watch/:id, /index.html).
 *
 * No secrets and no new dependencies. See scripts/copy-static.mjs.
 */

import alwan from '../api/alwan.js';
import athikoora from '../api/athikoora.js';
import espn from '../api/espn.js';
import form from '../api/form.js';
import fotmob from '../api/fotmob.js';
import highlights from '../api/highlights.js';
import matches from '../api/matches.js';
import player from '../api/player.js';
import poly from '../api/poly.js';
import sitemap from '../api/sitemap.js';
import standings from '../api/standings.js';
import strumyk from '../api/strumyk.js';

// The 12 Vercel "serverless function" routes. api/_*.js are shared modules,
// not routes — they get bundled through the imports above.
const ROUTES = {
  alwan, athikoora, espn, form, fotmob, highlights,
  matches, player, poly, sitemap, standings, strumyk,
};

const VERCEL_ORIGIN = 'https://kooraadz.vercel.app';

// Exact values from vercel.json. CSP includes BOTH refram1.space and
// kora-plus.mov in connect-src AND media-src (in-page HLS playback depends
// on it). Keep in sync with vercel.json if that file changes.
const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://pl31775792.profitableratecpmnetwork.com https://www.highrevenueformat.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data:; media-src 'self' blob: https://gamhed.online https://*.gamhed.online https://a.refram1.space https://*.refram1.space https://kora-plus.mov https://*.kora-plus.mov; connect-src 'self' https://a.refram1.space https://*.refram1.space https://kora-plus.mov https://*.kora-plus.mov https://site.api.espn.com https://*.supabase.co https://www.cloudflare.com https://ipapi.co https://pl31775792.profitableratecpmnetwork.com https://www.highrevenueformat.com https://protrafficinspector.com https://furiousexpansion.com https://fizzyacerbitymellow.com https://zoologyfibre.com https://kettledroopingcontinuation.com https://realizationnewestfangs.com; frame-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

/**
 * api/_sec.js selfOrigin() hardcodes the (now blocked) Vercel origin, and
 * api/sitemap.js uses it as its base URL. Rather than touch those handlers,
 * we redirect any server-side fetch to that origin back into this Worker,
 * and rewrite the origin string in API response bodies to the live origin.
 * Set once at module scope (never per-request) so concurrent requests cannot
 * clobber the patch.
 */
const nativeFetch = globalThis.fetch;
let selfDispatch = null;
globalThis.fetch = function kooraFetch(input, init) {
  let parsed;
  try {
    parsed = new URL(input instanceof Request ? input.url : input instanceof URL ? input.href : String(input));
  } catch {
    return nativeFetch(input, init);
  }
  if (parsed.origin === VERCEL_ORIGIN && typeof selfDispatch === 'function') {
    return selfDispatch(input instanceof Request ? input : new Request(parsed.href, init));
  }
  return nativeFetch(input, init);
};

function withSecurity(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  const body = response.status === 204 || response.status === 304 ? null : response.body;
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Vercel exposes repeated query keys as arrays and everything else as strings.
function parseQuery(searchParams) {
  const query = {};
  for (const [key, value] of searchParams) {
    if (Object.prototype.hasOwnProperty.call(query, key)) {
      const prev = query[key];
      query[key] = Array.isArray(prev) ? [...prev, value] : [prev, value];
    } else {
      query[key] = value;
    }
  }
  return query;
}

function makeRes() {
  const headers = new Headers();
  return {
    statusCode: 200,
    body: undefined,
    headers,
    setHeader(name, value) { headers.set(name, String(value)); return this; },
    getHeader(name) { return headers.get(name); },
    status(code) { this.statusCode = code; return this; },
    json(data) {
      if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8');
      this.body = JSON.stringify(data);
      return this;
    },
    send(data) {
      if (!headers.has('content-type')) headers.set('content-type', 'text/plain; charset=utf-8');
      this.body = typeof data === 'string' || data instanceof Uint8Array ? data : String(data);
      return this;
    },
    end() { if (this.body === undefined) this.body = ''; return this; },
  };
}

function notFound() {
  return new Response(JSON.stringify({ error: 'not found' }), {
    status: 404,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function dispatchApi(request, url) {
  const name = url.pathname.replace(/^\/api\//, '').replace(/\.js$/, '').replace(/\/+$/, '').split('/')[0];
  const handler = Object.prototype.hasOwnProperty.call(ROUTES, name) ? ROUTES[name] : null;
  if (!handler) return notFound();

  const reqHeaders = {};
  request.headers.forEach((value, key) => { reqHeaders[key] = value; });
  const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
  reqHeaders['x-forwarded-for'] = clientIp; // rl() trusts the LAST entry

  const req = {
    method: request.method,
    url: request.url,
    query: parseQuery(url.searchParams),
    headers: reqHeaders,
    socket: { remoteAddress: clientIp || 'unknown' },
    body: null,
  };

  const res = makeRes();
  try {
    await handler(req, res);
  } catch (error) {
    console.error('api handler failed', name, error);
    if (res.body === undefined && res.statusCode === 200) {
      res.statusCode = 500;
      res.setHeader('Cache-Control', 'no-store');
      res.json({ error: 'handler failed' });
    }
  }

  let body = res.body === undefined ? null : res.body;
  if (typeof body === 'string' && body.includes(VERCEL_ORIGIN)) {
    body = body.split(VERCEL_ORIGIN).join(new URL(request.url).origin);
  }
  return new Response(body, { status: res.statusCode, headers: res.headers });
}

// Used only by the patched global fetch above for the player.js self-lookup.
selfDispatch = (request) => dispatchApi(request, new URL(request.url));

function assetFetch(request, env, pathname) {
  const url = new URL(request.url);
  if (pathname !== undefined) url.pathname = pathname;
  return env.ASSETS.fetch(new Request(url.href, { headers: request.headers }));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/api/')) {
      return withSecurity(await dispatchApi(request, url));
    }

    // vercel.json redirect: /index.html -> / (permanent).
    if (path === '/index.html') {
      const dest = new URL(request.url);
      dest.pathname = '/';
      return withSecurity(new Response(null, { status: 308, headers: { Location: dest.pathname + dest.search } }));
    }

    // vercel.json rewrite: /watch/:id -> /player.html (URL stays unchanged).
    if (/^\/watch\/[^/]+\/?$/.test(path)) {
      return withSecurity(await assetFetch(request, env, '/player.html'));
    }

    // html_handling = "none" means the ASSETS binding needs an explicit map
    // for the site root (Vercel serves index.html there).
    if (path === '/') {
      return withSecurity(await assetFetch(request, env, '/index.html'));
    }

    return withSecurity(await assetFetch(request, env));
  },
};
