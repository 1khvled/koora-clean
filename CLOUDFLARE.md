# Cloudflare deployment

The Vercel project (kooraadz.vercel.app) is blocked, so the site now runs as a
single Cloudflare Worker with Workers Assets.

- **Live Worker URL:** `https://koora-clean.medflash-f496.workers.dev`
- **Config:** `wrangler.toml` (no secrets committed)
- **Worker entry:** `src/worker.js`
- **Staged static files:** `public/` (generated — do not edit directly)

## Deploy / update

```bash
node scripts/copy-static.mjs   # after editing any site HTML/CSS/JS/image
npx wrangler deploy
```

`copy-static.mjs` is a zero-dependency allowlist copy. It never copies
`api/`, `scripts/` or root config files into the public asset directory.

## What the Worker does

1. Serves all site files from `public/` via the `ASSETS` binding.
2. Dispatches `/api/<name>` to the **unchanged** `api/<name>.js` handlers
   (all 12 routes) through a Vercel-compatible `req`/`res` shim.
3. Replays `vercel.json`'s security headers on every response. If the CSP in
   `vercel.json` changes, update `SECURITY_HEADERS` in `src/worker.js` too.
4. Replays `/watch/:id -> /player.html` and `/index.html -> /` (308).

`api/_sec.js`'s hardcoded Vercel origin and `api/sitemap.js`'s base URL are
adapted around in the Worker (self-fetches are routed back in-process and the
origin in API response bodies is rewritten to the live origin), so no API
handler file needs modification.

## Custom domain (optional, manual)

To serve `kooraadz.*` from Cloudflare instead of workers.dev, add the domain
to the Cloudflare account and create a route for the `koora-clean` Worker,
or attach a custom domain in the Worker's Settings → Domains & Routes.
Then point DNS at Cloudflare and update the origin constants above if needed.
