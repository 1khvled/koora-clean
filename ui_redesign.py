import re

def load(p):
    with open(p, encoding='utf-8') as f:
        return f.read()

def save(p, s):
    with open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(s)

idx = load('index.html')
pl = load('player.html')

def rep(s, old, new, name):
    n = s.count(old)
    assert n >= 1, f'NOT FOUND: {name}'
    return s.replace(old, new)

def rep1(s, old, new, name):
    n = s.count(old)
    if n == 0 and new in s:
        return s  # already applied (idempotent re-run)
    assert n == 1, f'EXPECTED 1, FOUND {n}: {name}'
    return s.replace(old, new)

def splice(s, start_re, end_marker, new, name):
    m = re.search(start_re, s)
    if not m:
        assert new in s, f'START NOT FOUND and replacement absent: {name}'
        return s  # already applied
    j = s.find(end_marker, m.start())
    assert j != -1, f'END NOT FOUND: {name}'
    return s[:m.start()] + new + s[j:]

def resub1(s, pat, new, name, flags=0):
    s2, n = re.subn(pat, new, s, count=1, flags=flags)
    if n == 0 and new in s2:
        return s2  # already applied
    assert n == 1, f'EXPECTED 1, FOUND {n}: {name}'
    return s2

# ============ NEW CSS BLOCK (index) ============
NEW_CSS = """/* ===== KOORA CLEAN 2026 — flat Arabic match-day design ===== */
:root{
  --paper:#edf0f4; --card:#ffffff; --ink:#141b26; --muted:#667085;
  --line:#e2e7ef; --brand:#750044; --brand-deep:#5c0036;
  --live:#d92d20; --live-soft:#fdeceb; --pitch:#0e7a3d; --pitch-soft:#e6f4ec;
  --rail:#23060f; --rail-card:#33101d; --rail-line:#57213c;
  --radius:14px; --shadow:0 1px 2px rgba(16,24,40,.06),0 2px 8px rgba(16,24,40,.07);
}
*{ -webkit-font-smoothing:antialiased; }
body{ background:var(--paper) !important; color:var(--ink);
  font-family:"NeoSansArabic","Segoe UI",Tahoma,Arial,sans-serif !important; }
body.Night{ --paper:#0e1019; --card:#191d2d; --ink:#e9ebf1; --muted:#9aa3b2;
  --line:#283043; --live-soft:#3a1512; --pitch-soft:#0f2f1f; --shadow:none; }

/* header — flat bar, solid maroon brand block */
.STING-web-Header{ background:var(--card) !important; border:1px solid var(--line);
  border-radius:var(--radius); box-shadow:var(--shadow); padding:10px 14px; }
.STING-web-Header-Logo{ background:var(--brand) !important; border-radius:10px !important;
  height:58px; min-width:170px; }
.STING-web-Header-Logo > a{ align-items:flex-start; padding:8px 14px; }
.STING-WEB-SiteName{ font-size:23px !important; font-weight:800 !important; line-height:1.25; }
.STING-WEB-SiteUrl{ font-size:11px !important; font-weight:600; opacity:.85; }
.STING-web-Menu > li > a{ height:auto; padding:10px 14px; border-radius:10px;
  font-weight:700; color:var(--ink); }
.STING-web-Menu > li > a:hover{ color:var(--brand); background:#f8edf3;
  border-bottom-color:transparent; }
body.Night .STING-web-Menu > li > a:hover{ background:#241a26; }
.clean-badge{ display:inline-flex; align-items:center; gap:7px; background:var(--pitch-soft);
  border:1px solid #bfe3cf; color:var(--pitch); font-size:12px; font-weight:700;
  padding:6px 13px; border-radius:999px; white-space:nowrap; }
.clean-badge .dot{ width:8px; height:8px; border-radius:50%; background:var(--pitch); }

/* sticky schedule toolbar */
.STING-web-Container-Matches-Top{ background:var(--card) !important;
  border:1px solid var(--line) !important; border-radius:var(--radius) !important;
  box-shadow:var(--shadow); position:sticky; top:8px; z-index:60; }
.STING-web-Title-Box{ background:var(--brand) !important; font-weight:800 !important;
  border-radius:10px; }
.STING-web-Matches-Toggle > li > a{ border-radius:10px; font-weight:700; }
.STING-web-Matches-Toggle > li > a.on{ box-shadow:inset 0 -3px 0 rgba(255,255,255,.95); }
.STING-web-Time{ color:var(--muted); }

/* search + league pills */
.search-box{ position:relative; margin:0 0 8px; }
.search-box::before{ content:""; position:absolute; inset-inline-start:14px; top:50%;
  width:16px; height:16px; transform:translateY(-50%); opacity:.55;
  background:no-repeat center/contain url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23667085' stroke-width='2.4' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='M20 20l-3.5-3.5'/%3E%3C/svg%3E"); }
.search-box input{ width:100%; padding:12px 16px; padding-inline-start:42px;
  border:1px solid var(--line); border-radius:12px; background:var(--card);
  color:var(--ink); font:inherit; font-size:14px; outline:none; box-sizing:border-box; }
.search-box input:focus{ border-color:var(--brand); box-shadow:0 0 0 3px rgba(117,0,68,.12); }
.league-filter{ display:flex; flex-wrap:wrap; gap:8px; margin:2px 0 12px; }
.league-pill{ font-size:12px; font-weight:700; padding:7px 14px; border-radius:999px;
  border:1px solid var(--line); background:var(--card); color:var(--muted); cursor:pointer; }
.league-pill:hover{ border-color:var(--brand); color:var(--brand); }
.league-pill.active{ background:var(--ink); border-color:var(--ink); color:#fff; }

/* match cards — flat, tabular numerals */
.STING-web-Match{ background:var(--card) !important; border:1px solid var(--line) !important;
  border-radius:var(--radius) !important; box-shadow:var(--shadow); }
.STING-web-Match:hover{ border-color:#b6c0cf !important; }
.STING-web-Match.LIVE{ border-color:var(--live) !important;
  box-shadow:inset -4px 0 0 var(--live), var(--shadow); }
.STING-web-Match.END .STING-web-Team-Logo img{ filter:grayscale(.55); opacity:.7; }
.STING-web-Team-NAME{ font-weight:800 !important; font-size:14px !important;
  color:var(--ink) !important; }
#STING-web-Match-Time{ font-weight:800; color:var(--brand); font-variant-numeric:tabular-nums; }
#STING-web-Result{ font-weight:800; font-size:22px; letter-spacing:2px; color:var(--ink);
  font-variant-numeric:tabular-nums; }
.STING-web-Match-Timing .STING-web-Data{ background:var(--paper); color:var(--muted);
  border:1px solid var(--line); font-size:11px; font-weight:700; border-radius:999px;
  padding:5px 12px; }
.STING-web-Match-Timing .SOON{ background:var(--pitch-soft); color:var(--pitch);
  border:1px solid #bfe3cf; }
.STING-web-Match-Timing .END{ background:var(--paper); color:var(--muted);
  border:1px solid var(--line); }
.STING-web-Overlay{ background:rgba(20,5,12,.62); border-radius:var(--radius); }
.STING-web-SVG-Play{ width:62px; height:62px; background-color:var(--brand);
  border-radius:50%; box-shadow:0 4px 14px rgba(0,0,0,.35); }

/* league group heads — encode real grouping */
.lg-head{ display:flex; align-items:center; gap:8px; margin:16px 2px 8px;
  font-size:13px; font-weight:800; color:var(--muted); }
.lg-head::after{ content:""; flex:1; height:1px; background:var(--line); }
.lg-head .lg-dot{ width:8px; height:8px; border-radius:2px; background:var(--brand); flex:none; }
.lg-count{ background:var(--card); border:1px solid var(--line); color:var(--muted);
  border-radius:999px; font-size:11px; padding:1px 10px; font-variant-numeric:tabular-nums; }

/* signature: dark scoreboard rail for live matches */
.live-rail{ background:var(--rail); border-radius:16px; padding:14px; margin:0 0 14px;
  color:#fff; }
.live-rail-head{ display:flex; align-items:center; justify-content:space-between;
  margin-bottom:10px; }
.live-badge{ display:inline-flex; align-items:center; gap:8px; font-weight:800; font-size:14px; }
.live-count{ background:rgba(255,255,255,.14); border-radius:999px; font-size:12px;
  padding:2px 11px; font-variant-numeric:tabular-nums; }
.live-rail-row{ display:flex; gap:10px; overflow-x:auto; padding-bottom:4px;
  scroll-snap-type:x mandatory; }
.live-card{ scroll-snap-align:start; min-width:245px; background:var(--rail-card);
  border:1px solid var(--rail-line); border-radius:12px; padding:10px 12px;
  color:#fff; text-decoration:none; }
.live-card:hover{ border-color:var(--live); }
.lc-teams{ display:flex; align-items:center; justify-content:space-between; gap:8px;
  font-size:13px; font-weight:700; }
.lc-team{ display:inline-flex; align-items:center; gap:6px; }
.live-card img{ width:30px; height:30px; object-fit:contain; }
.lc-score{ font-size:19px; font-weight:800; font-variant-numeric:tabular-nums;
  letter-spacing:1px; white-space:nowrap; }
.lc-meta{ display:flex; align-items:center; justify-content:space-between; gap:8px;
  margin-top:8px; font-size:11px; color:#eec3d2; }
.lc-minute{ background:var(--live); color:#fff; border-radius:6px; padding:1px 9px;
  font-weight:800; font-variant-numeric:tabular-nums; }

/* skeleton + pulse (kept functional) */
.skeleton{ border-radius:var(--radius); }
.live-dot{ width:9px; height:9px; border-radius:50%; background:var(--live);
  display:inline-block; animation:pulse-ring 1.6s ease-out infinite; }
@keyframes pulse-ring{ 0%{ box-shadow:0 0 0 0 rgba(217,45,32,.55); }
  70%{ box-shadow:0 0 0 9px rgba(217,45,32,0); } 100%{ box-shadow:0 0 0 0 rgba(217,45,32,0); } }

/* info box + toast */
.zero-box{ background:var(--card); border:1px solid var(--line); border-radius:var(--radius);
  padding:14px 16px; margin-top:16px; box-shadow:var(--shadow); }
.zero-box h3{ margin:0 0 8px; font-size:14px; color:var(--ink); }
.zero-box ul{ margin:0; padding-inline-start:20px; font-size:13px; color:var(--muted); }
.zero-box p{ font-size:12px; color:var(--muted); margin:8px 0 0; }
#toast{ position:fixed; bottom:26px; inset-inline:0; margin-inline:auto; width:max-content;
  max-width:88vw; background:var(--ink); color:#fff; font-size:13px; font-weight:700;
  padding:10px 20px; border-radius:999px; opacity:0; pointer-events:none;
  transition:opacity .25s; z-index:999; }
#toast.show{ opacity:1; }
.STING-web-Footer{ background:var(--card) !important; color:var(--muted) !important;
  border:1px solid var(--line); border-radius:var(--radius); box-shadow:var(--shadow); }
.STING-web-Footer a{ color:var(--brand) !important; font-weight:700; }
@media (max-width:640px){
  .STING-web-Header{ flex-wrap:wrap; }
  .live-card{ min-width:220px; }
}
"""

