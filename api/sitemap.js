import { rl, readCapped } from './_sec.js';
export default async function handler(req, res) {
  // Dynamic sitemap: core pages + 3-day match pages (short ?m=&d= links).
  // Fail-open: upstream failure still returns the core URLs. Edge-cached 1h.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600');
  if (!rl(req, res, 'sitemap', 120, 60000)) return;
  if (req.method === 'OPTIONS') return res.status(200).end();

  const base = 'https://kooraadz.vercel.app';
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const urls = [
    { loc: base + '/', changefreq: 'hourly', priority: '1.0' },
    { loc: base + '/player.html', changefreq: 'hourly', priority: '0.8' },
  ];
  const segs = [
    ['today-matches/', 'today'],
    ['yesterday-matches/', 'yesterday'],
    ['tomorrow-matches/', 'tomorrow'],
  ];
  try {
    const htmls = await Promise.all(segs.map(async ([seg]) => {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 7000);
      try {
        const r = await fetch('https://kooralive-plus.info/' + seg, {
          signal: ctrl.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Referer': 'https://kooralive-plus.info/',
          },
        });
        if (!r.ok) return '';
        const cl = +(r.headers.get('content-length') || 0);
        if (cl > 2500000) return '';
        const tx = await r.text();
        return tx && tx.length <= 3000000 ? tx : '';
      } catch { return ''; }
      finally { clearTimeout(to); }
    }));
    const seen = new Set();
    htmls.forEach((html, idx) => {
      const d = segs[idx][1];
      const anchorRegex = /<a\s[^>]*href=(["'])(.*?)\1[^>]*>/gi;
      let m;
      while ((m = anchorRegex.exec(html)) !== null) {
        const tag = m[0];
        if (!tag.includes('data-home')) continue;
      const getAttr = (name) => {
          const mm = tag.match(new RegExp(name + '\\s*=\\s*(["\'])(.*?)\\1'));
          return mm ? mm[2] : '';
        };
        const href = m[2];
        let sid = getAttr('data-fixture-id');
        if (!sid && href) {
          try {
            const slug = decodeURIComponent(href).split('/').filter(Boolean).pop() || '';
            if (slug && slug !== 'matches') sid = 'slug-' + slug.slice(0, 80);
          } catch {}
        }
        if (!sid || seen.has(sid)) continue;
        seen.add(sid);
        const after = html.slice(m.index, m.index + 4000);
        const imgs = [...after.matchAll(/<img[^>]*src=(["'])(.*?)\1/gi)].map(x => x[2]).slice(0, 2);
        const start = getAttr('data-start');
        const dm = (start || '').match(/^(\d{4}-\d{2}-\d{2})/);
        urls.push({
          loc: base + '/player.html?m=' + encodeURIComponent(sid) + '&d=' + d,
          changefreq: 'hourly',
          priority: '0.7',
          lastmod: dm ? dm[1] : undefined,
          imgs,
        });
      }
    });
  } catch {}
  const body = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    .concat(urls.map(u => {
      const fr = u.loc + (u.loc.includes('?') ? '&' : '?') + 'lang=fr';
      const ar = u.loc + (u.loc.includes('?') ? '&' : '?') + 'lang=ar';
      return '  <url><loc>' + esc(u.loc) + '</loc>' +
        '<xhtml:link rel="alternate" hreflang="en" href="' + esc(u.loc) + '"/>' +
        '<xhtml:link rel="alternate" hreflang="fr" href="' + esc(fr) + '"/>' +
        '<xhtml:link rel="alternate" hreflang="ar" href="' + esc(ar) + '"/>' +
        '<xhtml:link rel="alternate" hreflang="x-default" href="' + esc(u.loc) + '"/>' +
        (u.imgs ? u.imgs.map(src => '<image:image><image:loc>' + esc(src) + '</image:loc></image:image>').join('') : '') +
        (u.lastmod ? '<lastmod>' + u.lastmod + '</lastmod>' : '') +
        '<changefreq>' + u.changefreq + '</changefreq>' +
        '<priority>' + u.priority + '</priority></url>';
    }))
    .concat(['</urlset>']).join('\n');
  return res.status(200).send(body);
}
