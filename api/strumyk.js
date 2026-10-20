import { rl, cap } from './_sec.js';
import { strumykMatch, strumykDetail, sfAnchor } from './_strumyk.js';
// GET ?home=&away=&start= -> {found, min, plus, half, h, a, status}
// A standalone, cheap live-minute source (English feed) so the player page
// can use it WITHOUT slowing the server list. Client-side, parallel with the
// ESPN/FotMob minute calls. Fail-open {found:false}; 30s edge cache.
const AR_TR = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ء': '', 'ؤ': 'w', 'ئ': 'y',
  'ب': 'b', 'ة': 'a', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
  'د': 'd', 'ذ': 'd', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
  'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh',
  'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ـ': '', ' ': ' ',
};
const EN_STOP = new Set(['vs', 'fc', 'sc', 'ac', 'cf', 'as', 'kf', 'fk', 'sk', 'if', 'bk', 'cd', 'ud', 'ssc']);
const noVow = (s) => s.replace(/[aeiou]/g, '');
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
const arToksOf = (s) => trAr(s).split(' ').map(noVow).filter(t => t.length >= 2);
const enToksOf = (name) => normLat(name || '')
  .replace(/v/g, 'f').replace(/p/g, 'b').split(' ')
  .map(noVow).filter(t => t && t.length >= 2 && !EN_STOP.has(t));

export default async function handler(req, res) {
  const home = cap(req.query.home || '', 120);
  const away = cap(req.query.away || '', 120);
  const start = cap(req.query.start || req.query.st || '', 64);
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!rl(req, res, 'strumyk')) return;
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30');
  if (!home || !away || !start) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ found: false });
  }
  try {
    const m = await strumykMatch({ arToksOf, enToksOf, editDist }, home, away, start);
    if (!m) { res.setHeader('Cache-Control', 'no-store'); return res.status(200).json({ found: false }); }
    const d = await strumykDetail(m, false);
    const a = sfAnchor(d);
    if (!a) { res.setHeader('Cache-Control', 'no-store'); return res.status(200).json({ found: false }); }
    return res.status(200).json({
      found: true, min: a.min, plus: a.plus, half: a.half, at: a.at,
      h: m.h, a: m.a, status: d.status || '',
    });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ found: false });
  }
}