# ============ index.html edits ============
idx = rep1(idx, '<html lang="en" dir="ltr">', '<html lang="ar" dir="rtl">', 'html tag')
idx = rep1(idx, '<title>Koora Live — Clean & Ad-Free</title>',
           '<title>كورة لايف — مشاهدة نظيفة بدون إعلانات</title>', 'title')
idx = rep1(idx, 'content="Clean football streaming — zero ads, zero telegram popups. Same structure as kooralive-plus.info"',
           'content="كورة لايف — بدون إعلانات وبدون نوافذ تيليجرام المنبثقة. جدول مباريات نظيف ومشغل محمي."', 'meta desc')

if 'KOORA CLEAN 2026' not in idx:
    idx = splice(idx, r'/\* =+ MODERN UI/UX 2026 =+ \*/', '</style>', NEW_CSS + '</style>', 'modern css block')

idx = rep1(idx, '<span class="STING-WEB-SiteName"></span><span class="STING-WEB-SiteUrl"></span>',
           '<span class="STING-WEB-SiteName">كورة لايف</span><span class="STING-WEB-SiteUrl">بث نظيف بدون إعلانات</span>', 'logo text')

idx = rep1(idx, '<li><a href="./" style="color:#750044; font-weight:800;">Home</a></li>',
           '<li><a href="./" style="color:#750044; font-weight:800;">الرئيسية</a></li>', 'nav home')
