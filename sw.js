// sw.js — network-level ad + telegram blocker for romabar-player
// Intercepts ALL fetches from the page (including iframe sub-requests where possible)
// and returns 204 for known ad/telegram domains.

const TELEGRAM_RE = /(^|[\/.])t\.me([/?#]|$)|telegram\.me|telegram\.org|telegram\.dog|tg:\/\/|joinchat/i;
const AD_RE = /(popads|popcash|adcash|propeller|onclkds|highperformancegate|highcpmgate|highcpm|exoclick|exo\.click|juicyads|hilltopads|doubleclick|googlesyndication|adsystem|adnxs|criteo|outbrain|taboola|zeroredirect|realsrv|adsterra|popunder)/i;
const BLOCK_RE = new RegExp(TELEGRAM_RE.source + '|' + AD_RE.source, 'i');

// 'gads'/'onclick' as bare substrings false-positive on query strings
// (?gads=, ?onclick=) and slugs — anchor them to host labels / path
// segments only (host+pathname, never the query). Keeps blocking power
// for onclickads-style hosts and /gads/ paths.
const segHit = (host, path) => {
  const parts = String(host || '').split('.').concat(String(path || '').split(/[\/\\]+/));
  return parts.some(s => { s = (s || '').toLowerCase(); return s === 'gads' || s === 'onclick' || s.startsWith('gads') || s.startsWith('onclick'); });
};

// Also block by path patterns common on romabar ad injections
// (anchored to path segments so legit ?telegram= query strings survive).
const PATH_BLOCK = /(\/|_|-)(telegram|join.?channel)($|[/_?#])/i;

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = event.request.url;
  // Match host+path only — never the query string (legit ?q=onclick params
  // must survive) and never bare relative asset URLs (no host to judge).
  let segAd = false, hp = url;
  try { const u = new URL(url); hp = u.hostname + u.pathname; segAd = segHit(u.hostname, u.pathname); } catch { segAd = false; }

  // block telegram + ads
  if (BLOCK_RE.test(hp) || PATH_BLOCK.test(hp) || segAd) {
    // notify page
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({type:'BLOCKED', reason: TELEGRAM_RE.test(hp) ? 'Telegram (SW)' : 'Ad (SW)', url: url.slice(0,120)}));
      })
    );
    // return empty response — prevents script/load
    return event.respondWith(new Response('', {
      status: 204,
      statusText: 'Blocked by SW',
      headers: {'Content-Type':'text/plain'}
    }));
  }

  // For navigation requests that look like telegram hijack, block
  if (event.request.mode === 'navigate' && TELEGRAM_RE.test(hp)) {
    return event.respondWith(new Response('', {status:204}));
  }

  // default: passthrough (don't cache, to keep stream fresh)
  return;
});
