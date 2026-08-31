/**
 * worker.js — Koora Live Clean Proxy
 * Deploy to Cloudflare Workers: `wrangler deploy` or paste in dashboard.
 * Usage:
 *   https://your-worker.workers.dev/?url=https://kooralive-plus.info/matches/...
 *   https://your-worker.workers.dev/?url=https://kooralive-plus.info/   (homepage)
 *
 * What it does:
 *  - Fetches kooralive-plus.info (or romabar) HTML
 *  - Strips ad scripts that inject the Telegram popup you sent (yellow pill + 615k + انضم الان)
 *  - Removes any <div> containing that popup text
 *  - Injects surgical CSS + JS to keep removing it every 400ms inside the proxied page
 *  - Returns cleaned HTML with CORS headers
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let target = url.searchParams.get('url');
    // default to homepage if no url
    if (!target) target = 'https://kooralive-plus.info/';
    // allow only kooralive / romabar / yasirtv
    let t;
    try { t = new URL(target); } catch { return new Response('Invalid url', {status:400}); }
    const allowed = ['kooralive-plus.info', 'romabar.info', 'yasirtv.com', '912acsss', 'sir-tv.tv', 'yalllashoot', 'kooralive'];
    const hostOk = allowed.some(h => t.hostname.includes(h));
    if (!hostOk) return new Response('Host not allowed. Use kooralive-plus.info or romabar.info', {status:403});

    // fetch upstream
    const upstream = await fetch(t.toString(), {
      headers: {
        'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://kooralive-plus.info/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
      },
      cf: { cacheTtl: 0 }
    });

    const contentType = upstream.headers.get('content-type') || '';
    // if not HTML (e.g. JSON API), just pass through with cleaning if needed
    if (!contentType.includes('text/html')) {
      const body = await upstream.arrayBuffer();
      return new Response(body, {
        status: upstream.status,
        headers: {
          'content-type': contentType,
          'access-control-allow-origin': '*',
          'cache-control': 'no-store',
        }
      });
    }

    let html = await upstream.text();

    // ===== 1. REMOVE AD SCRIPTS that create the popup =====
    // cl.mayhapmonisms.com, additionalheritagenose.com, yh.ferritegathers.com, cloudflareinsights beacon is ok but remove if it triggers popup
    html = html.replace(/<script[^>]*src=["'][^"']*cl\.mayhapmonisms\.com[^"']*["'][^>]*>\s*<\/script>/gi, '<!-- ad removed: mayhapmonisms -->');
    html = html.replace(/<script[^>]*src=["'][^"']*additionalheritagenose\.com[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '<!-- ad removed: additionalheritagenose -->');
    html = html.replace(/<script[^>]*src=["'][^"']*yh\.ferritegathers\.com[^"']*["'][^>]*>\s*<\/script>/gi, '<!-- ad removed: ferritegathers -->');
    html = html.replace(/<script[^>]*src=["'][^"']*ferritegathers[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '<!-- ad removed -->');
    // any script containing those domains inline
    html = html.replace(/<script[^>]*>[\s\S]*?mayhapmonisms[\s\S]*?<\/script>/gi, '<!-- inline ad removed -->');
    html = html.replace(/<script[^>]*>[\s\S]*?additionalheritagenose[\s\S]*?<\/script>/gi, '<!-- inline ad removed -->');

    // ===== 2. REMOVE THE TELEGRAM POPUP YOU SENT =====
    // The popup is a fixed overlay containing: 615 الف مشترك + توقعات + انضم الان + t.me or yellow pill
    // We remove any div that contains those keywords (case-insensitive, Arabic)
    // Strategy: replace whole fixed div blocks that contain 615 or انضم or توقعات + telegram
    // Use a few passes to catch nested structures
    const popupPatterns = [
      /<div[^>]*style="[^"]*position:\s*fixed[^"]*"[^>]*>[\s\S]*?(?:615|انضم\s*الان|توقعات|مراهنات)[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi,
      /<div[^>]*>[\s\S]*?615[\s\S]*?الف[\s\S]*?مشترك[\s\S]*?<\/div>/gi,
      /<div[^>]*>[\s\S]*?انضم\s*الان[\s\S]*?<\/div>/gi,
      /<a[^>]*href=["'][^"']*t\.me[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, // remove direct t.me links (popup button)
    ];
    for (const re of popupPatterns) {
      html = html.replace(re, '<!-- telegram popup removed -->');
    }
    // also remove any element with text "قناة المراهنات" or "قناة التوقعات"
    html = html.replace(/<[^>]*>[\s\S]*?قناة[\s\S]*?المراهنات[\s\S]*?<\/[^>]*>/gi, '<!-- channel popup removed -->');

    // ===== 3. INJECT CLEANER CSS + JS (inside proxied page) =====
    const inject = `
<!-- CLEAN INJECT by koora-clean worker -->
<style id="__koora_clean">
  /* hide any remaining popup by selector */
  div[class*="popup"], div[id*="popup"], div[class*="modal"], div[class*="overlay"] { /* not globally hidden, only if contains telegram text — handled by JS */ }
  a[href*="t.me"], a[href*="telegram"] { display:none !important; pointer-events:none !important; }