idx = rep1(idx, '<li><a href="#matches">Today\'s Matches</a></li>',
           '<li><a href="#matches">مباريات اليوم</a></li>', 'nav matches')
idx = rep1(idx, '<li><a href="./player.html?demo=1">Demo Player</a></li>',
           '<li><a href="./player.html?demo=1">مشغل تجريبي</a></li>', 'nav demo')
idx = rep1(idx, '<span class="clean-badge"><span class="dot"></span> Ad Block Active</span>',
           '<span class="clean-badge"><span class="dot"></span> حاجب الإعلانات نشط</span>', 'badge')

# drop the redundant centered LIVE pill (the rail is the live signal now)
idx = resub1(idx, r'<div class="STING-web-Max-Size" style="text-align:center; margin-top:10px;">\s*<span class="clean-badge"[^>]*>LIVE</span>\s*</div>\s*', '', 'live pill')
idx = rep1(idx, '<span class="STING-web-Time">Your local time</span>',
           '<span class="STING-web-Time">جميع المباريات بتوقيتك المحلي</span>', 'local time')

idx = rep1(idx, '<li class="Yesterday-Matches"><a href="#" onclick="toast(\'Coming soon\'); return false;"><strong>Yesterday</strong></a></li>',
           '<li class="Yesterday-Matches"><a href="#" data-day="yesterday"><strong>أمس</strong></a></li>', 'tab yesterday')
