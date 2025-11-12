# Server Integration Overview

このドキュメントは、Scheduly のフロントエンド（管理/参加者 UI）とバックエンド API の結合方式、現在の運用構成、継続課題をまとめた開発者向けの参照資料です。2025 年初頭時点で、アプリは **クライアントサーバー型** に移行済みであり、さくらの VPS 上でベータ公開を行っています。

## 1. 現行アーキテクチャ

```
┌────────────┐    https           ┌────────────────────┐
│ Admin UI   │ ────────────────▶ │                    │
│ (React,    │                    │  Nginx (static +   │
│ webpack)   │ ◀───────────────┐ │  reverse proxy)    │
└────────────┘    https        │ └──────┬─────────────┘
                                │        │
┌────────────┐    https        │        │ (proxy_pass /api/*)
│ Participant│ ────────────────┘        ▼
│ UI         │                     ┌───────────────┐
└────────────┘                     │ Node.js API   │
                                   │ (Express +    │
                                   │ InMemoryStore)│
                                   └───────────────┘
```

- フロントエンドは `npm run dev`（開発時） / `npm run build`（本番ビルド）で生成され、Nginx から `dist/` を配信。
- API は `src/server/index.js` で起動する Express アプリ。`InMemoryProjectStore` が `Map<projectId, ProjectState>` を保持し、再起動するとデータは消える。
- `.env` で `SCHEDULY_API_BASE_URL` / `SCHEDULY_SHARE_BASE_URL` を指定し、Webpack 定義済みの `runtime-config` から API URL を解決。
- 参加者・管理者 URL は API が発行するトークン（`/a/{token}`, `/p/{token}`）を通じてルーティングされる。フロントは `projectService.resolveProjectFromLocation()` を使い、共有トークン→プロジェクト ID を解決する。

## 2. プロセス構成と主要モジュール

| パス | 役割 |
| ---- | ---- |
| `src/server/app.js` | Express アプリの初期化、CORS、JSON パース、ヘルスチェック、メトリクス。 |
| `src/server/store.js` | InMemoryProjectStore。本体の CRUD、バージョン管理、共有トークン生成、回答集計など。 |
| `src/server/routes/projects.js` | `/api/projects/*` の REST ルーティング。 |
| `src/frontend/services/*-service.js` | フロント側から API を呼び出すラッパー。`projectService` がルート解決・購読を担う。 |
| `src/frontend/services/summary-service.js` / `tally-service.js` | サーバーの派生データをフロント向けに整形。 |

### InMemoryProjectStore の特徴
- `project`, `candidates`, `participants`, `responses`, `shareTokens`, `versions`, `derived.tallies` を１つのオブジェクトで保持。
- `shareTokens` は admin / participant の 2 種類を管理。API で `/share/rotate` を呼ぶと `token`, `url`, `issuedAt` を更新。
- バージョン管理: `metaVersion`, `candidatesVersion`, `candidatesListVersion`, `participantsVersion`, `responsesVersion`, `shareTokensVersion`。書き込み API は version を検証し、競合時は 409 を返す。
- `derived.tallies` は `tallyService.recalculate()` で生成し、候補別・参加者別の ○△× 集計をキャッシュ。

## 3. API サマリー

| メソッド/パス | 説明 |
| ------------- | ---- |
| `POST /api/projects` | 新規プロジェクト作成。管理 URL / 参加者 URL を付与し、空の state を返す。 |
| `GET /api/projects/share/:type/:token` | 共有トークン（admin/participant）から snapshot を取得。 |
| `GET /api/projects/:projectId/snapshot` | プロジェクト全体を一括取得。 |
| `GET/PUT /api/projects/:projectId/meta` | プロジェクト名・説明・タイムゾーンの取得/更新。 |
| `POST /api/projects/:projectId/candidates` | 候補の作成。 |
| `PUT /api/projects/:projectId/candidates/:candidateId` | 候補更新。 |
| `DELETE /api/projects/:projectId/candidates/:candidateId` | 候補削除。 |
| `POST /api/projects/:projectId/candidates/order` | 並び順更新（`candidatesListVersion` を検証）。 |
| `POST /api/projects/:projectId/participants` | 参加者作成。 |
| `PUT /api/projects/:projectId/participants/:participantId` | 参加者更新。 |
| `DELETE /api/projects/:projectId/participants/:participantId` | 参加者削除。 |
| `GET /api/projects/:projectId/participants/:participantId/responses` | 参加者単位の回答一覧。 |
| `POST /api/projects/:projectId/responses` | 回答 Upsert。`{ participantId, candidateId }` ごとに version を持つ。 |
| `DELETE /api/projects/:projectId/responses/:participantId/:candidateId` | 回答削除。 |
| `POST /api/projects/:projectId/share/rotate` | 管理者/参加者 URL を再発行。 |
| `POST /api/projects/:projectId/import` | ICS/JSON のインポート。 |
| `GET /api/projects/:projectId/export` | JSON エクスポート。 |
| `GET /api/projects/:projectId/ics` | ICS エクスポート。 |
| `GET /api/healthz`, `GET /api/readyz`, `GET /api/metrics` | ヘルスチェックと簡易メトリクス。 |

