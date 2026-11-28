/* 30-day dinner planner + weekly Costco shopping list. Same algorithm as bin/menu.py (the gate requires identical plans);
   rules come from data/menu_rules.json via menu-data.js (window.KMENU_RULES). Preferences and ticks are kept in localStorage only. */
(function () {
  var D = window.KMENU_DATA, RU = window.KMENU_RULES; if (!D || !RU) return;
  var byid = {}; D.recipes.forEach(function (r) { byid[r.id] = r; });
  function fnv(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function iso(t) { return new Date(t).toISOString().slice(0, 10); }
  function parse(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function dowOf(t) { return (new Date(t).getUTCDay() + 6) % 7; }
  function defaultStart() { var n = new Date(), t = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); return iso(t + ((7 - dowOf(t)) % 7) * 864e5); }
  function cmp(a, b) { return a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0); }
  function argmin(list, key) { var best = null, bk = null; list.forEach(function (r) { var k = key(r); if (!best || cmp(k, bk) < 0) { best = r; bk = k; } }); return best; }

  function plan(prefs, startIso) {
    var P = RU.prefs, S = RU.score;
    prefs = prefs.filter(function (p) { return P[p]; }).sort();
    var seed = startIso + '|' + prefs.join(','), fav = {};
    prefs.forEach(function (p) { if (P[p].kind === 'prefer') P[p].cuisines.forEach(function (c) { fav[c] = 1; }); });
    var pool = D.recipes.slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; }).filter(function (r) {
      return prefs.every(function (p) { var x = P[p]; return !(x.kind === 'exclude' && ((x.test === 'spicy' && r.spicy) || (x.test === 'fat_over' && r.fat > x.fat_g))); });
    });
    var mains = pool.filter(function (r) { return RU.main_categories.indexOf(r.cat) >= 0 && r.protein !== 'none'; });
    var sides = pool.filter(function (r) { return RU.side_categories.indexOf(r.cat) >= 0; });
    var fish = RU.fish_proteins, N = RU.days, gap = RU.min_gap_days, last = {}, out = [], prev = null, t0 = parse(startIso);
    function rnd(day, id) { return fnv(seed + ':' + day + ':' + id) % (S.random + 1); }
    function isFav(r) { return r.cu.some(function (c) { return fav[c]; }); }
    function isFish(p) { return fish.indexOf(p) >= 0; }
    for (var i = 0; i < N; i++) {
      var t = t0 + i * 864e5, dow = dowOf(t), weekend = RU.weekend_days.indexOf(dow) >= 0, w0 = Math.floor(i / 7) * 7;
      var week = out.slice(w0, i), full = N - w0 >= 7, have = 0;
      week.forEach(function (d) { if (isFish(d._mp)) have++; if (isFish(d._sp)) have++; });
      var remaining = 7 - (i - w0), need = full ? RU.fish_per_week - have : 0, wp = week.map(function (d) { return d._mp; });
      var fits = function (r) { return (weekend || r.min <= RU.weekday_max_minutes) && (!(r.id in last) || i - last[r.id] >= gap); };
      var used = function (r) { return (r.id in last) && i - last[r.id] < RU.no_repeat_days; };
      var cand = mains.filter(function (r) { return fits(r) && !(RU.protein_no_consecutive && r.protein === prev); });
      if (need >= remaining && cand.some(function (r) { return isFish(r.protein) && !used(r); })) cand = cand.filter(function (r) { return isFish(r.protein); });
      var m = argmin(cand, function (r) {
        var same = wp.filter(function (p) { return p === r.protein; }).length;
        return [(used(r) ? S.used_before : 0) + S.same_protein_this_week * same + (isFav(r) ? S.preferred_cuisine : 0) + rnd(i, r.id), r.id];
      });
      var needAfter = need - (m && isFish(m.protein) ? 1 : 0);
      var sc = sides.filter(function (r) { return fits(r) && !(m && r.protein !== 'none' && r.protein === m.protein); });
      if (needAfter >= remaining && sc.some(function (r) { return isFish(r.protein); })) sc = sc.filter(function (r) { return isFish(r.protein); });
      var s = argmin(sc, function (r) {
        var over = m ? m.na + r.na - RU.sodium.pair_penalty_over_mg : 0, pen = over > 0 ? Math.trunc(RU.sodium.pair_penalty_per_mg * over) : 0;
        return [(used(r) ? S.used_before : 0) + pen + (isFav(r) ? S.preferred_cuisine : 0) + rnd(i, 's:' + r.id), r.id];
      });
      out.push({ day: i, date: iso(t), dow: dow, weekend: weekend, main: m ? m.id : null, side: s ? s.id : null, na: (m ? m.na : 0) + (s ? s.na : 0), _mp: m ? m.protein : null, _sp: s ? s.protein : null });
      if (m) last[m.id] = i; if (s) last[s.id] = i;
      prev = m ? m.protein : null;
    }
    out.forEach(function (d) { delete d._mp; delete d._sp; });
    return out;
  }

  function shopping(pl, people) {
    var order = RU.shop_order, weeks = [];
    for (var w0 = 0; w0 < pl.length; w0 += 7) {
      var tot = {}, keys = [], days = pl.slice(w0, w0 + 7);
      days.forEach(function (d) {
        [d.main, d.side].forEach(function (id) {
          var r = byid[id]; if (!r) return;
          r.ings.forEach(function (x) { if (!(x[0] in tot)) { tot[x[0]] = 0; keys.push(x[0]); } tot[x[0]] += x[1] * people / r.sv; });
        });
      });
      var items = keys.map(function (k) {
        var m = D.ings[k], g = Math.round(tot[k]), pk = m.aisle !== 'elsewhere' ? m.pack_g : null;
        return { id: k, g: g, aisle: m.aisle, packs: pk ? Math.ceil(g / pk) : null, pantry: RU.pantry_groups.indexOf(m.group) >= 0, weeks_per_pack: pk && g ? Math.floor(pk / g) : null };
      });
      items.sort(function (a, b) {
        return order.indexOf(a.aisle) - order.indexOf(b.aisle) || D.groups.indexOf(D.ings[a.id].group) - D.groups.indexOf(D.ings[b.id].group) || (a.id < b.id ? -1 : 1);
      });
      weeks.push({ week: w0 / 7 + 1, start: days[0].date, end: days[days.length - 1].date, items: items });
    }
    return weeks;
  }

  /* ---------- UI ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function bi(en, zh) { return '<span class="en">' + en + '</span><span class="zh">' + zh + '</span>'; }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DEN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], DZH = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  function dlabel(isoS, dow) { var p = isoS.split('-'); return bi(DEN[dow] + ' ' + MON[+p[1] - 1] + ' ' + (+p[2]), (+p[1]) + '月' + (+p[2]) + '日 ' + DZH[dow]); }
  function short(isoS) { var p = isoS.split('-'); return bi(MON[+p[1] - 1] + ' ' + (+p[2]), (+p[1]) + '月' + (+p[2]) + '日'); }
  function grams(g) { return g >= 1000 ? (Math.round(g / 100) / 10) + ' kg' : g + ' g'; }
  function rlink(id) { var r = byid[id]; if (!r) return '—'; return '<a href="r-' + id + '.html">' + bi(esc(r.en), esc(r.zh)) + '</a> <small class="muted">' + r.min + ' ' + bi('min', '分钟') + '</small>'; }
  function naNote(na) {
    var ref = RU.sodium.daily_reference_mg, pct = Math.round(na / ref * 100);
    if (na >= ref) return '<span class="tag na-high">' + bi('Sodium about ' + na + ' mg, over a whole day\'s 2,300 mg', '钠约 ' + na + ' mg，超过全天参考 2300 mg') + '</span>';
    if (na >= RU.sodium.dinner_note_mg) return '<span class="tag na-mid">' + bi('Sodium about ' + na + ' mg (' + pct + '% of a day)', '钠约 ' + na + ' mg（全天参考的 ' + pct + '%）') + '</span>';
    return '<span class="tag na-low">' + bi('Sodium about ' + na + ' mg', '钠约 ' + na + ' mg') + '</span>';
  }
  var KEY = 'kitchen.menu', st = { people: RU.default_people, prefs: [], start: null };
  try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) { st.people = sv.people || st.people; st.prefs = sv.prefs || []; st.start = sv.start || null; } } catch (e) { }
  var qs = location.search.match(/[?&]start=(\d{4}-\d\d-\d\d)/); if (qs) st.start = qs[1];
  if (!st.start) st.start = defaultStart();
  var ticks = {}; try { ticks = JSON.parse(localStorage.getItem(KEY + '.ticks') || '{}'); } catch (e) { }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); localStorage.setItem(KEY + '.ticks', JSON.stringify(ticks)); } catch (e) { } }
  var api = { plan: plan, shopping: shopping, lastPlan: null };
  window.KMENU = api;

  function render() {
    var pl = plan(st.prefs, st.start); api.lastPlan = pl;
    var people = st.people, out = '';
    for (var w0 = 0; w0 < pl.length; w0 += 7) {
      var days = pl.slice(w0, w0 + 7);
      out += '<section class="mweek"><h2>' + bi('Week ' + (w0 / 7 + 1), '第 ' + (w0 / 7 + 1) + ' 周') + ' <small>' + short(days[0].date) + ' – ' + short(days[days.length - 1].date) + '</small></h2><ol class="mdays">';
      days.forEach(function (d) {
        out += '<li class="mday' + (d.weekend ? ' we' : '') + '"><div class="md-d">' + dlabel(d.date, d.dow) + '</div><div class="md-m">' + rlink(d.main) + '</div><div class="md-s">+ ' + rlink(d.side) + '</div><div class="md-n">' + naNote(d.na) + '</div></li>';
      });
      out += '</ol></section>';
    }
    document.getElementById('mplan').innerHTML = out;
    var sh = shopping(pl, people), so = '', tk = st.start + '|' + people + '|' + st.prefs.slice().sort().join(',');
    sh.forEach(function (w) {
      so += '<section class="sweek"><h2>' + bi('Week ' + w.week, '第 ' + w.week + ' 周') + ' <small>' + short(w.start) + ' – ' + short(w.end) + ' · ' + bi(people + ' people', people + ' 人') + '</small></h2>';
      RU.shop_order.forEach(function (a) {
        var its = w.items.filter(function (x) { return x.aisle === a; }); if (!its.length) return;
        so += '<h3>' + bi(RU.shop_aisles[a].en, RU.shop_aisles[a].zh) + '</h3><ul class="shop">';
        its.forEach(function (x) {
          var m = D.ings[x.id], k = tk + '|' + w.week + '|' + x.id, ab = m.basis === 'typical';
          var egg = x.id === 'eggs' ? bi(' (about ' + Math.ceil(x.g / 50) + ' eggs)', '（约 ' + Math.ceil(x.g / 50) + ' 个）') : '';
          var line = '<b>' + bi(esc(m.en), esc(m.zh)) + '</b> <span class="amt">' + bi('need ', '需要 ') + grams(x.g) + egg + '</span>';
          if (x.aisle === 'elsewhere') line += '<br><small class="muted">' + bi('Not usually at Costco.', 'Costco 通常没有。') + '</small>';
          else {
            line += '<br><small>' + bi('Costco pack' + (ab ? ' (typical, about ' : ' (') + grams(m.pack_g) + '): ' + esc(m.pack_en), 'Costco 包装' + (ab ? '（常见规格，约 ' : '（') + grams(m.pack_g) + '）：' + esc(m.pack_zh)) + '</small>';
            if (x.pantry) line += '<br><small class="muted">' + bi('Pantry item: check what you have first.' + (x.weeks_per_pack > 1 ? ' One pack lasts about ' + x.weeks_per_pack + ' weeks at this rate.' : ''), '常备调料：先看家里还有没有。' + (x.weeks_per_pack > 1 ? '按这个用量一包约够 ' + x.weeks_per_pack + ' 周。' : '')) + '</small>';
            else line += '<br><small class="buy">' + bi('Buy ' + x.packs + ' pack' + (x.packs > 1 ? 's' : ''), '买 ' + x.packs + ' 包') + (RU.freeze_groups.indexOf(m.group) >= 0 && x.packs * m.pack_g - x.g > 300 ? ' · ' + bi('portion and freeze the rest', '多出的分装冷冻') : '') + '</small>';
          }
          so += '<li><label><input type="checkbox" data-k="' + esc(k) + '"' + (ticks[k] ? ' checked' : '') + '> <span>' + line + '</span></label></li>';
        });
        so += '</ul>';
      });
      so += '</section>';
    });
    document.getElementById('mshop').innerHTML = so;
  }
  function controls() {
    var pe = document.getElementById('mpeople'), pr = document.getElementById('mprefs'), sd = document.getElementById('mstart');
    pe.innerHTML = RU.people.map(function (n) { return '<button type="button" class="chip" data-people="' + n + '" aria-pressed="' + (n === st.people) + '">' + bi(n + ' people', n + ' 人') + '</button>'; }).join('');
    pr.innerHTML = RU.pref_order.map(function (k) { return '<button type="button" class="chip" data-pref="' + k + '" aria-pressed="' + (st.prefs.indexOf(k) >= 0) + '">' + bi(esc(RU.prefs[k].en), esc(RU.prefs[k].zh)) + '</button>'; }).join('');
    sd.value = st.start;
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-people],[data-pref],[data-print]'); if (!b) return;
    if (b.hasAttribute('data-people')) st.people = +b.getAttribute('data-people');
    else if (b.hasAttribute('data-pref')) { var k = b.getAttribute('data-pref'), i = st.prefs.indexOf(k); if (i >= 0) st.prefs.splice(i, 1); else st.prefs.push(k); }
    else { window.print(); return; }
    save(); controls(); render();
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'mstart' && /^\d{4}-\d\d-\d\d$/.test(e.target.value)) { st.start = e.target.value; save(); render(); }
    if (e.target.matches && e.target.matches('input[data-k]')) { if (e.target.checked) ticks[e.target.getAttribute('data-k')] = 1; else delete ticks[e.target.getAttribute('data-k')]; save(); }
  });
  controls(); render();
})();