idx = rep1(idx, '<li class="Today-Matches"><a href="#"><strong>Today</strong></a></li>',
           '<li class="Today-Matches"><a href="#" data-day="today" class="on"><strong>اليوم</strong></a></li>', 'tab today')
idx = rep1(idx, '<li class="Tomorrow-Matches"><a href="#" onclick="toast(\'Coming soon\'); return false;"><strong>Tomorrow</strong></a></li>',
           '<li class="Tomorrow-Matches"><a href="#" data-day="tomorrow"><strong>الغد</strong></a></li>', 'tab tomorrow')

idx = rep1(idx, '<h2 class="STING-web-Title-Box"><strong>Today\'s Matches — Live & Clean</strong></h2>',
           '<h2 class="STING-web-Title-Box"><strong>مباريات اليوم — مباشر</strong></h2>', 'section h2')
idx = rep1(idx, '>Loading matches...</div>', '>جارٍ تحميل المباريات...</div>', 'loading')

# proxy details: translate visible strings only (keep workerUrl/saveWorker/clearWorker IDs wired to JS)
idx = rep1(idx, '⚙️ Advanced: Proxy Mode (auto — no setup needed, click to expand)',
           '⚙️ وضع متقدم: التصفح عبر البروكسي (تلقائي — اضغط للتوسيع)', 'proxy summary')
idx = rep1(idx, 'Site already blocks popups. Proxy is 100% automatic via <code>/api/matches</code> — no input needed.',
           'الموقع يحجب النوافذ تلقائياً. البروكسي يعمل 100% عبر <code>/api/matches</code> — لا حاجة لأي إدخال.', 'proxy span')
