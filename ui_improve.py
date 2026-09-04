import pathlib

base = pathlib.Path(r'C:/Users/Abdelli/Documents/koora-clean')
idx = base.joinpath('index.html').read_text(encoding='utf-8')

# Add modern UI improvements as an extra style block and JS enhancements
# We will inject a new <style> and <script> before </head> and before </body>

new_ui_css = """
/* ===== MODERN UI/UX 2026 ===== */
:root{ --bg:#f4f5f7; --card:#ffffff; --text:#0f172a; --muted:#64748b; --border:#e2e8f0; --primary:#750044; --primary-hover:#8a0052; --live:#dc2626; --soon:#0f6f37; }
*{ -webkit-font-smoothing:antialiased; }
body{ background:var(--bg) !important; color:var(--text); font-family: 'Inter', system-ui, -apple-system, Segoe UI, sans-serif !important; }
.STING-web-Header{ background:rgba(255,255,255,0.85) !important; backdrop-filter:blur(12px); border:1px solid var(--border); box-shadow:0 4px 20px rgba(0,0,0,0.04); border-radius:16px !important; padding:14px 18px !important; }
.STING-web-Header-Logo{ background:linear-gradient(135deg,#750044 0%, #a0005c 100%) !important; border-radius:12px !important; box-shadow:0 4px 12px rgba(117,0,68,0.25); }
.STING-web-Container-Matches-Top{ background:var(--card) !important; border:1px solid var(--border) !important; border-radius:16px !important; box-shadow:0 2px 10px rgba(0,0,0,0.03); }
.STING-web-Title-Box{ background:var(--primary) !important; font-weight:700 !important; letter-spacing:-0.02em; box-shadow:0 2px 8px rgba(117,0,68,0.2); }
.STING-web-Matches-Toggle > li > a{ border-radius:10px !important; font-weight:600 !important; transition:all 0.2s; }
.STING-web-Matches-Toggle > li > a:hover{ transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,0,0,0.1); }
.STING-web-Match{ background:var(--card) !important; border:1px solid var(--border) !important; border-radius:16px !important; box-shadow:0 2px 8px rgba(0,0,0,0.04) !important; transition:all 0.25s cubic-bezier(0.4,0,0.2,1) !important; margin-bottom:12px !important; overflow:hidden; }
.STING-web-Match:hover{ transform:translateY(-3px); box-shadow:0 12px 24px rgba(0,0,0,0.08) !important; border-color:#cbd5e1 !important; }
.STING-web-Match.LIVE{ border-color:rgba(220,38,38,0.2) !important; box-shadow:0 2px 12px rgba(220,38,38,0.08) !important; }
.STING-web-Match.LIVE:hover{ box-shadow:0 12px 24px rgba(220,38,38,0.12) !important; }
.STING-web-Team-NAME{ font-weight:700 !important; font-size:14px !important; color:var(--text) !important; }
.STING-web-Match-Info{ background:#f1f5f9 !important; color:var(--muted) !important; font-size:11px !important; font-weight:600 !important; letter-spacing:0.05em; text-transform:uppercase; border-radius:8px !important; padding:4px 8px !important; }
.STING-web-Match-Timing .LIVE::before{ background:var(--live) !important; font-weight:800 !important; letter-spacing:0.02em; box-shadow:0 2px 8px rgba(220,38,38,0.3); }
#STING-web-Match-Time{ font-weight:700 !important; color:var(--primary) !important; }
#STING-web-Result{ font-weight:800 !important; font-size:20px !important; color:var(--text) !important; letter-spacing:2px !important; }
.STING-web-Team-Logo img{ filter: drop-shadow(0 2px 4px rgba(0,0,0,0.06)); transition:transform 0.2s; }
.STING-web-Match:hover .STING-web-Team-Logo img{ transform:scale(1.05); }
.STING-web-Overlay{ background:linear-gradient(135deg, rgba(117,0,68,0.85) 0%, rgba(0,0,0,0.6) 100%) !important; backdrop-filter:blur(2px); }
.STING-web-SVG-Play{ width:56px !important; height:56px !important; background:rgba(255,255,255,0.95) !important; border-radius:50% !important; box-shadow:0 8px 24px rgba(0,0,0,0.2); background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23750044'%3E%3Cpath d='M8 5.14v14l11-7z'/%3E%3C/svg%3E") !important; background-size:24px !important; }
/* League filter pills */
.league-filter{ display:flex; gap:8px; flex-wrap:wrap; padding:12px; background:var(--card); border:1px solid var(--border); border-radius:12px; margin:12px auto; max-width:1000px; width:93%; }
.league-pill{ padding:6px 12px; border-radius:999px; font-size:12px; font-weight:600; background:#f1f5f9; color:var(--muted); cursor:pointer; border:1px solid var(--border); transition:all 0.2s; }
.league-pill.active{ background:var(--primary); color:#fff; border-color:var(--primary); box-shadow:0 2px 8px rgba(117,0,68,0.2); }
.league-pill:hover{ transform:translateY(-1px); }
/* Search */
.search-box{ max-width:1000px; width:93%; margin:12px auto; position:relative; }
.search-box input{ width:100%; padding:12px 16px 12px 40px; border-radius:12px; border:1px solid var(--border); background:var(--card); font-size:14px; transition:all 0.2s; }
.search-box input:focus{ outline:none; border-color:var(--primary); box-shadow:0 0 0 3px rgba(117,0,68,0.1); }
.search-box::before{ content:"🔍"; position:absolute; left:14px; top:50%; transform:translateY(-50%); opacity:0.4; }
/* Loading skeleton */
.skeleton{ background:linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size:200% 100%; animation:shimmer 1.5s infinite; border-radius:12px; height:90px; margin-bottom:8px; }
@keyframes shimmer{ 0%{background-position:-200% 0} 100%{background-position:200% 0} }
/* Live pulse dot */
.live-dot{ display:inline-block; width:8px; height:8px; background:var(--live); border-radius:50%; margin-right:6px; animation:pulse 1.5s infinite; }
@keyframes pulse{ 0%{box-shadow:0 0 0 0 rgba(220,38,38,0.4)}70%{box-shadow:0 0 0 6px rgba(220,38,38,0)}100%{box-shadow:0 0 0 0 rgba(220,38,38,0)} }
/* Footer */
footer{ background:var(--card) !important; border:1px solid var(--border) !important; border-radius:16px !important; box-shadow:0 2px 10px rgba(0,0,0,0.03); }
"""

