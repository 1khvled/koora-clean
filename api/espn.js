import { rl, cap, fetchableUrl } from './_sec.js';
export default async function handler(req, res) {
  // ESPN real minutes (free public JSON API, no key, no scraping).
  // GET ?home=&away=&start=&lg= -> best matching event with the REAL live
  // clock (displayClock "67'"), half and status. Fuzzy machinery is the
  // proven fotmob set (copied byte-exact — keep in sync if that changes).
  // Fail-open {found:false}; {blocked:true} when ESPN edge denies us.
  const qHome = cap(req.query.home || '', 120);
  const qAway = cap(req.query.away || '', 120);
  const qStart = cap(req.query.start || '', 64);
  const qLeague = cap(req.query.lg || req.query.league || '', 80);

  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!rl(req, res, 'espn')) return;
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');

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
const normFrag = (s) => normAr(s).replace(/[.\-_/]/g, ' ').replace(/\s+/g, ' ').trim();
  const ALIAS = [
    ['دي سي', ['dc', 'united']], ['ديسي', ['dc', 'united']],
    ['فيلادلفيا', ['philadelphia']], ['كولومبوس', ['columbus']],
    ['مونتريال', ['montreal']], ['شارلوت', ['charlotte']],
    ['لوس أنجلوس', ['los', 'angeles']], ['نيويورك', ['new', 'york']],
    ['فانكوفر', ['vancouver']], ['وايت كابس', ['whitecaps']], ['غالاكسي', ['galaxy']],
    ['اتحاد العاصمة', ['usm', 'alger']], ['شبيبة الأبيار', ['el', 'biar']],
  ];
  const applyAlias = (toks, rawNorm) => {
    // toks arrive already devoweled — compare devoweled drop-sets too.
    let out = [...toks];
    const flat = ' ' + rawNorm.replace(/[.\-_/]/g, ' ') + ' ';
    for (const [frag, en] of ALIAS) {
      const nf = normFrag(frag);
      if (!nf || (!flat.includes(' ' + nf + ' ') && !flat.replace(/\s+/g, '').includes(nf.replace(/\s+/g, '')))) continue;
      const drop = new Set((trAr(frag) + ' ' + trAr(frag.replace(/\s+/g, ''))).split(' ').map(noVow).filter(t => t.length >= 2));
      out = out.filter(t => !drop.has(t));
      out = out.concat(en.map(noVow).filter(t => t.length >= 2));
    }
    return [...new Set(out)];
  };
  
  // Our Arabic league -> ESPN slug. Order matters (champions before europa).
  const normH = (s) => (s || '').replace(/[\u0623\u0625\u0622]/g, '\u0627');
  const LEAGUE_SLUG = [
    ['\u0627\u0628\u0637\u0627\u0644 \u0627\u0648\u0631\u0648\u0628\u0627', 'uefa.champions'], ['\u062f\u0648\u0631\u064a \u0627\u0644\u0627\u0628\u0637\u0627\u0644', 'uefa.champions'], ['champions league', 'uefa.champions'], ['\bucl\b', 'uefa.champions'],
    ['\u0627\u0644\u0627\u0648\u0631\u0648\u0628\u064a', 'uefa.europa'], ['europa', 'uefa.europa'],
    ['\u0627\u0644\u0627\u0646\u062c\u0644\u064a\u0632', 'eng.1'], ['premier', 'eng.1'], ['england', 'eng.1'],
    ['\u0627\u0644\u0627\u0633\u0628\u0627\u0646', 'esp.1'], ['laliga', 'esp.1'], ['la liga', 'esp.1'],
    ['\u0627\u0644\u0627\u064a\u0637\u0627\u0644', 'ita.1'], ['serie', 'ita.1'],
    ['\u0627\u0644\u0627\u0644\u0645\u0627\u0646', 'ger.1'], ['bundesliga', 'ger.1'],
    ['\u0627\u0644\u0641\u0631\u0646\u0633', 'fra.1'], ['ligue 1', 'fra.1'],
    ['\u0627\u0644\u0647\u0648\u0644\u0646\u062f', 'ned.1'], ['eredivisie', 'ned.1'],
    ['\u0627\u0644\u0628\u0631\u062a\u063a\u0627\u0644', 'por.1'], ['primeira', 'por.1'],
    ['\u0627\u0644\u062a\u0631\u0643', 'tur.1'], ['super lig', 'tur.1'],
    ['\u062a\u0634\u0627\u0645\u0628\u064a\u0648\u0646\u0634\u064a\u0628', 'eng.2'], ['championship', 'eng.2'],
    ['\u0627\u0644\u0627\u0645\u0631\u064a\u0643', 'usa.1'], ['\bmls\b', 'usa.1'], ['major league', 'usa.1'],
    ['\u0627\u0644\u0633\u0639\u0648\u062f', 'ksa.1'], ['\u0631\u0648\u0634\u0646', 'ksa.1'], ['saudi', 'ksa.1'], ['roshn', 'ksa.1'],
  ];
  const slugFor = (lg) => {
    const s = normH((lg || '').toLowerCase());
    for (const [frag, slug] of LEAGUE_SLUG) {
      if (frag.startsWith('\\b')) { if (new RegExp(frag, 'i').test(s)) return slug; }
      else if (s.includes(frag)) return slug;
    }
    return '';
  };
  const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
  const ALL_SLUGS = ['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'ned.1', 'por.1', 'tur.1', 'eng.2', 'usa.1', 'ksa.1', 'uefa.champions', 'uefa.europa'];
  const ymdOf = (iso, back) => {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const t = new Date(d.getTime() + (back ? -86400000 : 0));
    return t.toISOString().slice(0, 10).replace(/-/g, '');
  };
  // ESPN clock: "67'" -> 67, "45'+2'" -> 47, "90'+6'" -> 96.
  const parseClock = (c) => {
    const t = String(c == null ? '' : c);
    const m = t.match(/(\d{1,3})\s*'\s*\+\s*(\d{1,2})\s*'/) || t.match(/(\d{1,3})\s*'/);
    if (!m) return null;
    const v = (+m[1]) + (+(m[2] || 0));
    return (v >= 1 && v <= 130) ? v : null;
  };
  const halfOfEv = (st) => {
    const n = (st && st.type && st.type.name) || '';
    if (n === 'STATUS_HALFTIME') return 'HT';
    if (n === 'STATUS_FULL_TIME') return 'FT';
    if (n === 'STATUS_IN_PROGRESS') return (st && st.period === 2) ? 2 : ((st && st.period === 1) ? 1 : null);
    return null;
  };
  const statusOf = (st) => {
    const n = (st && st.type && st.type.name) || '';
    if (n === 'STATUS_IN_PROGRESS') return 'live';
    if (n === 'STATUS_HALFTIME') return 'ht';
    if (n === 'STATUS_FULL_TIME') return 'ft';
    return 'sched';
  };
  const trimEv = (e, slug) => {
    try {
      const comp = (e.competitions || [])[0] || {};
      const sts = e.status || comp.status || {};
      const cs = comp.competitors || [];
      const h = cs.find(c => c.homeAway === 'home') || {};
      const a = cs.find(c => c.homeAway === 'away') || {};
      return {
        eid: String(e.id || ''), slug, date: e.date || comp.date || '',
        clock: sts.displayClock || '', min: parseClock(sts.displayClock),
        half: halfOfEv(sts), status: statusOf(sts),
        detail: (sts.type && (sts.type.shortDetail || sts.type.detail)) || '',
        h: { name: (h.team || {}).displayName || '', abbr: (h.team || {}).abbreviation || '' },
        a: { name: (a.team || {}).displayName || '', abbr: (a.team || {}).abbreviation || '' },
      };
    } catch { return null; }
  };
  // Per-side token scorer (same tuning family as fuzzyArEn): mean best
  // normalized edit distance over devoweled consonant tokens, both orders.
  const sideDist = (arToks, enToks) => {
    if (!arToks.length || !enToks.length) return 99;
    let tot = 0;
    for (const t of arToks) {
      let best = Infinity;
      for (const e of enToks) {
        const d = editDist(t, e) / Math.max(t.length, e.length);
        if (d < best) best = d;
      }
      tot += best;
    }
    return tot / arToks.length;
  };
  const enToksOf = (name, short) => normLat((name || '') + ' ' + (short || ''))
    .replace(/v/g, 'f').replace(/p/g, 'b').split(' ').map(noVow).filter(t => t && t.length >= 2 && !EN_STOP.has(t));
  const arToksOf = (s) => applyAlias(
    trAr(s).split(' ').map(noVow).filter(t => t.length >= 2), normAr(s));
  const orderScore = (arH, arA, enH, enA) => (sideDist(arH, enH) + sideDist(arA, enA)) / 2;
  const matchScore = (qH, qA, ev) => {
    const arH = arToksOf(qH), arA = arToksOf(qA);
    const enH = enToksOf(ev.h.name, ''), enA = enToksOf(ev.a.name, '');
    return Math.min(orderScore(arH, arA, enH, enA), orderScore(arH, arA, enA, enH));
  };
  if (!normAr(qHome) && !normAr(qAway))
    return res.status(400).json({ error: 'missing home/away' });

  try {
    const slug = slugFor(qLeague);
    const slugs = slug ? [slug] : ALL_SLUGS;
    // Candidate UTC dates: kickoff day, plus previous day for late-night games.
    const dates = [];
    const d0 = ymdOf(qStart, false);
    if (d0) {
      dates.push(d0);
      const hr = new Date(qStart).getUTCHours();
      if (!isNaN(hr) && hr < 4) { const dp = ymdOf(qStart, true); if (dp && dp !== d0) dates.push(dp); }
    } else {
      dates.push(ymdOf(new Date().toISOString(), false));
    }
    const jobs = [];
    for (const sl of slugs) for (const dt of dates) jobs.push([sl, dt]);
    const t0 = Date.now();
    const pages = await Promise.all(jobs.map(async ([sl, dt]) => {
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 6000);
        try {
          const r = await fetch(`${ESPN}/${sl}/scoreboard?dates=${dt}`, {
            signal: ctrl.signal,
            headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': 'https://www.espn.com/' },
          });
          if (!r.ok) return { sl, blocked: r.status === 403, events: [] };
          const j = await r.json();
          return { sl, events: ((j && j.events) || []).map(e => trimEv(e, sl)).filter(Boolean) };
        } finally { clearTimeout(to); }
      } catch { return { sl, events: [] }; }
    }));
    const blocked = pages.length > 0 && pages.every(p => p.blocked);
    let pool = [];
    for (const p of pages) pool = pool.concat(p.events);
    const qT = Date.parse(qStart);
    const scored = [];
    for (const ev of pool) {
      if (!ev || !ev.h.name || !ev.a.name) continue;
      if (ev.status !== 'live' && ev.status !== 'ht' && ev.status !== 'ft') continue;
      if (isFinite(qT) && ev.date) {
        const dd = Math.abs(Date.parse(ev.date) - qT);
        if (!isFinite(dd) || dd > 150 * 60000) continue;
      }
      scored.push([matchScore(qHome, qAway, ev), ev]);
    }
    scored.sort((a, b) => a[0] - b[0]);
    const fail = { found: false, ms: Date.now() - t0 };
    if (blocked) fail.blocked = true;
    if (!scored.length) return res.status(200).json(fail);
    const [best, bev] = scored[0];
    const second = scored.length > 1 ? scored[1][0] : 99;
    const okDirect = best <= 0.55;
    const okMargin = best <= 0.85 && (second - best) >= 0.08;
    if (!okDirect && !okMargin) return res.status(200).json(fail);
    return res.status(200).json({
      found: true, slug: bev.slug, eid: bev.eid, clock: bev.clock, min: bev.min,
      half: bev.half, status: bev.status, detail: bev.detail, date: bev.date,
      h: bev.h, a: bev.a, score: best, ms: Date.now() - t0,
    });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ found: false });
  }
}
