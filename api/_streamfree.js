// api/_streamfree.js — shared StreamFree helpers (NOT a route; underscore files
// are excluded from routing, like _sec.js).
// Owner-supplied 2026-10-20: https://streamfree.top/player/<sport>/<slug>
// Their robots.txt disallows /api/, /embed/, /get-stream-key/ and /internal/,
// so we touch ONLY the allowed public pages: the player page itself and the
// sitemap they publish for crawlers. The page then loads its own stream (same
// as a human visitor); our iframe sandbox blocks popups and top-navigation,
// and our service worker blocks the ad/pop hosts it pulls in.
const SF_SITE = 'https://streamfree.top';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const _idx = globalThis.__kooraStreamfreeIdx || (globalThis.__kooraStreamfreeIdx = { at: 0, list: [] });

const titleCase = (s) => String(s || '').split('-').map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(' ');
// "villarreal-vs-liverpool" -> ["Villarreal", "Liverpool"]
export function slugTeams(slug) {
  const raw = String(slug || '').split(/-(?:v|vs)\s*-/i);
  const parts = String(slug || '').split(/-vs-/i);
  if (parts.length >= 2) return [titleCase(parts[0]), titleCase(parts.slice(1).join('-vs-'))];
  return raw.length >= 2 ? [titleCase(raw[0]), titleCase(raw.slice(1).join('-'))] : null;
}
const EN_STOP = new Set(['vs', 'fc', 'sc', 'ac', 'cf', 'as', 'kf', 'fk', 'sk', 'if', 'bk', 'cd', 'ud', 'ssc']);
const noVow = (s) => s.replace(/[aeiou]/g, '');
const normLat = (s) => (s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
// English tokens in BOTH forms: the devoweled one (matches Arabic, which has
// no short vowels) AND the spelled-out one (Arabic cannot express them, so
// "Aek" -> "k" would be a 1-char token and get dropped). The matcher takes
// the best of the two, which fixes transliterations that lose a vowel.
const enTokens = (name) => normLat(name || '')
  .replace(/v/g, 'f').replace(/p/g, 'b').split(' ')
  .flatMap((w) => {
    const d = noVow(w);
    const out = [];
    if (d && d.length >= 2 && !EN_STOP.has(d)) out.push(d);
    if (w && w.length >= 3 && !EN_STOP.has(w)) out.push(w);
    return out;
  });
async function getText(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' } });
    if (!r.ok) return null;
    const txt = await r.text();
    if (!txt || txt.length > 400000) return null;
    return txt;
  } catch { return null; }
  finally { clearTimeout(t); }
}
// The sitemap they publish for crawlers -> the current match pages.
export async function streamfreeIndex() {
  if (Date.now() - _idx.at < 1800000 && _idx.list.length) return _idx.list;   // 30 min
  const txt = await getText(SF_SITE + '/sitemap.xml', 6000);
  if (!txt) return _idx.list;
  const list = [];
  for (const m of txt.matchAll(/<loc>\s*https?:\/\/streamfree\.top\/player\/([a-z0-9_-]+)\/([^<]+?)\s*<\/loc>/gi)) {
    const sport = String(m[1] || 'soccer').toLowerCase();
    const slug = decodeURIComponent(String(m[2] || '')).trim().toLowerCase();
    if (!slug) continue;
    const teams = slugTeams(slug);
    if (!teams) continue;
    list.push({ sport, slug, h: teams[0], a: teams[1], url: SF_SITE + '/player/' + sport + '/' + slug });
  }
  if (list.length) { _idx.at = Date.now(); _idx.list = list; }
  return list;
}
// Our fixture -> their player page. Same strict MAX-of-sides name gate as
// every other resolver (never a wrong match); the sitemap carries no dates,
// so the name gate does the work and the page title verifies the hit.
export async function streamfreeMatch(scorers, home, away) {
  const list = await streamfreeIndex();
  if (!list || !list.length) return null;
  const { arToksOf, editDist } = scorers;
  const arH = arToksOf(home), arA = arToksOf(away);
  if (!arH.length || !arA.length) return null;
  const sd = (at, et) => {
    if (!at.length || !et.length) return 99;
    let tot = 0;
    for (const t of at) {
      let best = Infinity;
      for (const e of et) {
        const d = editDist(t, e) / Math.max(t.length, e.length);
        if (d < best) best = d;
      }
      tot += best;
    }
    return tot / at.length;
  };
  let best = null;
  for (const it of list) {
    const eh = enTokens(it.h), ea = enTokens(it.a);
    const sc = Math.min(Math.max(sd(arH, eh), sd(arA, ea)), Math.max(sd(arH, ea), sd(arA, eh)));
    if (!best || sc < best.sc) best = { it, sc };
  }
  if (!best || !(best.sc <= 0.55)) return null;
  return best.it;
}
// The page must still be the match we matched (the sitemap rotates daily).
export async function streamfreeVerify(page) {
  if (!page || !page.url) return false;
  const txt = await getText(page.url, 5000);
  if (!txt) return false;
  const m = txt.match(/<title[^>]*>([^<]{0,200})<\/title>/i);
  const title = m ? m[1] : '';
  if (!title) return false;
  if (/not found|404|error/i.test(title)) return false;
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const tt = norm(title);
  const lastA = norm(page.a).split(' ').pop();
  const lastH = norm(page.h).split(' ').pop();
  if (lastA && tt.indexOf(lastA) === -1) return false;
  if (lastH && tt.indexOf(lastH) === -1) return false;
  return true;
}