idx = rep1(idx, 'placeholder="Custom worker URL (optional)"',
           'placeholder="رابط worker مخصص (اختياري)"', 'proxy input')
idx = rep1(idx, 'Leave empty — site works out of the box. Proxy just extra-cleans HTML on server.',
           'اتركه فارغاً — الموقع يعمل مباشرة. البروكسي ينظّف HTML إضافياً على الخادم.', 'proxy small')

# explainer box → Arabic (no nested <div> inside)
idx = resub1(idx, r'<div class="STING-web-Max-Size" style="background:#fff; border-radius:8px; padding:14px; margin-top:16px; border:1px solid #ffd0e0;">.*?\n</div>',
             '''<div class="STING-web-Max-Size zero-box"><h3>🛡️ صفر إعلانات — كيف نحجب نافذة تيليجرام؟</h3><ul><li><strong>درع النقرة:</strong> النقرة الأولى تُمتص — فلا يفتح <code>t.me</code> أبداً.</li><li><strong>حجب النوافذ:</strong> أي محاولة <code>window.open</code> من المصدر تُقتل فوراً.</li><li><strong>اعتراض الروابط:</strong> أي رابط <code>t.me</code> يُلغى قبل فتحه.</li><li><strong>عزل كامل:</strong> المشغل في إطار معزول بدون صلاحية النوافذ.</li><li><strong>بروكسي worker.js:</strong> يزيل اللافتات والنوافذ قبل وصولها إليك.</li></ul><p>عدّاد المحظورات يظهر أعلى المشغل. استمتع بالمباراة — نظيف 100%.</p></div>''',
             'explainer', flags=re.DOTALL)
assert 'Zero Ads — How it blocks' not in idx, 'explainer still EN'

# footer → Arabic
idx = resub1(idx, r'<footer style=.*?</footer>',
             '<footer class="STING-web-Max-Size STING-web-Footer" style="text-align:center; padding:14px; margin:14px auto; font-size:12px;">كورة لايف النظيفة — مشاهدة بدون إعلانات • <a href="./player.html?demo=1">مشغل تجريبي</a></footer>',
             'footer', flags=re.DOTALL)
assert '100% Free' not in idx and 'Clean clone of kooralive' not in idx, 'footer still EN'

# ---- JS strings ----
idx = rep1(idx, "titleBox.textContent = day==='today' ? \"Today's Matches — Live\" : day==='yesterday' ? \"Yesterday's Results\" : \"Tomorrow's Matches\";",
           "titleBox.textContent = day==='today' ? 'مباريات اليوم — مباشر' : day==='yesterday' ? 'نتائج الأمس' : 'مباريات الغد';", 'titleBox')
idx = resub1(idx, r"listEl\.innerHTML = '<div style=\"padding:20px; color:#c00;\">.*?</div>'",
             '''listEl.innerHTML = '<div class="STING-web-Matching-None">تعذّر تحميل المباريات. <button onclick="loadMatches()" style="text-decoration:underline;cursor:pointer;background:none;border:none;color:inherit;font:inherit;">إعادة المحاولة</button></div>' ''',
             'error box', flags=re.DOTALL)
assert 'Failed to load live matches' not in idx, 'error box still EN'

# toggle listener rewrite (uses data-day now)
# Guarded: runs once (manual stray-closer cleanup changed verbatim text).
if 'day-tab clicks' not in idx:
    idx = splice(idx, r'// Handle toggle clicks', '\n});\n',
             """// Handle day-tab clicks
document.addEventListener('DOMContentLoaded', ()=>{
  document.querySelectorAll('.STING-web-Matches-Toggle a').forEach(a=>{
    a.addEventListener('click', (e)=>{
      e.preventDefault();
      loadMatches(a.dataset.day || 'today');
    });
  });
});\n});\n""", 'toggle listener')

