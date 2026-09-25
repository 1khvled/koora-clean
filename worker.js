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
      let yacineTarget = 'https://yacinelive.online/matches-today/';
      let koraTarget = 'https://kooralive-plus.info/today-matches/';
      if (day === 'yesterday') {
        yacineTarget = 'https://yacinelive.online/matches-yesterday/';
        koraTarget = 'https://kooralive-plus.info/yesterday-matches/';
      } else if (day === 'tomorrow') {
        yacineTarget = 'https://yacinelive.online/matches-tomorrow/';
        koraTarget = 'https://kooralive-plus.info/tomorrow-matches/';
      }
      const _wc = globalThis.__kooraWorkerCache || (globalThis.__kooraWorkerCache = new Map());
      const _wk = 'w:' + day;
      const _hit = _wc.get(_wk);
      if (_hit && Date.now() - _hit.at < 45000) {
        return new Response(JSON.stringify(_hit.data), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=30', ...cors } });
      }
      const decFull = (s) => {
        let out = String(s == null ? '' : s), prev = '';
        for (let i = 0; i < 3 && out !== prev; i++) {
          prev = out;
          out = out.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
            .replace(/&#x([0-9a-fA-F]+);/g, (m2, h) => { const c = parseInt(h, 16); return c > 31 && c < 0x110000 ? String.fromCodePoint(c) : m2; })
            .replace(/&#(\d+);/g, (m2, n) => { const c = parseInt(n, 10); return c > 31 && c < 0x110000 ? String.fromCodePoint(c) : m2; });
        }
        return out;
      };
      const fetchWithTimeout = async (u, ms, referer) => {
        try {
          const r = await fetch(u, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html,application/xhtml+xml',
              'Referer': referer,
            },
            cf: { cacheTtl: 60 },
            signal: AbortSignal.timeout(ms),
          });
          if (!r.ok) return null;
          const cl = +(r.headers.get('content-length') || 0);
          if (cl > 2500000) return null;
          const text = await r.text();
          if (!text || text.length > 3000000) return null;
          return text;
        } catch { return null; }
      };
      // Base date explicitly in +03:00 (never server-local TZ).
      const now3 = new Date(Date.now() + 3 * 3600000);
      let _by = now3.getUTCFullYear(), _bm = now3.getUTCMonth() + 1, _bd = now3.getUTCDate();
      const _dimB = (yy, mm2) => new Date(Date.UTC(yy, mm2, 0)).getUTCDate();
      if (day === 'yesterday') { _bd -= 1; if (_bd < 1) { _bm -= 1; if (_bm < 1) { _bm = 12; _by -= 1; } _bd = _dimB(_by, _bm); } }
      else if (day === 'tomorrow') { _bd += 1; if (_bd > _dimB(_by, _bm)) { _bd = 1; _bm += 1; if (_bm > 12) { _bm = 1; _by += 1; } } }
      const wy = _by, wmo = String(_bm).padStart(2, '0'), wd = String(_bd).padStart(2, '0');
      const parseYacine = (html) => {
        if (!html || !html.includes('AY_Match')) return [];
        const out = [];
        const blocks = html.split('AY_Match').slice(1);
        for (const b of blocks) {
          try {
            const hrefM = b.match(/<a[^>]+href="(https:\/\/[^"]+)"/i) || b.match(/<a[^>]+href='([^']+)'/i) || b.match(/<a[^>]+href="([^"]+)"/i);
            const href = hrefM ? hrefM[1] || hrefM[2] : '';
            if (!href || href === '/' || href === '#') continue;
            if (!/(yala-go|kora\.athikoora|yacinelive|shooot|shots)/i.test(href)) continue;
            const names = [...b.matchAll(/TM_Name[^>]*>([^<]+)</gi)].map(m2 => decFull(m2[1].trim()));
            if (names.length < 2) continue;
            if (!/[\u0600-\u06FF]/.test(names[0] + names[1])) continue;
            const home = names[0], away = names[1];
            if (!home || !away) continue;
            const logos = [...b.matchAll(/TM_Logo[^>]*>[\s\S]*?<(?:img)[^>]+(?:data-src|src)=["']([^"']+)["']/gi)].map(m2 => m2[1]).slice(0, 2);
            const timeM = b.match(/MT_Time[^>]*>([^<]+)</i) || b.match(/MT_Time[^>]*>([^<]+)/i);
            const timeText = timeM ? decFull(timeM[1].trim()) : '';
            const statM = b.match(/MT_Stat[^>]*>([^<]+)</i);
            const statText = statM ? decFull(statM[1].trim()) : '';
            const leagueM = b.match(/MT_Info[\s\S]*?<li[^>]*><span>([^<]+)<\/span><\/li>\s*<li[^>]*><span>([^<]+)<\/span><\/li>\s*<li[^>]*><span>([^<]+)<\/span><\/li>/i);
            const leagueText = leagueM ? decFull(leagueM[3].trim()) : '';
            const scoreM = [...b.matchAll(/RS-goals[^>]*>([^<]+)</gi)].map(m2 => m2[1].trim());
            const scoreHome = scoreM[0] || '', scoreAway = scoreM[1] || '';
            let startIso = '';
            let gameendsIso = '';
            if (timeText) {
              try {
                const tm = timeText.match(/(\d{1,2}):(\d{2})\s*(AM|PM|\u0635|\u0645)/i);
                if (tm) {
                  let hh = parseInt(tm[1], 10), mm = parseInt(tm[2], 10);
                  const ap = tm[3].toUpperCase();
                  if (ap.includes('P') || ap.includes('\u0645')) { if (hh < 12) hh += 12; }
                  else { if (hh === 12) hh = 0; }
                  const dt = new Date(`${wy}-${wmo}-${wd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+03:00`);
                  if (!isNaN(dt)) {
                    startIso = `${wy}-${wmo}-${wd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+03:00`;
                    const tot = hh * 60 + mm + 105;
                    const eh = String(Math.floor(tot / 60) % 24).padStart(2, '0'), em = String(tot % 60).padStart(2, '0');
                    let _ey = +wy, _emo = +wmo, _ed = +wd + Math.floor(tot / 1440);
                    const _dimE = (yy, mm2) => new Date(Date.UTC(yy, mm2, 0)).getUTCDate();
                    while (_ed > _dimE(_ey, _emo)) { _ed -= _dimE(_ey, _emo); _emo += 1; if (_emo > 12) { _emo = 1; _ey += 1; } }
                    gameendsIso = `${_ey}-${String(_emo).padStart(2, '0')}-${String(_ed).padStart(2, '0')}T${eh}:${em}:00+03:00`;
                  }
                }
              } catch {}
            }
            if (leagueText.includes('\u0627\u0644\u0645\u0635\u0631\u064a') || /egypt/i.test(leagueText)) continue;
            let statusCode = 'NS';
            const sLow = statText.toLowerCase();
            if (/\u062c\u0627\u0631\u064a\u0629|\u0645\u0628\u0627\u0634\u0631|live/i.test(sLow) || statText.includes('\u062c\u0627\u0631\u064a\u0629')) statusCode = 'LIVE';
            else if (/\u0627\u0646\u062a\u0647\u062a|\u0646\u0647\u0627\u064a\u0629|finished/i.test(sLow)) statusCode = 'FT';
            else if (/\u0628\u0639\u062f \u0642\u0644\u064a\u0644|\u0644\u0645 \u062a\u0628\u062f\u0623/i.test(sLow)) statusCode = 'NS';
            let stableId = '';
            if (href) {
              try {
                const slug = decodeURIComponent(href).split('/').filter(Boolean).pop() || '';
                if (slug && slug !== 'matches') stableId = 'y-' + slug.slice(0, 80);
              } catch {}
            }
            if (!stableId) stableId = 'y-' + home.slice(0, 10) + '-' + away.slice(0, 10) + '-' + timeText.replace(/[^0-9]/g, '');
            out.push({
              id: stableId, href, home, away, league: leagueText, start: startIso,
              gameends: gameendsIso, status: statusCode, official_status: statText,
              game_time: statusCode === 'LIVE' ? (timeText.includes("'") ? timeText : '') : '',
              score_home: scoreHome, score_away: scoreAway,
              home_logo: logos[0] || '', away_logo: logos[1] || '', time_text: timeText,
              result_text: scoreHome && scoreAway ? `${scoreHome}-${scoreAway}` : '',
              league_text: leagueText,
            });
          } catch {}
        }
        return out;
      };
      try {
        // Yacine first — same gate as api/matches.js: >=5 valid short-circuits.
        const yHtml = await fetchWithTimeout(yacineTarget, 4000, 'https://yacinelive.online/');
        let matches = yHtml ? parseYacine(yHtml) : [];
        const validY = matches.filter(m2 => m2.time_text && m2.home && m2.away);
        if (validY.length >= 5) {
          _wc.set(_wk, { at: Date.now(), data: validY });
          return new Response(JSON.stringify(validY), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=30', ...cors } });
        }
        matches = validY;
        const kHtml = await fetchWithTimeout(koraTarget, 4000, 'https://kooralive-plus.info/');
        if (!kHtml) {
          if (matches.length) {
            _wc.set(_wk, { at: Date.now(), data: matches });
            return new Response(JSON.stringify(matches), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=30', ...cors } });
          }
          return new Response(JSON.stringify({ error: 'upstream failed' }), { status: 502, headers: { 'content-type': 'application/json', ...cors } });
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
          const idRaw = getAttr('data-fixture-id');
          const home = getAttr('data-home');
          const away = getAttr('data-away');
          const league = getAttr('data-league');
          const start = getAttr('data-start');
          const gameends = getAttr('data-gameends');
          const status = getAttr('data-status-code');
          const official = getAttr('data-official-status');
          const gameTime = getAttr('data-game-time');
          const scoreHome = getAttr('data-score-home');
          const scoreAway = getAttr('data-score-away');
          if (/\u0627\u0644\u0645\u0635\u0631\u064a|\u0645\u0635\u0631\u0649/i.test(league) || /egypt/i.test(league)) continue;
          const after = kHtml.substring(m.index, m.index + 4000);
          const imgsAll = [...after.matchAll(/<img[^>]*src=(["'])(.*?)\1/gi)].map(x => x[2]).filter(Boolean);
          const teamImgs = imgsAll.filter(u => /logo/i.test(u));
          const logos = (teamImgs.length >= 2 ? teamImgs : imgsAll).slice(0, 2);
          const timeMatch = after.match(/<div[^>]*id\s*=\s*(["'])STING-web-Match-Time\1[^>]*>([^<]*)<\/div>/i);
          const resultMatch = after.match(/<div[^>]*id\s*=\s*(["'])STING-web-Result\1[^>]*>([^<]*)<\/div>/i);
          const leagueMatch = after.match(/<div[^>]*class\s*=\s*(["'])[^"']*STING-web-Match-Info[^"']*\1[^>]*>([^<]*)<\/div>/i);
          let sid = idRaw;
          if (!sid && href) {
            try {
              const slug = decodeURIComponent(href).split('/').filter(Boolean).pop() || '';
              if (slug && slug !== 'matches') sid = 'slug-' + slug.slice(0, 80);
            } catch {}
          }
          kMatches.push({
            id: sid || `match-${kMatches.length}`,
            href, home, away, league, start, gameends, status,
            official_status: official, game_time: gameTime,
            score_home: scoreHome, score_away: scoreAway,
            home_logo: logos[0] || '', away_logo: logos[1] || '',
            time_text: timeMatch ? timeMatch[2].trim() : '',
            result_text: resultMatch ? resultMatch[2].trim() : '',
            league_text: leagueMatch ? leagueMatch[2].trim() : league,
          });
        }
        // Merge: prefer Yacine, fill gaps with Kora not already present (home|away).
        const seen = new Set(matches.map(m2 => (m2.home + '|' + m2.away).toLowerCase()));
        for (const km of kMatches) {
          const key = (km.home + '|' + km.away).toLowerCase();
          if (!seen.has(key)) { matches.push(km); seen.add(key); }
        }
        if (!matches.length) matches = kMatches;
        _wc.set(_wk, { at: Date.now(), data: matches });
        return new Response(JSON.stringify(matches), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=30, stale-while-revalidate=60', ...cors } });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'upstream failed' }), { status: 500, headers: { 'content-type': 'application/json', ...cors } });
      }
    }

    if (path === '/api/espn') {
      const qHome = url.searchParams.get('home') || '';
      const qAway = url.searchParams.get('away') || '';
      const qStart = url.searchParams.get('start') || '';
      const qLeague = url.searchParams.get('lg') || url.searchParams.get('league') || '';
      const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=30', ...cors } });
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
      if (!normAr(qHome) && !normAr(qAway)) return J({ error: 'missing home/away' }, 400);
      try {
        const slug = slugFor(qLeague);
        const slugs = slug ? [slug] : ALL_SLUGS.slice(0, 8);
        const dates = [];
        const d0 = ymdOf(qStart, false);
        if (d0) {
          dates.push(d0);
          const hr = new Date(qStart).getUTCHours();
          if (!isNaN(hr) && hr < 4) { const dp = ymdOf(qStart, true); if (dp && dp !== d0) dates.push(dp); }
        } else { dates.push(ymdOf(new Date().toISOString(), false)); }
        const t0 = Date.now();
        const settled = await Promise.allSettled(slugs.flatMap((sl) => dates.map(async (dt) => {
          try {
            const r = await fetch(`${ESPN}/${sl}/scoreboard?dates=${dt}`, {
              headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': 'https://www.espn.com/' },
              signal: AbortSignal.timeout(6000),
            });
            if (!r.ok) return { sl, blocked: r.status === 403, events: [] };
            const clen = +(r.headers.get('content-length') || 0);
            if (clen > 1500000) return { sl, events: [] };
            let j = null;
            try { j = await r.json(); } catch { return { sl, events: [] }; }
            return { sl, events: ((j && j.events) || []).map((e) => trimEv(e, sl)).filter(Boolean) };
          } catch { return { sl, events: [] }; }
        })));
        const pages = settled.map((s) => (s.status === 'fulfilled' ? s.value : { sl: '', events: [] }));
        const blocked = pages.length > 0 && pages.every((p) => p.blocked);
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
        if (!scored.length) { const f = { found: false, ms: Date.now() - t0 }; if (blocked) f.blocked = true; return J(f); }
        const [best, bev] = scored[0];
        const second = scored.length > 1 ? scored[1][0] : 99;
        if (!(best <= 0.55) && !(best <= 0.85 && (second - best) >= 0.08)) {
          const f = { found: false, ms: Date.now() - t0 }; if (blocked) f.blocked = true; return J(f);
        }
        return J({ found: true, slug: bev.slug, eid: bev.eid, clock: bev.clock, min: bev.min, half: bev.half, status: bev.status, detail: bev.detail, date: bev.date, h: bev.h, a: bev.a, score: best, ms: Date.now() - t0 });
      } catch (e) { return J({ found: false }, 500); }
    }

    if (url.searchParams.has('url')) {
      const target = url.searchParams.get('url');
      let t;
      try { t = new URL(target); } catch { return new Response('Invalid url', { status: 400, headers: cors }); }
      // NOTE: bare fragments without a real TLD can never match a hostname —
      // they were dead entries; dropped rather than guessed.
      const allowed = ['kooralive-plus.info','romabar.info','yasirtv.com','sir-tv.tv'];
      // SEC: exact-or-subdomain match — substring `includes` would allow
      // kooralive-plus.info.evil.com (SSRF/open-proxy bypass). HTTPS only
      // (no MITM-able http upgrades) and redirects re-validated below.
      const hostOk = t.protocol === 'https:' && allowed.some(h => t.hostname === h || t.hostname.endsWith('.' + h));
      if (!hostOk) return new Response('Host not allowed', { status: 403, headers: cors });
      const proxied = async (urlStr) => {
        const u = new URL(urlStr);
        const ok = u.protocol === 'https:' && allowed.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
        if (!ok) throw new Error('redirect off-allowlist');
        return fetch(u.toString(), {
          headers: { 'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0', 'Referer': 'https://kooralive-plus.info/', 'Accept': 'text/html,application/xhtml+xml' },
          cf: { cacheTtl: 0 },
          redirect: 'manual',
          signal: AbortSignal.timeout(8000),
        });
      };
      try {
        let upstream = await proxied(t.toString());
        // Follow same-allowlist redirects manually (fetch() would not re-check).
        for (let hop = 0; hop < 3 && upstream.status >= 300 && upstream.status < 400 && upstream.headers.get('location'); hop++)
          upstream = await proxied(new URL(upstream.headers.get('location'), upstream.url).toString());
        const ct = (upstream.headers.get('content-type') || '').toLowerCase();
        if(!ct.includes('text/html')) {
          const ncl = +(upstream.headers.get('content-length') || 0);
          if (ncl > 3000000) return new Response('upstream too large', { status: 502, headers: cors });
          const body = await upstream.arrayBuffer();
          return new Response(body, { status: upstream.status, headers: { 'content-type': ct, 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
        }
        const hcl = +(upstream.headers.get('content-length') || 0);
        if (hcl > 3000000) return new Response('upstream too large', { status: 502, headers: cors });
        let html = await upstream.text();
        if (html.length > 4000000) return new Response('upstream too large', { status: 502, headers: cors });
        html = html.replace(/<script[^>]*src=["'][^"']*cl\.mayhapmonisms[^"']*["'][^>]*>\s*<\/script>/gi, '<!-- ad removed -->');
        html = html.replace(/<script[^>]*src=["'][^"']*additionalheritagenose[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '<!-- ad removed -->');
        html = html.replace(/<script[^>]*src=["'][^"']*ferritegathers[^"']*["'][^>]*>\s*<\/script>/gi, '<!-- ad removed -->');
        html = html.replace(/<div[^>]*>[\s\S]*?615[\s\S]*?انضم الان[\s\S]*?<\/div>/gi, '<!-- popup removed -->');
        html = html.replace(/<a[^>]*href=["'][^"']*t\.me[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, '<!-- t.me removed -->');
        const inject = `<style>a[href*="t.me"]{display:none !important}</style><script>(function(){const P=/(615|انضم\\s*الان|توقعات)/i,T=/(t\\.me|telegram)/i;const o=window.open;window.open=function(u){if(u&&T.test(String(u)))return null;return o.apply(this,arguments)};function n(){document.querySelectorAll('div,section').forEach(e=>{const t=(e.textContent||'').slice(0,500);if(P.test(t)&&e.children.length<=8){const s=window.getComputedStyle(e);if(s.position==='fixed'||parseInt(s.zIndex||0)>100) e.remove()}})}setInterval(n,400);new MutationObserver(n).observe(document.documentElement,{childList:true,subtree:true})})()<\\/script>`;
        if (html.includes('</head>')) html = html.replace('</head>', inject + '</head>'); else html = inject + html;
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store', 'x-cleaned-by': 'koora-clean' } });
      } catch (e) {
        return new Response('Proxy error', { status: 500, headers: cors });
      }
    }
    if (path.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json; charset=utf-8', ...cors } });
    }
    return new Response('Koora Clean Worker — use /api/matches?day=today or ?url=https://...', { headers: { 'content-type': 'text/plain', ...cors } });
  }
}
