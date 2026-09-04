import pathlib

# Create a premium, pro UI - not basic
# We will overhaul index.html with a modern 2026 design

base = pathlib.Path(r'C:/Users/Abdelli/Documents/koora-clean')
idx = base.joinpath('index.html').read_text(encoding='utf-8')

# New premium CSS - replace the old UI improvements
premium_css = """
/* ===== PREMIUM 2026 — NOT BASIC ===== */
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Space+Grotesk:wght@500;700&display=swap');
:root{
  --bg:#080a0f; --bg2:#0f1219; --card:#141824; --card2:#1c2133; --border:rgba(255,255,255,0.06);
  --text:#eef2ff; --muted:#8b93a7; --dim:#5a6278;
  --primary:#7c3aed; --primary2:#a78bfa; --live:#ff3b30; --soon:#00d084; --accent:#06b6d4;
}
*{ font-family:'Outfit', system-ui, sans-serif !important; }
body{ background:radial-gradient(1200px 600px at 50% -10%, #1a1033 0%, transparent 60%), linear-gradient(180deg, #080a0f 0%, #0f1219 100%) !important; color:var(--text) !important; min-height:100vh; }
/* Header - glass + gradient border */
.STING-web-Header{
  background:rgba(20,24,36,0.7) !important; backdrop-filter:blur(20px) saturate(180%) !important;
  border:1px solid rgba(255,255,255,0.08) !important; border-radius:20px !important;
  box-shadow:0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06) !important;
  padding:16px 20px !important; margin-top:16px !important;
}
.STING-web-Header-Logo{
  background:linear-gradient(135deg, #7c3aed 0%, #ec4899 50%, #06b6d4 100%) !important;
  border-radius:14px !important; box-shadow:0 8px 20px rgba(124,58,237,0.3) !important;
  padding:10px 18px !important; height:auto !important;
}
.STING-WEB-SiteName::after{ content:"KOORA • PRO"; font-family:'Space Grotesk', sans-serif !important; font-weight:800 !important; letter-spacing:0.08em !important; font-size:13px !important; }
.STING-WEB-SiteUrl::after{ content:"LIVE • ZERO ADS • 2026"; font-size:9px !important; opacity:0.7 !important; letter-spacing:0.12em !important; }
/* Hero live */
.hero-live{
  max-width:1000px; width:93%; margin:20px auto 0; background:linear-gradient(135deg, #7c3aed 0%, #ec4899 100%);
  border-radius:20px; padding:1px; box-shadow:0 20px 40px rgba(124,58,237,0.2);
}
.hero-live-inner{ background:linear-gradient(135deg, #141824 0%, #1c2133 100%); border-radius:19px; padding:18px 20px; display:flex; align-items:center; justify-content:space-between; gap:16px; }
.hero-live-badge{ background:var(--live); color:#fff; font-size:10px; font-weight:800; letter-spacing:0.08em; padding:4px 8px; border-radius:999px; display:inline-flex; align-items:center; gap:6px; }
.hero-live-badge::before{ content:""; width:6px; height:6px; background:#fff; border-radius:50%; animation:ping 1.5s infinite; }
@keyframes ping{ 0%{box-shadow:0 0 0 0 rgba(255,255,255,0.7)}70%{box-shadow:0 0 0 8px rgba(255,255,255,0)}100%{box-shadow:0 0 0 0 rgba(255,255,255,0)} }
/* Container */
.STING-web-Container-Matches{ background:transparent !important; }
.STING-web-Container-Matches-Top{
  background:rgba(20,24,36,0.6) !important; backdrop-filter:blur(12px); border:1px solid var(--border) !important;
  border-radius:16px !important; padding:14px !important; box-shadow:0 4px 20px rgba(0,0,0,0.2);
}
.STING-web-Title-Box{ background:linear-gradient(135deg, #7c3aed, #a78bfa) !important; font-weight:800 !important; font-family:'Space Grotesk', sans-serif !important; letter-spacing:-0.02em; box-shadow:0 4px 16px rgba(124,58,237,0.3) !important; border:1px solid rgba(255,255,255,0.1); }
.STING-web-Time{ background:rgba(255,255,255,0.08) !important; color:var(--muted) !important; border:1px solid var(--border); backdrop-filter:blur(8px); }
/* Search + filters - pill nav */
.search-box{ max-width:1000px; width:93%; margin:16px auto 0; position:relative; }
.search-box input{
  width:100%; padding:14px 16px 14px 44px; border-radius:14px; border:1px solid var(--border);
  background:rgba(20,24,36,0.6) !important; backdrop-filter:blur(12px); color:var(--text) !important;
  font-size:14px; font-weight:500; transition:all 0.2s; box-shadow:0 4px 12px rgba(0,0,0,0.1);
}
.search-box input::placeholder{ color:var(--dim); }
.search-box input:focus{ outline:none; border-color:var(--primary); box-shadow:0 0 0 3px rgba(124,58,237,0.15), 0 4px 12px rgba(0,0,0,0.1); }
.search-box::before{ content:"⌕"; position:absolute; left:16px; top:50%; transform:translateY(-50%); color:var(--muted); font-size:16px; }
.league-filter{
  max-width:1000px; width:93%; margin:12px auto; display:flex; gap:8px; flex-wrap:wrap; padding:0;
  background:transparent !important; border:none !important;
}
.league-pill{
  padding:8px 14px !important; border-radius:999px !important; font-size:12px !important; font-weight:700 !important;
  background:rgba(20,24,36,0.6) !important; color:var(--muted) !important; border:1px solid var(--border) !important;
  backdrop-filter:blur(8px); transition:all 0.2s !important; letter-spacing:0.02em;
}
.league-pill:hover{ background:rgba(255,255,255,0.08) !important; color:var(--text) !important; transform:translateY(-1px); }
.league-pill.active{ background:var(--primary) !important; color:#fff !important; border-color:var(--primary) !important; box-shadow:0 4px 16px rgba(124,58,237,0.3) !important; }
/* Match cards - premium */
.STING-web-Match{
  background:linear-gradient(180deg, var(--card) 0%, var(--card2) 100%) !important;
  border:1px solid var(--border) !important; border-radius:20px !important;
  box-shadow:0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04) !important;
  transition:all 0.35s cubic-bezier(0.4,0,0.2,1) !important; margin-bottom:14px !important;
  position:relative; overflow:hidden;
}
.STING-web-Match::before{
  content:""; position:absolute; inset:0; border-radius:20px; padding:1px;
  background:linear-gradient(135deg, rgba(255,255,255,0.08), transparent 50%);
  -webkit-mask:linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite:xor; mask-composite:exclude; pointer-events:none; opacity:0; transition:opacity 0.3s;
}
.STING-web-Match:hover{ transform:translateY(-4px) scale(1.01); box-shadow:0 20px 40px rgba(0,0,0,0.3), 0 0 0 1px rgba(124,58,237,0.2) !important; border-color:rgba(124,58,237,0.3) !important; }
.STING-web-Match:hover::before{ opacity:1; }
.STING-web-Match.LIVE{ border-color:rgba(255,59,48,0.25) !important; box-shadow:0 4px 20px rgba(255,59,48,0.12) !important; }
.STING-web-Match.LIVE::after{
  content:"LIVE"; position:absolute; top:10px; right:10px; background:var(--live); color:#fff;
  font-size:9px; font-weight:800; letter-spacing:0.08em; padding:3px 7px; border-radius:999px;
  box-shadow:0 2px 8px rgba(255,59,48,0.3); z-index:2;
}
.STING-web-Team-NAME{ font-weight:800 !important; font-size:13px !important; color:var(--text) !important; letter-spacing:-0.01em; }
.STING-web-Match-Info{
  background:rgba(255,255,255,0.06) !important; color:var(--muted) !important;
  font-size:10px !important; font-weight:700 !important; letter-spacing:0.06em !important;
  border:1px solid var(--border); backdrop-filter:blur(8px);
}
#STING-web-Match-Time{ font-weight:800 !important; color:var(--primary2) !important; font-family:'Space Grotesk', sans-serif !important; }
#STING-web-Result{ font-weight:900 !important; font-size:22px !important; background:linear-gradient(135deg, #fff, #a78bfa); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
.STING-web-Team-Logo img{ filter:drop-shadow(0 4px 8px rgba(0,0,0,0.2)); transition:all 0.3s; }
.STING-web-Match:hover .STING-web-Team-Logo img{ transform:scale(1.08) rotate(1deg); }
.STING-web-Overlay{ background:radial-gradient(circle at center, rgba(124,58,237,0.9) 0%, rgba(0,0,0,0.7) 100%) !important; backdrop-filter:blur(4px); }
.STING-web-SVG-Play{
  width:64px !important; height:64px !important; background:#fff !important; border-radius:50% !important;
  box-shadow:0 12px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1) !important;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%237c3aed'%3E%3Cpath d='M8 5.14v14l11-7z'/%3E%3C/svg%3E") !important; background-size:28px !important;
  transition:transform 0.2s;
}
.STING-web-Match:hover .STING-web-SVG-Play{ transform:scale(1.1); }
/* Footer */
footer{ background:rgba(20,24,36,0.6) !important; backdrop-filter:blur(12px); border:1px solid var(--border) !important; border-radius:16px !important; }
"""