# renderMatches rewrite (grouped + live rail + Arabic)
# NOTE: splice() preserves the end marker while the replacement also ends
# with it — guarded so it NEVER runs twice (would duplicate helpers).
if 'live-rail' not in idx:
    idx = splice(idx, r'function renderMatches\(matches\)\{', '\nloadMatches();',
             '''function statusOf(m){ return m.status==='LIVE' ? 'LIVE' : (m.status==='FT' ? 'END' : (m.status==='SOON' ? 'SOON' : (m.status||''))); }
function playerUrlFor(m){
  return `player.html?id=${encodeURIComponent(m.id)}&href=${encodeURIComponent(m.href)}&home=${encodeURIComponent(m.home)}&away=${encodeURIComponent(m.away)}`;
}
function cardHtml(m){
  const statusClass = statusOf(m);
  const isLive = statusClass==='LIVE';
  const timeDisplay = isLive ? (m.game_time||m.time_text||'مباشر') : (m.time_text||'');
  const result = m.result_text || (m.score_home!==""&&m.score_home!=null ? `${m.score_away}-${m.score_home}` : "");
  return `
  <div class="STING-web-Match ${statusClass}" data-id="${m.id}" data-league="${m.league||''}">
    <a href="${playerUrlFor(m)}" title="${m.home} × ${m.away}">
      <div class="STING-web-Right-Team">
        <div class="STING-web-Team-Logo"><img alt="${m.home}" src="${m.home_logo}" loading="lazy" onerror="this.style.opacity=0"></div>
        <div class="STING-web-Team-NAME">${m.home}</div>
      </div>
      <div class="STING-web-Match-Center">
        <div class="STING-web-Match-Timing">
          <div id="STING-web-Match-Time" class="${isLive?'LIVE':''}">${timeDisplay}</div>
          <div id="STING-web-Result">${result}</div>
          <div class="STING-web-Data ${statusClass}">${m.league_text||''}</div>
        </div>
      </div>
      <div class="STING-web-Left-Team">
        <div class="STING-web-Team-Logo"><img alt="${m.away}" src="${m.away_logo}" loading="lazy" onerror="this.style.opacity=0"></div>
        <div class="STING-web-Team-NAME">${m.away}</div>
      </div>
      <div class="STING-web-Overlay"><div class="STING-web-SVG-Play"></div></div>
    </a>
  </div>`;
}
function renderMatches(matches){
  const c = document.getElementById('matchesList');
  if(!matches.length){ c.innerHTML='<div class="STING-web-Matching-None">لا توجد مباريات حالياً</div>'; return; }
  const rank={LIVE:0,SOON:1,'':2,END:3};
  const sorted=[...matches].sort((a,b)=>(rank[statusOf(a)]??2)-(rank[statusOf(b)]??2));
  const live=sorted.filter(m=>statusOf(m)==='LIVE');
  let html='';
  if(live.length){
    html += `<div class="live-rail"><div class="live-rail-head"><span class="live-badge"><span class="live-dot"></span>جارية الآن</span><span class="live-count">${live.length}</span></div><div class="live-rail-row">` +
      live.map(m=>{
        const score = m.result_text || ((m.score_home!==""&&m.score_home!=null) ? `${m.score_away}-${m.score_home}` : 'مباشر');
        return `<a class="live-card" href="${playerUrlFor(m)}"><div class="lc-teams"><span class="lc-team"><img alt="" src="${m.home_logo}" loading="lazy" onerror="this.style.display='none'"> ${m.home}</span><span class="lc-score">${score}</span><span class="lc-team">${m.away} <img alt="" src="${m.away_logo}" loading="lazy" onerror="this.style.display='none'"></span></div><div class="lc-meta"><span class="lc-minute">${m.game_time||m.time_text||"•"}</span><span>${m.league_text||''}</span></div></a>`;
      }).join('') + `</div></div>`;
  }
  const groups=new Map();
  for(const m of sorted){
    const g=m.league||m.league_text||'بطولات أخرى';
    if(!groups.has(g)) groups.set(g,[]);
    groups.get(g).push(m);
  }
  for(const [g,arr] of groups){
    html += `<div class="lg-head"><span class="lg-dot"></span><span>${g}</span><span class="lg-count">${arr.length}</span></div>` + arr.map(cardHtml).join('');
  }
  c.innerHTML=html;
  document.querySelectorAll('.STING-web-Team-Logo img').forEach(img=>{
    img.addEventListener('load', ()=> img.classList.add('show'));
    if(img.complete) img.classList.add('show');
  });
}
loadMatches();''', 'renderMatches')