レスポンス型は `src/shared/types.ts` で定義。Zod ベースのバリデーションをフロント/サーバで共有することで、入力サニタイズと型整合性を担保している。

## 4. ルーティングと URL

- 管理画面: `/index.html` から開始し、共有 URL 発行後は `/a/{token}` へ遷移。
- 参加者画面: `/user.html`（開発時）/ `/p/{token}`（本番運用）。`/r/{token}` は後方互換で `/p/{token}` へリダイレクト。
- Nginx のサンプル設定は `docs/internal/deploy-sakura-vps.md#5` を参照。`location ~ ^/(p|r)` を `user.html` に張り替えることで、参加者画面が正しく読み込まれる。

## 5. デプロイ（さくら VPS β環境）

詳細は `docs/internal/deploy-sakura-vps.md` に記載。要点のみ抜粋。

1. **環境**: Ubuntu 24.04 LTS。Node.js 20 (NodeSource) + npm。
2. **ユーザー**: `/home/scheduly/` に Git clone し、`npm ci && npm run build`。
3. **API 起動**: systemd サービス `scheduly-api.service` で `/usr/bin/node src/server/index.js` を常駐。`.env` は以下を想定。
   ```
   PORT=4000
   BASE_URL=https://example.com
   SCHEDULY_SHARE_BASE_URL=https://example.com
   ```
4. **Nginx**: `root dist/`、`/api/` を 127.0.0.1:4000 へ proxy。`/p`/`/r` 向けに `user.html` を返す rewrite を追加。
5. **HTTPS**: `snap install --classic certbot` → `sudo certbot --nginx -d example.com`。
6. **観測**: `journalctl -u scheduly-api` で API ログ、`/var/log/nginx/` でアクセスログを確認。

## 6. ロギング / テレメトリ / ヘルスチェック

- **ログ形式**: `src/server/logger.js` を介して JSON 1 行の構造化ログを出力（`request.start`, `request.complete`, `request.error`）。`X-Request-ID` をレスポンスヘッダに付与。
- **メトリクス**: `GET /api/metrics` がリクエスト数・平均応答時間・最新エラーなどのスナップショットを返す。
- **ヘルスエンドポイント**:
  - `/api/healthz`: 常に 200（HTTP ハンドラが生きているか）。
  - `/api/readyz`: 起動直後は 503、準備完了後は 200。Nginx / LB の readiness probe 用。

## 7. セキュリティと制限事項

- 現行の認証は **共有トークンベース**。URL を知っているだけで管理者/参加者画面へアクセスできるため、リンクの秘匿が大前提。
- API には認証レイヤを設けていない。外部公開時は IP 制限または VPN 配下で利用する想定。
- データは in-memory のため、VPS 再起動・プロセス再起動で消える。UI にもテスト公開中の注意パネルを表示し、利用者に明示している。

## 9. 参考ドキュメント

- `docs/internal/deploy-sakura-vps.md`: さくら VPS でのセットアップ手順。
- `docs/internal/spec-api-flow.md`: API の詳細シーケンス、楽観更新、エラー処理。
- `docs/internal/spec-data-model.md`: ProjectState の構造とフィールド意味。
- `docs/internal/spec-share-url-generation.md`: 共有トークンの規約と発行手順。
- `docs/internal/DEVELOPER_NOTES.md`: 最新の TODO / 完了項目、運用メモ。

本ドキュメントは現行実装を基準としつつ、将来の変更点を随時追記する。永続化や認証方式が決定した場合は、該当セクションを更新して整合性を保つこと。
