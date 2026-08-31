/**
 * worker.js — Koora Live LIVE scraper + proxy
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': '*',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    if (path === '/api/matches' || path === '/api/matches.json') {
      const day = url.searchParams.get('day') || 'today';
      let target = 'https://kooralive-plus.info/';
      if (day === 'yesterday') target = 'https://kooralive-plus.info/yesterday-matches/';
      else if (day === 'tomorrow') target = 'https://kooralive-plus.info/tomorrow-matches/';
      else if (day === 'today') target = 'https://kooralive-plus.info/today-matches/';
      try {
        const upstream = await fetch(target, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Referer': 'https://kooralive-plus.info/',
          },
          cf: { cacheTtl: 60 }
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
        return new Response(JSON.stringify(matches), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=30', ...cors } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'content-type': 'application/json', ...cors } });
      }
    }

    if (url.searchParams.has('url')) {
      const target = url.searchParams.get('url');
      let t;
      try { t = new URL(target); } catch { return new Response('Invalid url', { status: 400, headers: cors }); }
      const allowed = ['kooralive-plus.info','romabar.info','yasirtv.com','912acsss','sir-tv.tv','yalllashoot'];
      if (!allowed.some(h => t.hostname.includes(h))) return new Response('Host not allowed', { status: 403, headers: cors });
      try {
        const upstream = await fetch(t.toString(), { headers: { 'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0', 'Referer': 'https://kooralive-plus.info/', 'Accept': 'text/html,application/xhtml+xml' }, cf: { cacheTtl: 0 } });
        const ct = upstream.headers.get('content-type') || '';
        if (!ct.includes('text/html')) {
          const body = await upstream.arrayBuffer();
          return new Response(body, { status: upstream.status, headers: { 'content-type': ct, 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
        }
        let html = await upstream.text();
        html = html.replace(/<script[^>]*src=["'][^"']*cl\.mayhapmonisms[^"']*["'][^>]*>\s*<\/script>/gi, '<!-- ad removed -->');
        html = html.replace(/<script[^>]*src=["'][^"']*additionalheritagenose[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '<!-- ad removed -->');
        html = html.replace(/<script[^>]*src=["'][^"']*ferritegathers[^"']*["'][^>]*>\s*<\/script>/gi, '<!-- ad removed -->');
        html = html.replace(/<div[^>]*>[\s\S]*?615[\s\S]*?انضم الان[\s\S]*?<\/div>/gi, '<!-- popup removed -->');
        html = html.replace(/<a[^>]*href=["'][^"']*t\.me[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, '<!-- t.me removed -->');
        const inject = `<style>a[href*="t.me"]{display:none !important}</style><script>(function(){const P=/(615|انضم\\s*الان|توقعات)/i,T=/(t\\.me|telegram)/i;const o=window.open;window.open=function(u){if(u&&T.test(String(u)))return null;return o.apply(this,arguments)};function n(){document.querySelectorAll('div,section').forEach(e=>{const t=(e.textContent||'').slice(0,500);if(P.test(t)&&e.children.length<=8){const s=window.getComputedStyle(e);if(s.position==='fixed'||parseInt(s.zIndex||0)>100) e.remove()}})}setInterval(n,400);new MutationObserver(n).observe(document.documentElement,{childList:true,subtree:true})})()<\\/script>`;
        if (html.includes('</head>')) html = html.replace('</head>', inject + '</head>'); else html = inject + html;
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store', 'x-cleaned-by': 'koora-clean' } });
      } catch (e) {
        return new Response('Proxy error: ' + e.message, { status: 500, headers: cors });
      }
    }
    return new Response('Koora Clean Worker — use /api/matches?day=today or ?url=https://...', { headers: { 'content-type': 'text/plain', ...cors } });
  }
}
