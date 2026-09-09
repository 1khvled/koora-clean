export default async function handler(req, res) {
  // Personal IPTV (Xtream Codes) beIN bridge — added 2026-09-09.
  //
  // DESIGN: the account credentials live ONLY in Vercel env vars
  // (IPTV_SERVER / IPTV_USER / IPTV_PASS — set them in the Vercel dashboard,
  // NEVER in code). The browser never sees them: it gets channel ids and
  // /api/iptv proxy URLs, and every upstream request is made server-side.
  // There is intentionally NO generic URL parameter — actions are allowlisted
  // (`bein`, `play`, `seg`) and every id/URL is validated, so this cannot be
  // abused as an open proxy.
  //
  // COST WARNING: video bytes flow through Vercel (~2GB/hour/viewer). Also
  // note most IPTV subs (this one included) allow very few concurrent
  // connections — every site viewer consumes one of the owner's slots.
  // No default host on purpose — nothing about the owner's setup lives in the repo.
  const SERVER = (process.env.IPTV_SERVER || '').replace(/\/$/, '');
  const USER = process.env.IPTV_USER || '';
  const PASS = process.env.IPTV_PASS || '';
  const action = (req.query.action || '').toString();

  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!SERVER || !USER || !PASS) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'iptv not configured' });
  }
  let serverHost = '';
  try { serverHost = new URL(SERVER).hostname.toLowerCase(); }
  catch { return res.status(500).json({ error: 'bad IPTV_SERVER' }); }

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
  const api = async (params, ms = 20000) => {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(`${SERVER}/player_api.php?username=${encodeURIComponent(USER)}&password=${encodeURIComponent(PASS)}${params}`,
        { signal: ctrl.signal, headers: { 'User-Agent': UA } });
      return await r.json();
    } finally { clearTimeout(to); }
  };
  // Arabic beIN HD bouquet category (stable id on this panel).
  const BEIN_CAT = '108';
  const cleanName = (s) => (s || '').replace(/[◉▼⁸ᴷᴴᴰᵁ³⁴⁰ᴾᴿᴬᵂʰᵉᵛᶜˢˢᴮᴱ◉⚽️⚽▶️▶:;*#_]/gu, '').replace(/^\d+\s*K\s*/i, '').replace(/\s+/g, ' ').trim();

  try {
    // ---- channel list: beIN 1..3 (+News) from the Arabic HD bouquet ----
    if (action === 'bein') {
      const all = await api('&action=get_live_streams');
      if (!Array.isArray(all)) return res.status(502).json({ error: 'panel error' });
      const picks = [];
      for (const want of [/SP.RTS 1(?!\d|Xtra|ENGLISH|FRANCE)/i, /SP.RTS 2(?!\d|Xtra|ENGLISH|FRANCE)/i, /SP.RTS 3(?!\d|Xtra|ENGLISH|FRANCE)/i, /NEWS/i]) {
        const hit = all.find(s => String(s.category_id) === BEIN_CAT && want.test(s.name || ''));
        if (hit) picks.push({ sid: String(hit.stream_id), name: cleanName(hit.name) || ('beIN ' + picks.length) });
        if (picks.length >= 4) break;
      }
      res.setHeader('Cache-Control', 'public, s-maxage=600, max-age=60');
      return res.status(200).json({ count: picks.length, channels: picks });
    }

    // ---- HLS playlist for one stream id (creds injected server-side) ----
    if (action === 'play') {
      const sid = (req.query.sid || '').toString();
      if (!/^\d{1,10}$/.test(sid)) return res.status(400).json({ error: 'bad sid' });
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 15000);
      let up;
      try {
        up = await fetch(`${SERVER}/live/${encodeURIComponent(USER)}/${encodeURIComponent(PASS)}/${sid}.m3u8`,
          { signal: ctrl.signal, headers: { 'User-Agent': UA }, redirect: 'manual' });
      } finally { clearTimeout(to); }
      if (up.status >= 300 && up.status < 400 && up.headers.get('location')) {
        const loc = new URL(up.headers.get('location'), SERVER).toString();
        if (!loc.startsWith('http')) return res.status(502).json({ error: 'bad redirect' });
        const ctrl2 = new AbortController();
        const to2 = setTimeout(() => ctrl2.abort(), 15000);
        try {
          up = await fetch(loc, { signal: ctrl2.signal, headers: { 'User-Agent': UA } });
        } finally { clearTimeout(to2); }
      }
      if (!up.ok) return res.status(502).json({ error: 'stream offline (' + up.status + ')' });
      let text = await up.text();
      if (!text.startsWith('#EXTM3U')) return res.status(502).json({ error: 'not a playlist' });
      if (text.length > 500000) return res.status(502).json({ error: 'playlist too large' });
      const base = up.url && up.url.startsWith('http') ? up.url : `${SERVER}/live/${USER}/${PASS}/${sid}.m3u8`;
      const prox = (abs) => '/api/iptv?action=seg&u=' + encodeURIComponent(abs);
      text = text.split('\n').map(line => {
        const t = line.trim();
        if (!t) return line;
        if (t.startsWith('#')) {
          return line.replace(/URI="([^"]+)"/g, (mm, uri) => {
            try { return 'URI="' + prox(new URL(uri, base).toString()) + '"'; }
            catch { return mm; }
          });
        }
        try { return prox(new URL(t, base).toString()); }
        catch { return line; }
      }).join('\n');
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(text);
    }

    // ---- segment / key bytes (host must be the panel server — never open) ----
    if (action === 'seg') {
      const raw = (req.query.u || '').toString();
      let tu;
      try { tu = new URL(raw); } catch { return res.status(400).json({ error: 'bad u' }); }
      if (tu.protocol !== 'http:' && tu.protocol !== 'https:')
        return res.status(400).json({ error: 'bad u' });
      if (tu.hostname.toLowerCase() !== serverHost)
        return res.status(403).json({ error: 'host not allowed' });
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 15000);
      let up;
      try {
        const headers = { 'User-Agent': UA };
        if (req.headers.range) headers.Range = req.headers.range;
        up = await fetch(tu.toString(), { signal: ctrl.signal, headers });
      } finally { clearTimeout(to); }
      if (!up.ok && up.status !== 206) return res.status(502).json({ error: 'upstream ' + up.status });
      const clen = +(up.headers.get('content-length') || 0);
      if (clen > 12000000) return res.status(502).json({ error: 'segment too large' });
      const buf = Buffer.from(await up.arrayBuffer());
      if (buf.length > 12000000) return res.status(502).json({ error: 'segment too large' });
      res.setHeader('Content-Type', up.headers.get('content-type') || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Accept-Ranges', 'bytes');
      if (up.status === 206) {
        res.setHeader('Content-Range', up.headers.get('content-range') || '');
        return res.status(206).send(buf);
      }
      return res.status(200).send(buf);
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (e) {
    return res.status(502).json({ error: String((e && e.message) || e).slice(0, 120) });
  }
}
