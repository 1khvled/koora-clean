export default async function handler(req, res) {
  const day = (req.query.day || 'today').toString();
  let target = 'https://kooralive-plus.info/';
  if (day === 'yesterday') target = 'https://kooralive-plus.info/yesterday-matches/';
  else if (day === 'tomorrow') target = 'https://kooralive-plus.info/tomorrow-matches/';
  else if (day === 'today') target = 'https://kooralive-plus.info/today-matches/';

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=30');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Referer': 'https://kooralive-plus.info/',
      }
    });
    const html = await upstream.text();
    const matches = [];
    const matchRegex = /<div class="STING-web-Match"[^>]*id="([^"]*)"[^>]*>[\s\S]*?<a href="([^"]*)"[^>]*data-fixture-id="([^"]*)"[^>]*data-home="([^"]*)"[^>]*data-away="([^"]*)"[^>]*data-league="([^"]*)"[^>]*data-start="([^"]*)"[^>]*data-status-code="([^"]*)"[^>]*data-official-status="([^"]*)"[^>]*data-game-time="([^"]*)"[^>]*data-status-group="([^"]*)"[^>]*data-score-home="([^"]*)"[^>]*data-score-away="([^"]*)"[\s\S]*?<img[^>]*src="([^"]*)"[\s\S]*?<div class="STING-web-Team-NAME">([^<]*)<\/div>[\s\S]*?<div id="STING-web-Match-Time">([^<]*)<\/div>[\s\S]*?<div id="STING-web-Result">([^<]*)<\/div>[\s\S]*?<div class="STING-web-Match-Info">([^<]*)<\/div>[\s\S]*?<img[^>]*src="([^"]*)"/gi;
    let m;
    while ((m = matchRegex.exec(html)) !== null) {
      matches.push({
        id: m[3] || m[1],
        href: m[2],
        home: m[4],
        away: m[5],
        league: m[6],
        start: m[7],
        status: m[8],
        official_status: m[9],
        game_time: m[10],
        status_group: m[11],
        score_home: m[12],
        score_away: m[13],
        home_logo: m[14],
        time_text: (m[15] || '').trim(),
        result_text: (m[16] || '').trim(),
        league_text: (m[17] || m[6]).trim(),
        away_logo: m[18]
      });
    }
    // Fallback simple
    if (matches.length === 0) {
      const simple = /<div class="STING-web-Match"[^>]*>[\s\S]*?<a href="([^"]*)"/gi;
      let idx = 0;
      while ((m = simple.exec(html)) !== null && idx < 20) {
        matches.push({ id: `unknown-${idx}`, href: m[1], home: `Team ${idx*2+1}`, away: `Team ${idx*2+2}`, league: 'Unknown', status: 'SOON', home_logo: '', away_logo: '', time_text: '', result_text: '', league_text: 'Unknown' });
        idx++;
      }
    }
    return res.status(200).json(matches);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
