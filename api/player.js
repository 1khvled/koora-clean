export default async function handler(req, res) {
  const id = (req.query.id || '').toString();
  const href = (req.query.href || '').toString();
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=30');
  
  if (!id && !href) {
    return res.status(400).json({ error: 'Missing id or href' });
  }

  // Try to get player from kooralive match page
  let target = href;
  if (!target && id) {
    // If only id, try to find href from matches API
    try {
      const matchesRes = await fetch(`https://${req.headers.host}/api/matches?day=today`);
      const matches = await matchesRes.json();
      const match = matches.find(m => m.id === id);
      if (match) target = match.href;
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
      // No player found - return the match page URL as fallback
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
