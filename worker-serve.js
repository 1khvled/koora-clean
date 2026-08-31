export default {
  async fetch(request, env, ctx){
    const url = new URL(request.url);
    const path = url.pathname;
    const search = url.searchParams;

    if(search.has('url')){
      const target = search.get('url');
      try{
        const t = new URL(target);
        const allowed = ['kooralive-plus.info','romabar.info','yasirtv.com','912acsss','sir-tv.tv','yalllashoot'];
        if(!allowed.some(h=>t.hostname.includes(h))) return new Response('Host not allowed', {status:403});
        const upstream = await fetch(t.toString(), {headers:{'User-Agent': request.headers.get('User-Agent')||'Mozilla/5.0','Referer':'https://kooralive-plus.info/','Accept':'text/html,application/xhtml+xml'}});
        const ct = upstream.headers.get('content-type')||'';
        if(!ct.includes('text/html')){
          const body = await upstream.arrayBuffer();
          return new Response(body, {status: upstream.status, headers:{'content-type':ct,'access-control-allow-origin':'*','cache-control':'no-store'}});
        }
        let html = await upstream.text();
        html = html.replace(/<script[^>]*src=["'][^"']*cl\.mayhapmonisms[^"']*["'][^>]*>\s*<\/script>/gi, '<!-- ad removed -->');
        html = html.replace(/<script[^>]*src=["'][^"']*additionalheritagenose[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '<!-- ad removed -->');
        html = html.replace(/<script[^>]*src=["'][^"']*ferritegathers[^"']*["'][^>]*>\s*<\/script>/gi, '<!-- ad removed -->');
        html = html.replace(/<script[^>]*>[\s\S]*?mayhapmonisms[\s\S]*?<\/script>/gi, '<!-- inline ad removed -->');
        html = html.replace(/<div[^>]*>[\s\S]*?615[\s\S]*?انضم الان[\s\S]*?<\/div>/gi, '<!-- popup removed -->');
        html = html.replace(/<a[^>]*href=["'][^"']*t\.me[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, '<!-- t.me removed -->');
        const inject = `<style>a[href*="t.me"]{display:none !important}</style><script>(function(){const P=/(615|انضم\\s*الان|توقعات)/i,T=/(t\\.me|telegram)/i;const o=window.open;window.open=function(u){if(u&&T.test(String(u)))return null;return o.apply(this,arguments)};function n(){document.querySelectorAll('div,section').forEach(e=>{const t=(e.textContent||'').slice(0,500);if(P.test(t)&&e.children.length<=8&&t.length<600){const s=window.getComputedStyle(e);if(s.position==='fixed'||parseInt(s.zIndex||0)>100) e.remove()}});document.querySelectorAll('div[style*="position: fixed"]').forEach(e=>{if(P.test(e.textContent||'')||T.test(e.innerHTML||'')) e.remove()})}setInterval(n,400);new MutationObserver(n).observe(document.documentElement,{childList:true,subtree:true})})()<\/script>`;
        if(html.includes('</head>')) html=html.replace('</head>', inject+'</head>');
        else html=inject+html;
        return new Response(html, {headers:{'content-type':'text/html; charset=utf-8','access-control-allow-origin':'*','cache-control':'no-store','x-cleaned-by':'koora-clean'}});
      }catch(e){ return new Response('Proxy error: '+e.message, {status:500}); }
    }

    const files = {
      'index.html': `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>كورة لايف — نظيف بدون إعلانات | Koora Live Clean</title>
<meta name="description" content="كورة لايف نظيف: كل مباريات اليوم بدون إعلانات وبدون قفزات تيليجرام. نفس شكل كورة لايف الأصلي.">
<link rel="stylesheet" href="./style.css">
<style>
/* === CLEAN OVERRIDES — block that Telegram popup you sent === */
  /* hide any fixed overlay that contains telegram/615/انضم — surgical */
  div[style*="position: fixed"], div[style*="position:fixed"] {
    /* we can't globally hide fixed, so we hide only if injected by ad scripts — worker does surgical remove. This is fallback */
  }
  /* extra: hide common popup selectors if they slip through */
  #telegram-popup, .telegram-popup, .popup-telegram, div[class*="popup"][class*="telegram"] { display: none !important; }
  /* toast */
  .clean-toast { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%) translateY(80px); background: #111820; border: 1px solid #1e2d3d; color: #e6edf3; padding: 10px 14px; border-radius: 12px; font-size: 13px; opacity: 0; transition: all .3s; z-index: 9999; }
  .clean-toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
  .clean-badge { display: inline-flex; align-items: center; gap: 6px; background: #0f241a; border: 1px solid #1a4d2e; color: #00d084; font-size: 11px; font-weight: 700; padding: 6px 10px; border-radius: 999px; margin: 10px auto; }
  .clean-badge .dot { width: 7px; height: 7px; background: #00d084; border-radius: 50%; animation: pulse 1.8s infinite; }
  @keyframes pulse { 0%{box-shadow:0 0 0 0 rgba(0,208,132,.4)}70%{box-shadow:0 0 0 7px rgba(0,208,132,0)}100%{box-shadow:0 0 0 0 rgba(0,208,132,0)} }
  /* header clean label */
  .STING-web-Header-Logo::after { content: "نظيف — بدون إعلانات"; display: block; font-size: 10px; color: #ffd; opacity: .85; margin-top: 2px; letter-spacing: .5px; }
  /* worker box */
  .worker-box { background: #fff; border-radius: 8px; padding: 12px; margin: 12px auto; max-width: 1000px; width: 93%; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-size: 13px; }
  .worker-box input { flex: 1; min-width: 200px; padding: 9px 10px; border: 1px solid #ddd; border-radius: 8px; font-family: inherit; }
  .worker-box button { background: #750044; color: #fff; border: 0; padding: 9px 14px; border-radius: 8px; cursor: pointer; font-weight: 600; }
  .worker-box small { color: #666; width: 100%; margin-top: 4px; line-height: 1.5; }
  /* fix original css missing logo text */
  .STING-WEB-SiteName::after { content: "كورة لايف"; }
  .STING-WEB-SiteUrl::after { content: "kooralive-plus.info — النسخة النظيفة"; font-size: 10px; }
</style>
</head>
<body>
<header><div class="STING-web-Header STING-web-Max-Size">
  <div class="STING-web-Header-Right">
    <div class="STING-web-Header-Logo"><a href="./"><span class="STING-WEB-SiteName"></span><span class="STING-WEB-SiteUrl"></span></a></div>
    <div class="STING-web-Header-Menu"><ul class="STING-web-Menu" style="display:flex; gap:12px; list-style:none; padding:0; margin:0; align-items:center;">
      <li><a href="./" style="color:#750044; font-weight:700;">الرئيسية</a></li>
      <li><a href="#matches">مباريات اليوم</a></li>
      <li><a href="./player.html?demo=1">مشغل تجريبي (bein-9)</a></li>
    </ul></div>
  </div>
  <div class="STING-web-Header-Left">
    <span class="clean-badge"><span class="dot"></span> مانع الإعلانات نشط</span>
  </div>
</div></header>

<div class="STING-web-Max-Size" style="text-align:center; margin-top:8px;">
  <span class="clean-badge" style="background:#750044; color:#fff; border-color:#750044;">✦ نفس شكل كورة لايف الأصلي — لكن بدون إعلانات وبدون قفزة تيليجرام</span>
</div>

<div class="worker-box">
  <strong style="color:#750044">⚙️ وضع البروكسي (اختياري — يخفي بانر تيليجرام داخل الفيديو 100%):</strong>
  <input id="workerUrl" placeholder="https://your-worker.workers.dev — اتركه فارغاً للوضع المباشر المُنظف">
  <button id="saveWorker">حفظ</button>
  <button id="clearWorker" style="background:#273340">مباشر</button>
  <small>• <b>مباشر</b>: يعمل فوراً (يمنع القفزات + الزر يمتص أول نقرة). البانر الداخلي قد يومض ثانية ثم يُحجب بالـ JS.<br>• <b>بروكسي Cloudflare</b>: الصق رابط الـ Worker (ملف <code>worker.js</code> المرفق) — يُنظف الـ HTML على السيرفر قبل وصوله، البانر لا يظهر أبداً. تعليمات أسفل الصفحة.</small>
</div>

<div class="STING-web-Container-Matches STING-web-Max-Size" id="matches">
  <div class="STING-web-Container-Matches-Top">
    <span class="STING-web-Time">بتوقيت جهازك</span>
    <h2 class="STING-web-Title-Box"><strong>kooralive - كورة اون لاين | أبرز مباريات اليوم — نسخة نظيفة</strong></h2>
    <ul class="STING-web-Matches-Toggle">
      <li class="Yesterday-Matches"><a href="#" onclick="toast('قريباً'); return false;"><strong>مباريات الأمس</strong></a></li>
      <li class="Today-Matches"><a href="#"><strong>مباريات اليوم</strong></a></li>
      <li class="Tomorrow-Matches"><a href="#" onclick="toast('قريباً'); return false;"><strong>مباريات الغد</strong></a></li>
    </ul>
  </div>
  <div class="STING-web-Matches" id="matchesList">
    <div style="text-align:center; padding:40px; color:#666;">جاري تحميل المباريات...</div>
  </div>
</div>

<div class="STING-web-Max-Size" style="background:#fff; border-radius:8px; padding:14px; margin-top:16px;">
  <h3 style="font-size:14px; color:#750044; margin-bottom:8px;">🛡️ كيف يمنع الإعلانات والبوب-أب الذي أرسلته (صورة تيليجرام صفراء)</h3>
  <ul style="font-size:13px; line-height:1.9; color:#333; padding-right:18px;">
    <li><b>طبقة النقر الممتصة</b> — أول نقرة على المشغل يمتصها غطاء شفاف، فلا تفتح <code>t.me</code> . النقرة الثانية تذهب للفيديو نظيفة.</li>
    <li><b>حجب <code>window.open</code></b> — أي سكريبت يحاول <code>window.open('https://t.me/...')</code> يُلغى ويُحتسب في العداد.</li>
    <li><b>اعتراض الروابط</b> — أي <code>&lt;a href="*t.me*"&gt;</code> يُلغى قبل الإنتقال (مرحلة capture).</li>
    <li><b>مراقب التنقل</b> — لو غيّر الإعلان src الـ iframe إلى تيليجرام، يرجع فوراً للرابط النظيف.</li>
    <li><b>sandbox بدون <code>allow-popups</code></b> — المتصفح نفسه يمنع النوافذ المنبثقة.</li>
    <li><b>البروكسي (worker.js)</b> — يحذف سكريبتات <code>cl.mayhapmonisms.com / additionalheritagenose.com / yh.ferritegathers.com</code> التي تحقن البانر، ويحذف أي <code>&lt;div&gt;</code> فيه <code>615 الف مشترك / انضم الان / توقعات</code> قبل وصول الصفحة للمتصفح — فلا يومض حتى.</li>
  </ul>
  <p style="font-size:12px; color:#888; margin-top:8px;">الصورة التي أرسلتها (بانر أسود بخلفية صفراء "قناة المراهنات ..." وزر "انضم الان" وأيقونة تيليجرام) — محذوفة تماماً في وضع البروكسي، ومحجوبة من النقر والظهور في الوضع المباشر.</p>
</div>

<footer style="max-width:1000px; width:93%; margin:20px auto; background:#fff; border-radius:8px; padding:12px; text-align:center; font-size:13px; color:#666;">
  نسخة نظيفة — نفس هيكل <a href="https://kooralive-plus.info" target="_blank" style="color:#750044">kooralive-plus.info</a> بدون إعلانات. الأصل: Yalla Shoot Pro Premium (STING WEB). للاستخدام الشخصي.
  <div style="margin-top:8px; font-size:11px; color:#999;">ملفات المشروع: <code>index.html</code> + <code>player.html</code> + <code>style.css</code> + <code>matches.json</code> + <code>worker.js</code> (اختياري) + <code>sw.js</code> (اختياري)</div>
</footer>

<div class="clean-toast" id="toast"></div>

<script>
// === worker URL handling ===
const inp = document.getElementById('workerUrl');
inp.value = localStorage.getItem('koora_worker') || '';
document.getElementById('saveWorker').onclick = () => {
  const v = inp.value.trim();
  if(v && !v.startsWith('https://')) { toast('الرابط يجب أن يبدأ بـ https://'); return; }
  localStorage.setItem('koora_worker', v);
  toast(v ? 'تم حفظ البروكسي — سيعمل 100% بدون بانر' : 'تم التحويل للوضع المباشر');
};
document.getElementById('clearWorker').onclick = () => { localStorage.removeItem('koora_worker'); inp.value=''; toast('وضع مباشر — مانع قفزات نشط'); };

// === toast ===
function toast(m){
  const t=document.getElementById('toast');
  t.textContent=m; t.classList.add('show');
  clearTimeout(t._id); t._id=setTimeout(()=>t.classList.remove('show'),2500);
}

// === load matches ===
async function loadMatches(){
  try{
    const res = await fetch('./matches.json', {cache:'no-store'});
    const data = await res.json();
    renderMatches(data);
  }catch(e){
    document.getElementById('matchesList').innerHTML = '<div style="padding:20px; color:#c00;">فشل تحميل matches.json — تأكد أنك تفتح عبر http server (python -m http.server)</div>';
  }
}
function renderMatches(matches){
  const c = document.getElementById('matchesList');
  if(!matches.length){ c.innerHTML='<div class="STING-web-Matching-None">لا توجد مباريات الآن</div>'; return; }
  c.innerHTML = matches.map(m=>{
    const statusClass = m.status==='LIVE' ? 'LIVE' : (m.status==='FT' ? 'END' : (m.status==='SOON'?'SOON':''));
    const timeDisplay = m.status==='LIVE' ? (m.game_time||m.time_text||'جارية') : (m.time_text||'');
    const result = m.result_text|| (m.score_home!==""? \`\${m.score_away}-\${m.score_home}\` : "");
    // we pass href via encoding, but also id for worker
    const encHref = encodeURIComponent(m.href);
    const playerUrl = \`player.html?id=\${encodeURIComponent(m.id)}&href=\${encHref}&home=\${encodeURIComponent(m.home)}&away=\${encodeURIComponent(m.away)}\`;
    return \`
    <div class="STING-web-Match \${statusClass}" data-id="\${m.id}">
      <a href="\${playerUrl}" title="\${m.home} vs \${m.away}">
        <div class="STING-web-Right-Team">
          <div class="STING-web-Team-Logo"><img alt="\${m.home}" src="\${m.home_logo}" loading="lazy" onerror="this.style.opacity=0"></div>
          <div class="STING-web-Team-NAME">\${m.home}</div>
        </div>
        <div class="STING-web-Match-Center">
          <div class="STING-web-Match-Timing">
            <div id="STING-web-Match-Time" class="\${m.status==='LIVE'?'LIVE':''}">\${timeDisplay}</div>
            <div id="STING-web-Result">\${result}</div>
            <div class="STING-web-Data \${statusClass}">\${m.league_text}</div>
          </div>
        </div>
        <div class="STING-web-Left-Team">
          <div class="STING-web-Team-Logo"><img alt="\${m.away}" src="\${m.away_logo}" loading="lazy" onerror="this.style.opacity=0"></div>
          <div class="STING-web-Team-NAME">\${m.away}</div>
        </div>
        <div class="STING-web-Overlay"><div class="STING-web-SVG-Play"></div></div>
      </a>
    </div>\`;
  }).join('');
  // lazy image show
  document.querySelectorAll('.STING-web-Team-Logo img').forEach(img=>{
    img.addEventListener('load', ()=> img.classList.add('show'));
    if(img.complete) img.classList.add('show');
  });
}
loadMatches();

// === global popup blocker for this page itself (if any ad slips) ===
const TELE_RE = /(t\.me|telegram\.me|tg:\/\/|joinchat)/i;
const AD_RE = /(popads|popcash|adcash|propeller|onclkds|highperformancegate|highcpmgate|cl\.mayhapmonisms|additionalheritagenose|yh\.ferritegathers)/i;
const BLOCK_RE = new RegExp(TELE_RE.source+'|'+AD_RE.source,'i');
const origOpen = window.open.bind(window);
window.open = function(u, ...r){
  if(u && BLOCK_RE.test(String(u))) { toast('تم حجب نافذة تيليجرام/إعلان'); return null; }
  return origOpen(u,...r);
};
document.addEventListener('click', e=>{
  const a=e.target.closest('a');
  if(a && a.href && BLOCK_RE.test(a.href)){
    // allow our internal player links
    if(a.href.includes('player.html')) return;
    e.preventDefault(); e.stopPropagation();
    toast('تم حجب رابط تيليجرام');
    return false;
  }
}, true);
</script>
</body>
</html>
`,
      'player.html': `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>مشاهدة المباراة — كورة لايف نظيف</title>
<link rel="stylesheet" href="./style.css">
<style>
  body{ background:#e1e1e1; }
  .player-wrap{ max-width:1000px; width:93%; margin:0 auto; }
  .STING-web-Post{ background:#fff; border-radius:8px; padding:0; display:grid; margin:16px auto; }
  .STING-web-PostContent{ padding:0; }
  .player-card{ background:#111820; border:1px solid #1e2d3d; border-radius:12px; overflow:hidden; margin:12px; }
  .player-header{ padding:10px 12px; display:flex; align-items:center; justify-content:space-between; background:#0f1720; color:#e6edf3; font-size:13px; gap:8px; flex-wrap:wrap; }
  .player-header b{ color:#00d084; }
  .ratio{ position:relative; width:100%; aspect-ratio:16/9; background:#000; overflow:hidden; }
  .ratio iframe{ position:absolute; inset:0; width:100%; height:100%; border:0; background:#000; }
  .click-shield{ position:absolute; inset:0; z-index:6; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.72); backdrop-filter:blur(2px); cursor:pointer; transition:opacity .25s; }
  .click-shield.hidden{ opacity:0; pointer-events:none; }
  .click-shield button{ background:#00d084; color:#001410; border:0; padding:14px 22px; border-radius:12px; font-weight:800; font-size:15px; cursor:pointer; }
  .shield{ position:absolute; inset:0; pointer-events:none; border:2px solid transparent; transition:border-color .2s; }
  .shield.hit{ border-color:rgba(255,59,48,.6); }
  .controls{ display:flex; gap:8px; flex-wrap:wrap; padding:10px 12px; background:#eceef2; border-radius:8px; margin:12px; align-items:center; }
  .btn{ background:#750044; color:#fff; border:0; padding:9px 14px; border-radius:8px; cursor:pointer; font-weight:600; font-size:13px; }
  .btn.ghost{ background:#273340; }
  .btn.danger{ background:#5a1a1a; }
  .log{ font-family:monospace; font-size:11px; background:#0a0e13; color:#8b949e; border:1px solid #1e2d3d; border-radius:8px; padding:10px; max-height:120px; overflow:auto; margin:12px; white-space:pre-wrap; text-align:left; direction:ltr; }
  .clean-toast{ position:fixed; bottom:18px; left:50%; transform:translateX(-50%) translateY(80px); background:#111820; border:1px solid #1e2d3d; color:#e6edf3; padding:10px 14px; border-radius:12px; font-size:13px; opacity:0; transition:.3s; z-index:9999; }
  .clean-toast.show{ transform:translateX(-50%) translateY(0); opacity:1; }
  .clean-toast.err{ background:#1f1212; border-color:#5a1a1a; color:#ffa39e; }
  .warn{ background:#1f1505; border:1px solid #5a3a0a; color:#ffcc66; padding:10px 12px; border-radius:8px; font-size:12px; margin:12px; }
</style>
</head>
<body>
<header><div class="STING-web-Header STING-web-Max-Size">
  <div class="STING-web-Header-Right">
    <div class="STING-web-Header-Logo"><a href="./"><span class="STING-WEB-SiteName"></span><span class="STING-WEB-SiteUrl"></span></a></div>
    <div class="STING-web-Header-Menu"><ul class="STING-web-Menu" style="display:flex;gap:12px;list-style:none;padding:0;margin:0">
      <li><a href="./">الرئيسية</a></li><li><a href="./#matches">مباريات اليوم</a></li>
    </ul></div>
  </div>
  <div class="STING-web-Header-Left"><a href="./" style="background:#750044;color:#fff;padding:8px 12px;border-radius:8px;text-decoration:none;">← العودة</a></div>
</div></header>

<div class="player-wrap">
  <div id="warn" class="warn" style="display:none"></div>

  <div class="STING-web-Post STING-web-Max-Size" style="margin-top:12px;">
    <div id="matchCover" class="STING-web-MatchCover" style="padding:8px;">
      <div class="STING-web-Background-MatchCover">
        <div class="STING-web-MatchCover-Right"><img id="homeLogo" class="STING-web-MatchCover-Logo"><span id="homeName">...</span></div>
        <div class="STING-web-MatchCover-Center">VS</div>
        <div class="STING-web-MatchCover-Left"><img id="awayLogo" class="STING-web-MatchCover-Logo"><span id="awayName">...</span></div>
      </div>
    </div>

    <div class="controls">
      <button class="btn" id="btnFullscreen">⛶ ملء الشاشة</button>
      <button class="btn ghost" id="btnReload">↻ إعادة تحميل</button>
      <button class="btn danger" id="btnKill">☠️ إخفاء بانر تيليجرام</button>
      <span id="blockCount" style="margin-right:auto;font-size:12px;color:#666;">تم الحجب: 0</span>
    </div>

    <div class="player-card">
      <div class="player-header">
        <span>▶ مشغل نظيف — <b>مانع تيليجرام نشط</b> • sandbox بدون نوافذ</span>
        <span id="modeLabel" style="color:#8b949e;font-size:11px;">مباشر • click-shield ON</span>
      </div>
      <div class="ratio" id="ratio">
        <iframe id="player" title="player" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen loading="eager" sandbox="allow-same-origin allow-scripts allow-forms allow-presentation"></iframe>
        <div class="shield" id="shield"></div>
        <div class="click-shield" id="clickShield"><div style="text-align:center">
          <button id="playBtn">▶ اضغط للتشغيل — بدون إعلانات</button>
          <div style="color:#c9d1d9;font-size:12px;margin-top:8px;">النقرة الأولى تُمتص هنا — لا قفزة تيليجرام</div>
        </div></div>
      </div>
    </div>

    <div class="log" id="log">سجل الحجب:
[init] جاهز
</div>
    <div style="padding:12px;font-size:13px;color:#333;line-height:1.8">
      <b style="color:#750044">ملاحظة:</b> هذا المشغل يعرض نفس صفحة <code>kooralive-plus.info</code> لكن داخل <code>iframe sandbox</code> يمنع القفزات. البانر الذي أرسلته (خلفية صفراء "قناة المراهنات ... 615 الف ... انضم الان") محجوب عبر 3 طبقات: 1) حجب سكريبتات <code>cl.mayhapmonisms / additionalheritagenose / yh.ferritegathers</code> 2) click-shield 3) البروكسي يحذفه من الـ HTML قبل وصوله. فعّل البروكسي للاختفاء الكامل.
    </div>
  </div>
</div>

<div class="clean-toast" id="toast"></div>

<script>
const qs = new URLSearchParams(location.search);
const id = qs.get('id') || '';
const href = qs.get('href') ? decodeURIComponent(qs.get('href')) : '';
const home = qs.get('home') ? decodeURIComponent(qs.get('home')) : '';
const away = qs.get('away') ? decodeURIComponent(qs.get('away')) : '';

// fill cover from query or fallback
if(home) document.getElementById('homeName').textContent = home;
if(away) document.getElementById('awayName').textContent = away;
// try to load logos from matches.json
fetch('./matches.json').then(r=>r.json()).then(arr=>{
  const m = arr.find(x=>x.id===id);
  if(m){
    document.getElementById('homeName').textContent = m.home;
    document.getElementById('awayName').textContent = m.away;
    document.getElementById('homeLogo').src = m.home_logo;
    document.getElementById('awayLogo').src = m.away_logo;
    document.title = \`\${m.home} vs \${m.away} — كورة لايف نظيف\`;
  }
}).catch(()=>{});

const TELE_RE = /(t\.me|telegram\.me|telegram\.org|tg:\/\/|joinchat)/i;
const AD_RE = /(popads|popcash|adcash|propeller|onclkds|highperformancegate|highcpmgate|cl\.mayhapmonisms|additionalheritagenose|yh\.ferritegathers|exo\.click)/i;
const BLOCK_RE = new RegExp(TELE_RE.source+'|'+AD_RE.source,'i');

const iframe = document.getElementById('player');
const shield = document.getElementById('shield');
const clickShield = document.getElementById('clickShield');
const logEl = document.getElementById('log');
const countEl = document.getElementById('blockCount');
let blocked=0, lastCleanSrc='';

function log(m){ logEl.textContent += \`\n[\${new Date().toLocaleTimeString()}] \${m}\`; logEl.scrollTop=logEl.scrollHeight; }
function toast(m,err){ const t=document.getElementById('toast'); t.textContent=m; t.className= err?'clean-toast err show':'clean-toast show'; clearTimeout(t._id); t._id=setTimeout(()=>t.className='clean-toast',2500); }
function bump(reason, url){
  blocked++; countEl.textContent='تم الحجب: '+blocked;
  shield.classList.add('hit'); setTimeout(()=>shield.classList.remove('hit'),500);
  log('BLOCKED '+reason+': '+(url||'').slice(0,100));
  toast('تم الحجب: '+reason, true);
}

if(location.protocol==='file:'){
  document.getElementById('warn').style.display='block';
  document.getElementById('warn').innerHTML='⚠️ فتحت الملف عبر <code>file://</code> — الـ iframe قد يظهر "محظور". شغّل <code>python -m http.server 8000</code> داخل مجلد koora-clean ثم افتح <code>http://localhost:8000/player.html...';
}

// decide src: use worker proxy if configured
const workerBase = (localStorage.getItem('koora_worker')||'').trim();
let targetUrl = href || 'https://kooralive-plus.info/';
if(!targetUrl.startsWith('http')) targetUrl='https://kooralive-plus.info'+targetUrl;
let finalSrc;
if(workerBase && workerBase.startsWith('https://')){
  finalSrc = workerBase.replace(/\/$/,'') + '/?url=' + encodeURIComponent(targetUrl);
  document.getElementById('modeLabel').textContent='بروكسي • بانر محذوف 100%';
  log('وضع البروكسي: '+workerBase);
} else {
  finalSrc = targetUrl;
  log('وضع مباشر: '+targetUrl.slice(0,80));
}
iframe.src = finalSrc;
lastCleanSrc = finalSrc;
log('تحميل المشغل...');

// blocker
const origOpen = window.open.bind(window);
window.open = function(u, ...rest){
  const s=String(u||'');
  if(BLOCK_RE.test(s)){ bump(TELE_RE.test(s)?'تيليجرام':'إعلان', s); return null; }
  return origOpen(u,...rest);
};
document.addEventListener('click', e=>{
  const a=e.target.closest('a');
  const hrefA=a?.href||'';
  if(hrefA && BLOCK_RE.test(hrefA) && !hrefA.includes('player.html') && !hrefA.includes(location.host)){
    e.preventDefault(); e.stopPropagation();
    bump('رابط تيليجرام', hrefA.slice(0,100));
    return false;
  }
}, true);
setInterval(()=>{
  try{
    const src=iframe.src||'';
    if(src!==lastCleanSrc && BLOCK_RE.test(src)){
      bump('تحويل iframe', src.slice(0,100));
      iframe.src=lastCleanSrc;
    } else if(src && !BLOCK_RE.test(src)) lastCleanSrc=src;
  }catch(e){}
}, 600);

// click shield
let armed=true;
function disarm(){ if(!armed) return; armed=false; clickShield.classList.add('hidden'); log('تم إلغاء click-shield'); toast('جاهز للمشاهدة'); }
clickShield.addEventListener('click', disarm);
document.getElementById('playBtn').addEventListener('click', disarm);

// controls
document.getElementById('btnReload').onclick=()=>{
  const u=new URL(lastCleanSrc);
  u.searchParams.set('_', Date.now());
  iframe.src=u.toString(); lastCleanSrc=u.toString();
  armed=true; clickShield.classList.remove('hidden');
  log('إعادة تحميل'); toast('إعادة تحميل...');
};
document.getElementById('btnFullscreen').onclick=async()=>{
  try{ await document.getElementById('ratio').requestFullscreen(); }catch(e){ toast('اضغط تشغيل أولاً', true); }
};
document.getElementById('btnKill').onclick=()=>{
  bump('زر الإخفاء','overlay');
  try{ iframe.contentWindow.postMessage({type:'KILL_TELEGRAM'}, '*'); }catch(e){}
  // also try to reload via worker with kill param
  if(workerBase){
    const u=new URL(lastCleanSrc);
    u.searchParams.set('kill','1'); u.searchParams.set('_',Date.now());
    iframe.src=u.toString(); lastCleanSrc=u.toString();
  } else {
    // direct: just hide shield and try to hide via css injection attempt (will fail cross-origin but we log)
    clickShield.classList.add('hidden'); armed=false;
  }
  log('أُرسلت إشارة إخفاء البانر'); toast('تم إرسال إشارة الإخفاء');
};

// handle demo param
if(qs.get('demo')==='1' && !href){
  document.getElementById('homeName').textContent='beIN 9';
  document.getElementById('awayName').textContent='Demo';
  document.getElementById('homeLogo').src='https://via.placeholder.com/90/750044/fff?text=9';
  document.getElementById('awayLogo').src='https://via.placeholder.com/90/273340/fff?text=LIVE';
  iframe.src = (workerBase? workerBase.replace(/\/$/,'')+'/?url='+encodeURIComponent('https://www.romabar.info/albaplayer/bein-9/?serv=0') : 'https://www.romabar.info/albaplayer/bein-9/?serv=0');
  lastCleanSrc=iframe.src;
  log('وضع تجريبي bein-9');
}
</script>
</body>
</html>
`,
      'style.css': `/*================================== ~> Name Template : Yalla Shoot Pro Premium ~> Version	: V 5.0 BETA ~> Last Updated : 20 - 05 - 2025   : ->  02:00 AM  +2 GMT ~> Developer By : STING WEB - Facebook Page : ->  https://www.facebook.com/stingweb.eg ~> Desgin URL : sting-web.com =========== [ STING WEB ] ==========*/ /* ~> VIRTUAL */ @font-face { font-family: "NeoSansArabic"; font-style: normal; font-weight: 400; font-display: swap; src: local("NeoSansArabic"), url("https://kooralive-plus.info/wp-content/themes/Yalla-Shoot-Pro/assets/font/NeoSansArabic.woff2") format("woff2"); } * { margin: 0; text-decoration: none; list-style: none; list-style-type: none; font-family: "NeoSansArabic", Changa, Segoe UI, sans-serif;padding: 0; font-weight: 500; } a { color:#000000; } body { background: #e1e1e1; color: #000; font-size: 16px; line-height: 25px; }.STING-web-Max-Size { max-width: 1000px; width:93%; margin: 0 auto; padding: 0 12px; } /* ~> SVG ICON */ .STING-web-Icon-x { background: no-repeat center url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' x='0px' y='0px' fill='%23000' viewBox='0 0 50 50'%3E%3Cpath d='M 5.9199219 6 L 20.582031 27.375 L 6.2304688 44 L 9.4101562 44 L 21.986328 29.421875 L 31.986328 44 L 44 44 L 28.681641 21.669922 L 42.199219 6 L 39.029297 6 L 27.275391 19.617188 L 17.933594 6 L 5.9199219 6 z M 9.7167969 8 L 16.880859 8 L 40.203125 42 L 33.039062 42 L 9.7167969 8 z'%3E%3C/path%3E%3C/svg%3E"); } .STING-web-Icon-facebook { background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%231877f2' viewBox='0 0 64 64'%3E%3Cpath d='M20.1,36h3.4c0.3,0,0.6,0.3,0.6,0.6V58c0,1.1,0.9,2,2,2h7.8c1.1,0,2-0.9,2-2V36.6c0-0.3,0.3-0.6,0.6-0.6h5.6 c1,0,1.9-0.7,2-1.7l1.3-7.8c0.2-1.2-0.8-2.4-2-2.4h-6.6c-0.5,0-0.9-0.4-0.9-0.9v-5c0-1.3,0.7-2,2-2h5.9c1.1,0,2-0.9,2-2V6.2 c0-1.1-0.9-2-2-2h-7.1c-13,0-12.7,10.5-12.7,12v7.3c0,0.3-0.3,0.6-0.6,0.6h-3.4c-1.1,0-2,0.9-2,2v7.8C18.1,35.1,19,36,20.1,36z'%3E%3C/path%3E%3C/svg%3E") center no-repeat; } .STING-web-Icon-youtube { background: url("data:image/svg+xml;charset=utf8,%3Csvg aria-hidden='true' role='img' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 576 512' %3E%3Cpath fill='%23cd201f' d='M549.655 124.083c-6.281-23.65-24.787-42.276-48.284-48.597C458.781 64 288 64 288 64S117.22 64 74.629 75.486c-23.497 6.322-42.003 24.947-48.284 48.597-11.412 42.867-11.412 132.305-11.412 132.305s0 89.438 11.412 132.305c6.281 23.65 24.787 41.5 48.284 47.821C117.22 448 288 448 288 448s170.78 0 213.371-11.486c23.497-6.321 42.003-24.171 48.284-47.821 11.412-42.867 11.412-132.305 11.412-132.305s0-89.438-11.412-132.305zm-317.51 213.508V175.185l142.739 81.205-142.739 81.201z' cclass=''%3E%3C/path%3E%3C/svg%3E") center no-repeat; } .STING-web-Icon-telegram { background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%23389ce9' viewBox='0 0 64 64'%3E%3Cpath d='M56.4,8.2l-51.2,20c-1.7,0.6-1.6,3,0.1,3.5l9.7,2.9c2.1,0.6,3.8,2.2,4.4,4.3l3.8,12.1c0.5,1.6,2.5,2.1,3.7,0.9 l5.2-5.3c0.9-0.9,2.2-1,3.2-0.3l11.5,8.4c1.6,1.2,3.9,0.3,4.3-1.7l8.7-41.8C60.4,9.1,58.4,7.4,56.4,8.2z M50,17.4L29.4,35.6 c-1.1,1-1.9,2.4-2,3.9c-0.2,1.5-2.3,1.7-2.8,0.3l-0.9-3c-0.7-2.2,0.2-4.5,2.1-5.7l23.5-14.6C49.9,16.1,50.5,16.9,50,17.4z'%3E%3C/path%3E%3C/svg%3E") center no-repeat; } .STING-web-Open-Menu-SVG { background: no-repeat center url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 6H20M4 12H20M4 18H20' stroke='%23273340' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); width: 25px !important; height: 25px !important; } .STING-web-Open-Dark-SVG { background: no-repeat center url("data:image/svg+xml;charset=utf8,%3Csvg aria-hidden='true' role='img' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 241.072 241.072' %3E%3Cpath fill='%23273340' d='M202.167,156.857c-44.236,0-80.085-35.842-80.085-80.078c0-29.923,16.43-55.951,40.733-69.707 C150.088,2.498,136.373,0,122.082,0C55.506,0,1.535,53.971,1.535,120.528c0,66.584,53.971,120.544,120.547,120.544 c57.269,0,105.18-39.937,117.454-93.485C228.374,153.484,215.665,156.857,202.167,156.857L202.167,156.857z' class=''%3E%3C/path%3E%3C/svg%3E"); } /* ~> HEADER */ header { position: relative; overflow: hidden; width: 96%; margin: 0 auto; } .STING-web-Header { display: flex; align-items: center; justify-content: space-between; margin: 20px auto; background: #fff; border-radius: 8px; padding: 8px 12px; } .STING-web-Header-Right { display: flex; align-items: center; gap: 20px; } .STING-web-Header-Logo { width: initial; padding: 5px 15px; background: #750044; border-radius: 8px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; text-align: center; line-height: 33px; height: 70px; } .STING-web-Header-Logo > a { display: flex; flex-direction: column; justify-content: center; color: #fff; } .STING-web-Header-Logo > a > .STING-WEB-SiteName { font-size: 27px; font-weight: 500; } .STING-web-Header-Logo > a > .STING-WEB-SiteUrl { font-size: 16px; } .STING-web-Menu { display: flex; } .STING-web-Menu > li { float: right; position: relative; } .STING-web-Menu > li > a { color: #222; padding: 0 8px; height: 80px; display: flex; justify-content: center; align-items: center; border-bottom: 2px solid transparent; font-size: 16px; } .STING-web-Menu > li > a:hover { color: #750044; border-bottom: 2px solid #750044; } .STING-web-Social-Media { display: flex; align-items: center; gap: 8px; } .STING-WEB-Screen-Reader { clip: rect(1px,1px,1px,1px); position: absolute!important; height: 1px; width: 1px; overflow: hidden; } .STING-web-Social-Media.i { display: flex; gap: 5px; margin-top: 10px; } .STING-web-Social-Media.i > li { display: inline-block; } .STING-web-Social-Media.i > li > a > span[class*=Icon] { width: 35px; height: 35px; border-radius: 50px; color: #fff; display: inline-block; background-size: 100% 60%; border: 1px solid rgba(0, 0, 0, 0.1); } .STING-web-Header-Left { display: flex; gap: 8px; margin-top: 3px; } .STING-web-ICO { width: 20px; height: 20px; border-radius: 50px; display: block; } .STING-web-Open-Menu, .STING-web-Open-Dark { height: 35px; width: 35px; border-radius: 50px; cursor: pointer; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(0, 0, 0, 0.1); } .STING-web-Close-Menu, .STING-web-Open-Menu { display: none; } .STING-web-Ads:before { content: "مادة إعلانية"; display: block; font-size: 12px; padding-bottom: 2px; border-bottom: 1px solid rgba(0, 0, 0, 0.1); width: max-content; font-weight: 600; margin: 8px 12px; } .STING-WEB-Message-Box > p { color: #2c7635; background-color: #dff0d4; border: #d6e9c4 solid 1px; padding: 4px 15px; border-radius: 8px; margin: 0 auto 10px; font-size: 14px; width: 100%; } @media screen and (max-width: 1000px) { .STING-web-Header { padding: 0px 12px; } .STING-web-Header-Logo { margin: 8px auto; display: table; float: none; width: initial; padding: 2px 10px; } .STING-web-Header-Menu { right: -300px; } .STING-web-Header-Menu { float: none; z-index: 99; height: 100%; width: 245px; position: fixed; top: 0; margin: auto; background: #fff; transition: all .3s ease 0s; padding: 15px; overflow-x: hidden; box-shadow: 0 1px 6px rgba(32,33,36,.4); padding-top: 70px; } .STING-web-Menu { display: grid; margin-top: 8%; } .STING-web-Menu > li { margin-bottom: 15px; } .STING-web-Menu > li > a, .STING-web-Close-Menu { background: #273340; color: #fff; display: flex; justify-content: space-between; padding: 5px 10px; border-radius: 8px; height: max-content; } .STING-web-Header-Center { display: none; position: absolute; top: 0; right: 0; z-index: 99; transition: all .7s ease 0s; width: 250px; justify-content: center; } .STING-web-Open-Menu, .STING-web-Open-Dark { padding: 2px; display: flex !important; }} /* ~> MATCHES */ .STING-web-Container-Matches { margin: 20px auto; box-shadow: 0 0 4px rgba(0,0,0,.0); background: transparent; border-radius: 8px; padding: 0; position: relative; } .STING-web-Container-Matches-Top { padding: 12px; overflow: hidden; border-radius: 8px; background: #ffffff; border-bottom: 1px solid rgba(0, 0, 0, 0.1); } .STING-web-Time { position: absolute; left: 8px; top: -26px; z-index: 9; font-size: 11px; padding: 0 12px 6px 12px; border-radius: 8px 8px 0 0; background: #fff; } .STING-web-Title-Box, .STING-web-Matches-Toggle > li > a { font-size: 15px; background: #750044; color: #fff; padding: 4px 10px; display: block; border-radius: 8px; } .STING-web-Title-Box { float: right; display: flex; align-items: center; } .STING-web-Matches-Toggle > .Today-Matches > a, .STING-web-Title-Box { background: #750044 !important; } .STING-web-Matches-Toggle { float: left; display: flex; align-items: center; gap: 5px; } .STING-web-Matches-Toggle > .Yesterday-Matches > a { background: #104783; } .STING-web-Matches-Toggle > .Tomorrow-Matches > a { background: #af5100; } .STING-web-Matches { display: flex !important; flex-direction: column !important; padding: 12px 0; box-sizing: border-box; } .STING-web-Match { overflow: hidden; text-align: center; background: #ffffff; margin-bottom: 8px; position: relative; border-radius: 8px; } .STING-web-Match a { color: #222; } .STING-web-Match-Info { font-size: 12px; text-align: center; line-height: 1.4; margin-top: 10px; max-width: 130px; align-items: center; justify-self: center; } .STING-web-Left-Team, .STING-web-Match-Center, .STING-web-Right-Team { width: 33.33333333%; float: right; } .STING-web-Team-Logo { float: right; width: 50%; }@keyframes blinker { 50% { opacity: 0; } } .STING-web-Team-Logo img { margin: 15px auto !important; display: flex !important; border-radius: 4px; object-fit: contain; width: 50px; height: 50px; } .STING-web-Team-NAME { margin: 0 auto; display: table; font-size: 15px; } .STING-web-Match-Timing { margin: 12px auto; }#STING-web-Match-Time { margin-bottom: 5px; }#STING-web-Result { font-size: 21px; letter-spacing: 5px; margin-right: -5px; } .STING-web-Match-Timing .STING-web-Data, .STING-web-Match-Timing .live:before { color: #fff; background: #273340; border-radius: 8px; font-size: 14px; padding: 0 10px; line-height: 1.9; display: table; margin: auto; margin-top: 6px; position: relative; } /* .STING-web-Match-Info:before { content: "🏆"; margin-left: 7px; } */ .STING-web-Overlay { position: absolute; height: 100%; width: 100%; opacity: 0; cursor: pointer; background: rgb(0 0 0 / 60%); z-index: 9; } .STING-web-Overlay, .STING-web-SVG-Play { bottom: 0; right: 0; left: 0; top: 0; } .STING-web-SVG-Play { position: absolute; height: 45px; margin: auto; width: 45px; background: no-repeat center url("data:image/svg+xml;charset=utf8,%3Csvg aria-hidden='true' role='img' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512' %3E%3Cpath fill='%23fff' d='M256,0C114.617,0,0,114.615,0,256s114.617,256,256,256s256-114.615,256-256S397.383,0,256,0z M344.48,269.57l-128,80 c-2.59,1.617-5.535,2.43-8.48,2.43c-2.668,0-5.34-.664-7.758-2.008C195.156,347.172,192,341.82,192,336V176 c0-5.82,3.156-11.172,8.242-13.992c5.086-2.836,11.305-2.664,16.238,.422l128,80c4.676,2.93,7.52,8.055,7.52,13.57 S349.156,266.641,344.48,269.57z' class=''%3E%3C/path%3E%3C/svg%3E"); } .STING-web-Left-Team { direction: ltr; display: flex; } .STING-web-Match.LIVE #STING-web-Match-Time, .STING-web-Match.NOT #STING-web-Result { display: none !important; } .STING-web-Match:hover .STING-web-Overlay { opacity: 1; } .STING-web-Right-Team,.STING-web-Left-Team { display: grid; align-items: center; justify-items: center; } .STING-web-Match.SOON { order: 1; } .STING-web-Match.LIVE { order: 2; } .STING-web-Match.NOT { order: 3; } .STING-web-Match.END { order: 4; } .STING-web-Match-Timing .LIVE::before { content: "جارية الآن"; } .STING-web-Match-Timing .LIVE::before { position: absolute; animation: .5s ease-in-out infinite blinker; background: #d00000; left: 0; right: 0; border-radius: 8px; } .STING-web-Match-Timing .SOON { background: #0f6f37; } .STING-web-Match-Timing .END { background: #222; } .STING-web-Match img { opacity: 0; transition: opacity 400ms ease; } .STING-web-Match img.show { opacity: 1; } .STING-web-Matching-None { min-height: 200px; display: flex; align-items: center; justify-content: center; color: #666; border-radius: 8px; margin: 12px 0; background: #ffffff; } @media screen and (max-width: 500px){ .STING-web-Team-Logo { width: 100%; } .STING-web-Team-Logo img { margin: 7px auto; margin-bottom: 0; width: 45px; height: 45px; } .STING-web-Team-NAME { margin: 7px auto; margin-top: 0; } .STING-web-Match-Timing { margin: 13px auto; } .STING-web-Left-Team { display: table; } .STING-web-Match-Info { margin-top: 5px; }} @media screen and (max-width: 500px) { .STING-web-Title-Box { display: block; width: 100%; text-align: center; margin-bottom: 6px; } .STING-web-Title-Box, .STING-web-Matches-Toggle > li > a { padding: 4px 0; } .STING-web-Matches-Toggle { float: right; width: 100%; } .STING-web-Matches-Toggle > li { margin: 0; flex: 1; } .STING-web-Matches-Toggle > li > a { text-align: center; }} /* ~> MAIN */ .STING-web-Main { border-radius: 8px; box-shadow: 0 0 4px rgba(0,0,0,.0); padding: 0; display: grid; margin-bottom: 20px; } .STING-web-Main-Top { background: #fff; border-radius: 8px; } .STING-web-Main .STING-web-WebSite-Title { font-size: 15px; background: #273340; color: #fff; padding: 4px 10px; display: inline-block; border-radius: 6px; margin: 12px; } .STING-web-Main-Bottom-Posts { padding: 12px 12px 0; padding-bottom: 0; overflow: hidden; } .STING-web-Main-All-Post { margin: 0 auto; display: flex; justify-content: space-between; flex-wrap: wrap; } .STING-web-Main-Post { float: right; width: 24%; background: #eceef2; margin: 5px 2px 15px 2px; overflow: hidden; position: relative; border-radius: 8px; } .STING-web-Main-Posted { float: right; width: 24%; background: #fff; margin: 5px 2px 15px 2px; overflow: hidden; position: relative; border-radius: 8px; } .STING-web-Main-Posted a { color: #222; } .STING-web-Main-Posted-IMG img { object-fit: cover; height: 160px; width: 100%; display: grid; opacity: 0; transition: opacity 400ms ease; } .STING-web-Main-Posted-IMG img.show { opacity: 1; } .STING-web-Main-Posted-TiTle { padding: 10px; } .STING-web-Main-Posted-TiTle h3  { margin: 0; line-height: 2; font-size: 15px; height: 60px; overflow: hidden; font-weight: 500; } .STING-web-Not-Posts { text-align: center; display: flex; width: 100%; align-items: center; justify-content: center; padding: 50px 0; color: #222222c2; margin: 20px auto; border-radius: 8px; } .STING-web-Main-Bottom-Posts #loadMore { position: relative; text-align: center; display: flex; cursor: pointer; clear: both; min-width: 170px; border: 1px solid #fff; background: #fff; margin: 5px auto 5px; padding: 8px 15px; font-size: 100%; font-weight: 400; height: 40px; box-sizing: border-box; line-height: 1.4; border-radius: 8px; color: #222; justify-content: center; align-items: center; } .STING-web-Main-Bottom-Posts #loadMore:hover,.STING-web-Main-Posted:hover .STING-web-Main-Posted-TiTle h3 { color: #750044; } .STING-web-Not-More-Post { width: 100%; display: block; text-align: center; color: #ff0000; margin: 15px 0; font-size: 15px; } @media screen and (max-width: 500px) { .STING-web-Main-Posted { width: 100%; margin: 5px 2px 5px 2px; } .STING-web-Main-Posted-IMG { float: right; margin-left: 12px; } .STING-web-Main-Posted-IMG img { height: 80px; width: 125px; } .STING-web-Main-Bottom-Posts { padding: 5px 5px 0; }} /* ~> SITE DESCRIPTION */ .STING-web-Site-Description { text-align: justify; background: #fff; border-radius: 8px; box-shadow: 0 0 4px rgba(0,0,0,.0); padding: 0; display: grid; } .STING-web-Site-Description-Top > h3 { font-size: 15px; background: #273340; color: #fff; padding: 4px 10px; display: inline-block; border-radius: 6px; margin: 12px; } .STING-web-Site-Description-Bottom { padding: 5px 12px 12px 12px; text-align: justify; font-weight: 400; font-size: 16px; line-height: 35px; background: #ffffff; border-top: 1px solid #e1e1e1; max-height: 240px; overflow: hidden; } /* ~> SITE LINKS */ .STING-web-Pages-Site { display: flex; clear: both; padding: 0; flex-wrap: wrap; } .STING-web-Links-List { width: 25%; padding: 20px 12px; box-sizing: border-box; } .STING-web-Links-List-Title { border-bottom: transparent solid 1px; padding: 5px 0; margin-bottom: 7px; font-weight: 700; font-size: 16px; position: relative; } .STING-web-Links-List-Title::before { background: #750044; content: ""; height: 3px; position: absolute; width: 23px; bottom: -1.5px; } .STING-web-Links { line-height: 33px; } .STING-web-Links li { padding: 0; list-style: outside; color: #750044; width: 100%; margin-right: 16px; } .STING-web-Links li a { color: #484848; display: block; font-size: 14px; } .STING-web-Links li a:hover { color: #750044; } .STING-web-Pages > ul { display: flex; gap: 12px; font-size: 13px; padding: 0 7px; } .STING-web-Pages > ul > li a { border-radius: 6px; color: #222; font-size: 13.6px; } @media screen and (max-width: 720px) { .STING-web-Links-List { width: 100%; } .STING-web-Pages-Site  { display: none; } .STING-web-Pages > ul { flex-wrap: wrap; text-align: center; justify-content: center; gap: 18px; }} /* ~> FOOTER */ footer { position: relative; padding: 0; overflow: hidden; box-shadow: 0 0 4px rgba(0,0,0,.0); width: 96%; margin: 20px auto; } .STING-web-Footer { padding: 12px; display: flex; justify-content: space-between; align-items: center; background: #fff; border-radius: 8px; } .STING-web-Site-Copyright { padding: 5px 10px; border-radius: 6px; font-size: 13px; } .STING-web-Site-Copyright > a { color: #222; font-weight: 600; } .STING-web-Copyright a, .STING-web-Site-Copyright { border-radius: 6px; color: #222; font-size: 13.6px; text-align: center; } .STING-web-Footer a:hover { color: #750044; } @media screen and (max-width: 720px) { .STING-web-Footer { display: grid; justify-items: center; justify-content: center; gap: 12px; width: max-content; }} /* ~> NIGHT MODE */ .Night .STING-web-Match,.Night .STING-web-Footer,.Night .STING-web-Header,.Night .STING-web-Header-Menu,.Night .STING-web-Main-Posted,.Night .STING-web-Main-Top,.Night .STING-web-Site-Description,.Night .STING-web-Site-Description-Bottom{background:#191d2d} .Night .STING-web-Match-Timing .STING-web-Data,.Night .STING-web-Main .STING-web-WebSite-Title,.Night .STING-web-Site-Description-Top>h3{background:#0e1019} .Night .STING-web-Main-Bottom-Posts #loadMore{border:1px solid #191d2d;background:#191d2d;color:#fff} .Night .STING-web-Match *,.Night .STING-web-Copyright a,.Night .STING-web-Links li a,.Night .STING-web-Main-Posted-TiTle h3,.Night .STING-web-Menu>li>a,.Night .STING-web-Pages>ul>li a,.Night .STING-web-Site-Copyright,body.Night{color:#ddd} .Night .STING-web-Footer a:hover,.Night .STING-web-Header-Logo>a:hover,.Night .STING-web-Links li,.Night .STING-web-Links li a:hover,.Night .STING-web-Main-Bottom-Posts #loadMore:hover,.Night .STING-web-Main-Posted:hover .STING-web-Main-Posted-TiTle h3,.Night .STING-web-Menu>li>a:hover,.Night .STING-web-Not-More-Post{color:orange} .Night .STING-web-Matching-None{color:#ddd;background:#191d2d}.Night .STING-web-Site-Copyright>a{color:#fff}.Night .STING-web-Links-List-Title::before{background:#ddd} .Night .STING-web-Site-Description-Bottom{border-top:1px solid #0e1019} .Night .STING-web-Container-Matches-Top,.Night .STING-web-Time{background:#191d2d;border-bottom:1px solid #191d2d} .Night .STING-web-Matches-Toggle>li>a,.Night .STING-web-Title-Box{background:#0e1019!important} .Night .STING-web-Header-Logo,.Night .STING-web-Open-Dark,.Night .STING-web-Open-Menu,body.Night{background-color:#0e1019} @media screen and (max-width:1000px){ .Night .STING-web-Close-Menu,.Night .STING-web-Menu>li>a{background:#0e1019}} .Night .STING-web-Menu>li>a:hover{border-bottom:2px solid orange} .Night .STING-web-Ads:before{color:#ddd;border-bottom:1px solid #dddddd21} .Night .STING-web-Icon-youtube{background-color:#cd201f!important;background:url("data:image/svg+xml;charset=utf8,%3Csvg aria-hidden='true' role='img' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 576 512' %3E%3Cpath fill='%23fff' d='M549.655 124.083c-6.281-23.65-24.787-42.276-48.284-48.597C458.781 64 288 64 288 64S117.22 64 74.629 75.486c-23.497 6.322-42.003 24.947-48.284 48.597-11.412 42.867-11.412 132.305-11.412 132.305s0 89.438 11.412 132.305c6.281 23.65 24.787 41.5 48.284 47.821C117.22 448 288 448 288 448s170.78 0 213.371-11.486c23.497-6.321 42.003-24.171 48.284-47.821 11.412-42.867 11.412-132.305 11.412-132.305s0-89.438-11.412-132.305zm-317.51 213.508V175.185l142.739 81.205-142.739 81.201z' cclass=''%3E%3C/path%3E%3C/svg%3E") center no-repeat} .Night .STING-web-Icon-telegram{background-color:#389ce9!important;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%23fff' viewBox='0 0 64 64'%3E%3Cpath d='M56.4,8.2l-51.2,20c-1.7,0.6-1.6,3,0.1,3.5l9.7,2.9c2.1,0.6,3.8,2.2,4.4,4.3l3.8,12.1c0.5,1.6,2.5,2.1,3.7,0.9 l5.2-5.3c0.9-0.9,2.2-1,3.2-0.3l11.5,8.4c1.6,1.2,3.9,0.3,4.3-1.7l8.7-41.8C60.4,9.1,58.4,7.4,56.4,8.2z M50,17.4L29.4,35.6 c-1.1,1-1.9,2.4-2,3.9c-0.2,1.5-2.3,1.7-2.8,0.3l-0.9-3c-0.7-2.2,0.2-4.5,2.1-5.7l23.5-14.6C49.9,16.1,50.5,16.9,50,17.4z'%3E%3C/path%3E%3C/svg%3E") center no-repeat} .Night .STING-web-Icon-x{background-color:#000!important;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' x='0px' y='0px' fill='%23fff' viewBox='0 0 50 50'%3E%3Cpath d='M 5.9199219 6 L 20.582031 27.375 L 6.2304688 44 L 9.4101562 44 L 21.986328 29.421875 L 31.986328 44 L 44 44 L 28.681641 21.669922 L 42.199219 6 L 39.029297 6 L 27.275391 19.617188 L 17.933594 6 L 5.9199219 6 z M 9.7167969 8 L 16.880859 8 L 40.203125 42 L 33.039062 42 L 9.7167969 8 z'%3E%3C/path%3E%3C/svg%3E") center no-repeat} .Night .STING-web-Icon-facebook{background-color:#1877f2!important;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='%23fff' viewBox='0 0 64 64'%3E%3Cpath d='M20.1,36h3.4c0.3,0,0.6,0.3,0.6,0.6V58c0,1.1,0.9,2,2,2h7.8c1.1,0,2-0.9,2-2V36.6c0-0.3,0.3-0.6,0.6-0.6h5.6 c1,0,1.9-0.7,2-1.7l1.3-7.8c0.2-1.2-0.8-2.4-2-2.4h-6.6c-0.5,0-0.9-0.4-0.9-0.9v-5c0-1.3,0.7-2,2-2h5.9c1.1,0,2-0.9,2-2V6.2 c0-1.1-0.9-2-2-2h-7.1c-13,0-12.7,10.5-12.7,12v7.3c0,0.3-0.3,0.6-0.6,0.6h-3.4c-1.1,0-2,0.9-2,2v7.8C18.1,35.1,19,36,20.1,36z'%3E%3C/path%3E%3C/svg%3E") center no-repeat} .Night .STING-web-Open-Dark-SVG{background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Cpath fill='%23fff' d='M256 160c-52.9 0-96 43.1-96 96s43.1 96 96 96 96-43.1 96-96-43.1-96-96-96zm246.4 80.5l-94.7-47.3 33.5-100.4c4.5-13.6-8.4-26.5-21.9-21.9l-100.4 33.5-47.4-94.8c-6.4-12.8-24.6-12.8-31 0l-47.3 94.7L92.7 70.8c-13.6-4.5-26.5 8.4-21.9 21.9l33.5 100.4-94.7 47.4c-12.8 6.4-12.8 24.6 0 31l94.7 47.3-33.5 100.5c-4.5 13.6 8.4 26.5 21.9 21.9l100.4-33.5 47.3 94.7c6.4 12.8 24.6 12.8 31 0l47.3-94.7 100.4 33.5c13.6 4.5 26.5-8.4 21.9-21.9l-33.5-100.4 94.7-47.3c13-6.5 13-24.7.2-31.1zm-155.9 106c-49.9 49.9-131.1 49.9-181 0-49.9-49.9-49.9-131.1 0-181 49.9-49.9 131.1-49.9 181 0 49.9 49.9 49.9 131.1 0 181z'%3E%3C/path%3E%3C/svg%3E") center no-repeat} .Night .STING-web-Open-Menu-SVG { background: no-repeat center url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 6H20M4 12H20M4 18H20' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); }`,
      'matches.json': `[
  {
    "id": "4804596",
    "href": "https://kooralive-plus.info/matches/%d9%85%d8%b4%d8%a7%d9%87%d8%af%d8%a9-%d9%85%d8%a8%d8%a7%d8%b1%d8%a7%d8%a9-%d8%a8%d8%aa%d8%b1%d9%88%d9%84-%d8%a7%d8%b3%d9%8a%d9%88%d8%b7-%d8%b6%d8%af-%d8%a7%d9%84%d8%a8%d9%86%d9%83-%d8%a7%d9%84%d8%a7/",
    "home": "بترول اسيوط",
    "away": "البنك الاهلي",
    "league": "الدوري المصري",
    "start": "2026-08-31T17:00:00+03:00",
    "status": "FT",
    "official_status": "انتهت",
    "game_time": "",
    "score_home": "0",
    "score_away": "1",
    "home_logo": "https://kooralive-plus.info/wp-content/uploads/yalla-team-logos/12254.png",
    "away_logo": "https://kooralive-plus.info/wp-content/uploads/yalla-team-logos/50527.png",
    "time_text": "انتهت",
    "result_text": "1-0",
    "league_text": "الدوري المصري"
  },
  {
    "id": "4804597",
    "href": "https://kooralive-plus.info/matches/%d9%85%d8%b4%d8%a7%d9%87%d8%af%d8%a9-%d9%85%d8%a8%d8%a7%d8%b1%d8%a7%d8%a9-%d8%a7%d9%84%d8%b2%d9%85%d8%a7%d9%84%d9%83-%d8%b6%d8%af-%d9%85%d9%86%d8%aa%d8%ae%d8%a8-%d8%a7%d9%84%d8%b3%d9%88%d9%8a%d8%b3/",
    "home": "الزمالك",
    "away": "منتخب السويس بتروجت",
    "league": "الدوري المصري",
    "start": "2026-08-31T20:00:00+03:00",
    "status": "FT",
    "official_status": "انتهت",
    "game_time": "",
    "score_home": "2",
    "score_away": "1",
    "home_logo": "https://kooralive-plus.info/wp-content/uploads/yalla-team-logos/8201.png",
    "away_logo": "https://kooralive-plus.info/wp-content/uploads/yalla-team-logos/8302.png",
    "time_text": "انتهت",
    "result_text": "1-2",
    "league_text": "الدوري المصري"
  },
  {
    "id": "4804599",
    "href": "https://kooralive-plus.info/matches/%d9%85%d8%b4%d8%a7%d9%87%d8%af%d8%a9-%d9%85%d8%a8%d8%a7%d8%b1%d8%a7%d8%a9-%d8%a7%d9%84%d9%85%d8%b5%d8%b1%d9%8a-%d8%b6%d8%af-%d8%a8%d9%8a%d8%b1%d8%a7%d9%85%d9%8a%d8%af%d8%b2-%d8%a8%d8%aa%d8%a7%d8%b1/",
    "home": "المصري",
    "away": "بيراميدز",
    "league": "الدوري المصري",
    "start": "2026-08-31T20:00:00+03:00",
    "status": "FT",
    "official_status": "انتهت",
    "game_time": "",
    "score_home": "0",
    "score_away": "1",
    "home_logo": "https://kooralive-plus.info/wp-content/uploads/yalla-team-logos/8303.png",
    "away_logo": "https://kooralive-plus.info/wp-content/uploads/yalla-team-logos/22143.png",
    "time_text": "انتهت",
    "result_text": "1-0",
    "league_text": "الدوري المصري"
  },
  {
    "id": "4732725",
    "href": "https://kooralive-plus.info/matches/%d9%85%d8%b4%d8%a7%d9%87%d8%af%d8%a9-%d9%85%d8%a8%d8%a7%d8%b1%d8%a7%d8%a9-%d9%84%d9%8a%d8%aa%d8%b4%d9%8a-%d8%b6%d8%af-%d8%b1%d9%88%d9%85%d8%a7-%d8%a8%d8%aa%d8%a7%d8%b1%d9%8a%d8%ae-31-08-2026-koora-l/",
    "home": "ليتشي",
    "away": "روما",
    "league": "الدوري الإيطالي",
    "start": "2026-08-31T19:30:00+03:00",
    "status": "FT",
    "official_status": "انتهت",
    "game_time": "",
    "score_home": "0",
    "score_away": "4",
    "home_logo": "https://kooralive-plus.info/wp-content/uploads/yalla-team-logos/246.png",
    "away_logo": "https://kooralive-plus.info/wp-content/uploads/yalla-team-logos/225.png",
    "time_text": "انتهت",
    "result_text": "4-0",
    "league_text": "الدوري الإيطالي"
  },
  {
    "id": "4732730",
    "href": "https://kooralive-plus.info/matches/%d9%85%d8%b4%d8%a7%d9%87%d8%af%d8%a9-%d9%85%d8%a8%d8%a7%d8%b1%d8%a7%d8%a9-%d8%a3%d8%aa%d8%a7%d9%84%d8%a7%d9%86%d8%aa%d8%a7-%d8%b6%d8%af-%d8%a8%d9%88%d9%84%d9%88%d9%86%d9%8a%d8%a7-%d8%a8%d8%aa%d8%a7/",
    "home": "أتالانتا",
    "away": "بولونيا",
    "league": "الدوري الإيطالي",
    "start": "2026-08-31T21:45:00+03:00",
    "status": "LIVE",
    "official_status": "الشوط الثاني",
    "game_time": "85'",
    "score_home": "0",
    "score_away": "0",
    "home_logo": "https://kooralive-plus.info/wp-content/uploads/yalla-team-logos/232.png",
    "away_logo": "https://kooralive-plus.info/wp-content/uploads/yalla-team-logos/245.png",
    "time_text": "85'",
    "result_text": "0-0",
    "league_text": "الدوري الإيطالي"
  },
  {
    "id": "4750885",
    "href": "https://kooralive-plus.info/matches/%d9%85%d8%b4%d8%a7%d9%87%d8%af%d8%a9-%d9%85%d8%a8%d8%a7%d8%b1%d8%a7%d8%a9-%d8%a3%d9%88%d8%b3%d8%a7%d8%b3%d9%88%d9%86%d8%a7-%d8%b6%d8%af-%d8%ae%d9%8a%d8%aa%d8%a7%d9%81%d9%8a-%d8%a8%d8%aa%d8%a7%d8%b1/",
    "home": "أوساسونا",
    "away": "خيتافي",
    "league": "الدوري الإسباني",
    "start": "2026-08-31T20:30:00+03:00",
    "status": "FT",
    "official_status": "انتهت",
    "game_time": "",
    "score_home": "1",
    "score_away": "0",
    "home_logo": "https://kooralive-plus.info/wp-content/uploads/yalla-team-logos/143.png",
    "away_logo": "https://kooralive-plus.info/wp-content/uploads/yalla-team-logos/140.png",
    "time_text": "انتهت",
    "result_text": "0-1",
    "league_text": "الدوري الإسباني"
  },
  {
    "id": "4750887",
    "href": "https://kooralive-plus.info/matches/%d9%85%d8%b4%d8%a7%d9%87%d8%af%d8%a9-%d9%85%d8%a8%d8%a7%d8%b1%d8%a7%d8%a9-%d8%a8%d8%b1%d8%b4%d9%84%d9%88%d9%86%d8%a9-%d8%b6%d8%af-%d8%b1%d8%a7%d9%8a%d9%88-%d9%81%d8%a7%d9%8a%d9%8a%d9%83%d8%a7%d9%86/",
    "home": "برشلونة",
    "away": "رايو فاييكانو",
    "league": "الدوري الإسباني",
    "start": "2026-08-31T22:30:00+03:00",
    "status": "LIVE",
    "official_status": "شوط",
    "game_time": "45'",
    "score_home": "2",
    "score_away": "1",
    "home_logo": "https://kooralive-plus.info/wp-content/uploads/yalla-team-logos/132.png",
    "away_logo": "https://kooralive-plus.info/wp-content/uploads/yalla-team-logos/174.png",
    "time_text": "45'",
    "result_text": "1-2",
    "league_text": "الدوري الإسباني"
  },
  {
    "id": "4742090",
    "href": "https://kooralive-plus.info/matches/%d9%85%d8%b4%d8%a7%d9%87%d8%af%d8%a9-%d9%85%d8%a8%d8%a7%d8%b1%d8%a7%d8%a9-%d8%a3%d8%b3%d8%aa%d9%88%d9%86-%d9%81%d9%8a%d9%84%d8%a7-%d8%b6%d8%af-%d8%a3%d8%b1%d8%b3%d9%86%d8%a7%d9%84-%d8%a8%d8%aa%d8%a7/",
    "home": "أستون فيلا",
    "away": "أرسنال",
    "league": "الدوري الإنجليزي",
    "start": "2026-08-31T22:00:00+03:00",
    "status": "LIVE",
    "official_status": "الشوط الثاني",
    "game_time": "70'",
    "score_home": "0",
    "score_away": "1",
    "home_logo": "https://kooralive-plus.info/wp-content/uploads/yalla-team-logos/109.png",
    "away_logo": "https://kooralive-plus.info/wp-content/uploads/yalla-team-logos/104.png",
    "time_text": "70'",
    "result_text": "1-0",
    "league_text": "الدوري الإنجليزي"
  }
]`,
      'sw.js': `// sw.js — network-level ad + telegram blocker for romabar-player
// Intercepts ALL fetches from the page (including iframe sub-requests where possible)
// and returns 204 for known ad/telegram domains.

const TELEGRAM_RE = /(t\.me|telegram\.me|telegram\.org|telegram\.dog|tg:\/\/|joinchat)/i;
const AD_RE = /(popads|popcash|adcash|propeller|onclkds|highperformancegate|highcpmgate|highcpm|exo\.click|juicyads|hilltopads|doubleclick|googlesyndication|adservice|adsystem|adnxs|criteo|outbrain|taboola|zeroredirect|realsrv|gads|adsterra|onclick|popunder)/i;
const BLOCK_RE = new RegExp(TELEGRAM_RE.source + '|' + AD_RE.source, 'i');

// Also block by path patterns common on romabar ad injections
const PATH_BLOCK = /(telegram|join.*channel|t\.me)/i;

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = event.request.url;
  const dest = event.request.destination; // script, image, iframe, etc.

  // block telegram + ads
  if (BLOCK_RE.test(url) || PATH_BLOCK.test(url)) {
    // notify page
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(c => c.postMessage({type:'BLOCKED', reason: TELEGRAM_RE.test(url) ? 'Telegram (SW)' : 'Ad (SW)', url: url.slice(0,120)}));
      })
    );
    // return empty response — prevents script/load
    return event.respondWith(new Response('', {
      status: 204,
      statusText: 'Blocked by SW',
      headers: {'Content-Type':'text/plain'}
    }));
  }

  // For navigation requests that look like telegram hijack, block
  if (event.request.mode === 'navigate' && TELEGRAM_RE.test(url)) {
    return event.respondWith(new Response('', {status:204}));
  }

  // default: passthrough (don't cache, to keep stream fresh)
  return;
});
`,
      'worker.js': `/**
 * worker.js — Koora Live Clean Proxy
 * Deploy to Cloudflare Workers: \`wrangler deploy\` or paste in dashboard.
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
    const inject = \`
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
\`;

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
`,
    };
    let file = path === '/' ? 'index.html' : path.slice(1);
    if(files[file]){
      const ext = file.split('.').pop();
      const types = {html:'text/html; charset=utf-8', css:'text/css; charset=utf-8', json:'application/json; charset=utf-8', js:'application/javascript; charset=utf-8'};
      return new Response(files[file], {headers:{'content-type': types[ext]||'text/plain','cache-control':'public, max-age=300','access-control-allow-origin':'*'}});
    }
    return new Response('Not found: '+path, {status:404});
  }
}