new_ui_js = """
<script>
// League filter + search
document.addEventListener('DOMContentLoaded', ()=>{
  // Add search box
  const container = document.querySelector('.STING-web-Container-Matches');
  if(container && !document.querySelector('.search-box')){
    const searchHtml = `<div class="search-box"><input type="text" id="searchInput" placeholder="Search teams or leagues..."></div>`;
    const leagueHtml = `<div class="league-filter" id="leagueFilter"><span class="league-pill active" data-league="all">All</span></div>`;
    container.insertAdjacentHTML('beforebegin', searchHtml + leagueHtml);
    
    // Populate league pills
    setTimeout(()=>{
      const leagues = [...new Set((window.__MATCHES__||[]).map(m=>m.league).filter(Boolean))];
      const filterEl = document.getElementById('leagueFilter');
      leagues.forEach(l=>{
        const pill = document.createElement('span');
        pill.className='league-pill'; pill.dataset.league=l; pill.textContent=l;
        filterEl.appendChild(pill);
      });
      // Filter logic
      function applyFilter(){
        const search = document.getElementById('searchInput').value.toLowerCase();
        const activeLeague = document.querySelector('.league-pill.active')?.dataset.league || 'all';
        document.querySelectorAll('.STING-web-Match').forEach(card=>{
          const home = card.querySelector('.STING-web-Right-Team .STING-web-Team-NAME')?.textContent.toLowerCase()||'';
          const away = card.querySelector('.STING-web-Left-Team .STING-web-Team-NAME')?.textContent.toLowerCase()||'';
          const league = card.querySelector('.STING-web-Match-Info')?.textContent.toLowerCase()||'';
          const matchLeague = card.dataset.league || league;
          const matchesSearch = !search || home.includes(search) || away.includes(search) || league.includes(search);
          const matchesLeague = activeLeague==='all' || league.includes(activeLeague.toLowerCase());
          card.style.display = (matchesSearch && matchesLeague) ? '' : 'none';
        });
      }
      document.getElementById('searchInput').addEventListener('input', applyFilter);
      filterEl.addEventListener('click', e=>{
        if(e.target.classList.contains('league-pill')){
          document.querySelectorAll('.league-pill').forEach(p=>p.classList.remove('active'));
          e.target.classList.add('active');
          applyFilter();
        }
      });
    }, 800);
  }
  // Add live dot to LIVE matches
  const observer = new MutationObserver(()=>{
    document.querySelectorAll('.STING-web-Match.LIVE #STING-web-Match-Time').forEach(el=>{
      if(!el.querySelector('.live-dot')){
        el.innerHTML = '<span class="live-dot"></span>' + el.innerHTML;
      }
    });
  });
  observer.observe(document.body, {childList:true, subtree:true});
});
</script>
"""

# Inject before </head> for CSS and before </body> for JS
if '</head>' in idx:
    idx = idx.replace('</head>', f'<style>{new_ui_css}</style></head>')
if '</body>' in idx:
    idx = idx.replace('</body>', new_ui_js + '</body>')

# Also update player page similarly - add theater mode and better controls
player_path = base / 'player.html'
player = player_path.read_text(encoding='utf-8')
player_css = """
<style>
/* Player UX improvements */
.player-card{ box-shadow:0 12px 32px rgba(0,0,0,0.12) !important; border-radius:16px !important; }
.controls{ background:#ffffff !important; border:1px solid #e2e8f0 !important; border-radius:12px !important; box-shadow:0 2px 8px rgba(0,0,0,0.04); }
.btn{ border-radius:10px !important; font-weight:700 !important; transition:all 0.2s !important; }
.btn:hover{ transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,0,0,0.1); }
.btn:active{ transform:translateY(0); }
.ratio{ border-radius:0 0 16px 16px; }
.player-header{ border-radius:16px 16px 0 0; }
</style>
"""
if '</head>' in player:
    player = player.replace('</head>', player_css + '</head>')

idx_path = base / 'index.html'
idx_path.write_text(idx, encoding='utf-8')
player_path.write_text(player, encoding='utf-8')

print("UI/UX improved: added modern cards, search, league filter, live dot, hover, shadows")
