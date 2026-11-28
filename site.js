/* North American Home Kitchen: language switch, click-to-load video, search and quick filters. No tracking. */
(function () {
  var root = document.documentElement;
  function setLang(l) { root.setAttribute('data-lang', l); try { localStorage.setItem('kitchen.lang', l); } catch (e) { } place(); }
  function place() { var q = document.getElementById('q'); if (q) q.placeholder = root.getAttribute('data-lang') === 'zh' ? '搜菜名或食材，例如：鸡胸肉、salmon' : 'Search a dish or ingredient, e.g. 鸡胸肉, salmon'; }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-set-lang]'); if (b) { setLang(b.getAttribute('data-set-lang')); return; }
    var y = e.target.closest && e.target.closest('.yt[data-yt]'); if (y) { e.preventDefault(); loadVideo(y); return; }
    var c = e.target.closest && e.target.closest('.chip'); if (c) { c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); run(); }
  });
  function loadVideo(b) {
    var wrap = document.createElement('div'); wrap.className = 'yt-frame';
    var f = document.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(b.getAttribute('data-yt')) + '?rel=0&autoplay=1&start=' + (parseInt(b.getAttribute('data-start'), 10) || 0);
    f.title = 'Video'; f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.setAttribute('allowfullscreen', ''); f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    wrap.appendChild(f); b.closest('.vid').replaceChild(wrap, b);
  }
  /* search */
  var data = null, q = document.getElementById('q');
  function run() {
    if (!q) return;
    var qs = q.value.trim().toLowerCase();
    var on = Array.prototype.map.call(document.querySelectorAll('.chip[aria-pressed="true"]'), function (c) { return c.getAttribute('data-f'); });
    var box = document.getElementById('results'), list = document.getElementById('rlist');
    if (!qs && !on.length) { box.hidden = true; document.getElementById('start').hidden = false; return; }
    if (!data) return;
    var out = data.filter(function (r) {
      if (qs) { var hay = (r.zh + ' ' + r.en + ' ' + r.ings.join(' ') + ' ' + r.cuz + ' ' + r.cue).toLowerCase(); if (qs.split(/\s+/).some(function (w) { return hay.indexOf(w) < 0; })) return false; }
      return on.every(function (f) {
        return f === 't15' ? r.t <= 15 : f === 't30' ? r.t <= 30 : f === 'mild' ? r.mild : f === 'costco' ? r.costco : f === 'soup' ? r.cat === 'soup' : r.occ.indexOf(f) >= 0;
      });
    });
    list.innerHTML = '';
    out.forEach(function (r) {
      var a = document.createElement('a'); a.className = 'rcard'; a.href = 'r-' + r.id + '.html';
      a.innerHTML = '<span class="rc-t"><b><span class="en"></span><span class="zh"></span></b><small></small></span>';
      a.querySelector('.en').textContent = r.en; a.querySelector('.zh').textContent = r.zh;
      a.querySelector('small').textContent = r.t + ' min · ' + r.sv + ' servings';
      list.appendChild(a);
    });
    document.getElementById('rcount').textContent = out.length;
    box.hidden = false; document.getElementById('start').hidden = true;
  }
  if (q) {
    place(); q.addEventListener('input', run);
    fetch('search.json').then(function (r) { return r.json(); }).then(function (d) { data = d; run(); }).catch(function () { });
  }
})();
