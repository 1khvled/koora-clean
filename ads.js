/* ads.js — Koora banner slots. Banner units ONLY (no popups, no interstitials,
   nothing inside the video player). Default ON; the user toggle persists in
   localStorage under 'koora_ads'. Units are the owner's own codes, rendered
   inside sandboxed srcdoc iframes so provider document.write calls cannot
   touch the page, and ad clicks can only open a new tab (never hijack). */
(function () {
  'use strict';
  var KEY = 'koora_ads';
  var N_SRC = 'https://pl31775792.profitableratecpmnetwork.com/be0e02a320b5124b4e5f04bdd873852a/invoke.js';
  var N_BOX = 'container-be0e02a320b5124b4e5f04bdd873852a';
  var S_KEY = 'b184c0e669a8ff1f59faf710e4f7304d';
  var S_SRC = 'https://www.highrevenueformat.com/' + S_KEY + '/invoke.js';

  function enabled() {
    try { return localStorage.getItem(KEY) !== '0'; }
    catch (e) { return true; }
  }
  function set(on) {
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
  }

  /* Full srcdoc document for one slot. The provider <script> tags run inside
     this inner document (still open at parse time), so their document.write
     calls land in the frame, never in our page. */
  function doc(kind) {
    var head = '<!doctype html><html><head><meta charset="utf-8">' +
      '<base target="_blank">' +
      '<style>html,body{margin:0;padding:0;background:transparent}' +
      'body{text-align:center}iframe{border:0;max-width:100%}img{max-width:100%;height:auto}</style>' +
      '</head><body>';
    var tail = '</body></html>';
    if (kind === 'side') {
      return head +
        '<scr' + 'ipt>atOptions={' +
        "'key':'" + S_KEY + "'," +
        "'format':'iframe'," +
        "'height':600," +
        "'width':160," +
        "'params':{}};</scr' + 'ipt>" +
        '<scr' + 'ipt src="' + S_SRC + '"></scr' + 'ipt>' + tail;
    }
    return head +
      '<scr' + 'ipt async="async" data-cfasync="false" src="' + N_SRC + '"></scr' + 'ipt>' +
      '<div id="' + N_BOX + '"></div>' + tail;
  }

  /* Auto-size the frame to its creative (same-origin via srcdoc, so readable).
     The 160x600 unit keeps its exact size. */
  function fit(fr, kind) {
    var tries = 0;
    function go() {
      tries++;
      try {
        var b = fr.contentDocument && fr.contentDocument.body;
        if (b) {
          if (kind === 'side') {
            fr.style.width = '160px';
            fr.style.height = '600px';
          } else {
            var h = Math.max(b.scrollHeight || 0,
              (b.firstElementChild && b.firstElementChild.scrollHeight) || 0);
            if (h > 20) fr.style.height = Math.min(h, 700) + 'px';
          }
        }
      } catch (e) {}
      if (tries < 6) setTimeout(go, 900);
    }
    try { fr.addEventListener('load', function () { setTimeout(go, 400); }); } catch (e) {}
    setTimeout(go, 2500);
  }

  function fill(slot) {
    if (!slot || slot.getAttribute('data-filled') === '1') return;
    var kind = slot.getAttribute('data-ad') === 'side' ? 'side' : 'native';
    var lab = document.createElement('div');
    lab.className = 'adtag';
    lab.textContent = 'Advertisement';
    var fr = document.createElement('iframe');
    fr.setAttribute('title', 'Advertisement');
    fr.setAttribute('scrolling', 'no');
    fr.setAttribute('loading', 'lazy');
    /* No allow-top-navigation: ad clicks open a new tab, they can never
       redirect or popup-hijack this page. No allow-forms/pointer-lock. */
    fr.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
    fr.style.width = kind === 'side' ? '160px' : '100%';
    fr.style.height = kind === 'side' ? '600px' : '120px';
    fr.style.maxWidth = '100%';
    try { fr.srcdoc = doc(kind); }
    catch (e) { return; }
    slot.appendChild(lab);
    slot.appendChild(fr);
    slot.setAttribute('data-filled', '1');
    slot.hidden = false;
    slot.style.display = '';
    fit(fr, kind);
  }

  function fillAll() {
    if (!enabled()) return;
    var slots = document.querySelectorAll('.adslot');
    for (var i = 0; i < slots.length; i++) {
      (function (s) {
        /* Timer backstop: some environments never fire IntersectionObserver
           (backgrounded/headless tabs); fill anyway after 3s. data-filled
           guards double-fill. */
        setTimeout(function () {
          try { if (!s.getAttribute('data-filled')) fill(s); } catch (x) {}
        }, 3000);
        if ('IntersectionObserver' in window) {
          var io = new IntersectionObserver(function (es) {
            for (var k = 0; k < es.length; k++) {
              if (es[k].isIntersecting) {
                try { fill(s); } catch (x) {}
                try { io.disconnect(); } catch (x) {}
                break;
              }
            }
          }, { rootMargin: '400px' });
          try { io.observe(s); } catch (x) { try { fill(s); } catch (y) {} }
        } else {
          try { fill(s); } catch (x) {}
        }
      })(slots[i]);
    }
  }

  function clearAll() {
    var slots = document.querySelectorAll('.adslot');
    for (var i = 0; i < slots.length; i++) {
      slots[i].innerHTML = '';
      slots[i].removeAttribute('data-filled');
      slots[i].hidden = true;
      slots[i].style.display = 'none';
    }
  }

  var pill = null;
  function paintPill() {
    if (!pill) return;
    var on = enabled();
    pill.textContent = on ? '\uD83D\uDCE2 Ads: ON' : '\uD83D\uDEAB Ads: OFF';
    pill.setAttribute('aria-pressed', on ? 'true' : 'false');
    pill.title = on ? 'Ads are on — tap to disable' : 'Ads are off — tap to enable';
  }

  function mountPill() {
    if (document.getElementById('adPill')) {
      pill = document.getElementById('adPill');
      paintPill();
      return;
    }
    pill = document.createElement('button');
    pill.id = 'adPill';
    pill.type = 'button';
    pill.addEventListener('click', function () {
      var on = !enabled();
      set(on);
      clearAll();
      if (on) fillAll();
      paintPill();
    });
    try { document.body.appendChild(pill); } catch (e) { return; }
    paintPill();
  }

  function init() {
    mountPill();
    if (enabled()) fillAll();
    else clearAll();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
