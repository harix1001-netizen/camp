// node --test tests/*.test.mjs で実行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const R = require('../js/record.js');

const base = { name: ' 青川峡キャンピングパーク ', date: '2026-11-21', nights: '2', rating: '5', pref: '三重', facilities: ['川・水遊び'], seasons: ['秋'] };

test('normalize: 正常な入力を整える', () => {
  const res = R.normalize(base);
  assert.equal(res.ok, true);
  const r = res.record;
  assert.equal(r.name, '青川峡キャンピングパーク');
  assert.equal(r.nights, 2);
  assert.equal(r.dateEnd, '2026-11-23');
  assert.equal(r.rating, 5);
  assert.equal(r.price, null);
  assert.equal(r.memo, null);
});

test('normalize: 泊数が空なら1泊、0泊なら終了日なし', () => {
  assert.equal(R.normalize({ ...base, nights: '' }).record.nights, 1);
  const r = R.normalize({ ...base, nights: '0' }).record;
  assert.equal(r.nights, 0);
  assert.equal(r.dateEnd, null);
});

test('normalize: 月またぎ・年またぎの終了日', () => {
  assert.equal(R.normalize({ ...base, date: '2026-12-31', nights: 1 }).record.dateEnd, '2027-01-01');
});

test('normalize: 必須項目と不正な値をはじく', () => {
  const res = R.normalize({ name: '', date: '2026-02-30', nights: 'x', rating: 7, pref: '東京', facilities: ['謎'], napUrl: 'javascript:alert(1)' });
  assert.equal(res.ok, false);
  const msg = res.errors.join('\n');
  for (const s of ['キャンプ場名', '訪問日', '泊数', '評価', '都道府県', '設備', 'なっぷURL']) assert.ok(msg.includes(s), s);
});

test('toNotionProperties: Notionの形に変換', () => {
  const r = R.normalize({ ...base, memo: 'あ'.repeat(2500), kids: '大喜び🎉', price: '8800' }).record;
  const p = R.toNotionProperties(r);
  assert.equal(p['キャンプ場名'].title[0].text.content, '青川峡キャンピングパーク');
  assert.deepEqual(p['訪問日'].date, { start: '2026-11-21', end: '2026-11-23' });
  assert.equal(p['評価'].select.name, '⭐⭐⭐⭐⭐');
  assert.equal(p['料金（円）'].number, 8800);
  assert.equal(p['メモ・感想'].rich_text.length, 2);
  assert.equal(p['メモ・感想'].rich_text[0].text.content.length, 2000);
  assert.deepEqual(p['設備'].multi_select, [{ name: '川・水遊び' }]);
  assert.equal(p['天気'], undefined);
  assert.equal(p['なっぷURL'], undefined);
});