</style>
<script id="__koora_clean_js">
(function(){
  const POP_RE = /(615|انضم\\s*الان|توقعات|مراهنات|قناة.*الاول|توقع.*95%)/i;
  const TELE_RE = /(t\\.me|telegram)/i;
  // block window.open inside
  const origOpen = window.open;
  window.open = function(u){ if(u && (TELE_RE.test(String(u)) || /popads|mayhapmonisms|additionalheritagenose|ferritegathers/i.test(String(u)))) return null; return origOpen.apply(this, arguments); };
  // click interceptor
  document.addEventListener('click', function(e){
    const a = e.target.closest('a');
    if(a && TELE_RE.test(a.href||'')){ e.preventDefault(); e.stopPropagation(); a.remove(); return false; }
  }, true);
  // observer to nuke popup as soon as it appears
  function nuke(){
    // remove any fixed overlay containing popup text
    document.querySelectorAll('div, section, aside').forEach(el=>{
      const txt = (el.textContent||'').slice(0,500);
      const html = el.innerHTML||'';
      if( (POP_RE.test(txt) && txt.length < 800) || (TELE_RE.test(html) && el.querySelector('a[href*=\"t.me\"]')) ){
        // check if it's an overlay (fixed or high z-index or centered modal)
        const cs = window.getComputedStyle(el);
        if(cs.position==='fixed' || cs.position==='absolute' || parseInt(cs.zIndex||0) > 100 || el.children.length <= 8){
          if(txt.includes('615') || txt.includes('انضم') || TELE_RE.test(html)){
            el.remove();
          }
        }
      }
    });
    // also remove direct fixed containers with dark bg
    document.querySelectorAll('div[style*=\"position: fixed\"], div[style*=\"position:fixed\"]').forEach(el=>{
      if(POP_RE.test(el.textContent||'') || TELE_RE.test(el.innerHTML||'')) el.remove();
    });
  }
  // run periodically + observer
  setInterval(nuke, 400);
  new MutationObserver(nuke).observe(document.documentElement, {childList:true, subtree:true});
  window.addEventListener('message', function(e){
    if(e.data && e.data.type==='KILL_TELEGRAM') nuke();
  });
  // initial
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', nuke);
  else nuke();
})();
<\/script>
`;

    if (html.includes('</head>')) html = html.replace('</head>', inject + '</head>');
    else if (html.includes('<body')) html = html.replace('<body', inject + '<body');
    else html = inject + html;

    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': '*',
        'cache-control': 'no-store, no-cache, must-revalidate',
        'x-cleaned-by': 'koora-clean-worker',
      }
    });
  }
}
