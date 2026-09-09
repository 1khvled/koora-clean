export default async function handler(req, res) {
  // Goal scorers for the index rows (added 2026-09-09): for every LIVE or
  // FINISHED match of the day, resolve the FotMob match (same strict fuzzy
  // gate as api/fotmob.js) and return its goal events. The index paints
  // "⚽ name min’" under each team. One call covers the whole day; the edge
  // caches it 60s so N viewers don't N× the upstream cost.
  // GET /api/scorers?day=today|yesterday|tomorrow
  const day = (req.query.day || 'today').toString();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=60, max-age=30');
  if (!['today', 'yesterday', 'tomorrow'].includes(day)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ error: 'bad day' });
  }

  const fetchT = (url, opts = {}, ms = 8000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
  };
  const UA = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://www.fotmob.com/en-GB',
  };
  // --- fuzzy machinery (same tuning as api/fotmob.js; kept in sync) ---
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
  const noVow = (s) => s.replace(/[aeiou]/g, '');
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
    const arToks = trAr(home + ' ' + away).split(' ').map(noVow).filter(t => t.length >= 2);
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
      ['الفرنس', ['france', 'ligue']], ['السعود', ['saudi', 'arabia', 'pro']],
      ['روشن', ['saudi', 'roshn']], ['الأمريك', ['united', 'states', 'mls']],
    ];
    return MAP.some(([ar, toks]) => arLeague.includes(normHamza(ar)) && toks.some(v => words.has(v)));
  };
  const wallMin = (iso) => {
    const m = (iso || '').match(/T(\d{2}):(\d{2})/);
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  };
  const str32 = (v) => String(v == null ? '' : v).slice(0, 32);
  const isLiveLike = (m) => {
    const s = [m.official_status, m.status, m.game_time, m.result_text].join(' ');
    return /جارية|مباشر|الشوط|استراحة|\b(1H|2H|HT|LIVE)\b/i.test(s);
  };
  const isEndedLike = (m) => /انتهت|نهاية|\bFT\b|\bFull-?Time\b/i.test(
    [m.official_status, m.status, m.result_text].join(' '));

  try {
    // 1) our matches (same-origin self fetch; hrefs it yields are ours).
    const selfRes = await fetchT(`https://${req.headers.host}/api/matches?day=${day}`, {}, 7000);
    if (!selfRes.ok) throw 0;
    const ours = await selfRes.json();
    if (!Array.isArray(ours)) throw 0;
    const wanted = ours.filter(m => m && (isLiveLike(m) || isEndedLike(m)));
    if (!wanted.length) return res.status(200).json({ day, count: 0, goals: {} });

    // 2) FotMob day lists for the distinct dates involved (cap 3, parallel).
    const dates = [...new Set(wanted.map(m => {
      const mm = String(m.start || '').match(/(\d{4})-(\d{2})-(\d{2})/);
      return mm ? mm[1] + mm[2] + mm[3] : null;
    }).filter(Boolean))].slice(0, 3);
    if (!dates.length) {
      dates.push(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
    }
    const pools = (await Promise.all(dates.map(async (date) => {
      try {
        const r = await fetchT(`https://www.fotmob.com/api/data/matches?date=${date}&ccode3=USA_en`, { headers: UA }, 7000);
        if (!r.ok) return [];
        const dj = await r.json();
        const out = [];
        const seen = new Set();
        for (const lg of (dj.leagues || [])) {
          for (const mm of (lg.matches || [])) {
            const h = (mm.home && mm.home.name) || '', a = (mm.away && mm.away.name) || '';
            if (!h && !a) continue;
            if (/\bU1[5-9]\b|\bU2[0-3]\b|\byouth\b|\breserve\b|\bII\b/i.test(h + ' ' + a)) continue;
            if (mm.id != null) {
              if (seen.has(String(mm.id))) continue;
              seen.add(String(mm.id));
            }
            const tms = [...String(mm.time || '').matchAll(/(\d{2})[.:](\d{2})/g)];
            const tm = tms.length ? tms[tms.length - 1] : null;
            out.push({ id: mm.id, h, a, league: lg.name || '', clock: tm ? tm[1] + ':' + tm[2] : '' });
          }
        }
        return out;
      } catch { return []; }
    }))).flat();

    // 3) gate each wanted match, then pull details in parallel for the hits.
    const hits = [];
    for (const m of wanted) {
      const refMin = wallMin(m.start);
      const scored = pools.map(it => ({ ...it, fz: fuzzyArEn(m.home, m.away, it.h + ' vs ' + it.a) }))
        .sort((x, y) => x.fz - y.fz);
      const b0 = scored[0], b1 = scored[1];
      if (!b0 || b0.fz > 1.4) continue;
      const margin = b1 ? b1.fz - b0.fz : 99;
      const lh = leagueHitEn(m.league_text || m.league, b0.league);
      let dd = null;
      if (refMin !== null && b0.clock && /^\d{2}:\d{2}$/.test(b0.clock)) {
        const d = Math.abs((+b0.clock.slice(0, 2)) * 60 + (+b0.clock.slice(3)) - refMin);
        dd = Math.min(d, 1440 - d);
      }
      if (margin < 0.25 && !(margin >= 0.10 && lh && dd !== null && dd <= 120)) continue;
      if (!lh && (dd === null || dd > 120)) continue;
      hits.push({ ours: m, fmId: b0.id });
    }
    const goals = {};
    await Promise.all(hits.slice(0, 14).map(async ({ ours, fmId }) => {
      try {
        if (!/^\d{1,12}$/.test(String(fmId))) return;
        const r = await fetchT(`https://www.fotmob.com/api/data/matchDetails?matchId=${fmId}&ccode3=USA_en`, {}, 8000);
        if (!r.ok) return;
        const dj = await r.json();
        const ev = (((dj.content || {}).matchFacts || {}).events || {}).events || [];
        const h = [], a = [];
        for (const e of ev) {
          if (!/^goal$/i.test(String(e.type || ''))) continue;
          const nm = str32(e.nameStr || (e.player && e.player.name && e.player.name.trim()));
          if (!nm) continue;
          let min = e.timeStr != null ? String(e.timeStr) : '';
          if (e.overloadTime && !min.includes('+')) min += '+' + e.overloadTime;
          const row = { p: nm, m: (min ? min + '’' : '') };
          if (e.isHome) { if (h.length < 4) h.push(row); }
          else if (a.length < 4) a.push(row);
        }
        if (h.length || a.length) goals[String(ours.id)] = { h, a };
      } catch {}
    }));
    return res.status(200).json({ day, count: Object.keys(goals).length, goals });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ day, count: 0, goals: {} });
  }
}
