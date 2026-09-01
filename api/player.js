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
    
    // Look for iframe with yasirtv, romabar, or similar
    const iframeMatch = html.match(/<iframe[^>]*src="([^"]*(?:yasirtv|romabar|alba|player)[^"]*)"[^>]*>/i);
    if (iframeMatch) {
      playerSrc = iframeMatch[1];
      playerHtml = iframeMatch[0];
    }
    
    // If not found, try to find the API data: the page has a commented fetch to /wp-json/sting/v1/iframes
    // We can try to fetch that API directly with the match ID
    if (!playerSrc) {
      try {
        const apiRes = await fetch('https://kooralive-plus.info/wp-json/sting/v1/iframes', {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Referer': target,
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          }
        });
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          const match = apiData.find(m => m.match_id === id || m.id === id);
          if (match && match.code) {
            // Extract src from code
            const srcMatch = match.code.match(/src="([^"]+)"/);
            if (srcMatch) {
              playerSrc = srcMatch[1];
              playerHtml = match.code;
            }
          }
        }
      } catch {}
    }
    
    // Ultimate fallback: try yasirtv pattern directly
    if (!playerSrc && id) {
      // Try common yasirtv pattern
      playerSrc = `https://912acsss8af382.yasirtv.com/playerv5.php?match=${id}`;
      // We don't have the key, but we can try without it or with a generic
      // For now, return a message to use the match page directly
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
