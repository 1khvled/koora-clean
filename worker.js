/**
 * worker.js — Koora Live LIVE scraper + proxy
 * Endpoints:
 *   /api/matches              → live scrape homepage (today)
 *   /api/matches?day=today    → today
 *   /api/matches?day=yesterday→ yesterday
 *   /api/matches?day=tomorrow → tomorrow
 *   /?url=https://kooralive-plus.info/... → proxy + clean HTML (for player)
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': '*',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // === LIVE SCRAPE API ===
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
            'Accept-Language': 'ar,en;q=0.9',
            'Referer': 'https://kooralive-plus.info/',
          },
          cf: { cacheTtl: 60, cacheEverything: false }
        });
        const html = await upstream.text();
        
        // Parse matches from HTML - same logic as scrape_koora_home.py
        const matches = [];
        // Regex to find STING-web-Match divs
        const matchRegex = /<div class="STING-web-Match"[^>]*id="([^"]*)"[^>]*>[\s\S]*?<a href="([^"]*)"[^>]*data-fixture-id="([^"]*)"[^>]*data-home="([^"]*)"[^>]*data-away="([^"]*)"[^>]*data-league="([^"]*)"[^>]*data-start="([^"]*)"[^>]*data-status-code="([^"]*)"[^>]*data-official-status="([^"]*)"[^>]*data-game-time="([^"]*)"[^>]*data-status-group="([^"]*)"[^>]*data-score-home="([^"]*)"[^>]*data-score-away="([^"]*)"[\s\S]*?<img[^>]*alt="[^"]*"[^>]*src="([^"]*)"[\s\S]*?<div class="STING-web-Team-NAME">([^<]*)<\/div>[\s\S]*?<div id="STING-web-Match-Time">([^<]*)<\/div>[\s\S]*?<div id="STING-web-Result">([^<]*)<\/div>[\s\S]*?<div class="STING-web-Match-Info">([^<]*)<\/div>[\s\S]*?<img[^>]*alt="[^"]*"[^>]*src="([^"]*)"/gi;
        
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

        // Fallback: simpler parse if regex fails (for different HTML structure)
        if (matches.length === 0) {
          const simpleRegex = /<div class="STING-web-Match"[^>]*>[\s\S]*?<a href="([^"]*)"/gi;
          let idx = 0;
          while ((m = simpleRegex.exec(html)) !== null && idx < 20) {
            matches.push({
              id: `unknown-${idx}`,
              href: m[1],
              home: `Team ${idx*2+1}`,
              away: `Team ${idx*2+2}`,
              league: 'Unknown',
              status: 'SOON',
              home_logo: '',
              away_logo: '',
              time_text: '',
              result_text: '',
              league_text: 'Unknown'
            });
            idx++;
          }
        }

        return new Response(JSON.stringify(matches), {
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=30', ...cors }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'content-type': 'application/json', ...cors } });
      }
    }

    // === PROXY + CLEAN HTML (for player) ===
    if (url.searchParams.has('url')) {
      const target = url.searchParams.get('url');
      let t;
      try { t = new URL(target); } catch { return new Response('Invalid url', { status: 400, headers: cors }); }
      const allowed = ['kooralive-plus.info','romabar.info','yasirtv.com','912acsss','sir-tv.tv','yalllashoot'];
      if (!allowed.some(h => t.hostname.includes(h))) return new Response('Host not allowed', { status: 403, headers: cors });
      try {
        const upstream = await fetch(t.toString(), {
          headers: {
            'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0',
            'Referer': 'https://kooralive-plus.info/',
            'Accept': 'text/html,application/xhtml+xml',
          },
          cf: { cacheTtl: 0 }
        });
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
