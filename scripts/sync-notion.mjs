#!/usr/bin/env node
// NotionのDBから data/camps.json と data/wishlist.json を作り直す。
// 使い方: NOTION_TOKEN=secret_xxx node scripts/sync-notion.mjs
// 事前に Notion のインテグレーションを2つのDBに「接続」しておくこと。
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const CAMP_DB = process.env.NOTION_CAMP_DB || '1fc479e18be94c878f419e146f820c52';
const WISH_DB = process.env.NOTION_WISH_DB || '4a922358860f4a7aae1197b2a0db006e';
const NOTION_VERSION = '2022-06-28';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function queryAll(dbId, token) {
  const rows = [];
  let cursor;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 }),
    });
    if (!res.ok) throw new Error(`Notion API ${res.status}: ${await res.text()}`);
    const body = await res.json();
    rows.push(...body.results);
    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor);
  return rows;
}

// --- プロパティの取り出し ---
const text = (p) => {
  if (!p) return null;
  const arr = p.type === 'title' ? p.title : p.type === 'rich_text' ? p.rich_text : null;
  if (!arr) return null;
  const s = arr.map((t) => t.plain_text).join('').trim();
  return s || null;
};
const select = (p) => (p && p.type === 'select' && p.select ? p.select.name : null);
const multi = (p) => (p && p.type === 'multi_select' ? p.multi_select.map((o) => o.name) : []);
const num = (p) => (p && p.type === 'number' ? p.number : null);
const url = (p) => (p && p.type === 'url' ? p.url : null);
const dateStart = (p) => (p && p.type === 'date' && p.date ? p.date.start.slice(0, 10) : null);
const dateEnd = (p) => (p && p.type === 'date' && p.date && p.date.end ? p.date.end.slice(0, 10) : null);
const uid = (p) => (p && p.type === 'unique_id' ? p.unique_id.number : null);
const place = (p) => {
  if (!p) return null;
  if (p.type === 'place' && p.place) return p.place.name || p.place.address || null;
  return text(p);
};
const starCount = (s) => (s ? [...s].filter((ch) => ch === '⭐').length || null : null);

export function toCamp(page) {
  const p = page.properties;
  return {
    id: uid(p['ID']),
    name: text(p['キャンプ場名']),
    date: dateStart(p['訪問日']),
    dateEnd: dateEnd(p['訪問日']),
    nights: num(p['泊数']),
    pref: select(p['都道府県']),
    rating: starCount(select(p['評価'])),
    kids: select(p['子ども評価']),
    weather: select(p['天気']),
    access: select(p['アクセス（北摂から）']),
    price: num(p['料金（円）']),
    facilities: multi(p['設備']),
    seasons: multi(p['おすすめシーズン']),
    napUrl: url(p['なっぷURL']),
    siteUrl: url(p['公式サイトURL']),
    place: place(p['場所']),
    memo: text(p['メモ・感想']),
    gear: text(p['持ち物メモ']),
  };
}

export function toSpot(page) {
  const p = page.properties;
  return {
    name: text(p['キャンプ場名']),
    pref: select(p['都道府県']),
    priority: select(p['優先度']),
    access: select(p['アクセス（北摂から）']),
    facilities: multi(p['設備']),
    seasons: multi(p['おすすめシーズン']),
    napUrl: url(p['なっぷURL']),
    kids: text(p['子ども向けポイント']),
    memo: text(p['メモ・特徴']),
  };
}

function today() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

async function writeJSON(file, data) {
  await writeFile(path.join(root, file), JSON.stringify(data, null, 2) + '\n');
  console.log(`wrote ${file}`);
}

async function main() {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error('NOTION_TOKEN が設定されていません');
    process.exit(1);
  }
  const [campPages, wishPages] = await Promise.all([queryAll(CAMP_DB, token), queryAll(WISH_DB, token)]);

  const camps = campPages
    .map(toCamp)
    .filter((c) => c.name && c.date) // 名前・日付のない空行は除く
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const spots = wishPages
    .map(toSpot)
    .filter((s) => s.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  const updatedAt = today();
  await writeJSON('data/camps.json', { source: 'Notion「🏕️ キャンプ記録」', updatedAt, camps });
  await writeJSON('data/wishlist.json', { source: 'Notion「🏕️ キャンプ場おすすめリスト（未訪問）」', updatedAt, spots });
  console.log(`camps: ${camps.length}件, wishlist: ${spots.length}件`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