# active-tab highlight on every loadMatches (regex, keeps indentation)
if "(a.dataset.day||'today')===day" not in idx:
    idx = resub1(idx, r"^([ \t]*)renderMatches\(data\);",
                 "\\1document.querySelectorAll('.STING-web-Matches-Toggle a').forEach(a=>a.classList.toggle('on', (a.dataset.day||'today')===day));\n\\1renderMatches(data);",
                 'tab highlight', flags=re.MULTILINE)

# search/filter Arabic
idx = rep1(idx, 'placeholder="Search teams or leagues..."', 'placeholder="ابحث عن فريق أو بطولة..."', 'search ph')
idx = rep1(idx, '<span class="league-pill active" data-league="all">All</span>',
           '<span class="league-pill active" data-league="all">الكل</span>', 'pill all')
idx = resub1(idx, r"No matches for this filter.*?try All", "لا نتائج لهذا الفلتر — جرّب «الكل»", 'no results')

# leftover worker + ad-block guard toasts
idx = rep1(idx, "toast('URL must start with https://')", "toast('الرابط يجب أن يبدأ بـ https://')", 'toast url')
idx = rep1(idx, "toast(v ? 'Proxy saved — 100% clean' : 'Direct mode')", "toast(v ? 'تم حفظ البروكسي — نظيف 100%' : 'وضع مباشر')", 'toast proxy')
idx = rep1(idx, "toast('Direct mode — popup blocking active')", "toast('وضع مباشر — حجب النوافذ نشط')", 'toast direct')
idx = rep1(idx, "toast('Blocked popup')", "toast('تم حجب نافذة منبثقة')", 'toast popup')
idx = rep1(idx, "toast('Blocked telegram link')", "toast('تم حجب رابط تيليجرام')", 'toast tg')
idx = rep1(idx, 'box-shadow:inset 4px 0 0 var(--live), var(--shadow);', 'box-shadow:inset -4px 0 0 var(--live), var(--shadow);', 'rtl live edge')
idx = rep1(idx, '>Save</button>', '>حفظ</button>', 'btn save')
idx = rep1(idx, '>Direct</button>', '>مباشر</button>', 'btn direct')

save('index.html', idx)

# ============ player.html edits (light consistency touch) ============
pl = rep1(pl, '<html lang="en" dir="ltr">', '<html lang="ar" dir="rtl">', 'p: html tag')
pl = rep1(pl, '<title>Watch Match — Clean Player</title>',
          '<title>مشاهدة المباراة — مشغل نظيف بدون إعلانات</title>', 'p: title')
pl = rep1(pl, 'background: linear-gradient(135deg,#750044,#ff4d8d) !important;',
          'background:#750044 !important;', 'p: flat logo')
pl = rep1(pl, 'content:"Koora Live"', 'content:"كورة لايف"', 'p: brand ar')
pl = rep1(pl, 'content:"Clean"', 'content:"نظيف"', 'p: brand clean')
pl = rep1(pl, '<span class="STING-WEB-SiteName"></span><span class="STING-WEB-SiteUrl"></span>',
          '<span class="STING-WEB-SiteName"></span><span class="STING-WEB-SiteUrl"></span>', 'p: logo noop')
