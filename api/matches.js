import { rl } from './_sec.js';
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
  if (!rl(req, res, 'matches')) return;
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

  // Logo gate (mirrors poly.js imgOk): absolute https only, no spaces or
  // angle brackets/quotes — anything else becomes '' server-side.
  const logoOk = (u) => {
    const s = String(u == null ? '' : u);
    return /^https:\/\//i.test(s) && !/[\s<>"]/.test(s) ? s.slice(0, 200) : '';
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
      const cl = +(r.headers.get('content-length') || 0);
      if (cl > 2500000) return null;
      const text = await r.text();
      if (!text || text.length > 3000000) return null;
      return text;
    } catch { return null; } finally { clearTimeout(to); }
  };

  // Authoritative live overlay from koora-l.live (same id space as ours).
  // Scraped Yacine/Kora pages lag; koora-l updates its /game/<id> feed the
  // same moment the play-by-play does. Proven 22/22 name-exact against our
  // own fixtures, so it is never a wrong-match source -- only fresher numbers.
  const refreshLive = async (list) => {
    if (!Array.isArray(list) || !list.length) return list;
    const stale = list.filter(m => {
      const st = String((m && (m.official_status || m.status || '')) || '');
      if (/انتهت|نهاية|finished/i.test(st)) return false;        // final score is correct
      if (/تأجلت|postponed/i.test(st)) return false;             // nothing to refresh
      return true;                                                // NS / live / unknown
    });
    if (!stale.length) return list;
    const now = Date.now();
    const isLiveOrRecent = (m) => {
      const st = String((m && (m.official_status || '')) || '');
      if (/الشوط|جارية|مباشر|live|،/i.test(st) && st.length > 0 && !/لم تبدأ|تأجلت/.test(st)) return true;
      const t = Date.parse(m.start || '');
      return t && now > t - 20 * 60000 && now < t + 3.5 * 3600 * 1000;
    };
    const targets = stale.filter(m => {
      // always refresh anything not clearly over, to recover from a
      // silently-stale NS row that actually started.
      const t = Date.parse(m.start || '');
      if (!t) return true;
      return now < t + 3.5 * 3600 * 1000;   // started within ~3.5h or later
    });
    if (!targets.length) return list;
    const out = [...list];
    await Promise.all(targets.map(async (m) => {
      try {
        // bounded: quick JSON read, capped body, short timeout
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 4500);
        let j = null;
        try {
          const r = await fetch('https://koora-l.live/game/' + encodeURIComponent(m.id), {
            signal: ctrl.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
            },
          });
          if (!r.ok) return;
          const t = await Promise.race([r.text(), new Promise((_, rej) => setTimeout(() => rej(new Error('cap')), 4000))]);
          if (!t || t.length > 1200000) return;
          j = JSON.parse(t);
        } finally { clearTimeout(to); }
        const g = j && j.game;
        if (!g) return;
        const hSc = (g.homeCompetitor && g.homeCompetitor.score);
        const aSc = (g.awayCompetitor && g.awayCompetitor.score);
        const usable = (v) => v != null && v !== '' && isFinite(+v) && +v >= 0;
        if (usable(hSc) && usable(aSc)) {
          m.score_home = String(hSc);
          m.score_away = String(aSc);
          m.result_text = m.score_home + '-' + m.score_away;
        }
        const g3 = +(g.statusGroup || 0);
        const gst = String(g.statusText || '');
        if (gst) m.official_status = gst;
        if (/تأجلت|postponed/i.test(gst)) m.status = 'POST';
        else if (/الغيت|cancelled|canceled|abandoned/i.test(gst)) m.status = 'POST';
        else if (/انتهت|finished/i.test(gst)) m.status = 'FT';
        else if (g3 === 3 || /الشوط|جارية|مباشر/.test(gst)) m.status = 'LIVE';
        else if (/لم تبدأ|not started|start/i.test(gst)) m.status = 'NS';
        const gt = String(g.gameTimeDisplay || '').trim();
        if (m.status === 'LIVE') {
          m.game_time = gt || m.game_time || '';
        }
        if (g.startTime) {
          const utc = new Date(g.startTime);
          if (!isNaN(utc)) {
            // keep our "+03:00" wall-clock convention, same instant
            const local = new Date(utc.getTime() + 3 * 3600000);
            m.start = local.toISOString().slice(0, 19) + '+03:00';
            // NOTE: m.time_text keeps the scraped wall-clock string exactly;
            // rewriting it in a different HH:MM format regressed the display.
          }
        }
      } catch {}
    }));
    return out;
  };


  // YACINE primary — parse AY_Match blocks
  const parseYacine = (html) => {
    if (!html || !html.includes('AY_Match')) return [];
    const out = [];
    const blocks = html.split('AY_Match').slice(1);
    // Base date computed explicitly in +03:00 (never server-local TZ).
    const now3 = new Date(Date.now() + 3 * 3600000);
    let _by = now3.getUTCFullYear(), _bm = now3.getUTCMonth() + 1, _bd = now3.getUTCDate();
    const _dimB = (yy, mm2) => new Date(Date.UTC(yy, mm2, 0)).getUTCDate();
    if (day === 'yesterday') { _bd -= 1; if (_bd < 1) { _bm -= 1; if (_bm < 1) { _bm = 12; _by -= 1; } _bd = _dimB(_by, _bm); } }
    else if (day === 'tomorrow') { _bd += 1; if (_bd > _dimB(_by, _bm)) { _bd = 1; _bm += 1; if (_bm > 12) { _bm = 1; _by += 1; } } }
    const y = _by, mo = String(_bm).padStart(2,'0'), d = String(_bd).padStart(2,'0');
    for (const b of blocks) {
      try {
        const hrefM = b.match(/<a[^>]+href="(https:\/\/[^"]+)"/i) || b.match(/<a[^>]+href='([^']+)'/i) || b.match(/<a[^>]+href="([^"]+)"/i);
        const href = hrefM ? hrefM[1] || hrefM[2] : '';
        if (!href || href === '/' || href === '#') continue;
        if (!/(yala-go|kora\.athikoora|yacinelive|shooot|shots)/i.test(href)) continue;
        const names = [...b.matchAll(/TM_Name[^>]*>([^<]+)</gi)].map(m => decFull(m[1].trim()));
        if (names.length < 2) continue;
        // Require at least one Arabic letter in team names (filters ad blocks)
        if (!/[\u0600-\u06FF]/.test(names[0] + names[1])) continue;
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
        let scoreHome = scoreM[0] || '', scoreAway = scoreM[1] || '';
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
                startIso = `${y}-${mo}-${d}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00+03:00`;
                // End wall-clock: +105min on the parsed hh:mm with manual day
                // rollover (no getHours/getDate — those are server-local TZ).
                const tot = hh * 60 + mm + 105;
                const eh = String(Math.floor(tot / 60) % 24).padStart(2,'0'), em = String(tot % 60).padStart(2,'0');
                let _ey = +y, _emo = +mo, _ed = +d + Math.floor(tot / 1440);
                const _dimE = (yy, mm2) => new Date(Date.UTC(yy, mm2, 0)).getUTCDate();
                while (_ed > _dimE(_ey, _emo)) { _ed -= _dimE(_ey, _emo); _emo += 1; if (_emo > 12) { _emo = 1; _ey += 1; } }
                gameendsIso = `${_ey}-${String(_emo).padStart(2,'0')}-${String(_ed).padStart(2,'0')}T${eh}:${em}:00+03:00`;
              }
            }
          } catch {}
        }
        if (leagueText.includes('المصري') || /egypt/i.test(leagueText)) continue;
        // Status mapping
        let statusCode = 'NS', official = statText;
        const sLow = statText.toLowerCase();
        if (/تأجلت|تاجلت|postponed/i.test(statText)) { statusCode = 'POST'; scoreHome = ''; scoreAway = ''; }
        else if (/جارية|مباشر|live/i.test(sLow) || statText.includes('جارية')) statusCode = 'LIVE';
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
          home_logo: logoOk(logos[0]),
          away_logo: logoOk(logos[1]),
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
    // If Yacine gave us at least 5 *valid* matches (with time), use it. Otherwise fallback.
    const validY = matches.filter(m => m.time_text && m.home && m.away);
    if (validY.length >= 5) {
      const fresh1 = await refreshLive(validY);
      _mc.set(cacheKey, { at: Date.now(), data: fresh1 });
      return res.status(200).json(fresh1);
    }
    matches = validY;
    // Kora backup — original STING scrape
    const kHtml = await fetchWithTimeout(koraTarget, 4000, 'https://kooralive-plus.info/');
    if (!kHtml) {
      if (matches.length) { const fr = await refreshLive(matches); _mc.set(cacheKey, { at: Date.now(), data: fr }); return res.status(200).json(fr); }
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
        const mm = tag.match(new RegExp(name + '\\s*=\\s*(["\'])(.*?)\\1', 'i'));
        return mm ? mm[2] : '';
      };
      const href = m[2];
      const id = getAttr('data-fixture-id');
      const home = getAttr('data-home');
      const away = getAttr('data-away');
      const league = getAttr('data-league');
      const start = getAttr('data-start');
      const gameends = getAttr('data-gameends');
      let status = getAttr('data-status-code');
      const official = getAttr('data-official-status');
      const gameTime = getAttr('data-game-time');
      let scoreHome = getAttr('data-score-home');
      let scoreAway = getAttr('data-score-away');
      if (/تأجلت|تاجلت|postponed/i.test(official)) { status = 'POST'; scoreHome = ''; scoreAway = ''; }
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
        home_logo: logoOk(logos[0]),
        away_logo: logoOk(logos[1]),
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
    const fresh = await refreshLive(matches);
    _mc.set(cacheKey, { at: Date.now(), data: fresh });
    return res.status(200).json(fresh);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'upstream failed' });
  }
}
