export default async function handler(req, res) {
  const day = (req.query.day || 'today').toString();
  let target = 'https://kooralive-plus.info/';
  if (day === 'yesterday') target = 'https://kooralive-plus.info/yesterday-matches/';
  else if (day === 'tomorrow') target = 'https://kooralive-plus.info/tomorrow-matches/';
  else if (day === 'today') target = 'https://kooralive-plus.info/today-matches/';
  else {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ error: 'bad day (today|yesterday|tomorrow)' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // Edge caches 60s (every other 45s poll is instant), browsers 30s (scores stay fresh).
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Decode entities ONCE at the scrape (WordPress sends 63&#039;, sometimes
  // double-encoded) so every client gets clean Unicode instead of garbage.
  const decFull = (s) => {
    let out = String(s == null ? '' : s), prev = '';
    for (let i = 0; i < 3 && out !== prev; i++) {
      prev = out;
      out = out.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
        .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => { const c = parseInt(h, 16); return c > 31 && c < 0x110000 ? String.fromCodePoint(c) : m; })
        .replace(/&#(\d+);/g, (m, n) => { const c = parseInt(n, 10); return c > 31 && c < 0x110000 ? String.fromCodePoint(c) : m; });
    }
    return out;
  };

  try {
    // Hard timeout so a hung upstream can't burn the serverless invocation.
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 8000);
    const upstream = await fetch(target, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Referer': 'https://kooralive-plus.info/',
      }
    }).finally(() => clearTimeout(to));
    if (!upstream.ok) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(502).json({ error: 'upstream failed' });
    }
    const clen = +(upstream.headers.get('content-length') || 0);
    if (clen > 2500000) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(502).json({ error: 'upstream too large' });
    }
    const html = await upstream.text();
    const matches = [];
    const anchorRegex = /<a\s[^>]*href=(["'])(.*?)\1[^>]*>/gi;
    let m;
    while ((m = anchorRegex.exec(html)) !== null) {
      const tag = m[0];
      if (!tag.includes('data-home')) continue;
      const getAttr = (name) => {
        const mm = tag.match(new RegExp(name + '\\s*=\\s*(["\'])(.*?)\\1'));
        return mm ? mm[2] : '';
      };
      const href = m[2]; // m[1] is the quote char in the quote-agnostic regex
      const id = getAttr('data-fixture-id');
      const home = getAttr('data-home');
      const away = getAttr('data-away');
      const league = getAttr('data-league');
      const start = getAttr('data-start');
      const status = getAttr('data-status-code');
      const official = getAttr('data-official-status');
      const gameTime = getAttr('data-game-time');
      const scoreHome = getAttr('data-score-home');
      const scoreAway = getAttr('data-score-away');
      // Skip Egyptian league
      if (league.includes('المصري') || league.includes('Egypt')) continue;
      const after = html.substring(m.index, m.index + 4000);
      const imgs = [...after.matchAll(/<img[^>]*src=(["'])(.*?)\1/gi)].map(x => x[2]).filter(Boolean);
      // Prefer team-logo URLs (league emblems/placeholders otherwise pollute slot 0/1).
      const teamImgs = imgs.filter(u => /logo/i.test(u));
      const logos = (teamImgs.length >= 2 ? teamImgs : imgs).slice(0, 2);
      const timeMatch = after.match(/<div id="STING-web-Match-Time">([^<]*)<\/div>/);
      const resultMatch = after.match(/<div id="STING-web-Result">([^<]*)<\/div>/);
      const leagueMatch = after.match(/<div class="STING-web-Match-Info">([^<]*)<\/div>/);
      // Stable id: fixture attr first, else the match slug from href (order-
      // based match-N ids break player links between scrapes).
      let stableId = id;
      if (!stableId && href) {
        try {
          const slug = decodeURIComponent(href).split('/').filter(Boolean).pop() || '';
          if (slug && slug !== 'matches') stableId = 'slug-' + slug.slice(0, 80);
        } catch {}
      }
      matches.push({
        id: stableId || `match-${matches.length}`,
        href,
        home: decFull(home),
        away: decFull(away),
        league: decFull(league),
        start,
        status: decFull(status),
        official_status: decFull(official),
        game_time: decFull(gameTime),
        score_home: decFull(scoreHome),
        score_away: decFull(scoreAway),
        home_logo: logos[0] || '',
        away_logo: logos[1] || '',
        time_text: decFull(timeMatch ? timeMatch[1].trim() : ''),
        result_text: decFull(resultMatch ? resultMatch[1].trim() : ''),
        league_text: decFull(leagueMatch ? leagueMatch[1].trim() : league),
      });
    }
    return res.status(200).json(matches);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'upstream failed' });
  }
}
