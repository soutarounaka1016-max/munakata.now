# むなかたNOW 開発状況

更新日: 2026-07-22

## 完成条件

| 項目 | 状態 | 補足 |
|---|---|---|
| ホーム画面 | 実装済み | 今日の要点、天気、防災 |
| ニュース一覧 | 実装済み | カテゴリ、検索、公式リンク |
| イベント | 実装済み | 宗像ユリックス中心 |
| 保存と再読み込み | 自動確認済み | localStorage |
| レスポンシブ表示 | 自動確認済み | iPad横向き、スマートフォン |
| 通常テスト | 成功 | Node標準テスト |
| データ検証 | 成功 | URL、日付、重複、必須項目 |
| ブラウザ確認 | Chromium成功 | Playwright使用 |
| WebKit確認 | 未確認 | 実行環境にWebKit本体がないため |
| GitHub反映 | 完了 | 完成版PRをmainへマージ済み |
| GitHub Pages | 公開設定待ち | configure-pagesで停止。PagesのSourceをGitHub Actionsにする必要あり |
| 実機Safari | 未確認 | 公開後にiPadで最終確認が必要 |

## 公開を完了するための残作業

1. GitHubのリポジトリ `soutarounaka1016-max/2` を開く
2. `Settings` → `Pages` を開く
3. `Build and deployment` の `Source` を `GitHub Actions` にする
4. `Actions` → `Deploy GitHub Pages` → `Run workflow` を実行する
5. `https://soutarounaka1016-max.github.io/2/` をiPad Safariで確認する

公開確認用の一時PRはmainへマージせず、確認後に閉じています。

## 情報源

- 宗像市公式サイト 新着情報
- 宗像市防災ホームページ
- 宗像ユリックス お知らせ・イベント
- JR九州 運行情報への公式リンク
- Open-Meteo 天気API

## 既知の制約

- 自動取得は公式ページのHTML構造変更で停止する可能性があります。
- 記事本文の無断転載はせず、短い整理文とリンクだけを掲載します。
- AI APIは使用していません。初版の分類と短文化はルールベースです。
