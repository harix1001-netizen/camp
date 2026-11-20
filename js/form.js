// 「＋ 記録する」フォーム。送信すると GitHub Actions 経由で Notion に追加される。
(function () {
  const R = window.CampRecord;
  const L = window.CampLogic;
  const TOKEN_KEY = 'camp.githubToken';
  const PENDING_KEY = 'camp.pending';
  const WORKFLOW = 'add-camp-record.yml';
  const DEFAULT_REPO = 'harix1001-netizen/camp';

  let ctx = { camps: [], spots: [], onChange: function () {} };

  // ---------- localStorage（使えない環境でも落ちないように） ----------
  function load(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  }
  function save(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function repoSlug() {
    const host = location.hostname;
    if (host.endsWith('.github.io')) {
      const owner = host.slice(0, -'.github.io'.length);
      const repo = location.pathname.split('/').filter(Boolean)[0];
      if (owner && repo && !repo.includes('.')) return owner + '/' + repo;
    }
    return DEFAULT_REPO;
  }

  // ---------- 反映待ち ----------
  function pending() {
    const list = load(PENDING_KEY, []);
    if (!Array.isArray(list)) return [];
    const now = Date.now();
    const keep = list.filter(
      (p) => p && p.name && p.date && now - (p.sentAt || 0) < 24 * 3600 * 1000 && !ctx.camps.some((c) => c.name === p.name && c.date === p.date)
    );
    if (keep.length !== list.length) save(PENDING_KEY, keep);
    return keep;
  }

  // ---------- フォームの組み立て ----------
  function $(id) {
    return document.getElementById(id);
  }

  function fillOptions(select, values) {
    for (const v of values) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      select.appendChild(o);
    }
  }

  function fillChecks(container, name, values) {
    container.innerHTML = '';
    for (const v of values) {
      const label = document.createElement('label');
      label.className = 'check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = name;
      input.value = v;
      label.appendChild(input);
      label.appendChild(document.createTextNode(v));
      container.appendChild(label);
    }
  }

  function knownPlaces() {
    const map = new Map();
    for (const g of L.groupVisits(ctx.camps)) {
      const c = g.latest;
      map.set(g.name, {
        pref: c.pref,
        access: c.access,
        facilities: g.visits.map((v) => v.facilities || []).sort((a, b) => b.length - a.length)[0] || [],
        seasons: g.visits.map((v) => v.seasons || []).find((s) => s.length) || [],
        napUrl: g.napUrl,
        siteUrl: g.siteUrl,
        visits: g.visits.length,
      });
    }
    for (const s of ctx.spots) {
      if (!map.has(s.name)) map.set(s.name, { pref: s.pref, access: s.access, facilities: s.facilities || [], seasons: s.seasons || [], napUrl: s.napUrl, siteUrl: null, visits: 0 });
    }
    return map;
  }

  function setChecks(name, values) {
    document.querySelectorAll('input[name="' + name + '"]').forEach((el) => (el.checked = values.includes(el.value)));
  }

  function getChecks(name) {
    return [...document.querySelectorAll('input[name="' + name + '"]:checked')].map((el) => el.value);
  }

  // 過去に行った場所・未訪問リストの場所を選んだら、場所の情報を埋める
  function autofill(places) {
    const name = $('r-name').value.trim();
    const p = places.get(name);
    const hint = $('r-name-hint');
    if (!p) {
      hint.textContent = '';
      return;
    }
    hint.textContent = p.visits ? p.visits + 1 + '回目の訪問です。前回の情報を入れました。' : '未訪問リストの情報を入れました。';
    $('r-pref').value = p.pref || '';
    $('r-access').value = p.access || '';
    setChecks('facilities', p.facilities);
    setChecks('seasons', p.seasons);
    $('r-nap').value = p.napUrl || '';
    $('r-site').value = p.siteUrl || '';
  }

  function readForm() {
    const rating = document.querySelector('input[name="rating"]:checked');
    return {
      name: $('r-name').value,
      date: $('r-date').value,
      nights: $('r-nights').value,
      pref: $('r-pref').value,
      rating: rating ? rating.value : '',
      kids: $('r-kids').value,
      weather: $('r-weather').value,
      access: $('r-access').value,
      price: $('r-price').value,
      facilities: getChecks('facilities'),
      seasons: getChecks('seasons'),
      napUrl: $('r-nap').value,
      siteUrl: $('r-site').value,
      memo: $('r-memo').value,
      gear: $('r-gear').value,
    };
  }

  function showStatus(msg, kind) {
    const el = $('r-status');
    el.textContent = msg;
    el.className = 'status' + (kind ? ' status-' + kind : '');
  }

  function renderTokenState() {
    const has = !!load(TOKEN_KEY, null);
    $('token-set').hidden = !has;
    $('token-form').hidden = has;
    $('token-details').open = !has;
  }

  async function dispatch(record, token) {
    const res = await fetch('https://api.github.com/repos/' + repoSlug() + '/actions/workflows/' + WORKFLOW + '/dispatches', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs: { record: JSON.stringify(record) } }),
    });
    if (res.status === 204) return;
    let detail = '';
    try {
      detail = (await res.json()).message || '';
    } catch (e) {}
    if (res.status === 401) throw new Error('GitHubトークンが無効です。設定し直してください。');
    if (res.status === 403 || res.status === 404) throw new Error('GitHubトークンにこのリポジトリのActionsを動かす権限がありません（' + res.status + '）。');
    throw new Error('送信に失敗しました（' + res.status + (detail ? '：' + detail : '') + '）');
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    const result = R.normalize(readForm());
    if (!result.ok) {
      showStatus(result.errors.join('\n'), 'error');
      return;
    }
    const token = load(TOKEN_KEY, null);
    if (!token) {
      showStatus('先にGitHubトークンを設定してください。', 'error');
      $('token-details').open = true;
      return;
    }
    const btn = $('r-submit');
    btn.disabled = true;
    showStatus('送信中…');
    try {
      await dispatch(result.record, token);
      const list = pending();
      list.push({ name: result.record.name, date: result.record.date, sentAt: Date.now() });
      save(PENDING_KEY, list);
      $('record-form').reset();
      $('r-name-hint').textContent = '';
      $('r-date').value = defaultDate();
      showStatus('送信しました。Notionとアプリへの反映まで1〜2分かかります。', 'ok');
      ctx.onChange();
    } catch (e) {
      showStatus(e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  // 直近の土曜（今日が日曜なら昨日）を初期値にする
  function defaultDate() {
    const d = new Date();
    const back = (d.getDay() + 1) % 7; // 土曜からの経過日数
    d.setDate(d.getDate() - back);
    return L.toISODate(d);
  }

  function init(options) {
    ctx = Object.assign(ctx, options);
    const dialog = $('record-dialog');
    if (!dialog) return;

    fillOptions($('r-pref'), R.OPTIONS.pref);
    fillOptions($('r-kids'), R.OPTIONS.kids);
    fillOptions($('r-weather'), R.OPTIONS.weather);
    fillOptions($('r-access'), R.OPTIONS.access);
    fillChecks($('r-facilities'), 'facilities', R.OPTIONS.facilities);
    fillChecks($('r-seasons'), 'seasons', R.OPTIONS.seasons);

    const places = knownPlaces();
    const dl = $('r-name-list');
    for (const name of places.keys()) {
      const o = document.createElement('option');
      o.value = name;
      dl.appendChild(o);
    }
    $('r-name').addEventListener('change', () => autofill(places));
    $('r-date').value = defaultDate();

    $('open-record').addEventListener('click', () => {
      showStatus('');
      renderTokenState();
      if (dialog.showModal) dialog.showModal();
      else dialog.setAttribute('open', '');
    });
    $('close-record').addEventListener('click', () => dialog.close());
    $('record-form').addEventListener('submit', onSubmit);

    $('token-save').addEventListener('click', () => {
      const v = $('token-input').value.trim();
      if (!v) return;
      if (!save(TOKEN_KEY, v)) {
        showStatus('このブラウザではトークンを保存できません（プライベートモードなど）。', 'error');
        return;
      }
      $('token-input').value = '';
      renderTokenState();
    });
    $('token-clear').addEventListener('click', () => {
      save(TOKEN_KEY, null);
      renderTokenState();
    });
  }

  window.CampForm = { init, pending };
})();
