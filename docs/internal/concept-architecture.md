# Architecture Overview (2025)

Scheduly は、React/webpack 製のフロントエンドと Node.js (Express) 製の in-memory API サーバーで構成された **クライアントサーバー型** アプリです。ここでは現行構成と役割分担、モジュール間の責務、今後の拡張候補を整理します。

## 1. 全体構成

```
┌─────────────┐   https    ┌──────────────┐   http   ┌──────────────────┐
│ React Admin │──────────▶│              │────────▶│ InMemory API      │
│ React User  │◀──────────│   Nginx      │◀────────│ (Express +        │
└─────────────┘            │ (static +   │         │  InMemoryStore)   │
                           │  proxy)     │         └──────────────────┘
```

- フロントエンド: `src/frontend/admin.jsx`（管理画面）、`src/frontend/user.jsx`（参加者画面）。Webpack が `index.bundle.js` / `user.bundle.js` を生成し、Nginx から配信。
- バックエンド: `src/server/` 以下の Express アプリ。`InMemoryProjectStore` が `Map<projectId, ProjectState>` を保持し、REST API で CRUD・共有トークン発行・集計を提供。
- 共有 URL ルーティング: `/a/{token}`（管理者） / `/p/{token}`（参加者）。Nginx で `/p` / `/r` を `user.html` にリライトする。
- `.env` で `SCHEDULY_API_BASE_URL` / `SCHEDULY_SHARE_BASE_URL` を指定し、`runtime-config` が API ベース URL を検出する。

## 2. フロントエンド詳細

```
public/
├── index.html     # 管理画面
├── user.html      # 参加者画面
└── assets/
    └── tailwind.css  # `npm run css:build` で生成
src/frontend/
├── admin.jsx
├── user.jsx
├── services/        # project/schedule/participant/response/tally/summary
├── store/project-store.js
└── shared/          # runtime-config, date-utils, mutation-message 等
```

- **Tailwind**: PostCSS/Tailwind CLI で事前ビルド (`npm run css:build`)。CDN ではなくローカル CSS を読み込む。
- **projectStore**: sessionStorage をキャッシュとして使いながら、API snapshot を反映する。`projectService` が route resolution と subscribe を担当。
- **tallyService / summaryService**: API から受け取った state をビュー用に整形し、○△× 集計を再計算。
- **client/services**: API 呼び出しは `api-client`（fetch ラッパー）経由で実装。`responseService.upsert` → `tallyService.recalculate` → `summaryService.build*View` のループで UI を再描画。

## 3. バックエンド詳細

```
src/server/
├── app.js          # Express 初期化、CORS、JSON、ヘルスチェック
├── index.js        # 起動エントリ
├── store.js        # InMemoryProjectStore
├── routes/projects.js
├── logger.js / telemetry.js
└── routes/dev-log.js (development helper)
```

- `InMemoryProjectStore`: `project`, `candidates`, `participants`, `responses`, `icsText`, `shareTokens`, `versions`, `derived.tallies` を保持。バージョン検証や競合検知、共有トークン生成、回答集計もここに実装。
- `routes/projects.js`: `/api/projects/*` の CRUD。共有トークンを `/share/:type/:token` で解決。ICS/JSON の import/export を同期レスポンスで提供。
- `logger` / `telemetry`: 構造化ログと簡易メトリクス (`/api/metrics`) を提供。ヘルスチェックは `/api/healthz` / `/api/readyz`。
- データは揮発（プロセス再起動で消える）。再利用したい場合は JSON/ICS のエクスポートで外部保全する。

## 4. API とデータモデル

| エンティティ | 主なフィールド |
|--------------|----------------|
| Project      | `projectId`, `name`, `description`, `defaultTzid`, `shareTokens`, `createdAt`, `updatedAt` |
| Candidate    | `candidateId`, `uid`, `dtstart`, `dtend`, `status`, `sequence`, `dtstamp`, `location`, `description` |
| Participant  | `participantId`, `displayName`, `comment`, `token`, `version` |
| Response     | `participantId`, `candidateId`, `mark`, `comment`, `version`, `updatedAt` |

- バージョン管理: `metaVersion`, `candidatesVersion`, `candidatesListVersion`, `participantsVersion`, `responsesVersion`, `shareTokensVersion`。API は `version` / `If-Match` を要求し、競合時は 409 を返す。
- 派生データ: `derived.tallies` で候補別/参加者別の ○△× 集計を保持。`summaryService` が UI 表示用に整形。

## 5. デプロイと運用

- さくら VPS（Ubuntu 24.04）での最小セットアップは `docs/internal/deploy-sakura-vps.md` を参照。Node.js 20 + systemd + Nginx + Let’s Encrypt で運用。
- API は `Scheduly` ユーザーで常駐し、`dist/` を Nginx が配信。`/p`/`/r` の rewrite ルールを忘れず追加。
- 監視: `journalctl -u scheduly-api`、`/var/log/nginx/`、`/api/metrics`、`certbot renew --dry-run`。

## 6. 今後の拡張課題

| 項目 | 内容 |
| ---- | ---- |
| 永続化 | SQLite/PostgreSQL などへの移行。InMemoryStore のインターフェースを抽象化してバックエンドを差し替え可能にする。 |
| 認証 | 管理者に対する最低限の認証（Basic Auth など）や参加者トークンの失効機能。 |
| 通知 | 回答締切リマインダーや確定日時通知。ICS 添付メール配信など。 |
| 観測 | `/api/metrics` の Prometheus 対応、エラーログアラート。 |
| 自動テスト | E2E シナリオ (参加者回答〜エクスポート) を Cypress 等で自動化。 |
| バックアップ | JSON/ICS の定期出力、自動アップロードの仕組み。 |

## 7. 関連ドキュメント

- `docs/internal/spec-server-integration.md`: サーバー側アーキテクチャと運用詳細。
- `docs/internal/spec-api-flow.md`: API の詳細フロー、楽観更新、エラーハンドリング。
- `docs/internal/spec-data-model.md`: ProjectState/レスポンスの型定義。
- `docs/internal/ref-screen-tech-overview.md`: 画面別の技術構成とデータフロー。
- `docs/internal/deploy-sakura-vps.md`: ベータ公開の手順書。

本ドキュメントは実装状況に合わせて更新します。構成変更や永続化対応を行った際は、この概要も必ずキャッチアップしてください。
