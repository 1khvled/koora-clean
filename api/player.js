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

  // NEW (2026-09-04, verified live x2): resolve the real stream embed via the
  // hd7livex/goal-kooora clone chain, all statically fetchable:
  //   matches-today card -> match page -> goalkooora /live/*.php
  //     -> goalkooora /m9/*.php -> leaf provider embed (varies per match).
  // Returns { playerSrc, livePage } or null.
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
      let liveUrl = liveM[1];
      if (liveUrl.startsWith('//')) liveUrl = 'https:' + liveUrl;

      const lvRes = await fetchT(liveUrl, { headers: { ...UA, Referer: pageUrl } });
      if (!lvRes.ok) return null;
      const lv = await lvRes.text();
      const m9M = lv.match(/<iframe[^>]+src="([^"]+)"/i);
      if (!m9M) return null;
      let m9Url = m9M[1];
      if (m9Url.startsWith('//')) m9Url = 'https:' + m9Url;

      const m9Res = await fetchT(m9Url, { headers: { ...UA, Referer: liveUrl } });
      if (!m9Res.ok) return null;
      const m9 = await m9Res.text();
      const leafM = m9.match(/<iframe[^>]+src="([^"]+)"/i);
      if (!leafM) return null;
      let leaf = leafM[1];
      if (leaf.startsWith('//')) leaf = 'https:' + leaf;
      if (!leaf.startsWith('https://')) return null;
      return { playerSrc: leaf, livePage: liveUrl };
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
    
    if (playerSrc) {
      // Clean the player src
      // Ensure it's https
      if (playerSrc.startsWith('//')) playerSrc = 'https:' + playerSrc;
      
      return res.status(200).json({ 
        id, 
        href: target,
        playerSrc,
        playerHtml,
        found: true,
        // Also return a clean embed URL
        embedUrl: playerSrc
      });
    } else {
      // No player on the kooralive page — try the hd7livex clone chain
      // (verified 2026-09-04: Abha→yallaxsport ch9, Lyon→kora-live-live albaplayer).
      const hd7 = await resolveHd7(matchHome, matchAway);
      if (hd7) {
        return res.status(200).json({
          id,
          href: target,
          playerSrc: hd7.playerSrc,
          playerHtml: null,
          found: true,
          via: 'hd7livex',
          // Full AlbaPlayer UI (server buttons) for this match — the frontend
          // can offer it as an alternate "servers" view.
          livePage: hd7.livePage,
          embedUrl: hd7.playerSrc
        });
      }
      // No player found anywhere - return the match page URL as fallback
      // The frontend will then iframe the match page directly (with cleaning via proxy)
      return res.status(200).json({
        id,
        href: target,
        playerSrc: null,
        playerHtml: null,
        found: false,
        fallbackUrl: target,
        message: 'No direct player found, use fallbackUrl with cleaning'
      });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message, id, href: target });
  }
}