# Inject premium CSS
if '</head>' in idx:
    idx = idx.replace('</head>', f'<style>{premium_css}</style></head>')

# Add hero live section + better empty states via JS
new_js = """
<script>
// Premium: hero for top LIVE match + better UX
document.addEventListener('DOMContentLoaded', ()=>{
  // Add hero for first LIVE match
  setTimeout(()=>{
    const liveMatches = [...document.querySelectorAll('.STING-web-Match.LIVE')];
    if(liveMatches.length && !document.querySelector('.hero-live')){
      const top = liveMatches[0];
      const home = top.querySelector('.STING-web-Right-Team .STING-web-Team-NAME')?.textContent || '';
      const away = top.querySelector('.STING-web-Left-Team .STING-web-Team-NAME')?.textContent || '';
      const hero = document.createElement('div');
      hero.className='hero-live';
      hero.innerHTML=`<div class="hero-live-inner"><div><div class="hero-live-badge">LIVE NOW</div><div style="margin-top:6px; font-weight:800; font-size:15px; color:#fff;">${home} vs ${away} — Watch Now</div><div style="font-size:12px; color:#a78bfa; margin-top:2px;">Tap any LIVE card to watch — zero ads</div></div><div style="background:rgba(255,255,255,0.1); padding:8px 12px; border-radius:10px; font-size:11px; font-weight:700; color:#fff;">● ${liveMatches.length} LIVE</div></div>`;
      const container = document.querySelector('.STING-web-Container-Matches');
      if(container) container.parentNode.insertBefore(hero, container);
    }
  }, 900);
});
</script>
"""

