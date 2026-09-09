export default async function handler(req, res) {
  const id = (req.query.id || '').toString();
  const href = (req.query.href || '').toString();
  // Optional: team names (Arabic) so the hd7livex resolver can run without
  // the /api/matches self-lookup (also used by local tests).
  const qHome = (req.query.home || '').toString();
  const qAway = (req.query.away || '').toString();
  const qStart = (req.query.start || '').toString();
  const qLeague = (req.query.lg || req.query.league || '').toString();

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
  
  // VIPBox English section (added 2026-09-08, fixed same day): the vipbox
  // player is JS-rendered + encrypted (no static iframe to extract), but its
  // /football-schedule IS static HTML with English titles. We map OUR match
  // (Arabic names) to THEIR slug via Arabic->Latin transliteration + fuzzy
  // token scoring (tuned on 11 real pairs: correct title always wins), with
  // league-token + wall-clock bonuses. Returns ONLY this match's verified
  // videos (Video 1..3, each status-checked) — never other matches.
  // Fail-open: no confident match -> [] and the section stays hidden.
  const AR_TR = {
    'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ء': '', 'ؤ': 'w', 'ئ': 'y',
    'ب': 'b', 'ة': 'a', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
    'د': 'd', 'ذ': 'd', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
    'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh',
    'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
    'ه': 'h', 'و': 'o', 'ي': 'y', 'ى': 'a', 'ـ': '', ' ': ' ',
  };
  const EN_STOP = new Set(['vs', 'fc', 'sc', 'ac', 'cf', 'as', 'kf', 'fk', 'sk', 'if', 'bk', 'cd', 'ud', 'ssc']);
  const trAr = (s) => (s || '').replace(/[ً-ْٰ]/g, '').split('')
    .map(c => AR_TR[c] !== undefined ? AR_TR[c] : c).join('')
    .toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const normLat = (s) => (s || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const editDist = (a, b) => {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = [...Array(n + 1).keys()], cur = new Array(n + 1);
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++)
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      const tmp = prev; prev = cur; cur = tmp;
    }
    return prev[n];
  };
  const fuzzyArEn = (home, away, enTitle) => {
    const arToks = trAr(home + ' ' + away).split(' ').filter(t => t.length >= 2);
    // Conflate letters Arabic has no distinct form for: v->f, p->b
    // (ليفربول/liverpool, نابولي/napoli, فياريال/villarreal).
    const enToks = normLat(enTitle).replace(/v/g, 'f').replace(/p/g, 'b')
      .split(' ').filter(t => t && !EN_STOP.has(t));
    if (!arToks.length || !enToks.length) return 99;
    let total = 0;
    for (const t of arToks) {
      let best = Infinity;
      for (const e of enToks) {
        const d = editDist(t, e) / Math.max(t.length, e.length);
        if (d < best) best = d;
      }
      total += best;
    }
    return total;
  };
  // Arabic league substring -> vipbox schedule tokens (tokens are countries
  // like 'england'/'saudi-arabia' or competitions like 'champions-league').
  const LEAGUE_MAP = [
    ['أبطال أوروبا', ['champions-league']], ['الأوروبي', ['europa-league']],
    ['المؤتمر', ['conference-league']], ['الإنجليز', ['england', 'premier-league']],
    ['الإسبان', ['spain', 'la-liga']], ['الإيطال', ['italy', 'serie-a']],
    ['الألمان', ['germany', 'bundesliga']], ['الفرنس', ['france', 'ligue-1']],
    ['البرتغال', ['portugal']], ['الهولند', ['netherlands']], ['التركي', ['turkey', 'turkiye']],
    ['السعود', ['saudi-arabia']], ['روشن', ['saudi-arabia']], ['الإسكتلند', ['scotland']],
    ['البرازيل', ['brazil']], ['الأرجنتين', ['argentina']], ['المكسيك', ['mexico']],
    ['أمريك', ['united-states']], ['كأس العالم', ['worldcup']], ['كوبا', ['copa-america']],
    ['اليونان', ['greece']], ['بلجيك', ['belgium']], ['النمسا', ['austria']],
    ['سويسر', ['switzerland']], ['الدنمارك', ['denmark']], ['النرويج', ['norway']],
    ['السويد', ['sweden']], ['كروات', ['croatia']], ['صرب', ['serbia']],
    ['التشيك', ['czech-republic']], ['بولند', ['poland']], ['أوكران', ['ukraine']],
    ['اليابان', ['japan']], ['كوريا', ['south-korea', 'korea']], ['الصين', ['china']],
    ['أسترال', ['australia']], ['المغرب', ['morocco']], ['الجزائر', ['algeria']],
    ['تونس', ['tunisia']], ['الإمارات', ['uae']], ['قطر', ['qatar']],
  ];
  // Hamza-insensitive: upstream writes اوروبا while the map has أوروبا.
  const normHamza = (s) => (s || '').replace(/[أإآ]/g, 'ا');
  const leagueHit = (arLeague, vipToken) => {
    if (!arLeague || !vipToken) return false;
    arLeague = normHamza(arLeague);
    const tok = vipToken.toLowerCase();
    return LEAGUE_MAP.some(([ar, toks]) =>
      arLeague.includes(normHamza(ar)) && toks.some(v => tok === v || tok.includes(v) || v.includes(tok)));
  };
  // Wall-clock HH:MM straight from the ISO strings (no Date/TZ math — the two
  // sites use different zones, so this is a soft bonus only, never a filter).
  const wallMin = (iso) => {
    const m = (iso || '').match(/T(\d{2}):(\d{2})/);
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  };
  const resolveVipboxMatch = async (home, away, startIso, leagueAr) => {
    if (!normAr(home) && !normAr(away)) return [];
    const UA = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Referer': 'https://vipbox.lc/',
    };
    try {
      const r = await fetchT('https://vipbox.lc/football-schedule', { headers: UA }, 8000);
      if (!r.ok) return [];
      const html = await r.text();
      const anchors = [...html.matchAll(/<a[^>]+href="\/onair\/football\/([A-Za-z0-9\-]+)"[^>]*title="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
      const seen = new Set();
      const items = [];
      for (const a of anchors) {
        const slug = a[1].toLowerCase();
        const title = (a[2] || '').trim().replace(/\s+/g, ' ');
        if (!slug || !title || seen.has(slug)) continue;
        seen.add(slug);
        const inner = a[3] || '';
        const tM = inner.match(/<span[^>]+content="([^"]+)"[^>]*>/i);
        const kickoff = tM ? tM[1] : null;
        const clock = (kickoff && (kickoff.match(/(\d{2}:\d{2})/) || [])[1]) || '';
        const lM = inner.match(/vip-box\s+([a-z\-]+)/i);
        const league = lM ? lM[1].toLowerCase() : '';
        items.push({ slug, title, kickoff, clock, league });
      }
      if (!items.length) return [];
      // Rank by fuzzy name score only. League/kickoff are CORROBORATION
      // (never filters — the two sites use different timezones and the league
      // map can miss). Tuned 2026-09-08 on 10 cases: 4/4 present matches
      // accepted, 6/6 absent correctly rejected (incl. the Atalanta/Atlante
      // near-collision, killed by the corroboration clause).
      const refMin = wallMin(startIso);
      const scored = items.map(it => ({ ...it, fz: fuzzyArEn(home, away, it.title) }))
        .sort((x, y) => x.fz - y.fz);
      const best = scored[0];
      const second = scored[1];
      if (!best || best.fz > 1.4) return [];
      if (second && (second.fz - best.fz) < 0.25) return [];
      const lh = leagueHit(leagueAr, best.league);
      let dd = null;
      if (refMin !== null && best.kickoff && wallMin(best.kickoff) !== null) {
        const d = Math.abs(wallMin(best.kickoff) - refMin);
        dd = Math.min(d, 1440 - d);
      }
      if (!lh && (dd === null || dd > 45)) return [];
      // Verify Video 1..3 exist (status + title) so we never show dead
      // buttons — in parallel with short budgets (sequential 3x6s + 8s
      // schedule blew the 10s serverless limit under load).
      const vids = (await Promise.all([1, 2, 3].map(async (n) => {
        try {
          const u = `https://vipbox.lc/live/football/${best.slug}-${n}`;
          const vr = await fetchT(u, { headers: UA }, 5000);
          if (!vr.ok) return null;
          const vh = await vr.text();
          const vt = (vh.match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
          if (!new RegExp(`Video\\s*${n}\\b`, 'i').test(vt)) return null;
          return {
            label: `Video ${n}`,
            sub: best.clock || undefined,
            url: u,
            play: `/api/vip?u=${encodeURIComponent(u)}`,
            kind: 'en',
            via: 'vipbox',
          };
        } catch { return null; }
      }))).filter(Boolean);
      return vids;
    } catch { return []; }
  };
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=30');
  
  if (!id && !href) {
    res.setHeader('Cache-Control', 'no-store'); // errors must never cache
    return res.status(400).json({ error: 'Missing id or href' });
  }

  // Try to get player from kooralive match page
  let target = href;
  let matchHome = qHome, matchAway = qAway;
  if ((!target || (!matchHome && !matchAway)) && id) {
    // If only id, try to find href + team names from matches API
    // (host-header-influenced URL is safe: any href it yields still passes
    // the kooralive allowlist below before being fetched).
    try {
      const matchesRes = await fetchT(`https://${req.headers.host}/api/matches?day=today`, {}, 7000);
      if (!matchesRes.ok) throw 0;
      const matches = await matchesRes.json();
      if (!Array.isArray(matches)) throw 0;
      const match = matches.find(m => String(m && m.id) === String(id));
      if (match) {
        if (!target) target = match.href;
        if (!matchHome) matchHome = match.home || '';
        if (!matchAway) matchAway = match.away || '';
      }
    } catch {}
  }
  
  if (!target) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({ error: 'Match not found', id });
  }

  // Ensure target is a full URL
  if (!target.startsWith('http')) target = 'https://kooralive-plus.info' + target;

  // SEC (SSRF): `href` is user input — the server must never fetch arbitrary
  // hosts (cloud metadata 169.254.169.254, intranet, etc.). Only our scrape
  // origin is allowed; everything else is a 400. Exact-or-subdomain match —
  // never substring (kooralive-plus.info.evil.com must fail).
  let targetHost = '';
  try { targetHost = new URL(target).hostname.toLowerCase(); } catch { res.setHeader('Cache-Control', 'no-store'); return res.status(400).json({ error: 'bad href' }); }
  if (!(targetHost === 'kooralive-plus.info' || targetHost.endsWith('.kooralive-plus.info'))){
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ error: 'href host not allowed' });
  }

  try {
    const upstream = await fetchT(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Referer': 'https://kooralive-plus.info/',
      }
    }, 8000);
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
          const apiRes = await fetchT(base + '/wp-json/sting/v1/iframes', {
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
          }, 7000);
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
    // VIPBox schedule resolves in parallel (independent fetch, fail-open).
    const [hd7, vipServers] = await Promise.all([
      resolveHd7(matchHome, matchAway).catch(() => null),
      resolveVipboxMatch(matchHome, matchAway, qStart || null, qLeague || null).catch(() => []),
    ]);
    const enServers = vipServers || [];

    const servers = [];
    const pushUnique = (entry) => {
      if (!entry || !entry.url) return;
      // SEC: only http(s) URLs leave the server — kills javascript:/data:
      // URL smuggling from compromised upstreams (client re-checks too).
      if (!/^https?:\/\//i.test(entry.url)) return;
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

    // found = a real playable embed exists (post-filter, not the raw inputs —
    // a dropped javascript: URL must not report found:true with the fallback).
    const hasPlayable = servers.some(s => s.kind !== 'fallback');
    if (hasPlayable) {
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
        enCount: (enServers || []).length,
        enServers: enServers || [],
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
        enCount: (enServers || []).length,
        enServers: enServers || [],
        message: 'No direct player found, use fallbackUrl with cleaning'
      });
    }
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'upstream failed', id });
  }
}
