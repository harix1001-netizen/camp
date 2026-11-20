// キャンプ管理アプリの計算ロジック（DOMに依存しない部分）
// ブラウザでは window.CampLogic、Node では require() で使える。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CampLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const PRIORITY_SCORE = { S: 30, A: 20, B: 10 };
  const ACCESS_SCORE = { '〜60分': 10, '60〜90分': 5, '90分〜': 0 };

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function toISODate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function parseDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // 今週末（土・日）。土日当日ならその週末、それ以外は次の土曜から。
  function upcomingWeekend(today) {
    const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dow = base.getDay(); // 0=日, 6=土
    const sat = new Date(base);
    if (dow === 0) sat.setDate(base.getDate() - 1);
    else sat.setDate(base.getDate() + (6 - dow));
    const sun = new Date(sat);
    sun.setDate(sat.getDate() + 1);
    return { saturday: sat, sunday: sun };
  }

  function seasonOf(date) {
    const m = date.getMonth() + 1;
    if (m >= 3 && m <= 5) return '春';
    if (m >= 6 && m <= 8) return '夏';
    if (m >= 9 && m <= 11) return '秋';
    return '冬';
  }

  function seasonMatches(seasons, season) {
    if (!seasons || seasons.length === 0) return null; // 情報なし
    return seasons.includes(season) || seasons.includes('通年');
  }

  // 未訪問リストを週末向けにスコアリングする
  function scoreSpot(spot, season) {
    let score = 0;
    const reasons = [];
    const p = PRIORITY_SCORE[spot.priority] || 0;
    score += p;
    if (spot.priority) reasons.push('優先度' + spot.priority);

    const match = seasonMatches(spot.seasons, season);
    if (match === true) {
      score += 20;
      reasons.push(season + 'がおすすめ');
    } else if (match === false) {
      score -= 15;
    }

    const a = ACCESS_SCORE[spot.access];
    if (a !== undefined) {
      score += a;
      if (a >= 10) reasons.push('近い（' + spot.access + '）');
    }

    const fac = spot.facilities || [];
    if (season === '冬' || season === '秋') {
      if (fac.includes('温泉近く')) { score += 5; reasons.push('温泉近く'); }
      if (fac.includes('電源あり')) { score += 5; reasons.push('電源あり'); }
    }
    if (season === '夏' && fac.includes('川・水遊び')) {
      score += 5;
      reasons.push('川遊び');
    }
    return { spot, score, reasons, offSeason: match === false };
  }

  function rankWishlist(spots, season) {
    return spots
      .map((s) => scoreSpot(s, season))
      .sort(
        (a, b) =>
          b.score - a.score ||
          (PRIORITY_SCORE[b.spot.priority] || 0) - (PRIORITY_SCORE[a.spot.priority] || 0) ||
          a.spot.name.localeCompare(b.spot.name, 'ja')
      );
  }

  // 「（2回目）」「2回目」「3回目」などを外して同じキャンプ場としてまとめる
  function baseName(name) {
    return name
      .replace(/[（(]\s*\d+\s*回目\s*[）)]/g, '')
      .replace(/\s*\d+\s*回目\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isTrip(c) {
    return (c.nights || 0) > 0;
  }

  function normKey(name) {
    return baseName(name).toLowerCase().replace(/[\s・／/「」]/g, '');
  }

  // 同じキャンプ場の記録をまとめる。表記ゆれ（「しあわせの村」と「しあわせの村オートキャンプ場」など）は
  // 片方の名前がもう片方に含まれていれば同じ場所とみなす。
  function groupVisits(camps) {
    const groups = [];
    const trips = camps.filter(isTrip).slice().sort((a, b) => b.name.length - a.name.length);
    for (const c of trips) {
      const key = normKey(c.name);
      const g = groups.find(
        (x) =>
          (c.napUrl && x.napUrls.has(c.napUrl)) ||
          x.key === key ||
          (key.length >= 4 && x.key.includes(key)) ||
          (x.key.length >= 4 && key.includes(x.key))
      );
      if (g) {
        g.visits.push(c);
        if (c.napUrl) g.napUrls.add(c.napUrl);
      } else {
        groups.push({ key, visits: [c], napUrls: new Set(c.napUrl ? [c.napUrl] : []) });
      }
    }
    for (const g of groups) {
      g.visits.sort((a, b) => (a.date < b.date ? 1 : -1));
      g.latest = g.visits[0];
      // 表示名は一番長い（＝正式名に近い）名前を使う
      g.name = baseName(g.visits.map((v) => v.name).sort((a, b) => b.length - a.length)[0]);
      g.napUrl = g.visits.map((v) => v.napUrl).find(Boolean) || null;
      g.siteUrl = g.visits.map((v) => v.siteUrl).find(Boolean) || null;
    }
    return groups;
  }

  // 履歴から「また行きたい」候補：最新の評価が★4以上・季節が合う
  function revisitPicks(camps, season, limit) {
    const picks = [];
    for (const g of groupVisits(camps)) {
      const c = g.latest;
      const rating = c.rating || 0;
      if (rating < 4) continue;
      const seasons = g.visits.map((v) => v.seasons || []).find((x) => x.length) || [];
      const match = seasonMatches(seasons, season);
      if (match === false) continue;
      const best = Math.max(...g.visits.map((v) => v.rating || 0));
      let score = rating * 10 + best * 2;
      if (c.kids === '大喜び🎉') score += 10;
      if (match === true) score += 5;
      picks.push({ camp: c, name: g.name, napUrl: g.napUrl, siteUrl: g.siteUrl, visits: g.visits.length, score });
    }
    picks.sort((a, b) => b.score - a.score || (b.camp.date > a.camp.date ? 1 : -1));
    return picks.slice(0, limit || 3);
  }

  function stats(camps) {
    const trips = camps.filter(isTrip);
    const prefs = new Set(trips.map((c) => c.pref).filter((p) => p && p !== 'その他'));
    const groups = groupVisits(camps);
    return {
      trips: trips.length,
      nights: trips.reduce((s, c) => s + (c.nights || 0), 0),
      prefectures: prefs.size,
      spots: groups.length,
      repeatSpots: groups.filter((g) => g.visits.length > 1).length,
      fiveStars: trips.filter((c) => c.rating === 5).length,
    };
  }

  function filterCamps(camps, opts) {
    const q = (opts.query || '').trim().toLowerCase();
    let list = camps.filter((c) => {
      if (opts.pref && c.pref !== opts.pref) return false;
      if (opts.minRating && (c.rating || 0) < opts.minRating) return false;
      if (opts.kids && c.kids !== opts.kids) return false;
      if (q) {
        const hay = [c.name, c.pref, c.memo, c.place, (c.facilities || []).join(' ')]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const sort = opts.sort || 'new';
    list = list.slice().sort((a, b) => {
      if (sort === 'old') return a.date < b.date ? -1 : 1;
      if (sort === 'rating') return (b.rating || 0) - (a.rating || 0) || (a.date < b.date ? 1 : -1);
      return a.date < b.date ? 1 : -1;
    });
    return list;
  }

  function isNapUrl(url) {
    return typeof url === 'string' && /^https:\/\/(www\.)?nap-camp\.com\//.test(url);
  }

  return {
    toISODate,
    parseDate,
    upcomingWeekend,
    seasonOf,
    seasonMatches,
    scoreSpot,
    rankWishlist,
    baseName,
    groupVisits,
    revisitPicks,
    stats,
    filterCamps,
    isNapUrl,
  };
});