if '</body>' in idx:
    idx = idx.replace('</body>', new_js + '</body>')

pathlib.Path(r'C:/Users/Abdelli/Documents/koora-clean/index.html').write_text(idx, encoding='utf-8')
print("Premium UI injected")

# Also update player with premium dark
import pathlib
player = pathlib.Path(r'C:/Users/Abdelli/Documents/koora-clean/player.html').read_text(encoding='utf-8')
player_premium = """
<style>
body{ background:radial-gradient(1000px 500px at 50% -10%, #1a1033 0%, transparent 60%), #080a0f !important; color:#eef2ff !important; }
.STING-web-Post{ background:rgba(20,24,36,0.7) !important; backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,0.06) !important; border-radius:20px !important; box-shadow:0 20px 40px rgba(0,0,0,0.3) !important; }
.player-card{ background:#0a0e1a !important; border:1px solid rgba(255,255,255,0.06) !important; border-radius:16px !important; box-shadow:0 12px 32px rgba(0,0,0,0.4) !important; }
.player-header{ background:linear-gradient(135deg, #1c2133 0%, #141824 100%) !important; border-bottom:1px solid rgba(255,255,255,0.06) !important; }
.controls{ background:rgba(20,24,36,0.6) !important; backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.06) !important; border-radius:14px !important; }
.btn{ border-radius:10px !important; font-weight:700 !important; transition:all 0.2s !important; }
.btn:hover{ transform:translateY(-1px); }
</style>
"""
if '</head>' in player:
    player = player.replace('</head>', player_premium + '</head>')
    pathlib.Path(r'C:/Users/Abdelli/Documents/koora-clean/player.html').write_text(player, encoding='utf-8')
    print("Premium player injected")
