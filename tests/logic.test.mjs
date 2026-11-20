// node --test tests/ で実行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { toCamp, toSpot } from '../scripts/sync-notion.mjs';

const require = createRequire(import.meta.url);
const L = require('../js/logic.js');
const camps = require('../data/camps.json').camps;
const spots = require('../data/wishlist.json').spots;

test('upcomingWeekend: 平日は次の土日', () => {
  const { saturday, sunday } = L.upcomingWeekend(new Date(2026, 10, 20)); // 金
  assert.equal(L.toISODate(saturday), '2026-11-21');
  assert.equal(L.toISODate(sunday), '2026-11-22');
});

test('upcomingWeekend: 土日当日はその週末', () => {
  assert.equal(L.toISODate(L.upcomingWeekend(new Date(2026, 10, 21)).saturday), '2026-11-21');
  assert.equal(L.toISODate(L.upcomingWeekend(new Date(2026, 10, 22)).saturday), '2026-11-21');
});

test('seasonOf', () => {
  assert.equal(L.seasonOf(new Date(2026, 10, 21)), '秋');
  assert.equal(L.seasonOf(new Date(2026, 11, 5)), '冬');
  assert.equal(L.seasonOf(new Date(2026, 6, 1)), '夏');
  assert.equal(L.seasonOf(new Date(2026, 2, 1)), '春');
});

test('baseName: 何回目の表記を外す', () => {
  assert.equal(L.baseName('グリーンパーク山東（3回目）'), 'グリーンパーク山東');
  assert.equal(L.baseName('南光自然観察村2回目'), '南光自然観察村');
  assert.equal(L.baseName('CAUNA Nara Uda（平成榛原）2回目'), 'CAUNA Nara Uda（平成榛原）');
});

test('rankWishlist: 秋は夏限定の場所が下がる', () => {
  const ranked = L.rankWishlist(spots, '秋');
  assert.equal(ranked[0].spot.name, '青川峡キャンピングパーク'); // 優先度S・秋OK
  const summerOnly = ranked.filter((r) => r.spot.seasons.length === 1 && r.spot.seasons[0] === '夏');
  assert.ok(summerOnly.length > 0);
  assert.ok(summerOnly.every((r) => r.offSeason));
  const lastInSeason = ranked.filter((r) => !r.offSeason).at(-1);
  assert.ok(summerOnly.every((r) => r.score < lastInSeason.score));
});

test('revisitPicks: ★4以上で季節が合い、同じ場所は1件にまとまる', () => {
  const picks = L.revisitPicks(camps, '秋', 10);
  assert.ok(picks.length > 0);
  const names = picks.map((p) => p.name);
  assert.equal(new Set(names).size, names.length);
  for (const p of picks) {
    assert.ok(p.camp.rating >= 4);
    assert.notEqual(L.seasonMatches(p.camp.seasons, '秋'), false);
  }
  const sando = picks.find((p) => p.name === 'グリーンパーク山東');
  assert.equal(sando.visits, 3);
});

test('groupVisits: 表記ゆれをまとめる', () => {
  const groups = L.groupVisits(camps);
  const find = (n) => groups.find((g) => g.visits.some((v) => v.name === n));
  assert.equal(find('しあわせの村'), find('しあわせの村オートキャンプ場'));
  assert.equal(find('konze3回目').visits.length, 3);
  assert.equal(find('やまもりサーキット').visits.length, 3);
  assert.notEqual(find('南光自然観察村'), find('グリーンパーク山東'));
});

test('stats: 中止の回は数えない', () => {
  const s = L.stats(camps);
  assert.equal(s.trips, camps.filter((c) => c.nights > 0).length);
  assert.ok(s.repeatSpots > 0);
});

test('filterCamps: 検索・評価・並べ替え', () => {
  const r = L.filterCamps(camps, { query: '温泉', minRating: 5, sort: 'new' });
  assert.ok(r.length > 0);
  assert.ok(r.every((c) => c.rating === 5));
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].date >= r[i].date);
});

test('isNapUrl', () => {
  assert.ok(L.isNapUrl('https://www.nap-camp.com/shiga/11418'));
  assert.ok(!L.isNapUrl('https://fbi-camping.com/daisen/'));
});

test('sync: Notionのページをアプリの形に変換', () => {
  const page = {
    properties: {
      ID: { type: 'unique_id', unique_id: { number: 41 } },
      キャンプ場名: { type: 'title', title: [{ plain_text: 'グリーンパーク山東（3回目）' }] },
      訪問日: { type: 'date', date: { start: '2026-05-05', end: '2026-05-06' } },
      泊数: { type: 'number', number: 1 },
      評価: { type: 'select', select: { name: '⭐⭐⭐⭐⭐' } },
      設備: { type: 'multi_select', multi_select: [{ name: '電源あり' }] },
      なっぷURL: { type: 'url', url: null },
      'メモ・感想': { type: 'rich_text', rich_text: [{ plain_text: 'メモ' }] },
    },
  };
  const c = toCamp(page);
  assert.equal(c.id, 41);
  assert.equal(c.rating, 5);
  assert.equal(c.dateEnd, '2026-05-06');
  assert.deepEqual(c.facilities, ['電源あり']);
  assert.deepEqual(c.seasons, []);
  assert.equal(c.memo, 'メモ');
  assert.equal(c.pref, null);

  const s = toSpot({ properties: { キャンプ場名: { type: 'title', title: [{ plain_text: 'X' }] }, 優先度: { type: 'select', select: { name: 'S' } } } });
  assert.equal(s.priority, 'S');
});
