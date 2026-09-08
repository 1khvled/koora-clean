export default async function handler(req, res) {
  // HLS proxy for DaddyLive streams (added 2026-09-09 — the "Access Denied /
  // not available on your domain" fix). The stream CDN only answers when the
  // HTTP Referer is the exact DaddyLive leaf page URL, which browsers on OUR
  // domain can never send (Referer is unspoofable client-side, and no
  // referrerpolicy value helps). So this proxy re-sends every playlist,
  // segment and key request with the leaf URL as Referer, and rewrites
  // playlists so all sub-URLs point back here. The player then plays NATIVE
  // HLS (hls.js) — no iframe, no ads, full control.
  // Usage: /api/hls?u=<absolute https URL>&ref=<leaf page URL>
  //
  // COST WARNING: video bytes flow through Vercel (~2.5GB/hour/viewer at the
  // single 1080p50 rendition DaddyLive serves). The 100GB/mo free tier covers
  // roughly 40 viewer-hours. To disable, stop emitting `hls` entries in
  // api/player.js (resolveDaddy) — iframe fallbacks keep working for sources
  // that don't gate (hd7/vipbox).
  const u = (req.query.u || '').toString();
  const ref = (req.query.ref || '').toString();
  let target, refUrl;
  try { target = new URL(u); refUrl = new URL(ref); } catch {
    return res.status(400).json({ error: 'bad u or ref' });
  }
  if (target.protocol !== 'https:')
    return res.status(400).json({ error: 'https only' });
  // ref must look like a DaddyLive leaf page (keeps this from becoming a
  // generic open proxy): /premiumtv/daddyN.php on any https host.
  if (!/\/premiumtv\/daddy\d+\.php/i.test(refUrl.pathname))
    return res.status(400).json({ error: 'bad ref' });

  res.setHeader('Access-Control-Allow-Origin', '*');

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
  const proxied = (abs) => '/api/hls?u=' + encodeURIComponent(abs) + '&ref=' + encodeURIComponent(refUrl.toString());

  // Fetch with manual redirect handling so the spoofed Referer is re-applied
  // on every hop (fetch() does not guarantee header forwarding across hosts).
  const fetchUp = async (url, ms, range) => {
    let cur = url;
    for (let hop = 0; hop < 4; hop++) {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), ms);
      let r;
      try {
        r = await fetch(cur, {
          signal: ctrl.signal,
          redirect: 'manual',
          headers: {
            'User-Agent': UA,
            'Accept': '*/*',
            'Referer': refUrl.toString(),
            ...(range ? { Range: range } : {}),
          },
        });
      } finally { clearTimeout(to); }
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
        cur = new URL(r.headers.get('location'), cur).toString();
        if (!cur.startsWith('https://')) throw new Error('redirect off-https');
        continue;
      }
      return r;
    }
    throw new Error('too many redirects');
  };

  try {
    const range = req.headers.range;
    const up = await fetchUp(target.toString(), 15000, range);
    if (up.status === 403 || up.status === 401)
      return res.status(502).json({ error: 'stream denied (expired token?)' });
    if (!up.ok && up.status !== 206)
      return res.status(502).json({ error: 'upstream ' + up.status });

    const ct = (up.headers.get('content-type') || '').toLowerCase();
    const looksPlaylist = /\.m3u8?(\?|#|$)/i.test(target.pathname) || ct.includes('mpegurl') || ct.includes('x-mpegurl');

    if (looksPlaylist) {
      let text = await up.text();
      if (!text.startsWith('#EXTM3U')) {
        // Not actually a playlist (e.g. an error page) — don't poison the player.
        return res.status(502).json({ error: 'not a playlist' });
      }
      if (text.length > 500000) return res.status(502).json({ error: 'playlist too large' });
      const base = up.url && up.url.startsWith('https://') ? up.url : target.toString();
      text = text.split('\n').map(line => {
        const t = line.trim();
        if (!t) return line;
        if (t.startsWith('#')) {
          // Rewrite URI="..." attributes (keys, maps, media).
          return line.replace(/URI="([^"]+)"/g, (mm, uri) => {
            try { return 'URI="' + proxied(new URL(uri, base).toString()) + '"'; }
            catch { return mm; }
          });
        }
        try { return proxied(new URL(t, base).toString()); }
        catch { return line; }
      }).join('\n');
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(text);
    }

    // Segments / keys: byte passthrough with Range support.
    const clen = +(up.headers.get('content-length') || 0);
    if (clen > 12000000) return res.status(502).json({ error: 'segment too large' });
    const buf = Buffer.from(await up.arrayBuffer());
    if (buf.length > 12000000) return res.status(502).json({ error: 'segment too large' });
    const outCt = up.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', outCt);
    // Live segments are URL-unique (signed URLs rotate) — safe to cache.
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (up.status === 206) {
      res.setHeader('Content-Range', up.headers.get('content-range') || '');
      res.setHeader('Accept-Ranges', 'bytes');
      return res.status(206).send(buf);
    }
    res.setHeader('Accept-Ranges', 'bytes');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ error: String((e && e.message) || e).slice(0, 160) });
  }
}
