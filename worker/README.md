# むなかたNOW AI Worker

このWorkerは、むなかたNOWに掲載済みの候補だけから最大3件を選ぶAI提案APIです。

## 安全設計

- ブラウザやGitHubへAI APIキーを置かない
- 候補は最大40件、本文は最大50KB
- 対応している分類以外を拒否
- AI出力のIDを掲載候補と照合
- 存在しない店舗ID、重複ID、長すぎる理由を拒否
- 許可したGitHub Pages origin以外のブラウザ通信を拒否
- AI障害時はフロント側でルール提案へ自動切り替え

## デプロイ

CloudflareアカウントでWorkers AIを利用できる状態にしてから実行します。

```bash
cd worker
npm install
npx wrangler login
npm test
npm run deploy
```

デプロイ後に表示されたWorker URLを、ルートの `ai-config.json` に設定します。

```json
{
  "endpoint": "https://munakata-now-ai.<account>.workers.dev",
  "mode": "ai",
  "version": 1
}
```

その変更をCI通過後にmainへ反映すると、画面の表示が「AI接続可能」に変わります。

## 費用と認証

Workers AIの利用条件・無料枠・料金はCloudflare側で変更される可能性があります。デプロイ前にCloudflareダッシュボードで現在のプランと請求設定を確認してください。認証、規約同意、外部アカウント接続、支払い設定はリポジトリから自動実行しません。
