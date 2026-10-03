import { rl, cap, selfOrigin, fetchableUrl, readCapped } from './_sec.js';
export default async function handler(req, res) {
  const id = cap(req.query.id || '', 160);
  const href = cap(req.query.href || '', 500);
  // Optional: team names (Arabic) so the hd7livex resolver can run without
  // the /api/matches self-lookup (also used by local tests).
  const qHome = cap(req.query.home || '', 120);
  const qAway = cap(req.query.away || '', 120);
  const qStart = cap(req.query.start || req.query.st || '', 64);

  // Fetch with a hard timeout (serverless-friendly). Default 4s: typical
  // upstreams answer in 1-3s; hung ones must die fast inside the 10s budget.
  // Manual redirects (max 3 hops): fetch() would silently follow a hop
  // onto an off-allowlist/private host — each Location is re-checked with
  // fetchableUrl (mirror alwan pattern). Fail-open: a rejected hop returns
  // the last response so callers degrade via their !ok paths.
  const fetchT = async (url, opts = {}, ms = 4000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      let cur = url;
      let r = await fetch(cur, { ...opts, redirect: 'manual', signal: ctrl.signal });
      for (let hop = 0; hop < 3 && r.status >= 300 && r.status < 400 && r.headers.get('location'); hop++) {
        let nx = null;
        try { nx = new URL(r.headers.get('location'), cur).toString(); } catch { break; }
        if (!fetchableUrl(nx)) break;
        cur = nx;
        r = await fetch(cur, { ...opts, redirect: 'manual', signal: ctrl.signal });
      }
      return r;
    } finally { clearTimeout(t); }
  };
  // In-memory HTML cache for yacine/hd7 day pages (60s) — avoids 3× fetch per match
  const _htmlCache = globalThis.__kooraHtmlCache || (globalThis.__kooraHtmlCache = new Map());
  const fetchCached = async (url, opts, ms) => {
    const key = url;
    const hit = _htmlCache.get(key);
    if (hit && Date.now() - hit.at < 60000) {
      _htmlCache.delete(key); _htmlCache.set(key, hit); // LRU refresh
      return { ok: true, text: async () => hit.html, headers: { get: () => null } , status: 200 };
    }
    try {
      const r = await fetchT(url, opts, ms);
      if (r.ok) {
        const clen = +((r.headers && r.headers.get('content-length')) || 0);
        if (clen > 1500000) return r; // oversize: fail-open without caching
        const html = await r.text();
        if (!html || new TextEncoder().encode(html).length > 1500000) {
          return { ok: true, text: async () => html, headers: r.headers, status: r.status };
        }
        _htmlCache.set(key, { at: Date.now(), html });
        while (_htmlCache.size > 50) { const oldest = _htmlCache.keys().next().value; _htmlCache.delete(oldest); }
        return { ok: true, text: async () => html, headers: r.headers, status: r.status };
      }
      return r;
    } catch (e) { throw e; }
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
  const fixUrl = (u, base) => {
    if (!u) return null;
    u = u.trim();
    if (u.startsWith('//')) return 'https:' + u;
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('/') && base) try { return new URL(u, base).toString(); } catch { return null; }
    if (u.startsWith('/') ) return u;
    return null;
  };
  const resolveOneLive = async (liveUrl, referer, UA, ms = 6000) => {
    try {
      liveUrl = fetchableUrl(liveUrl);
      if (!liveUrl) return null;
      const lvRes = await fetchT(liveUrl, { headers: { ...UA, Referer: referer } }, ms);
      if (!lvRes.ok) return null;
      const lv = await lvRes.text();
      const m9M = lv.match(/<iframe[^>]+src\s*=\s*(["'])([^"']*\/m9\/[^"']+)\1[^>]*>/i)
        || lv.match(/<iframe[^>]+src\s*=\s*(["'])([^"']+)\1[^>]*>/i);
      if (!m9M) return { livePage: liveUrl, m9: null, leaf: null };
      let m9Url = fixUrl(m9M[2], liveUrl);
      m9Url = m9Url && fetchableUrl(m9Url);
      if (!m9Url) return { livePage: liveUrl, m9: null, leaf: null };
      let leaf = null;
      try {
        const m9Res = await fetchT(m9Url, { headers: { ...UA, Referer: liveUrl } }, ms);
        if (m9Res.ok) {
          const m9 = await m9Res.text();
          const leafM = m9.match(/<iframe[^>]+src\s*=\s*(["'])([^"']+)\1[^>]*>/i);
          if (leafM) leaf = fixUrl(leafM[2], m9Url);
        }
      } catch {}
      return { livePage: liveUrl, m9: m9Url, leaf };
    } catch { return null; }
  };
  const resolveHd7 = async (home, away, startIso) => {
    return null; // DISABLED: user wants JUST 2 sites (Yacine + Kora backup)
    const nH = normAr(home), nA = normAr(away);
    if (!nH && !nA) return null;
    const UA = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    };
    try {
      // Date-aware: try the day that matches the kickoff (today/yesterday/tomorrow)
      // in parallel — sequential 3×6s would blow budget and misses yesterday
      // fixtures when only today is checked (reported: Spurs-Everton 2026-09-12
      // shown as 6× generic beIN).
      const segs = ['https://hd7livex.com/matches-today/', 'https://hd7livex.com/yesterday-matches/', 'https://hd7livex.com/tomorrow-matches/'];
      // Prefer the segment whose date matches startIso if provided
      let probeSegs = segs;
      try {
        if (startIso) {
          const d = new Date(startIso);
          const now = new Date();
          const diff = Math.floor((d - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
          if (diff < 0) probeSegs = [segs[1], segs[0], segs[2]];
          else if (diff > 0) probeSegs = [segs[2], segs[0], segs[1]];
        }
      } catch {}
      const dayPages = await Promise.all(probeSegs.map(async (u) => {
        try {
          const r = await fetchCached(u, { headers: { ...UA, Referer: 'https://hd7livex.com/' } }, 3200);
          return r.ok ? await r.text() : '';
        } catch { return ''; }
      }));
      let pageUrl = null;
      for (const day of dayPages) {
        if (!day) continue;
        const noscr = day.replace(/<script[\s\S]*?<\/script>/gi, '');
        const cards = [...noscr.matchAll(/alba_sports_events_link[^>]*href\s*=\s*(["'])([^"']+)\1[^>]*title\s*=\s*(["'])([^"']+)\3/gi)];
        for (const c of cards) {
          const href = c[2], title = normAr(c[4]);
          if ((nH && title.includes(nH)) || (nA && title.includes(nA))) { pageUrl = href; break; }
        }
        if (pageUrl) break;
      }
      if (!pageUrl) return null;

      const mpRes = await fetchT(pageUrl, { headers: { ...UA, Referer: 'https://hd7livex.com/matches-today/' } });
      if (!mpRes.ok) return null;
      const mp = await mpRes.text();
      const liveM = mp.match(/<iframe[^>]+src\s*=\s*(["'])([^"']+)\1[^>]*>/i);
      if (!liveM) return null;
      const firstLive = fixUrl(liveM[2] || liveM[1], pageUrl);
      if (!firstLive) return null;

      // Collect every Live tab from the AlbaPlayer server list.
      const first = await resolveOneLive(firstLive, pageUrl, UA);
      if (!first) return null;
      let tabs = [];
      try {
        const lvRes = await fetchT(firstLive, { headers: { ...UA, Referer: pageUrl } });
        if (lvRes.ok) {
          const lv = await lvRes.text();
          const ulM = lv.match(/<ul[^>]*class\s*=\s*["'][^"']*albaplayer_name[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i);
          const scope = ulM ? ulM[1] : lv;
          const links = [...scope.matchAll(/<a[^>]+href\s*=\s*(["'])([^"']*\/live\/[^"']+)\1[^>]*>([^<]+)<\/a>/gi)];
          const seen = new Set([firstLive]);
          for (const l of links) {
            const u = fixUrl(l[2], pageUrl);
            const label = (l[3] || '').trim().replace(/\s+/g, ' ');
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
  
// YacineLive (added 2026-09-12): same AlbaYallaShoot theme family, ARABIC
// names (no transliteration needed — direct normalized matching). Chain, all
// statically fetchable:
//   yacinelive.online/matches-today/ -> shooot.yala-go.online/.../sport-N.html
//     -> playerv5.php embed (yasirtv host, alive; fabortvcdn twin is TLS-dead)
// Returns { playerSrc, servers: [{label, url}] } or null. Fail-open.
const teamScore = (q, c) => {
  if (!q || !c) return 0;
  if (q === c) return 2;
  if (q.includes(c) || c.includes(q)) return 1.5;
  const qt = q.split(' ').filter(t => t.length > 1);
  const ct = c.split(' ').filter(t => t.length > 1);
  if (!qt.length || !ct.length) return 0;
  let hit = 0;
  for (const t of qt) {
    if (ct.some(u => u === t || (u.length > 2 && t.length > 2 && (u.includes(t) || t.includes(u))))) hit++;
  }
  return hit / Math.max(qt.length, ct.length);
};
const resolveYacine = async (home, away, startIso) => {
  const nH = normAr(home), nA = normAr(away);
  if (!nH && !nA) return null;
  const UA = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
  };
  try {
    const segsY = ['https://yacinelive.online/matches-today/', 'https://yacinelive.online/yesterday-matches/', 'https://yacinelive.online/tomorrow-matches/'];
    let probeY = segsY;
    try {
      if (startIso) {
        const d = new Date(startIso);
        const now = new Date();
        const diff = Math.floor((d - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
        if (diff < 0) probeY = [segsY[1], segsY[0], segsY[2]];
        else if (diff > 0) probeY = [segsY[2], segsY[0], segsY[1]];
      }
    } catch {}
    const yPages = await Promise.all(probeY.map(async (u) => {
      try {
        const r = await fetchCached(u, { headers: { ...UA, Referer: 'https://yacinelive.online/' } }, 3200);
        return r.ok ? await r.text() : '';
      } catch { return ''; }
    }));
    let best = null;
    let bestScore = -1;
    for (const day of yPages) {
      if (!day) continue;
      const blocks = day.split('AY_Match').slice(1);
      for (const b of blocks) {
      // Accept any stream page host (shooot/shots/kora.athikoora etc.) — was shooot-only and missed
      // kora.athikoora.com live pages (e.g. Celta Vigo 45' on 2026-09-13, reported).
      const rawLink = (b.match(/<a[^>]+href="(https:\/\/[^"]+)"/i) || [])[1] || (b.match(/<a[^>]+href="([^"]+)"/i) || [])[1];
      const link = rawLink && rawLink !== "/" && rawLink.startsWith("http") ? rawLink : null;
      const names = [...b.matchAll(/TM_Name[^>]*>([^<]+)</gi)].map(m => normAr(m[1]));
      if (!link || names.length < 2) continue;
      const straight = teamScore(nH, names[0]) + teamScore(nA, names[1]);
      const swapped = teamScore(nH, names[1]) + teamScore(nA, names[0]);
      const score = Math.max(straight, swapped);
      if (score > bestScore) { bestScore = score; best = link; }
    }
    }
    // Both teams must substantially match (>= 2.5 of max 4).
    if (!best || bestScore < 2.5) return null;
    best = fetchableUrl(best);
    if (!best) return null;
    const spRes = await fetchT(best, { headers: { ...UA, Referer: 'https://yacinelive.online/matches-today/' } }, 2800);
    if (!spRes.ok) return null;
    const sp = await spRes.text();
    const urls = [...sp.matchAll(/((?:https?:)?\/\/[a-z0-9._:\-]+\/(?:playerv5\.php[^"'<\s]*|albaplayer[^"'<\s]*|live\.php[^"'<\s]*))/gi)]
      .map(m => fixUrl(m[1], best)).filter(Boolean);
    const clean = [...new Set(urls)].slice(0, 2);
    if (!clean.length) return null;
    return {
      playerSrc: clean[0],
      servers: clean.map((u, i) => ({ label: `ياسين ${i + 1}`, url: u })),
    };
  } catch { return null; }
};
  // Hidden EN fallback (owner-authorized 2026-09-27): Streamed.su free
  // no-auth JSON API — /api/matches/football (epoch-ms dates + sources),
  // /api/stream/{source}/{id} -> {embedUrl,language,hd,viewers}.
  // Used ONLY when Yacine + Kora yield zero servers (e.g. MLS with no
  // Arabic coverage). Upstream brands never reach the UI — the client
  // numbers every non-tv button. Fail-open throughout. Fuzzy core is the
  // proven fotmob set (byte-identical logic); normAr() above is reused.
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
  // Per-side ordered scorer (same tuning as api/espn.js, validated on
  // live fixtures): mean best normalized edit distance over devoweled
  // consonant tokens, both home/away orders. Gates 0.55 / 0.85+0.08.
  const arToksOf = (s) => applyAlias(
    trAr(s).split(' ').map(noVow).filter(t => t.length >= 2), normAr(s));
  const enToksOf = (name) => normLat(name || '')
    .replace(/v/g, 'f').replace(/p/g, 'b').split(' ').map(noVow).filter(t => t && t.length >= 2 && !EN_STOP.has(t));
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
  // BOTH sides must match: take the WORSE of the two side scores, over both
  // home/away orders. The old MEAN let one team's tokens match while the
  // other team was completely unrelated, which is how "Uzbekistan vs Syria"
  // latched onto "Israel vs Kosovo" (mean 0.50 <= 0.55 gate). MAX scores
  // that decoy at 0.67 while real pairs stay <= 0.55 (CONTEXT 82).
  const orderScore = (arH, arA, enH, enA) =>
    Math.max(sideDist(arH, enH), sideDist(arA, enA));
  const streamScore = (arH, arA, t1, t2) => {
    const enH = enToksOf(t1), enA = enToksOf(t2);
    return Math.min(orderScore(arH, arA, enH, enA), orderScore(arH, arA, enA, enH));
  };
  const STHOSTS = ['https://streamed.pk', 'https://streamed.st'];
  const stFetch = async (host, path, ms) => {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(host + path, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' },
      });
      if (!r.ok) return null;
      const cl = +(r.headers.get('content-length') || 0);
      if (cl > 2000000) return null;
      const tx = await r.text();
      if (!tx || tx.length > 2000000) return null;
      try { return JSON.parse(tx); } catch { return null; }
    } catch { return null; }
    finally { clearTimeout(to); }
  };
  // Phase 1 (cheap): fetch the live list + pick the matching game. Runs in
  // parallel with the Arabic resolvers so the match decision costs no extra
  // wall-clock. Returns the game object only -- no stream details yet.
  const streamedMatch = async (home, away, startIso) => {
    // Our kickoff (ms) - used as a hard proximity gate below.
    const qStartMs = Date.parse(startIso || '') || 0;
    try {
      let games = [], ghost = STHOSTS[0];
      for (const host of STHOSTS) {
        const list = await stFetch(host, '/api/matches/football', 5000);
        if (Array.isArray(list) && list.length) { games = list; ghost = host; break; }
      }
      const now = Date.now();
      const arH = arToksOf(home), arA = arToksOf(away);
      if (!arH.length || !arA.length) return null;
      const cands = [];
      for (const g of games) {
        const tm = (g && g.teams) || {};
        let t1 = (((tm.home || {}).name) || ((g && g.team1 || {}).name) || (g && g.home) || '');
        let t2 = (((tm.away || {}).name) || ((g && g.team2 || {}).name) || (g && g.away) || '');
        if ((!t1 || !t2) && g && g.title) {
          const parts = String(g.title).split(/\s+vs\.?\s+/i);
          if (parts.length >= 2) { t1 = t1 || parts[0].trim(); t2 = t2 || (parts[1] || '').trim(); }
        }
        if (!t1 || !t2) continue;
        const rawD = g && (g.date || g.start);
        const dt = (typeof rawD === 'number') ? rawD : Date.parse(rawD || '');
        if (!isFinite(dt)) continue;
        if (dt < now - 105 * 60000 || dt > now + 30 * 60000) continue;
        // Kickoff proximity: the pools are independent, so a same-window
        // kickoff is the strongest available corroboration that two records
        // are the same fixture. Without it a decoy that merely looks similar
        // can still slip through on names alone (CONTEXT 82).
        if (qStartMs && Math.abs(dt - qStartMs) > 90 * 60000) continue;
        const sc = streamScore(arH, arA, t1, t2);
        cands.push({ g, sc });
      }
      cands.sort((a, b) => a.sc - b.sc);
      if (!cands.length) return null;
      const b0 = cands[0];
      // Strict absolute gate only (no relative-margin fallback): the pool
      // is every live game worldwide, so relative differences are
      // meaningless for garbage input — a miss must stay a miss, never
      // another game's stream (see §48). Scorer is MAX-of-both-sides so a
      // decoy cannot pass on one team's tokens alone (CONTEXT 82).
      if (!(b0.sc <= 0.55)) return null;
      return { game: b0.g, host: ghost };
    } catch { return null; }
  };
  // Phase 2 (expensive): only reached when every Arabic source came up
  // empty, so the "hidden EN fallback" policy is unchanged.
  const streamedDetail = async (hit) => {
    if (!hit || !hit.game) return null;
    const { game, host: ghost } = hit;
    try {
      const srcs = Array.isArray(game.sources) ? game.sources : [];
      const det = await Promise.all(srcs.map(async (s) => {
        try {
          const sid = s && s.id;
          const snm = s && s.source;
          if (!sid || !snm) return [];
          let d = await stFetch(ghost, '/api/stream/' + encodeURIComponent(snm) + '/' + encodeURIComponent(sid), 4000);
          if (!d) {
            const other = STHOSTS.find(h => h !== ghost);
            if (other) d = await stFetch(other, '/api/stream/' + encodeURIComponent(snm) + '/' + encodeURIComponent(sid), 4000);
          }
          const arr = Array.isArray(d) ? d : ((d && d.embedUrl) ? [d] : []);
          return arr.map(e => {
            const eu = e && e.embedUrl;
            if (!eu || !/^https:\/\//i.test(String(eu))) return null;
            return { url: String(eu), lang: String((e && e.language) || ''), hd: !!(e && e.hd), viewers: +(e && e.viewers) || 0 };
          }).filter(Boolean);
        } catch { return []; }
      }));
      const ok = det.flat().filter(Boolean);
      if (!ok.length) return null;
      ok.sort((a, b) =>
        (((/en/i.test(b.lang)) ? 1 : 0) - ((/en/i.test(a.lang)) ? 1 : 0)) ||
        ((b.hd ? 1 : 0) - (a.hd ? 1 : 0)) ||
        (b.viewers - a.viewers));
      return { servers: ok.slice(0, 3).map(o => ({ url: o.url })) };
    } catch { return null; }
  };



  // VIPBox (verified 2026-10-04): the football-schedule carries genuinely
  // niche fixtures (South/Central American + lower US leagues) with
  // /onair/football/<slug> pages exposing data-uri /live/... players.
  // The /live pages send no X-Frame-Options and no CSP, so they embed
  // directly — no token reversal needed. Hidden fallback BEHIND Streamed:
  // runs ONLY when every Arabic source + Streamed yields zero (numbered
  // buttons, zero brand leakage, same strict gates as the EN path).
  const VIP_HOSTS = ['https://vipbox.live', 'https://vipbox.fm'];
  // Phase 1 (cheap): schedule fetch + name match. Schedule times read as
  // UTC (calibrated: evening slots line up with UTC wall-clock); the strict
  // MAX-of-sides name gate carries precision, time is corroboration only.
  const vipMatch = async (home, away, startIso) => {
    const qStartMs = Date.parse(startIso || '') || 0;
    try {
      const arH = arToksOf(home), arA = arToksOf(away);
      if (!arH.length || !arA.length) return null;
      let sched = '', ghost = VIP_HOSTS[0];
      for (const host of VIP_HOSTS) {
        try {
          const r = await fetchT(host + '/football-schedule', {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html,application/xhtml+xml',
              'Referer': host + '/',
            },
          }, 4500);
          if (!r || !r.ok) continue;
          const tx = await readCapped(r, 1500000);
          if (tx && tx.includes('/onair/')) { sched = tx; ghost = host; break; }
        } catch {}
      }
      if (!sched) return null;
      const nowMs = Date.now();
      const nowD = new Date();
      const cands = [];
      for (const m of sched.matchAll(/<a[^>]+href="(\/onair\/[^"]+)"[^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
        const t = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const tm = t.match(/(\d{1,2}):(\d{2})\s+(.*)/);
        if (!tm) continue;
        const parts = tm[3].split(/\s+vs\.?\s+/i);
        if (parts.length < 2) continue;
        const t1 = parts[0].trim(), t2 = parts.slice(1).join(' vs ').trim();
        if (!t1 || !t2) continue;
        let dt = Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth(), nowD.getUTCDate(), +tm[1], +tm[2]);
        if (dt - nowMs > 12 * 3600 * 1000) dt -= 86400000;
        if (nowMs - dt > 12 * 3600 * 1000) dt += 86400000;
        if (qStartMs && Math.abs(dt - qStartMs) > 150 * 60000) continue;
        const sc = streamScore(arH, arA, t1, t2);
        cands.push({ href: m[1], sc });
      }
      cands.sort((a, b) => a.sc - b.sc);
      if (!cands.length) return null;
      const b0 = cands[0];
      if (!(b0.sc <= 0.55)) return null;
      return { href: b0.href, host: ghost };
    } catch { return null; }
  };
  // Phase 2: the /onair page's data-uri players (embeddable live pages).
  const vipDetail = async (hit) => {
    if (!hit || !hit.href) return null;
    try {
      const r = await fetchT(hit.host + hit.href, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Referer': hit.host + '/football-schedule',
        },
      }, 4500);
      if (!r || !r.ok) return null;
      const html = await readCapped(r, 800000);
      const links = [...new Set([...html.matchAll(/data-uri="(\/live\/[^"]+)"/gi)].map(x => x[1]))].slice(0, 3);
      if (!links.length) return null;
      return { servers: links.map(u => ({ url: hit.host + u })) };
    } catch { return null; }
  };

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=30');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!rl(req, res, 'player')) return;

  // Hard response deadline. player.html aborts /api/player at ~4s on its first
  // attempt and Vercel caps this function at 10s; the old Kora chain measured
  // 8-17s and was being killed before it could answer (CONTEXT 82). Every
  // optional step below is skipped once we are out of budget.
  const T0 = Date.now();
  const BUDGET_MS = 8500;
  const left = () => BUDGET_MS - (Date.now() - T0);
  const outOfTime = (need) => left() < (need || 0);
  
  if (!id && !href) {
    res.setHeader('Cache-Control', 'no-store'); // errors must never cache
    return res.status(400).json({ error: 'Missing id or href' });
  }

  // Yassir (owner-supplied 2026-10-01, replaces the lost Arabic source):
  // yassirtv.com/hard/<hash>.html?match=<id> just iframes
  // <host>/playerv5.php?match=<id>&key=<key>. CRITICAL: that <id> is OUR id --
  // cross-checked 22/22 fixtures against koora-l.live/game/<ourId> with exact
  // Arabic team-name agreement. So this path needs NO name matching at all,
  // which is exactly what makes it immune to the wrong-match bug the fuzzy
  // English fallback hit (a "Uzbekistan vs Syria" query served the
  // "Israel vs Kosovo" stream -- see CONTEXT 82).
  // Live -> ~19.7KB page carrying <li><a data-path="kooora/kc/..."> AR tabs.
  // Finished / not started -> 2366-byte "Match ended" page, zero tabs.
  const YAS_HOSTS = ['https://912acsss8af382.yasirtv.com', 'https://yassirtv.com'];
  const YAS_KEY = '9f39972b67d6ce22189507d008acwc26';
  const resolveYassir = async (matchId) => {
    const mid = String(matchId == null ? '' : matchId).trim();
    if (!/^\d{4,12}$/.test(mid)) return null;
    for (const host of YAS_HOSTS) {
      const url = host + '/playerv5.php?match=' + encodeURIComponent(mid) +
        '&key=' + YAS_KEY;
      try {
        // NOTE: headers are inlined, NOT spread from a `UA` const -- the only
        // UA in this file's scope belongs to the disabled resolveHd7 and
        // referencing it threw a ReferenceError that .catch() swallowed,
        // which silently disabled this whole resolver (CONTEXT 82).
        const r = await fetchT(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Referer: 'https://yassirtv.com/',
            'Accept-Language': 'ar,en;q=0.9',
          },
        }, Math.min(4500, Math.max(0, left() - 200)));
        if (!r || !r.ok) continue;
        const cl = +(r.headers.get('content-length') || 0);
        if (cl > 400000) continue;
        const html = await readCapped(r, 400000);
        const tabs = [...html.matchAll(/data-path="([^"]+)"/g)].map(m => m[1]);
        // Zero tabs == the "Match ended" placeholder. Never surface it.
        if (!tabs.length) continue;
        return { servers: [{ url, kind: 'live', tabs: tabs.length }] };
      } catch { /* try next host */ }
    }
    return null;
  };

  // ---- Yassir fast path -------------------------------------------------
  // Yassir (owner-supplied 2026-10-01, replaces the lost Arabic source) keys
  // on OUR OWN match id -- cross-checked 22/22 fixtures against
  // koora-l.live/game/<ourId> with exact Arabic team-name agreement -- so it
  // needs neither the /api/matches self-lookup nor any name matching. Probing
  // it first means one small request answers the whole request, well inside
  // the client's abort window. Live -> ~19.7KB page with data-path tabs;
  // finished/not started -> 2366-byte "Match ended" page with zero tabs.
  if (id && !outOfTime(500)) {
    const y = await resolveYassir(id);
    if (y && y.servers && y.servers.length) {
      const servers = [];
      for (const s of y.servers) {
        // SEC: only http(s) leaves the server (same choke as pushUnique).
        if (!s || !/^https:\/\//i.test(String(s.url || ''))) continue;
        if (servers.some(x => x.url === s.url)) continue;
        servers.push({ label: 'سيرفر ' + (servers.length + 1), url: s.url, kind: 'live' });
      }
      if (servers.length) {
        res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=60');
        return res.status(200).json({
          id,
          href: href || undefined,
          home: qHome || undefined,
          away: qAway || undefined,
          playerSrc: servers[0].url,
          found: true,
          via: 'live',
          embedUrl: servers[0].url,
          count: servers.length,
          servers,
        });
      }
    }
  }
  // Yassir missed (finished, not yet live, or upstream down): carry on to the
  // older Arabic + EN chain below, folding Yassir in if a late retry lands.
  let yassirHit = false;
  let yassirServers = null;



  // Try to get player from kooralive match page
  let target = href;
  let matchHome = qHome, matchAway = qAway;
  let targetStart = (typeof qStart !== 'undefined' ? qStart : '') || '';
  // qStart is start query param; will be enriched from match lookup below if needed
  if ((!target || (!matchHome && !matchAway)) && id && !outOfTime(2500)) {
    // If only id, try to find href + team names from matches API
    // (host-header-influenced URL is safe: any href it yields still passes
    // the kooralive allowlist below before being fetched).
    try {
      const matchesRes = await fetchT(selfOrigin(req) + '/api/matches?day=today', {}, 7000);
      if (!matchesRes.ok) throw 0;
      const matches = JSON.parse(await readCapped(matchesRes, 1500000));
      if (!Array.isArray(matches)) throw 0;
      const match = matches.find(m => String(m && m.id) === String(id));
      if (match) {
        if (!target) target = match.href;
        if (!targetStart && match.start) targetStart = match.start;
        if (!matchHome) matchHome = match.home || '';
        if (!matchAway) matchAway = match.away || '';
      }
    } catch {}
  }

  // Kick the name-matched resolvers off NOW, before the Kora chain, so they
  // overlap it instead of queueing behind it. That serialisation was the
  // difference between a ~2s answer and a 16s one (CONTEXT 82).
  const kickoff = targetStart || qStart || '';
  const kickMs = Date.parse(kickoff || '') || 0;
  // Never fall back to "whatever is streaming right now" for a fixture that
  // kicked off long ago: that was the live wrong-stream trigger (a finished
  // match fell through and picked up an unrelated live game).
  const tooOld = !!(kickMs && Date.now() > kickMs + 3.5 * 3600 * 1000);
  const canEn = !!(matchHome && matchAway && !tooOld);
  const batchP = Promise.all([
    Promise.race([
      resolveYacine(matchHome, matchAway, kickoff).catch(() => null),
      new Promise(r => setTimeout(() => r(null), Math.min(4000, Math.max(0, left() - 900)))),
    ]),
    canEn ? Promise.race([
        streamedMatch(matchHome, matchAway, kickoff).catch(() => null),
        new Promise(r => setTimeout(() => r(null), Math.min(4000, Math.max(0, left() - 900)))),
      ]).catch(() => null)
          : Promise.resolve(null),
    canEn ? Promise.race([
        vipMatch(matchHome, matchAway, kickoff).catch(() => null),
        new Promise(r => setTimeout(() => r(null), Math.min(4000, Math.max(0, left() - 900)))),
      ]).catch(() => null)
          : Promise.resolve(null),
  ]);

  // Allow yacine/hd7 lookup even when kooralive has no entry for this
  // fixture (e.g. Championship Coventry-Brighton is on yacinelive but not on
  // kooralive — previously 404'd before trying yacine, reported).
  let targetHost = '';
  let kooraHtml = '';
  let playerHtml = null;
  let playerSrc = null;
  if (target && !outOfTime(1500)) {
    if (/^http:\/\//i.test(target)) { res.setHeader('Cache-Control', 'no-store'); return res.status(400).json({ error: 'href host not allowed' }); }
    if (!/^https:\/\//i.test(target)) target = 'https://kooralive-plus.info' + target;
    try { targetHost = new URL(target).hostname.toLowerCase(); } catch { res.setHeader('Cache-Control', 'no-store'); return res.status(400).json({ error: 'bad href' }); }
    if (!(targetHost === 'kooralive-plus.info' || targetHost.endsWith('.kooralive-plus.info'))){
      res.setHeader('Cache-Control', 'no-store'); return res.status(400).json({ error: 'href host not allowed' });
    }
    try {
      const upstream = await fetchT(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Referer': 'https://kooralive-plus.info/',
        }
      }, Math.min(4000, Math.max(0, left() - 300)));
      if (!upstream.ok) throw 0;
      kooraHtml = await readCapped(upstream, 3000000);
    } catch { kooraHtml = ''; }
  }

  try {
    const html = kooraHtml;
    
    // Try to find player iframe directly in HTML (if already rendered)
    
    // Look for iframe with yasirtv, romabar, or similar (single or double quotes)
    const iframeMatch = html.match(/<iframe[^>]*src\s*=\s*(["'])([^"']*(?:yasirtv|romabar|alba|player|yala-go|yacinelive|kora|shooot|shots)[^"']*)\1[^>]*>/i);
    if (iframeMatch) {
      playerSrc = iframeMatch[2];
      playerHtml = iframeMatch[0];
    }

    // If not found, try the sting iframes API. The loader is commented out in
    // the page HTML, so this API is the ONLY source of the real player code.
    // Match IDs are shared across the whole STING-clone ecosystem, so try
    // every known sister domain — if any one of them unlocks its API we get
    // players for all matches.
    if (!playerSrc && !outOfTime(1200)) {
      const apiBases = [
        'https://kooralive-plus.info',
        'https://kooralive24.com',
        'https://www.romabar.info',
      ];
      // Parallel probe — sequential 3×7s could blow the 10s budget.
      const probe = await Promise.all(apiBases.map(async (base) => {
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
          }, Math.min(3000, Math.max(0, left() - 200)));
          if (!apiRes.ok) return null;
          const apiData = await apiRes.json();
          if (!Array.isArray(apiData)) return null;
          const match = apiData.find(m => String(m.match_id) === String(id) || String(m.id) === String(id));
          if (match && match.code) {
            const srcMatch = match.code.match(/src=(["'])([^"']+)\1/);
            if (srcMatch) return { src: srcMatch[2], html: match.code };
          }
        } catch {}
        return null;
      }));
      for (const r of probe) if (r && r.src) { playerSrc = r.src; playerHtml = r.html; break; }
    }
    
    // Clean direct src if we got one.
    if (playerSrc && playerSrc.startsWith('//')) playerSrc = 'https:' + playerSrc;



    // Yassir already answered (or was tried) in the fast path above; the
    // name-matched resolvers were started before this chain and are awaited
    // here. Yassir is folded in again only if the fast path did not return.
    const [yacine, enHit, vipHit] = await batchP;
    const servers = [];
    if (id && !yassirHit) {
      const y2 = await resolveYassir(id).catch(() => null);
      if (y2 && y2.servers) yassirServers = y2.servers;
    }
    const pushUnique = (entry) => {
      if (!entry || !entry.url) return;
      // SEC: only http(s) URLs leave the server — kills javascript:/data:
      // URL smuggling from compromised upstreams (client re-checks too).
      if (!/^https:\/\//i.test(entry.url)) return;
      if (servers.some(s => s.url === entry.url)) return;
      servers.push(entry);
    };
    if (playerSrc) {
      pushUnique({ label: 'المصدر المباشر', url: playerSrc, livePage: null, kind: 'direct', via: 'direct' });
    }
    // hd7 disabled
    if (yassirServers && yassirServers.length) {
      yassirServers.forEach(s => pushUnique({
        label: 'سيرفر ' + (servers.length + 1), url: s.url, kind: 'live',
      }));
    }
    if (yacine && yacine.servers) {
      yacine.servers.forEach((s, i) => pushUnique({
        label: 'سيرفر ' + (i + 1), url: s.url, kind: 'leaf',
      }));
    }
    // Hidden EN fallback (owner-authorized): phase 2, ONLY when Yassir +
    // Yacine + Kora all yield zero servers.
    if (!servers.length && enHit && !outOfTime(800)) {
      try {
        const en = await Promise.race([
          streamedDetail(enHit).catch(() => null),
          new Promise(r => setTimeout(() => r(null), Math.min(4000, Math.max(0, left() - 300)))),
        ]);
        if (en && en.servers) en.servers.forEach(s => pushUnique({ label: 'backup', url: s.url, kind: 'live' }));
      } catch {}
    }
    // VIPBox niche fallback (verified 2026-10-04): ONLY when every other
    // source yields zero. Same strict gates; never surfaces a wrong match.
    if (!servers.length && vipHit && !outOfTime(800)) {
      try {
        const vb = await Promise.race([
          vipDetail(vipHit).catch(() => null),
          new Promise(r => setTimeout(() => r(null), Math.min(4000, Math.max(0, left() - 300)))),
        ]);
        if (vb && vb.servers) vb.servers.forEach(s => pushUnique({ label: 'backup', url: s.url, kind: 'live' }));
      } catch {}
    }

    // found = a real playable embed exists (post-filter, not the raw inputs —
    // a dropped javascript: URL must not report found:true).
    const hasPlayable = servers.length > 0;
    if (hasPlayable) {
      const first = servers[0].url;
      res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=60');
      return res.status(200).json({
        id,
        href: target,
        home: matchHome || undefined,
        away: matchAway || undefined,
        playerSrc: first,
        found: true,
        via: 'live',
        embedUrl: first,
        count: servers.length,
        servers,
      });
    } else {
      // Unknown fixture (no self-lookup hit and nothing identifiable from
      // the resolvers) -> 404; known-but-streamless -> 200 + found:false
      // so the UI shows the no-links state.
      if (!target && !matchHome && !matchAway) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(404).json({ found: false, message: 'Unknown fixture' });
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        id,
        href: target,
        home: matchHome || undefined,
        away: matchAway || undefined,
        playerSrc: null,
        found: false,
        count: servers.length,
        servers,
        message: 'No playable stream found'
      });
    }
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'upstream failed', id });
  }
}
