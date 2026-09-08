export default async function handler(req, res) {
  const id = (req.query.id || '').toString();
  const href = (req.query.href || '').toString();
  // Optional: team names (Arabic) so the hd7livex resolver can run without
  // the /api/matches self-lookup (also used by local tests).
  const qHome = (req.query.home || '').toString();
  const qAway = (req.query.away || '').toString();

  // Fetch with a hard timeout (serverless-friendly).
  const fetchT = (url, opts = {}, ms = 8000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
  };

  // Arabic-loose normalize so upstream name variants still match
  // (أ/إ/آ→ا, ة→ه, ى→ي, strip tashkeel).
  const normAr = (s) => (s || '').toString()
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[ً-ْٰ]/g, '').replace(/\s+/g, ' ').trim();

  // hd7livex/goal-kooora chain (verified 2026-09-04, extended 2026-09-08):
  //   matches-today card -> match page -> goalkooora /live/*.php
  //     -> <ul class="albaplayer_name"> Live 1/2/3 tabs (each its own /live/*.php)
  //     -> each live page embeds /m9/*.php -> leaf provider embed.
  // Old code returned ONLY the first tab's leaf; now we resolve ALL tabs so
  // the player can offer N selectable servers instead of 1-2 generic buttons.
  // Returns { playerSrc, livePage, servers: [{label, livePage, m9, embedUrl}] } or null.
  const fixUrl = (u) => {
    if (!u) return null;
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('https://')) return u;
    return null;
  };
  const resolveOneLive = async (liveUrl, referer, UA, ms = 6000) => {
    try {
      const lvRes = await fetchT(liveUrl, { headers: { ...UA, Referer: referer } }, ms);
      if (!lvRes.ok) return null;
      const lv = await lvRes.text();
      const m9M = lv.match(/<iframe[^>]+src="([^"]*\/m9\/[^"]+)"[^>]*>/i)
        || lv.match(/<iframe[^>]+src="([^"]+)"/i);
      if (!m9M) return { livePage: liveUrl, m9: null, leaf: null };
      const m9Url = fixUrl(m9M[1]);
      if (!m9Url) return { livePage: liveUrl, m9: null, leaf: null };
      let leaf = null;
      try {
        const m9Res = await fetchT(m9Url, { headers: { ...UA, Referer: liveUrl } }, ms);
        if (m9Res.ok) {
          const m9 = await m9Res.text();
          const leafM = m9.match(/<iframe[^>]+src="([^"]+)"/i);
          if (leafM) leaf = fixUrl(leafM[1]);
        }
      } catch {}
      return { livePage: liveUrl, m9: m9Url, leaf };
    } catch { return null; }
  };
  const resolveHd7 = async (home, away) => {
    const nH = normAr(home), nA = normAr(away);
    if (!nH && !nA) return null;
    const UA = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    };
    try {
      const dayRes = await fetchT('https://hd7livex.com/matches-today/', { headers: { ...UA, Referer: 'https://hd7livex.com/' } });
      if (!dayRes.ok) return null;
      const day = await dayRes.text();
      const noscr = day.replace(/<script[\s\S]*?<\/script>/gi, '');
      // Card links use single quotes: class='alba_sports_events_link' href='...' title='...'
      const cards = [...noscr.matchAll(/class='alba_sports_events_link'\s+href='([^']+)'\s+title='([^']+)'/gi)];
      let pageUrl = null;
      for (const c of cards) {
        const title = normAr(c[2]);
        if ((nH && title.includes(nH)) || (nA && title.includes(nA))) { pageUrl = c[1]; break; }
      }
      if (!pageUrl) return null;

      const mpRes = await fetchT(pageUrl, { headers: { ...UA, Referer: 'https://hd7livex.com/matches-today/' } });
      if (!mpRes.ok) return null;
      const mp = await mpRes.text();
      const liveM = mp.match(/<iframe[^>]+src="([^"]+)"/i);
      if (!liveM) return null;
      const firstLive = fixUrl(liveM[1]);
      if (!firstLive) return null;

      // Collect every Live tab from the AlbaPlayer server list.
      const first = await resolveOneLive(firstLive, pageUrl, UA);
      if (!first) return null;
      let tabs = [];
      try {
        const lvRes = await fetchT(firstLive, { headers: { ...UA, Referer: pageUrl } });
        if (lvRes.ok) {
          const lv = await lvRes.text();
          const ulM = lv.match(/<ul class="albaplayer_name">([\s\S]*?)<\/ul>/i);
          const scope = ulM ? ulM[1] : lv;
          const links = [...scope.matchAll(/<a[^>]+href="([^"]*\/live\/[^"]+)"[^>]*>([^<]+)<\/a>/gi)];
          const seen = new Set([firstLive]);
          for (const l of links) {
            const u = fixUrl(l[1]);
            const label = (l[2] || '').trim().replace(/\s+/g, ' ');
            if (u && !seen.has(u)) { seen.add(u); tabs.push({ url: u, label }); }
          }
        }
      } catch {}
      tabs = tabs.slice(0, 3); // cap: 1 first + up to 3 alternates = max 4 servers
      const rest = await Promise.all(tabs.map(t => resolveOneLive(t.url, pageUrl, UA)));
      const servers = [];
      const pushServer = (label, r) => {
        if (!r) return;
        const best = r.leaf || r.m9 || r.livePage;
        if (!best) return;
        if (servers.some(s => s.url === best || s.livePage === r.livePage)) return;
        servers.push({ label, url: best, livePage: r.livePage, m9: r.m9, leaf: r.leaf });
      };
      pushServer('Live 1', first);
      rest.forEach((r, i) => pushServer(tabs[i].label || `Live ${i + 2}`, r));
      if (!servers.length) return null;
      return { playerSrc: servers[0].url, livePage: servers[0].livePage, servers };
    } catch { return null; }
  };
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=30');
  
  if (!id && !href) {
    return res.status(400).json({ error: 'Missing id or href' });
  }

  // Try to get player from kooralive match page
  let target = href;
  let matchHome = qHome, matchAway = qAway;
  if ((!target || (!matchHome && !matchAway)) && id) {
    // If only id, try to find href + team names from matches API
    try {
      const matchesRes = await fetch(`https://${req.headers.host}/api/matches?day=today`);
      const matches = await matchesRes.json();
      const match = matches.find(m => m.id === id);
      if (match) {
        if (!target) target = match.href;
        if (!matchHome) matchHome = match.home || '';
        if (!matchAway) matchAway = match.away || '';
      }
    } catch {}
  }
  
  if (!target) {
    return res.status(404).json({ error: 'Match not found', id });
  }

  // Ensure target is a full URL
  if (!target.startsWith('http')) target = 'https://kooralive-plus.info' + target;
  
  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Referer': 'https://kooralive-plus.info/',
      }
    });
    const html = await upstream.text();
    
    // Try to find player iframe directly in HTML (if already rendered)
    let playerHtml = null;
    let playerSrc = null;
    
    // Look for iframe with yasirtv, romabar, or similar (single or double quotes)
    const iframeMatch = html.match(/<iframe[^>]*src=(["'])([^"']*(?:yasirtv|romabar|alba|player)[^"']*)\1[^>]*>/i);
    if (iframeMatch) {
      playerSrc = iframeMatch[2];
      playerHtml = iframeMatch[0];
    }

    // If not found, try the sting iframes API. The loader is commented out in
    // the page HTML, so this API is the ONLY source of the real player code.
    // Match IDs are shared across the whole STING-clone ecosystem, so try
    // every known sister domain — if any one of them unlocks its API we get
    // players for all matches.
    if (!playerSrc) {
      const apiBases = [
        'https://kooralive-plus.info',
        'https://kooralive24.com',
        'https://www.romabar.info',
      ];
      for (const base of apiBases) {
        try {
          const apiRes = await fetch(base + '/wp-json/sting/v1/iframes', {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
              'Accept': 'application/json',
              'Referer': base + '/',
              'Origin': base,
              'X-Requested-With': 'XMLHttpRequest',
              'Sec-Fetch-Site': 'same-origin',
              'Sec-Fetch-Mode': 'cors',
              'Sec-Fetch-Dest': 'empty',
            }
          });
          if (!apiRes.ok) continue;
          const apiData = await apiRes.json();
          if (!Array.isArray(apiData)) continue; // {"error":"Unauthorized origin"} when locked
          const match = apiData.find(m =>
            String(m.match_id) === String(id) || String(m.id) === String(id));
          if (match && match.code) {
            // Extract src from code (single or double quotes)
            const srcMatch = match.code.match(/src=(["'])([^"']+)\1/);
            if (srcMatch) {
              playerSrc = srcMatch[2];
              playerHtml = match.code;
              break;
            }
          }
        } catch {}
      }
    }
    
    // Clean direct src if we got one.
    if (playerSrc && playerSrc.startsWith('//')) playerSrc = 'https:' + playerSrc;

    // Always try the hd7livex multi-server chain too (it is the only source
    // proven to yield playable leaf embeds). Merged below with direct/fallback.
    let hd7 = null;
    try { hd7 = await resolveHd7(matchHome, matchAway); } catch { hd7 = null; }

    const servers = [];
    const pushUnique = (entry) => {
      if (!entry || !entry.url) return;
      if (servers.some(s => s.url === entry.url)) return;
      servers.push(entry);
    };
    if (playerSrc) {
      pushUnique({ label: 'المصدر المباشر', url: playerSrc, livePage: null, kind: 'direct', via: 'kooralive' });
    }
    if (hd7 && hd7.servers) {
      hd7.servers.forEach((s, i) => pushUnique({
        label: s.label || `سيرفر ${i + 1}`,
        url: s.url, livePage: s.livePage, m9: s.m9, leaf: s.leaf,
        kind: 'leaf', via: 'hd7livex',
      }));
    }
    // Last resort: the match page itself (frontend iframes it via cleaning proxy).
    pushUnique({ label: 'صفحة المباراة (احتياطي)', url: target, livePage: null, kind: 'fallback', via: 'fallback' });

    if (playerSrc || (hd7 && hd7.playerSrc)) {
      const first = servers[0].url;
      return res.status(200).json({
        id,
        href: target,
        home: matchHome || undefined,
        away: matchAway || undefined,
        playerSrc: first,
        playerHtml,
        found: true,
        via: playerSrc && hd7 ? 'mixed' : (hd7 ? 'hd7livex' : 'direct'),
        livePage: (hd7 && hd7.livePage) || null,
        embedUrl: first,
        fallbackUrl: target,
        count: servers.length,
        servers,
      });
    } else {
      // No playable embed anywhere — still return the tab list (if any) plus
      // the fallback so the UI can show "1 source • fallback" instead of zero.
      return res.status(200).json({
        id,
        href: target,
        home: matchHome || undefined,
        away: matchAway || undefined,
        playerSrc: null,
        playerHtml: null,
        found: false,
        fallbackUrl: target,
        count: servers.length,
        servers,
        message: 'No direct player found, use fallbackUrl with cleaning'
      });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message, id, href: target });
  }
}
