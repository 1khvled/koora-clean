export default async function handler(req, res) {
  // 24/7 generic fallback channels extracted from the Alwan Sport app.js bundle
  // (added 2026-09-10): the bundle is a static public JS file (~30KB, no auth)
  // that embeds a `channels = [{id, name, url, type}, ...]` array. These are
  // ALWAYS-ON generic channels (not match-specific), so the player lists them
  // AFTER the match servers and BEFORE the fallback entry — last-resort viewing.
  //
  // Only `okru` and `iframe` types are returned: `hls` entries are Periscope
  // replay tokens that expire, and the frontend has no HLS player.
  // NEVER iframe the source page itself (ad-infested: ratecpm/popups,
  // telegram modal) — only the extracted embed URLs are used.
  // Fail-open: ANY error returns {count:0, channels:[]} with no-store so the
  // frontend simply hides the section. No credentials anywhere in this flow.
  const SRC = 'https://ahamadsport.yusf-dara1000.workers.dev/app.js';
  const fail = () => {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ count: 0, channels: [] });
  };

  // Hard 6s timeout (serverless-friendly: bundle + parallel verify must
  // fit inside the 10s Hobby budget).
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 6000);
  try {
    const up = await fetch(SRC, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        Accept: 'application/javascript,text/javascript,*/*',
      },
    }).finally(() => clearTimeout(to));
    if (!up.ok) return fail();
    // Size cap: bundle is ~30KB; refuse absurd bodies before buffering.
    const clen = +(up.headers.get('content-length') || 0);
    if (clen > 500000) return fail();
    const js = await up.text();
    if (!js || js.length > 500000) return fail();

    // Regex-extract the `channels = [...]` array. NEVER eval: the bundle is
    // third-party and may carry anything outside the array.
    const m = js.match(/channels\s*=\s*\[([\s\S]*?)\];/);
    if (!m) return fail();

    // Parse each flat {…} literal field-by-field with small regexes —
    // defensive by construction (no eval, no Function, no JSON.parse of JS).
    // NOTE: no cap here — liveness filtering below decides the final 6.
    const out = [];
    const BLOCK_RE = /javascript:|data:|blob:|t\.me|telegram/i;
    for (const obj of m[1].matchAll(/\{([^{}]*)\}/g)) {
      try {
        const body = obj[1];
        const idM = body.match(/id\s*:\s*(\d+)/);
        const nameM = body.match(/name\s*:\s*(?:"([^"]*)"|'([^']*)')/);
        const urlM = body.match(/url\s*:\s*(?:"([^"]*)"|'([^']*)')/);
        const typeM = body.match(/type\s*:\s*(?:"([^"]*)"|'([^']*)')/);
        if (!idM || !nameM || !urlM || !typeM) continue;
        const type = (typeM[1] !== undefined ? typeM[1] : typeM[2]).trim().toLowerCase();
        if (type !== 'okru' && type !== 'iframe') continue; // skip hls: expiring tokens, no HLS player
        const url = (urlM[1] !== undefined ? urlM[1] : urlM[2]).trim();
        if (!/^https:\/\//i.test(url)) continue;
        if (BLOCK_RE.test(url)) continue;
        const name = (nameM[1] !== undefined ? nameM[1] : nameM[2]).trim();
        if (!name) continue;
        const id = parseInt(idM[1], 10);
        if (!Number.isFinite(id)) continue;
        if (out.some((c) => c.url === url)) continue;
        out.push({ id, name: name.slice(0, 60), url });
      } catch { /* skip malformed entry, keep the rest */ }
    }

    // Playability gate (hardened): a bare 200 is NOT enough — ok.ru returns
    // 200 with near-identical shells for DELETED videos, and hosts die with
    // invalid TLS while staying "reachable". Each candidate is fetched and
    // sniffed for player-ready vs dead markers (verified: `notFound` appears
    // only in dead ok.ru shells). beIN entries first (big nights ride beIN).
    const beinScore = (c) => (/bein/i.test(c.name + ' ' + c.url) ? 0 : 1);
    const beinFirst = (a, b) => beinScore(a) - beinScore(b);
    const DEAD_RE = /notFound|videoDeleted|video_deleted|video-removed|contentDeleted|videoUnavailable/i;
    const sniffAlive = async (c) => {
      try {
        const ctrl2 = new AbortController();
        const to2 = setTimeout(() => ctrl2.abort(), 5000);
        const headers = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Referer': 'https://ahamadsport.yusf-dara1000.workers.dev/',
        };
        const get = (u) => fetch(u, { signal: ctrl2.signal, redirect: 'manual', headers });
        try {
          let r = await get(c.url);
          // Follow one same-scheme redirect, then sniff the final page
          // (redirect shells have no body to sniff).
          if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
            try { r = await get(new URL(r.headers.get('location'), c.url).toString()); } catch { return null; }
          }
          if (!r.ok) return null;
          const ct = (r.headers.get('content-type') || '').toLowerCase();
          if (!ct.includes('text/html')) return c; // non-HTML embeds pass on status
          const clen = +(r.headers.get('content-length') || 0);
          if (clen > 800000) return c; // huge shell — accept on status, don't buffer
          const html = await r.text();
          if (html.length < 2000) return null; // stub/block page, not a player
          if (DEAD_RE.test(html)) return null; // deleted/removed video shells
          if (/ok\.ru\//i.test(c.url)) return c; // 200 + full shell + no dead markers
          // iframe-network pages must actually contain a nested player
          return /<iframe|jwplayer|clappr|albaplayer|\.m3u8|bein/i.test(html) ? c : null;
        } finally { clearTimeout(to2); }
      } catch { return null; }
    };
    const alive = (await Promise.all(out.sort(beinFirst).map(sniffAlive))).filter(Boolean).slice(0, 6);

    res.setHeader('Cache-Control', 'public, s-maxage=120, max-age=60');
    return res.status(200).json({ count: alive.length, channels: alive });
  } catch {
    return fail();
  }
}
