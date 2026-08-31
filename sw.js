// sw.js — network-level ad + telegram blocker for romabar-player
// Intercepts ALL fetches from the page (including iframe sub-requests where possible)
// and returns 204 for known ad/telegram domains.

const TELEGRAM_RE = /(t\.me|telegram\.me|telegram\.org|telegram\.dog|tg:\/\/|joinchat)/i;
const AD_RE = /(popads|popcash|adcash|propeller|onclkds|highperformancegate|highcpmgate|highcpm|exo\.click|juicyads|hilltopads|doubleclick|googlesyndication|adservice|adsystem|adnxs|criteo|outbrain|taboola|zeroredirect|realsrv|gads|adsterra|onclick|popunder)/i;
const BLOCK_RE = new RegExp(TELEGRAM_RE.source + '|' + AD_RE.source, 'i');

// Also block by path patterns common on romabar ad injections
const PATH_BLOCK = /(telegram|join.*channel|t\.me)/i;

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = event.request.url;
  const dest = event.request.destination; // script, image, iframe, etc.

  // block telegram + ads
  if (BLOCK_RE.test(url) || PATH_BLOCK.test(url)) {
    // notify page
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({type:'BLOCKED', reason: TELEGRAM_RE.test(url) ? 'Telegram (SW)' : 'Ad (SW)', url: url.slice(0,120)}));
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
  if (event.request.mode === 'navigate' && TELEGRAM_RE.test(url)) {
    return event.respondWith(new Response('', {status:204}));
  }

  // default: passthrough (don't cache, to keep stream fresh)
  return;
});
