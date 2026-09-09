export default async function handler(req, res) {
  // Cleaned VIPBox embed proxy (added 2026-09-08): iframing a vipbox
  // /live/<slug>-N page directly shows the whole site (header, titles,
  // chat, footer) squeezed in 16:9 with the player below the fold.
  // This proxy returns the SAME page but with:
  //   - <base href="https://vipbox.lc/"> so relative assets/APIs keep working
  //   - CSS hiding site chrome (navbar, h1/h2 titles, chat, footer) so the
  //     video switcher + 16:9 player sit at the top
  //   - a tiny window.open guard for ad/tracker domains (player scripts kept)
  // Usage: /api/vip?u=https://vipbox.lc/live/football/<slug>-<N>
  // Only vipbox /live/ pages are allowed. Fail-open: any error -> 502 JSON
  // (the player UI keeps working with Arabic servers).
  const u = (req.query.u || '').toString();
  let t;
  try { t = new URL(u); } catch { return res.status(400).json({ error: 'bad url' }); }
  if (!(t.hostname === 'vipbox.lc' || t.hostname.endsWith('.vipbox.lc')))
    return res.status(403).json({ error: 'host not allowed' });
  if (!t.pathname.startsWith('/live/'))
    return res.status(403).json({ error: 'only /live/ pages' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  // NOTE: cache header is set only on the 200 path below — errors stay uncached.

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 7000);
  try {
    const up = await fetch(t.toString(), {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Referer': 'https://vipbox.lc/',
      },
    }).finally(() => clearTimeout(to));
    if (!up.ok) return res.status(502).json({ error: 'upstream ' + up.status });
    // SEC: fetch follows redirects — re-check the FINAL host AND path so a
    // vipbox redirect can't launder arbitrary content through our origin.
    let finalUrl = null;
    try { finalUrl = new URL(up.url); } catch {}
    const finalHost = (finalUrl ? finalUrl.hostname : '').toLowerCase();
    if (!(finalHost === 'vipbox.lc' || finalHost.endsWith('.vipbox.lc'))
      || !(finalUrl && finalUrl.pathname.startsWith('/live/')))
      return res.status(502).json({ error: 'upstream redirected off-page' });
    // Size cap: pages are ~650KB; refuse absurd bodies before buffering.
    const clen = +(up.headers.get('content-length') || 0);
    if (clen > 2500000) return res.status(502).json({ error: 'upstream too large' });
    let html = await up.text();
    if (html.length > 2500000) return res.status(502).json({ error: 'upstream too large' });

    if (/<base\s/i.test(html)) html = html.replace(/<base[^>]*>/i, '<base href="https://vipbox.lc/">');
    else if (html.includes('<head>')) html = html.replace('<head>', '<head><base href="https://vipbox.lc/">');
    else html = '<base href="https://vipbox.lc/">' + html;

    const css = `<style id="__vip_clean">nav.navbar,h1,h2,[data-item="chat"],footer,.site-footer,#chat,#chatango,.chatango{display:none!important}body{padding-top:0!important;background:#0a0a0a!important;color:#eee}.container-fluid{padding-top:0!important}.row.text-center{margin-top:0!important}</style>`;
    const js = `<script>(function(){var B=/(hai8g|privacykum|linguetlainer|lonpapil|doubleclick|popads|popcash|adcash|propeller|exoclick|adsterra|t\\.me|telegram)/i;var o=window.open;window.open=function(x){if(x&&B.test(String(x)))return null;return o.apply(this,arguments)};})();</script>`;
    if (html.includes('</head>')) html = html.replace('</head>', css + js + '</head>');
    else html = css + js + html;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Force opaque origin so the third-party scripts can never touch our page.
    res.setHeader('Content-Security-Policy', 'sandbox allow-scripts allow-forms allow-presentation');
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).send(html);
  } catch (e) {
    return res.status(502).json({ error: 'upstream failed' });
  }
}
