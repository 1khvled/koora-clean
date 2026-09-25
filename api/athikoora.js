import { rl, fetchableUrl } from './_sec.js';
export default async function handler(req, res) {
  // Athikoora 24/7 beIN channels — Blogger JSON feed (public, no auth).
  // These are the "قناة بين سبورتس" posts whose HTML holds an <iframe> to an
  // albaplayer / playerv5 host. They are ALWAYS-ON generic channels, so the
  // player merges them AFTER the match-specific servers, same tier as /api/alwan.
  // Fail-open: ANY error returns {count:0, channels:[]} with no-store.
  const SRC = 'https://kora.athikoora.com/feeds/posts/default?alt=json&max-results=16';
  const fail = () => {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ count: 0, channels: [] });
  };
  if (!rl(req, res, 'athikoora')) return;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 6000);
  try {
    const up = await fetch(SRC, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        'Accept': 'application/json,*/*',
        'Referer': 'https://kora.athikoora.com/',
      },
    }).finally(() => clearTimeout(to));
    if (!up.ok) return fail();
    const clen = +(up.headers.get('content-length') || 0);
    if (clen > 800000) return fail();
    const j = await up.json();
    if (!j || !j.feed || !Array.isArray(j.feed.entry)) return fail();
    const out = [];
    const BLOCK_RE = /javascript:|data:|blob:|t\.me|telegram/i;
    for (const entry of j.feed.entry) {
      try {
        const title = (entry.title && entry.title.$t) ? entry.title.$t.trim().slice(0, 60) : '';
        const html = (entry.content && entry.content.$t) ? entry.content.$t : '';
        if (!html) continue;
        // Extract iframe src (single or double quotes, albaplayer or playerv5)
        const m = html.match(/<iframe[^>]+src=(["'])([^"']+)\1/i);
        if (!m) continue;
        let url = m[2].trim();
        if (!url) continue;
        if (url.startsWith('//')) url = 'https:' + url;
        if (!/^https:\/\//i.test(url)) continue;
        if (BLOCK_RE.test(url)) continue;
        // Keep only known player hosts to avoid ad iframes
        if (!/(albaplayer|playerv5\.php|yasirtv|baranewss|matchlivehd|kora-live-live)/i.test(url)) continue;
        if (out.some(c => c.url === url)) continue;
        const name = title || url.replace(/^https?:\/\//, '').split('/')[0];
        out.push({ id: out.length + 1, name: name.slice(0, 60), url });
        if (out.length >= 8) break;
      } catch { /* skip entry */ }
    }
    // Liveness gate (mirrors alwan sniffAlive, 3.5s, fail-open per
    // channel): a bare 200 is not enough — dead embeds return 200 shells.
    // Keep beIN-labelled entries first (most reliable on big nights).
    const beinScore = (c) => (/bein|بين/i.test(c.name) ? 0 : 1);
    const DEAD_RE = /notFound|videoDeleted|video_deleted|video-removed|contentDeleted|videoUnavailable/i;
    const sniffAlive = async (c) => {
      try {
        if (!fetchableUrl(c.url)) return null;
        const ctrl2 = new AbortController();
        const to2 = setTimeout(() => ctrl2.abort(), 3500);
        const headers = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Referer': 'https://kora.athikoora.com/',
        };
        const get = (u) => fetch(u, { signal: ctrl2.signal, redirect: 'manual', headers });
        try {
          let r = await get(c.url);
          if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
            try { const nx = new URL(r.headers.get('location'), c.url).toString(); if (!fetchableUrl(nx)) return null; r = await get(nx); } catch { return null; }
          }
          if (!r.ok) return null;
          const ct = (r.headers.get('content-type') || '').toLowerCase();
          if (!ct.includes('text/html')) return c;
          const clen = +(r.headers.get('content-length') || 0);
          if (clen > 800000) return c;
          const html = await r.text();
          if (html.length < 2000) return null;
          if (DEAD_RE.test(html)) return null;
          return c;
        } finally { clearTimeout(to2); }
      } catch { return null; }
    };
    out.sort((a, b) => beinScore(a) - beinScore(b));
    const channels = (await Promise.all(out.slice(0, 8).map(sniffAlive))).filter(Boolean).slice(0, 6);
    res.setHeader('Cache-Control', 'public, s-maxage=120, max-age=60');
    return res.status(200).json({ count: channels.length, channels });
  } catch {
    return fail();
  }
}
