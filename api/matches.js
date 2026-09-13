export default async function handler(req, res) {
  const day = (req.query.day || 'today').toString();
  let yacineTarget = 'https://yacinelive.online/matches-today/';
  let koraTarget = 'https://kooralive-plus.info/today-matches/';
  if (day === 'yesterday') {
    yacineTarget = 'https://yacinelive.online/matches-yesterday/';
    koraTarget = 'https://kooralive-plus.info/yesterday-matches/';
  } else if (day === 'tomorrow') {
    yacineTarget = 'https://yacinelive.online/matches-tomorrow/';
    koraTarget = 'https://kooralive-plus.info/tomorrow-matches/';
  } else if (day !== 'today') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ error: 'bad day (today|yesterday|tomorrow)' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=60');
  const _mc = globalThis.__kooraMatchesCache || (globalThis.__kooraMatchesCache = new Map());
  const cacheKey = 'm:' + day;
  const hit = _mc.get(cacheKey);
  if (hit && Date.now() - hit.at < 45000) {
    return res.status(200).json(hit.data);
  }
  if (req.method === 'OPTIONS') return res.status(200).end();

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

  const fetchWithTimeout = async (url, ms, referer) => {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Referer': referer,
        }
      });
      if (!r.ok) return null;
      const text = await r.text();
      return text;
    } catch { return null; } finally { clearTimeout(to); }
  };

  // YACINE primary — parse AY_Match blocks
  const parseYacine = (html) => {
    if (!html || !html.includes('AY_Match')) return [];
    const out = [];
    const blocks = html.split('AY_Match').slice(1);
    // Determine base date for start ISO
    const baseDate = new Date();
    if (day === 'yesterday') baseDate.setDate(baseDate.getDate() - 1);
    else if (day === 'tomorrow') baseDate.setDate(baseDate.getDate() + 1);
    const y = baseDate.getFullYear(), mo = String(baseDate.getMonth()+1).padStart(2,'0'), d = String(baseDate.getDate()).padStart(2,'0');
    for (const b of blocks) {
      try {
        const hrefM = b.match(/<a[^>]+href="(https:\/\/[^"]+)"/i) || b.match(/<a[^>]+href='([^']+)'/i) || b.match(/<a[^>]+href="([^"]+)"/i);
        const href = hrefM ? hrefM[1] || hrefM[2] : '';
        if (!href || href === '/' || href === '#') continue;
        const names = [...b.matchAll(/TM_Name[^>]*>([^<]+)</gi)].map(m => decFull(m[1].trim()));
        if (names.length < 2) continue;
        const home = names[0], away = names[1];
        if (!home || !away) continue;
        // Logos
        const logos = [...b.matchAll(/TM_Logo[^>]*>[\s\S]*?<(?:img)[^>]+(?:data-src|src)=["']([^"']+)["']/gi)].map(m => m[1]).slice(0,2);
        // Time like "03:00 PM" or "04:00 PM"
        const timeM = b.match(/MT_Time[^>]*>([^<]+)</i) || b.match(/MT_Time[^>]*>([^<]+)/i);
        let timeText = timeM ? decFull(timeM[1].trim()) : '';
        // Stat like "جارية الان" etc
        const statM = b.match(/MT_Stat[^>]*>([^<]+)</i);
        const statText = statM ? decFull(statM[1].trim()) : '';
        // League from MT_Info third li
        const leagueM = b.match(/MT_Info[\s\S]*?<li[^>]*><span>([^<]+)<\/span><\/li>\s*<li[^>]*><span>([^<]+)<\/span><\/li>\s*<li[^>]*><span>([^<]+)<\/span><\/li>/i);
        const leagueText = leagueM ? decFull(leagueM[3].trim()) : '';
        // Scores
        const scoreM = [...b.matchAll(/RS-goals[^>]*>([^<]+)</gi)].map(m => m[1].trim());
        const scoreHome = scoreM[0] || '', scoreAway = scoreM[1] || '';
        // Also try MT_Result
        // Start ISO from timeText
        let startIso = '';
        let gameendsIso = '';
        if (timeText) {
          try {
            const tm = timeText.match(/(\d{1,2}):(\d{2})\s*(AM|PM|ص|م)/i);
            if (tm) {
              let hh = parseInt(tm[1],10), mm = parseInt(tm[2],10);
              const ap = tm[3].toUpperCase();
              if (ap.includes('P') || ap.includes('م')) { if (hh < 12) hh += 12; }
              else { if (hh === 12) hh = 0; }
              const dt = new Date(`${y}-${mo}-${d}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00+03:00`);
              if (!isNaN(dt)) {
                startIso = dt.toISOString().replace('.000Z', '+03:00').replace('Z', '+03:00');
                // crude but keep same as kora: +03:00
                // Actually toISOString gives Z, we want +03:00; construct manually
                startIso = `${y}-${mo}-${d}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00+03:00`;
                const end = new Date(dt.getTime() + 105*60000);
                const eh = String(end.getHours()).padStart(2,'0'), em = String(end.getMinutes()).padStart(2,'0');
                // Use same date logic for end (may roll over)
                const ey = end.getFullYear(), emo = String(end.getMonth()+1).padStart(2,'0'), ed = String(end.getDate()).padStart(2,'0');
                gameendsIso = `${ey}-${emo}-${ed}T${eh}:${em}:00+03:00`;
              }
            }
          } catch {}
        }
        if (leagueText.includes('المصري') || /egypt/i.test(leagueText)) continue;
        // Status mapping
        let statusCode = 'NS', official = statText;
        const sLow = statText.toLowerCase();
        if (/جارية|مباشر|live/i.test(sLow) || statText.includes('جارية')) statusCode = 'LIVE';
        else if (/انتهت|نهاية|finished/i.test(sLow)) statusCode = 'FT';
        else if (/بعد قليل|لم تبدأ/i.test(sLow)) statusCode = 'NS';
        let stableId = '';
        if (href) {
          try {
            const slug = decodeURIComponent(href).split('/').filter(Boolean).pop() || '';
            if (slug && slug !== 'matches') stableId = 'y-' + slug.slice(0, 80);
          } catch {}
        }
        if (!stableId) stableId = 'y-' + home.slice(0,10) + '-' + away.slice(0,10) + '-' + timeText.replace(/[^0-9]/g,'');
        out.push({
          id: stableId,
          href,
          home,
          away,
          league: leagueText,
          start: startIso,
          gameends: gameendsIso,
          status: statusCode,
          official_status: official,
          game_time: statusCode === 'LIVE' ? (timeText.includes("'") ? timeText : '') : '',
          score_home: scoreHome,
          score_away: scoreAway,
          home_logo: logos[0] || '',
          away_logo: logos[1] || '',
          time_text: timeText,
          result_text: scoreHome && scoreAway ? `${scoreHome}-${scoreAway}` : '',
          league_text: leagueText,
        });
      } catch {}
    }
    return out;
  };

  try {
    // GOATED: Yacine first
    const yHtml = await fetchWithTimeout(yacineTarget, 4000, 'https://yacinelive.online/');
    let matches = yHtml ? parseYacine(yHtml) : [];
    // If Yacine gave us at least 5 matches, use it. Otherwise fallback to Kora (backup).
    if (matches.length >= 5) {
      _mc.set(cacheKey, { at: Date.now(), data: matches });
      return res.status(200).json(matches);
    }
    // Kora backup — original STING scrape
    const kHtml = await fetchWithTimeout(koraTarget, 4000, 'https://kooralive-plus.info/');
    if (!kHtml) {
      if (matches.length) { _mc.set(cacheKey, { at: Date.now(), data: matches }); return res.status(200).json(matches); }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(502).json({ error: 'upstream failed' });
    }
    const kMatches = [];
    const anchorRegex = /<a\s[^>]*href=(["'])(.*?)\1[^>]*>/gi;
    let m;
    while ((m = anchorRegex.exec(kHtml)) !== null) {
      const tag = m[0];
      if (!tag.includes('data-home')) continue;
      const getAttr = (name) => {
        const mm = tag.match(new RegExp(name + '\\s*=\\s*(["\'])(.*?)\\1'));
        return mm ? mm[2] : '';
      };
      const href = m[2];
      const id = getAttr('data-fixture-id');
      const home = getAttr('data-home');
      const away = getAttr('data-away');
      const league = getAttr('data-league');
      const start = getAttr('data-start');
      const gameends = getAttr('data-gameends');
      const status = getAttr('data-status-code');
      const official = getAttr('data-official-status');
      const gameTime = getAttr('data-game-time');
      const scoreHome = getAttr('data-score-home');
      const scoreAway = getAttr('data-score-away');
      if (league.includes('المصري') || league.includes('Egypt')) continue;
      const after = kHtml.substring(m.index, m.index + 4000);
      const imgs = [...after.matchAll(/<img[^>]*src=(["'])(.*?)\1/gi)].map(x => x[2]).filter(Boolean);
      const teamImgs = imgs.filter(u => /logo/i.test(u));
      const logos = (teamImgs.length >= 2 ? teamImgs : imgs).slice(0, 2);
      const timeMatch = after.match(/<div id="STING-web-Match-Time">([^<]*)<\/div>/);
      const resultMatch = after.match(/<div id="STING-web-Result">([^<]*)<\/div>/);
      const leagueMatch = after.match(/<div class="STING-web-Match-Info">([^<]*)<\/div>/);
      let stableId = id;
      if (!stableId && href) {
        try {
          const slug = decodeURIComponent(href).split('/').filter(Boolean).pop() || '';
          if (slug && slug !== 'matches') stableId = 'slug-' + slug.slice(0, 80);
        } catch {}
      }
      kMatches.push({
        id: stableId || `match-${kMatches.length}`,
        href,
        home: decFull(home),
        away: decFull(away),
        league: decFull(league),
        start,
        gameends,
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
    // Merge: prefer Yacine, fill gaps with Kora not already in Yacine (by home+away)
    const seen = new Set(matches.map(m => (m.home + '|' + m.away).toLowerCase()));
    for (const km of kMatches) {
      const key = (km.home + '|' + km.away).toLowerCase();
      if (!seen.has(key)) { matches.push(km); seen.add(key); }
    }
    if (!matches.length) matches = kMatches;
    _mc.set(cacheKey, { at: Date.now(), data: matches });
    return res.status(200).json(matches);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'upstream failed' });
  }
}
