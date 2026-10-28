import { koraPlaylist } from './_kora.js';
import { rl } from './_sec.js';

// Live playlist for the in-page Kora player (API paths end in .m3u8 so the
// client's existing HLS detection picks it up). Same-origin for the client;
// the segment URLs inside stay on their CDN, which allows our origin.
export default async function handler(req, res) {
  if (!rl(req, res, 'kstream', 600, 60000)) return;
  const m = String((req.query && req.query.m) || '').replace(/\D/g, '').slice(0, 12);
  const c = Number((req.query && req.query.c));
  if (!m || !Number.isInteger(c) || c < 0 || c > 23) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(400).json({ found: false });
    return;
  }
  const body = await koraPlaylist(m, c);
  if (!body) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(404).json({ found: false });
    return;
  }
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(200).send(body);
}