pl = rep1(pl, '>Home</a></li>', '>الرئيسية</a></li>', 'p: nav home')
pl = rep1(pl, '>Matches</a>', '>المباريات</a>', 'p: nav matches')
pl = resub1(pl, r'>← Back</a>', '>→ عودة</a>', 'p: back')
pl = rep1(pl, '<button class="btn" id="btnFullscreen">⛶ Fullscreen</button>',
          '<button class="btn" id="btnFullscreen">⛶ ملء الشاشة</button>', 'p: fs')
pl = rep1(pl, '<button class="btn ghost" id="btnReload">↻ Reload</button>',
          '<button class="btn ghost" id="btnReload">↻ إعادة تحميل</button>', 'p: reload')
pl = rep1(pl, '<button class="btn danger" id="btnKill">☠️ Hide Telegram Banner</button>',
          '<button class="btn danger" id="btnKill">☠️ إخفاء لافتة تيليجرام</button>', 'p: kill')
pl = rep1(pl, '>Blocked: 0</span>', '>محظور: 0</span>', 'p: count')
pl = rep1(pl, "countEl.textContent='Blocked: '+blocked;", "countEl.textContent='محظور: '+blocked;", 'p: bump')
pl = rep1(pl, "toast('Blocked: '+reason, true);", "toast('محظور: '+reason, true);", 'p: toast blocked')
pl = rep1(pl, '<span>▶ Clean Player — ad block active</span>',
          '<span>▶ مشغل نظيف — الحجب نشط</span>', 'p: player header')
pl = rep1(pl, '>Direct • click-shield ON</span>', '>مباشر • الدرع مفعّل</span>', 'p: mode init')
pl = rep1(pl, '<button id="playBtn">▶ Click to Play — No Ads</button>',
          '<button id="playBtn">▶ اضغط للمشاهدة — بدون إعلانات</button>', 'p: play')
pl = rep1(pl, '>First click absorbed — no popup</div>', '>النقرة الأولى تُمتص — لا نوافذ منبثقة</div>', 'p: shield')
pl = rep1(pl, '<div class="log" id="log">Log:', '<div class="log" id="log">سجل:', 'p: log')
pl = rep1(pl, '[init] Ready', '[init] جاهز', 'p: init')
pl = rep1(pl, 'This player is ad-free. That yellow/black telegram popup is blocked 100%.',
          'هذا المشغل خالٍ من الإعلانات. نافذة تيليجرام الصفراء/السوداء محجوبة 100%.', 'p: note')
pl = rep1(pl, "textContent='Demo'", "textContent='تجريبي'", 'p: demo name')
pl = rep1(pl, "'Real Player • ' + (isLiveMatch ? 'LIVE' : 'Found')",
          "'مشغل حقيقي • ' + (isLiveMatch ? 'مباشر' : 'موجود')", 'p: mode live')
pl = rep1(pl, "'Proxy • clean'", "'بروكسي • نظيف'", 'p: mode proxy')
pl = rep1(pl, '— Koora Live`;', '— كورة لايف`;', 'p: doc title')
pl = rep1(pl, "toast('Banner hidden')", "toast('تم إخفاء اللافتة')", 'p: toast banner')
pl = rep1(pl, "toast('Ready')", "toast('جاهز')", 'p: toast ready')
pl = rep1(pl, "toast('Reloading...')", "toast('جارٍ إعادة التحميل...')", 'p: toast reload')
pl = rep1(pl, "toast('Click Play first', true)", "toast('اضغط تشغيل أولاً', true)", 'p: toast play')
pl = rep1(pl, "toast('Fullscreen not supported'", "toast('ملء الشاشة غير مدعوم'", 'p: toast fs')
pl = resub1(pl, r"warn'\)\.innerHTML='⚠️ Open via <code>http server</code> — <code>python -m http\.server 8000</code>'",
             "warn').innerHTML='⚠️ افتح عبر <code>خادم http محلي</code> — <code>python -m http.server 8000</code>'", 'p: warn')
save('player.html', pl)

print('edits applied OK')
