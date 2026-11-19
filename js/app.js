// キャンプ管理アプリの画面描画
(function () {
  const L = window.CampLogic;
  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
  const state = { camps: [], spots: [], filters: { query: '', pref: '', minRating: 0, kids: '', sort: 'new' } };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(url) {
    return typeof url === 'string' && /^https?:\/\//.test(url) ? url : null;
  }

  function fmtDate(iso) {
    const d = L.parseDate(iso);
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() + '（' + WEEKDAYS[d.getDay()] + '）';
  }

  function fmtMD(d) {
    return d.getMonth() + 1 + '/' + d.getDate() + '（' + WEEKDAYS[d.getDay()] + '）';
  }

  function stars(n) {
    if (!n) return '<span class="muted">評価なし</span>';
    return '<span class="stars" aria-label="評価' + n + '">' + '★'.repeat(n) + '<span class="stars-off">' + '★'.repeat(5 - n) + '</span></span>';
  }

  function chips(list, cls) {
    return (list || []).map((t) => '<span class="chip ' + (cls || '') + '">' + esc(t) + '</span>').join('');
  }

  function linkButtons(nap, site) {
    const out = [];
    const n = safeUrl(nap);
    const s = safeUrl(site);
    if (n && L.isNapUrl(n)) out.push('<a class="btn btn-nap" href="' + esc(n) + '" target="_blank" rel="noopener">なっぷで見る・予約</a>');
    else if (n && n !== s) out.push('<a class="btn" href="' + esc(n) + '" target="_blank" rel="noopener">予約ページ</a>');
    if (s) out.push('<a class="btn" href="' + esc(s) + '" target="_blank" rel="noopener">公式サイト</a>');
    return out.length ? '<div class="actions">' + out.join('') + '</div>' : '';
  }

  // ---------- 週末おすすめ ----------
  function renderWeekend() {
    const today = new Date();
    const { saturday, sunday } = L.upcomingWeekend(today);
    const season = L.seasonOf(saturday);
    document.getElementById('weekend-date').textContent = fmtMD(saturday) + '〜' + fmtMD(sunday) + '・季節は' + season;

    const ranked = L.rankWishlist(state.spots, season);
    const top = ranked.filter((r) => !r.offSeason).slice(0, 5);
    const rest = ranked.filter((r) => !top.includes(r));

    document.getElementById('weekend-list').innerHTML = top.length
      ? top.map((r, i) => spotCard(r, i + 1)).join('')
      : '<p class="empty">今の季節に合う未訪問のキャンプ場がありません。下の「その他の候補」から選んでみてください。</p>';

    document.getElementById('weekend-rest').innerHTML = rest.map((r) => spotCard(r)).join('');
    document.getElementById('weekend-rest-count').textContent = rest.length + '件';

    const picks = L.revisitPicks(state.camps, season, 3);
    document.getElementById('revisit-list').innerHTML = picks.length
      ? picks.map(revisitCard).join('')
      : '<p class="empty">条件に合う履歴がまだありません。</p>';
  }

  function spotCard(r, rank) {
    const s = r.spot;
    return (
      '<article class="card">' +
      '<div class="card-head">' +
      (rank ? '<span class="rank">' + rank + '</span>' : '') +
      '<div class="card-title"><h3>' + esc(s.name) + '</h3>' +
      '<div class="meta">' + esc(s.pref || '') + (s.access ? '・北摂から' + esc(s.access) : '') + '</div></div>' +
      (s.priority ? '<span class="prio prio-' + esc(s.priority) + '">' + esc(s.priority) + '</span>' : '') +
      '</div>' +
      (r.reasons.length ? '<div class="chips">' + chips(r.reasons, 'chip-reason') + '</div>' : '') +
      (r.offSeason ? '<p class="note">おすすめシーズン：' + esc((s.seasons || []).join('・')) + '</p>' : '') +
      (s.kids ? '<p class="text"><strong>子ども向け：</strong>' + esc(s.kids) + '</p>' : '') +
      (s.memo ? '<p class="text muted">' + esc(s.memo) + '</p>' : '') +
      '<div class="chips">' + chips(s.facilities) + '</div>' +
      linkButtons(s.napUrl, null) +
      '</article>'
    );
  }

  function revisitCard(p) {
    const c = p.camp;
    return (
      '<article class="card card-revisit">' +
      '<div class="card-head"><div class="card-title"><h3>' + esc(p.name) + '</h3>' +
      '<div class="meta">' + esc(c.pref || '') + '・' + p.visits + '回訪問・前回 ' + esc(fmtDate(c.date)) + '</div></div></div>' +
      '<div class="row">' + stars(c.rating) + (c.kids ? '<span class="chip">' + esc(c.kids) + '</span>' : '') + '</div>' +
      (c.memo ? '<p class="text muted">' + esc(c.memo) + '</p>' : '') +
      linkButtons(p.napUrl, p.siteUrl) +
      '</article>'
    );
  }

  // ---------- 履歴 ----------
  function renderStats() {
    const s = L.stats(state.camps);
    const items = [
      [s.trips, '回のキャンプ'],
      [s.nights, '泊'],
      [s.spots, 'か所'],
      [s.prefectures, '府県'],
      [s.repeatSpots, 'か所リピート'],
      [s.fiveStars, '回 ★5'],
    ];
    document.getElementById('stats').innerHTML = items
      .map(([n, l]) => '<div class="stat"><span class="stat-num">' + n + '</span><span class="stat-label">' + l + '</span></div>')
      .join('');
  }

  function fillSelect(id, values) {
    const el = document.getElementById(id);
    for (const v of values) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      el.appendChild(o);
    }
  }

  function renderHistory() {
    const list = L.filterCamps(state.camps, state.filters);
    document.getElementById('history-count').textContent = list.length + '件';
    const el = document.getElementById('history-list');
    if (!list.length) {
      el.innerHTML = '<p class="empty">条件に合う記録がありません。</p>';
      return;
    }
    let html = '';
    let year = null;
    const byDate = state.filters.sort !== 'rating';
    for (const c of list) {
      const y = c.date.slice(0, 4);
      if (byDate && y !== year) {
        year = y;
        html += '<h3 class="year">' + y + '年</h3>';
      }
      html += historyCard(c);
    }
    el.innerHTML = html;
  }

  function historyCard(c) {
    const cancelled = !c.nights;
    const metaParts = [c.pref, c.access ? '北摂から' + c.access : null, c.weather, c.price ? c.price.toLocaleString('ja-JP') + '円' : null].filter(Boolean);
    return (
      '<details class="card hist' + (cancelled ? ' cancelled' : '') + '">' +
      '<summary>' +
      '<div class="hist-date">' + esc(fmtDate(c.date)) + (c.nights > 1 ? '・' + c.nights + '泊' : '') + '</div>' +
      '<h4>' + esc(c.name) + '</h4>' +
      '<div class="row">' + (cancelled ? '<span class="chip chip-warn">中止</span>' : stars(c.rating)) + (c.kids ? '<span class="chip">' + esc(c.kids) + '</span>' : '') + '</div>' +
      '</summary>' +
      '<div class="hist-body">' +
      (metaParts.length ? '<div class="meta">' + esc(metaParts.join('・')) + '</div>' : '') +
      (c.place ? '<div class="meta">📍 ' + esc(c.place) + '</div>' : '') +
      (c.memo ? '<p class="text">' + esc(c.memo) + '</p>' : '') +
      (c.gear ? '<p class="text"><strong>持ち物メモ：</strong>' + esc(c.gear) + '</p>' : '') +
      '<div class="chips">' + chips(c.facilities) + chips(c.seasons, 'chip-season') + '</div>' +
      linkButtons(c.napUrl, c.siteUrl) +
      '</div>' +
      '</details>'
    );
  }

  function bindHistoryControls() {
    const prefs = [...new Set(state.camps.map((c) => c.pref).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
    fillSelect('f-pref', prefs);
    const kids = [...new Set(state.camps.map((c) => c.kids).filter(Boolean))];
    fillSelect('f-kids', kids);

    const bind = (id, key, cast) => {
      const el = document.getElementById(id);
      el.addEventListener('input', () => {
        state.filters[key] = cast ? cast(el.value) : el.value;
        renderHistory();
      });
    };
    bind('f-query', 'query');
    bind('f-pref', 'pref');
    bind('f-rating', 'minRating', Number);
    bind('f-kids', 'kids');
    bind('f-sort', 'sort');
  }

  // ---------- タブ ----------
  function showTab(name) {
    document.querySelectorAll('.tab').forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.panel').forEach((p) => (p.hidden = p.id !== 'panel-' + name));
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  }

  function initTabs() {
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
    const initial = location.hash === '#history' ? 'history' : 'weekend';
    showTab(initial);
  }

  async function loadJSON(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(path + ' の読み込みに失敗しました（' + res.status + '）');
    return res.json();
  }

  async function init() {
    initTabs();
    try {
      const [campData, wishData] = await Promise.all([loadJSON('data/camps.json'), loadJSON('data/wishlist.json')]);
      state.camps = campData.camps || [];
      state.spots = wishData.spots || [];
      document.getElementById('updated').textContent = 'Notionのデータ：' + (campData.updatedAt || '不明') + ' 時点';
      renderWeekend();
      renderStats();
      bindHistoryControls();
      renderHistory();
    } catch (e) {
      document.querySelector('main').insertAdjacentHTML(
        'afterbegin',
        '<p class="error">' + esc(e.message) + '<br>ローカルで開くときは <code>python3 -m http.server</code> などでサーバーを立ててください。</p>'
      );
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
