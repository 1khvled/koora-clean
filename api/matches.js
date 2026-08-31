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
    const anchorRegex = /<a href="([^"]*)"[^>]*>/g;
    let m;
    while ((m = anchorRegex.exec(html)) !== null) {
      const tag = m[0];
      if (!tag.includes('data-home')) continue;
      const getAttr = (name) => {
        const mm = tag.match(new RegExp(name + '="([^"]*)"'));
        return mm ? mm[1] : '';
      };
      const href = m[1];
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
      const logos = [...after.matchAll(/<img[^>]*src="([^"]*)"/g)];
      const timeMatch = after.match(/<div id="STING-web-Match-Time">([^<]*)<\/div>/);
      const resultMatch = after.match(/<div id="STING-web-Result">([^<]*)<\/div>/);
      const leagueMatch = after.match(/<div class="STING-web-Match-Info">([^<]*)<\/div>/);
      matches.push({
        id: id || `match-${matches.length}`,
        href,
        home,
        away,
        league,
        start,
        status,
        official_status: official,
        game_time: gameTime,
        score_home: scoreHome,
        score_away: scoreAway,
        home_logo: logos[0] ? logos[0][1] : '',
        away_logo: logos[1] ? logos[1][1] : '',
        time_text: timeMatch ? timeMatch[1].trim() : '',
        result_text: resultMatch ? resultMatch[1].trim() : '',
        league_text: leagueMatch ? leagueMatch[1].trim() : league,
      });
    }
    return res.status(200).json(matches);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
