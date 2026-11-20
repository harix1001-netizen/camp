#!/usr/bin/env node
// アプリのフォームから送られた記録を Notion「キャンプ記録」DBに1件追加する。
// GitHub Actions（add-camp-record.yml）から呼ばれる。
// 使い方: NOTION_TOKEN=xxx RECORD='{"name":"...","date":"2026-11-21",...}' node scripts/add-notion-record.mjs
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalize, toNotionProperties } = require('../js/record.js');

const CAMP_DB = process.env.NOTION_CAMP_DB || '1fc479e18be94c878f419e146f820c52';

async function main() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error('NOTION_TOKEN が設定されていません');

  let input;
  try {
    input = JSON.parse(process.env.RECORD || '');
  } catch (e) {
    throw new Error('RECORD がJSONとして読めません');
  }
  const result = normalize(input);
  if (!result.ok) throw new Error('入力エラー: ' + result.errors.join(' / '));
  const r = result.record;

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ parent: { database_id: CAMP_DB }, properties: toNotionProperties(r) }),
  });
  if (!res.ok) throw new Error(`Notion API ${res.status}: ${await res.text()}`);
  const page = await res.json();
  console.log(`Notionに追加しました: ${r.name}（${r.date}） ${page.url || ''}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
