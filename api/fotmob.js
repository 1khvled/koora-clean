export default async function handler(req, res) {
  // FotMob match-data bridge (added 2026-09-09): lineups, player ratings,
  // team stats, top players and match events for the player page.
  // Chain (all public, no keys — verified live):
  //   /api/data/matches?date=YYYYMMDD  -> pick OUR match via the proven
  //      Arabic->Latin fuzzy scorer (same gate as VIPBox/DaddyLive)
  //   /api/data/matchDetails?matchId=  -> lineup/stats/playerStats/events
  // Only trimmed, display-ready JSON leaves the server. Fail-open: anything
  // unresolved -> {found:false} and the frontend hides the section.
  const qHome = ((req.query.home || '')).toString();
  const qAway = ((req.query.away || '')).toString();
  const qStart = ((req.query.start || '')).toString();
  const qLeague = ((req.query.lg || req.query.league || '')).toString();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60');

  const fetchT = (url, ms = 9000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.fotmob.com/en-GB',
      },
    }).finally(() => clearTimeout(t));
  };
  const FM = 'https://www.fotmob.com';
  // --- shared fuzzy machinery (same tuning as the stream resolvers) ---
  const AR_TR = {
    'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ء': '', 'ؤ': 'w', 'ئ': 'y',
    'ب': 'b', 'ة': 'a', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
    'د': 'd', 'ذ': 'd', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
    'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh',
    'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
    'ه': 'h', 'و': 'o', 'ي': 'y', 'ى': 'a', 'ـ': '', ' ': ' ',
  };
  const EN_STOP = new Set(['vs', 'fc', 'sc', 'ac', 'cf', 'as', 'kf', 'fk', 'sk', 'if', 'bk', 'cd', 'ud', 'ssc']);
  const normAr = (s) => (s || '').toString()
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[ً-ْٰ]/g, '').replace(/\s+/g, ' ').trim();
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
  // Vowel-insensitive: Arabic script omits short vowels, so الفتح/fateh only
  // align consonant-to-consonant (validated 2026-09-09: fixes Fateh-type
  // misses, improves every correct margin, wrong cases still gate out).
  const noVow = (s) => s.replace(/[aeiou]/g, '');
  const fuzzyArEn = (home, away, enTitle) => {
    const arToks = trAr(home + ' ' + away).split(' ').map(noVow).filter(t => t.length >= 2);
    // Conflate letters Arabic has no distinct form for: v->f, p->b
    // (ليفربول/liverpool, نابولي/napoli, فياريال/villarreal).
    const enToks = normLat(enTitle).replace(/v/g, 'f').replace(/p/g, 'b')
      .split(' ').map(noVow).filter(t => t && t.length >= 2 && !EN_STOP.has(t));
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
  // FotMob league names are English ("Champions League", "LaLiga", "Serie A").
  // Hamza-insensitive: upstream writes اوروبا while the map has أوروبا.
  const normHamza = (s) => (s || '').replace(/[أإآ]/g, 'ا');
  const leagueHitEn = (arLeague, enText) => {
    arLeague = normHamza(arLeague);
    if (!arLeague || !enText) return false;
    const words = new Set(enText.toLowerCase().replace(/-/g, ' ').split(/[^a-z]+/).filter(w => w.length > 3));
    if (!words.size) return false;
    const MAP = [
      ['أبطال أوروبا', ['champions', 'league']], ['الأوروبي', ['europa']], ['المؤتمر', ['conference']],
      ['الإنجليز', ['england', 'premier']], ['الإسبان', ['spain', 'laliga', 'la', 'liga']],
      ['الإيطال', ['italy', 'serie']], ['الألمان', ['germany', 'bundesliga']],
      ['الفرنس', ['france', 'ligue']], ['البرتغال', ['portugal', 'primeira']],
      ['الهولند', ['netherlands', 'eredivisie']], ['التركي', ['turkey', 'turkiye', 'super', 'lig']],
      ['السعود', ['saudi', 'arabia', 'pro']], ['روشن', ['saudi', 'roshn']],
      ['الإسكتلند', ['scotland', 'scottish']], ['البرازيل', ['brazil', 'brasileiro']],
      ['الأرجنتين', ['argentina', 'liga', 'profesional']], ['المكسيك', ['mexico', 'liga']],
      ['أمريك', ['united', 'states', 'mls']], ['كأس العالم', ['world', 'cup']],
      ['اليونان', ['greece']], ['بلجيك', ['belgium']], ['النمسا', ['austria']],
      ['سويسر', ['switzerland', 'swiss']], ['الدنمارك', ['denmark', 'danish']],
      ['النرويج', ['norway']], ['السويد', ['sweden']], ['كروات', ['croatia']],
      ['صرب', ['serbia']], ['التشيك', ['czech']], ['بولند', ['poland', 'ekstraklasa']],
      ['أوكران', ['ukraine']], ['اليابان', ['japan', 'league']], ['كوريا', ['korea']],
      ['الصين', ['china']], ['أسترال', ['australia', 'league']], ['المغرب', ['morocco', 'botola']],
      ['الجزائر', ['algeria', 'ligue']], ['تونس', ['tunisia', 'ligue']], ['مصر', ['egypt', 'egyptian']],
      ['الإمارات', ['uae', 'emirates']], ['قطر', ['qatar', 'stars']],
    ];
    return MAP.some(([ar, toks]) => arLeague.includes(normHamza(ar)) && toks.some(v => words.has(v)));
  };
  const wallMin = (iso) => {
    const m = (iso || '').match(/T(\d{2}):(\d{2})/);
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  };
  const num1 = (v) => {
    const n = parseFloat(v);
    return isFinite(n) ? Math.round(n * 10) / 10 : null;
  };
  const str40 = (v) => String(v == null ? '' : v).slice(0, 40);
  const pidOf = (v) => (/^\d{1,12}$/.test(String(v == null ? '' : v)) ? String(v) : '');
  const shortOf = (p) => {
    const last = (p.lastName || '').trim();
    if (last) return last.split(/\s+/).slice(-1)[0].slice(0, 20);
    const full = str40((p.firstName && p.lastName) ? p.firstName + ' ' + p.lastName : p.name);
    return full.split(/\s+/).slice(-1)[0] || full;
  };
  const clipNum = (v) => {
    const s = String(v == null ? '' : v);
    return /^[\d.,%()'’\s-]+$/.test(s) && /\d/.test(s) ? s.slice(0, 14) : '';
  };

  if (!normAr(qHome) && !normAr(qAway))
    return res.status(400).json({ error: 'missing home/away' });

  try {
    // 1) candidate dates: match-day first, then the UTC-adjacent day
    // (late-night +03:00 matches belong to the previous UTC day on FotMob).
    const base = (qStart.match(/(\d{4})-(\d{2})-(\d{2})/) || []).slice(1, 4);
    const dates = [];
    if (base.length === 3) {
      const d0 = base.join('');
      dates.push(d0);
      const dt = new Date(`${base[0]}-${base[1]}-${base[2]}T12:00:00Z`);
      if (!isNaN(dt)) {
        const prev = new Date(dt.getTime() - 86400000);
        dates.push(prev.toISOString().slice(0, 10).replace(/-/g, ''));
      }
    } else {
      dates.push(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
    }

    // Both candidate dates fetched IN PARALLEL (sequential 9s+10s blew the 10s
    // serverless budget); gating runs once over the combined pool.
    const days = (await Promise.all(dates.slice(0, 2).map(async (date) => {
      try {
        const r = await fetchT(`${FM}/api/data/matches?date=${date}&ccode3=USA_en`, 7000);
        if (!r.ok) return null;
        return await r.json();
      } catch { return null; }
    }))).filter(Boolean);
    const items = [];
    const seenIds = new Set();
    for (const day of days) {
      for (const lg of (day.leagues || [])) {
        for (const m of (lg.matches || [])) {
          const h = (m.home && m.home.name) || '', a = (m.away && m.away.name) || '';
          if (!h && !a) continue;
          // Same match can spill into both date buckets near midnight —
          // dedupe by id or the twin ties the margin gate at 0.
          if (m.id != null) {
            if (seenIds.has(String(m.id))) continue;
            seenIds.add(String(m.id));
          }
          // Youth/reserve games (U19/U21/…) transliterate identically to their
          // senior sides and tie the fuzzy score — dropping them from the pool
          // outright (a genuine youth query simply hides the section: safe).
          if (/\bU1[5-9]\b|\bU2[0-3]\b|\byouth\b|\breserve\b|\bII\b/i.test(h + ' ' + a)) continue;
          items.push({
            id: m.id, h, a, league: lg.name || '',
            time: m.time || '',
            hs: m.home && m.home.score, as: m.away && m.away.score,
          });
        }
      }
    }
    let best = null;
    if (items.length) {
      const refMin = wallMin(qStart);
      const scored = items.map(it => ({ ...it, fz: fuzzyArEn(qHome, qAway, it.h + ' vs ' + it.a) }))
        .sort((x, y) => x.fz - y.fz);
      const b0 = scored[0], b1 = scored[1];
      const margin = b1 ? b1.fz - b0.fz : 99;
      const lh = leagueHitEn(qLeague, b0.league);
      let dd = null;
      // FotMob times look like "09.09.2026 18:45" — take the LAST HH:MM
      // (the first regex hit would be the date part "09.09").
      const tms = [...(b0.time || '').matchAll(/(\d{2})[.:](\d{2})/g)];
      const tm = tms.length ? tms[tms.length - 1] : null;
      if (refMin !== null && tm) {
        const d = Math.abs((+tm[1]) * 60 + (+tm[2]) - refMin);
        dd = Math.min(d, 1440 - d);
      }
      const corroborated = lh || (dd !== null && dd <= 120);
      // Strict margin normally; relaxed when league AND kickoff both agree
      // (e.g. Saudi derbies whose transliterations legitimately collide).
      if (b0.fz <= 1.4 && margin >= 0.25 && corroborated) best = b0;
      else if (b0.fz <= 1.4 && margin >= 0.10 && lh && dd !== null && dd <= 120) best = b0;
    }
    if (!best) return res.status(200).json({ found: false });

    // 2) full details (matchId comes from FotMob's own JSON — still validated
    // digits-only so a compromised upstream can't turn it into URL injection).
    if (!/^\d{1,12}$/.test(String(best.id))) return res.status(200).json({ found: false });
    const dr = await fetchT(`${FM}/api/data/matchDetails?matchId=${best.id}&ccode3=USA_en`, 8000);
    if (!dr.ok) return res.status(200).json({ found: false });
    const d = await dr.json();
    const header = d.header || {};
    const teams = header.teams || [];
    const general = d.general || {};
    const content = d.content || {};
    const lineup = content.lineup || {};

    const side = (t) => {
      t = t || {};
      const cmap = (p) => ({
        pid: pidOf(p.id),
        name: str40((p.firstName && p.lastName) ? p.firstName + ' ' + p.lastName : p.name),
        short: str40(shortOf(p)),
        num: str40(p.shirtNumber),
        x: typeof p.horizontalLayout?.x === 'number' ? Math.round(p.horizontalLayout.x * 100) / 100 : null,
        y: typeof p.horizontalLayout?.y === 'number' ? Math.round(p.horizontalLayout.y * 100) / 100 : null,
        rating: num1(p.performance && p.performance.rating),
      });
      return {
        name: str40(t.name),
        formation: str40(t.formation),
        rating: num1(t.rating),
        coach: str40(t.coach && t.coach.name),
        starters: (t.starters || []).slice(0, 11).map(cmap),
        subs: (t.subs || []).slice(0, 9).map(cmap),
        unavailable: (t.unavailable || []).slice(0, 6).map(p => ({
          name: str40((p.firstName && p.lastName) ? p.firstName + ' ' + p.lastName : p.name),
          reason: str40(p.reason || p.injury || p.status || ''),
        })),
      };
    };
    let stats = [];
    let periods = {};
    try {
      // Shape is {Periods:{All:{stats:[...]}}} (sometimes {stats:[...]}).
      const root = content.stats || {};
      const parseGroups = (groups) => {
        const list = Array.isArray(groups) ? groups : [];
        const top = list.find(g => g.key === 'top_stats') || list[0];
        return ((top && top.stats) || []).slice(0, 8).map(s => ({
          title: str40(s.title),
          home: clipNum(Array.isArray(s.stats) ? s.stats[0] : ''),
          away: clipNum(Array.isArray(s.stats) ? s.stats[1] : ''),
        })).filter(s => s.title && (s.home !== '' || s.away !== ''));
      };
      // Per-half splits for the in-page period switcher (additive: `stats`
      // keeps its exact previous meaning = All). Small by design (<=3x8 rows).
      if (root.Periods && typeof root.Periods === 'object') {
        for (const k of ['All', '1H', '2H']) {
          const pg = root.Periods[k];
          if (pg && Array.isArray(pg.stats)) {
            const parsed = parseGroups(pg.stats);
            if (parsed.length) periods[k] = parsed;
          }
        }
      }
      const groups = root.stats || (root.Periods && (root.Periods.All || root.Periods[Object.keys(root.Periods)[0] || ''] || {}).stats) || [];
      stats = parseGroups(groups);
      if (!periods.All && stats.length) periods.All = stats;
    } catch {}

    let events = [];
    try {
      const ev = (((content.matchFacts || {}).events || {}).events) || [];
      events = ev.filter(e => /^(goal|card|substitution)$/i.test(String(e.type || ''))).slice(0, 24).map(e => {
        const t = String(e.type || '');
        const kind = /^goal$/i.test(t) ? 'goal' : /^card$/i.test(t) ? 'card' : 'sub';
        const swapArr = Array.isArray(e.swap) ? e.swap : [];
        const swap = swapArr.map(s => s && s.name).filter(Boolean).join(' ⇄ ');
        const swapPids = swapArr.map(s => pidOf(s && s.id)).filter(Boolean);
        const detail = kind === 'goal' ? (e.goalDescription || (e.ownGoal ? 'Own goal' : ''))
          : kind === 'card' ? String(e.card || '') : '';
        const tstr = e.timeStr != null ? String(e.timeStr) : '';
        return {
          min: str40(tstr ? tstr + ((e.overloadTime && !tstr.includes('+')) ? '+' + e.overloadTime : '') + '’' : ''),
          kind,
          home: !!e.isHome,
          pid: pidOf(e.player && e.player.id),
          player: str40(e.nameStr || (e.player && e.player.name && e.player.name.trim()) || swap),
          swapPids,
          red: kind === 'card' && /\bred\b/i.test(String(e.card || '') + ' ' + String(e.cardDescription || '')),
          detail: str40(detail),
          score: (e.homeScore != null && e.awayScore != null) ? `${e.homeScore}-${e.awayScore}` : '',
        };
      }).filter(e => e.player);
    } catch {}
    let topPlayers = [];
    try {
      const tp = (content.matchFacts || {}).topPlayers || {};
      const homeId = (lineup.homeTeam || {}).id;
      const all = [...(tp.homeTopPlayers || []), ...(tp.awayTopPlayers || [])]
        .map(p => ({
          pid: pidOf(p.playerId),
          name: str40(p.name && (p.name.fullName || (p.name.firstName + ' ' + p.name.lastName))),
          team: str40(p.teamName),
          home: !!(p.teamId && homeId && String(p.teamId) === String(homeId)),
          rating: num1(p.playerRating),
          motm: !!p.manOfTheMatch,
        }))
        .filter(p => p.name && p.rating != null)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 4);
      topPlayers = all;
    } catch {}

    // Logos must be https (never javascript:/data:) — frontend re-checks too.
    const logoOk = (u) => {
      const s = String(u || '');
      return /^https:\/\//i.test(s) && !/[\s<>"]/.test(s) ? s.slice(0, 160) : '';
    };
    return res.status(200).json({
      found: true,
      matchId: best.id,
      home: { name: str40(teams[0]?.name || best.h), score: teams[0]?.score, logo: logoOk(teams[0]?.imageUrl) },
      away: { name: str40(teams[1]?.name || best.a), score: teams[1]?.score, logo: logoOk(teams[1]?.imageUrl) },
      started: !!general.started,
      finished: !!general.finished,
      league: str40(general.leagueName || best.league),
      lineups: { home: side(lineup.homeTeam), away: side(lineup.awayTeam) },
      stats, periods, events, topPlayers,
    });
  } catch (e) {
    return res.status(200).json({ found: false });
  }
}
