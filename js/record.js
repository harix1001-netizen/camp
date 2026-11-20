// キャンプ記録の入力値チェックと、Notionプロパティへの変換。
// ブラウザ（フォーム）と GitHub Actions（scripts/add-notion-record.mjs）の両方で使う。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CampRecord = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // NotionのキャンプDBにある選択肢と同じもの
  const OPTIONS = {
    pref: ['京都', '大阪', '兵庫', '奈良', '滋賀', '和歌山', '三重', '鳥取', 'その他'],
    kids: ['大喜び🎉', '楽しんだ😊', 'まあまあ😐', '次は別の場所😅'],
    weather: ['晴れ☀️', '曇り☁️', '雨🌧️', '晴れのち曇り', '曇りのち雨'],
    access: ['〜60分', '60〜90分', '90分〜'],
    facilities: ['電源あり', 'トイレ（洋式）', 'シャワー', '炊事場', '売店', 'レンタル充実', '温泉近く', '川・水遊び', '海近く', '山・絶景', 'ペットOK', '予約必須', '足こぎカート'],
    seasons: ['春', '夏', '秋', '冬', '通年'],
  };
  const MAX_TEXT = 4000;

  function str(v) {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
  }

  function isISODate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  function addDays(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return dt.toISOString().slice(0, 10);
  }

  function isHttpUrl(s) {
    try {
      const u = new URL(s);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch (e) {
      return false;
    }
  }

  // 入力（フォームの値やActionsに渡されたJSON）を検証して正規化する。
  // 戻り値: { ok: true, record } または { ok: false, errors: [...] }
  function normalize(input) {
    const errors = [];
    const r = {};
    input = input || {};

    r.name = str(input.name);
    if (!r.name) errors.push('キャンプ場名を入力してください');
    else if (r.name.length > 200) errors.push('キャンプ場名が長すぎます');

    r.date = str(input.date);
    if (!r.date || !isISODate(r.date)) errors.push('訪問日を正しく入力してください');

    const nights = input.nights === '' || input.nights == null ? 1 : Number(input.nights);
    if (!Number.isInteger(nights) || nights < 0 || nights > 30) errors.push('泊数は0〜30の整数で入力してください');
    r.nights = nights;
    r.dateEnd = r.date && isISODate(r.date) && nights > 0 ? addDays(r.date, nights) : null;

    const pick = (key, label) => {
      const v = str(input[key]);
      if (v && !OPTIONS[key].includes(v)) errors.push(label + 'の値が正しくありません');
      return v && OPTIONS[key].includes(v) ? v : null;
    };
    r.pref = pick('pref', '都道府県');
    r.kids = pick('kids', '子ども評価');
    r.weather = pick('weather', '天気');
    r.access = pick('access', 'アクセス');

    const rating = input.rating === '' || input.rating == null ? null : Number(input.rating);
    if (rating !== null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) errors.push('評価は1〜5で選んでください');
    r.rating = rating;

    const price = input.price === '' || input.price == null ? null : Number(input.price);
    if (price !== null && !(Number.isFinite(price) && price >= 0 && price <= 1000000)) errors.push('料金を正しく入力してください');
    r.price = price;

    const multi = (key, label) => {
      const arr = Array.isArray(input[key]) ? input[key].map(str).filter(Boolean) : [];
      const bad = arr.filter((v) => !OPTIONS[key].includes(v));
      if (bad.length) errors.push(label + 'に不明な値があります：' + bad.join('、'));
      return [...new Set(arr.filter((v) => OPTIONS[key].includes(v)))];
    };
    r.facilities = multi('facilities', '設備');
    r.seasons = multi('seasons', 'おすすめシーズン');

    for (const [key, label] of [['napUrl', 'なっぷURL'], ['siteUrl', '公式サイトURL']]) {
      const v = str(input[key]);
      if (v && !isHttpUrl(v)) errors.push(label + 'は http(s):// から始まるURLにしてください');
      r[key] = v && isHttpUrl(v) ? v : null;
    }

    for (const [key, label] of [['memo', 'メモ・感想'], ['gear', '持ち物メモ']]) {
      const v = str(input[key]);
      if (v && v.length > MAX_TEXT) errors.push(label + 'は' + MAX_TEXT + '文字以内にしてください');
      r[key] = v;
    }

    return errors.length ? { ok: false, errors } : { ok: true, record: r };
  }

  // Notion APIの rich_text は1要素2000文字までなので分割する
  function richText(s) {
    const out = [];
    for (let i = 0; i < s.length; i += 2000) out.push({ type: 'text', text: { content: s.slice(i, i + 2000) } });
    return out;
  }

  // 正規化済みの記録 → Notion「キャンプ記録」DBのプロパティ
  function toNotionProperties(r) {
    const p = {
      キャンプ場名: { title: richText(r.name) },
      訪問日: { date: { start: r.date, end: r.dateEnd || null } },
      泊数: { number: r.nights },
      設備: { multi_select: r.facilities.map((name) => ({ name })) },
      おすすめシーズン: { multi_select: r.seasons.map((name) => ({ name })) },
    };
    if (r.pref) p['都道府県'] = { select: { name: r.pref } };
    if (r.rating) p['評価'] = { select: { name: '⭐'.repeat(r.rating) } };
    if (r.kids) p['子ども評価'] = { select: { name: r.kids } };
    if (r.weather) p['天気'] = { select: { name: r.weather } };
    if (r.access) p['アクセス（北摂から）'] = { select: { name: r.access } };
    if (r.price != null) p['料金（円）'] = { number: r.price };
    if (r.napUrl) p['なっぷURL'] = { url: r.napUrl };
    if (r.siteUrl) p['公式サイトURL'] = { url: r.siteUrl };
    if (r.memo) p['メモ・感想'] = { rich_text: richText(r.memo) };
    if (r.gear) p['持ち物メモ'] = { rich_text: richText(r.gear) };
    return p;
  }

  return { OPTIONS, normalize, toNotionProperties, addDays };
});
