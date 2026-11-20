# camp

家族キャンプの「キャンプ手帳」。GitHub Pages でそのまま動く静的サイトです。

- `index.html` … トップページ
  - **週末おすすめ**：Notionの未訪問リストを「優先度・季節・北摂からの距離」で並べ、なっぷへのリンクを表示。過去の★4以上で季節が合う場所も「また行きたい」として表示
  - **キャンプ履歴**：Notionのキャンプ記録を検索・絞り込み・並べ替え。回数・泊数・リピート数などの集計つき
  - **＋ キャンプを記録する**：アプリのフォームから Notion のキャンプ記録に1件追加（下の「アプリから記録する」を参照）
- `camp.html` / `kinki-blog.html` … 以前からあるページ（そのまま残しています）

## データ

| ファイル | 元データ |
| --- | --- |
| `data/camps.json` | Notion「🏕️ キャンプ記録」 |
| `data/wishlist.json` | Notion「🏕️ キャンプ場おすすめリスト（未訪問）」 |

### Notionから更新する

1. Notion で[インテグレーション](https://www.notion.so/profile/integrations)を作り、2つのDBの「…」→「接続」から追加する
2. 手元で更新する場合: `NOTION_TOKEN=xxx npm run sync`
3. 自動更新する場合: リポジトリの Settings → Secrets and variables → Actions に `NOTION_TOKEN` を登録する。
   毎週金曜18時（JST）に `.github/workflows/sync-notion.yml` が動き、変更があればコミットします（Actions タブから手動実行も可）

### アプリから記録する

フォームの送信 → GitHub Actions（`.github/workflows/add-camp-record.yml`）→ Notionに追加 → `data/` を同期してコミット、の順に動きます。反映まで1〜2分です。公開ページにNotionの鍵を置かないため、この形にしています。

初回だけ次の2つを設定します。

1. 上の「Notionから更新する」の1と3（インテグレーションの接続と `NOTION_TOKEN` の登録）
2. GitHub の Settings → Developer settings → Fine-grained tokens でトークンを作る
   - Repository access: `camp` だけ
   - Permissions: Actions を「Read and write」
   - 作ったトークンを、アプリのフォームの「GitHubトークンの設定」に貼り付ける（そのブラウザの中だけに保存されます）

## ローカルで見る

```sh
npm start   # http://localhost:8000
npm test
```
