# Server Integration Plan (Draft)

このドキュメントは、Scheduly がクライアントサイド完結の実装からサーバー連携へ移行する際に検討すべきポイントを整理するためのたたき台です。現時点では詳細が未確定のため、TBD 項目を含むラフな構成になっています。

## 目的と前提

- 現行: `projectStore` がブラウザの `sessionStorage` を利用し、すべてのロジックがクライアント内で完結
- 初期サーバ実装: **単一プロセス / オンメモリ** の Node.js アプリとして立ち上げ、永続ストレージを持たない揮発運用を起点とする（プロセス再起動時に状態は消える前提）
- スケールアウトやマルチプロセス対応は後続フェーズで検討し、初期段階では単一ノード内でのトークン配布・ICS 生成・回答集計を完結させる
- 目標: Node.js ベースのサーバーを導入しても既存の JavaScript スタックを活かしつつ、永続化と複数クライアントの整合性を確保する
- 範囲: API 設計、ストレージ選定、データ移行手順、テスト/CI への影響

## 段階的移行プラン（ドラフト）

1. **API スケルトン作成（TBD）**  
   - Express などで `/projects`, `/candidates`, `/participants`, `/responses` の CRUD を定義する  
   - 認証/トークンの扱いは別ドキュメントで検討
2. **データストア選定（TBD）**  
   - 選択肢: SQLite, PostgreSQL, Document Store など  
   - モックとの親和性を考慮して JSON 互換スキーマから検討
3. **クライアントの段階移行**  
   - `sessionStorage` への書き込み箇所をラップし、API 経由の fetch へ差し替え可能な構造を用意（現状は API 専用に統一済み）
4. **ICS ワークフローへの組み込み（TBD）**  
   - ファイルアップロード/ダウンロードのハンドリング  
   - ICS の差分更新をサーバー側でどう管理するか

## 揮発性バックエンド（初期実装）方針

最初のサーバ導入は、あくまでフロントの `sessionStorage` 実装を置き換える最小機能に限定し、可観測性・競合検知の基礎を整えることを目的とする。永続ストレージや分散構成は後続フェーズで検討する。

### ランタイム構成

- Node.js + Express（または同等の軽量 HTTP フレームワーク）を単一プロセスで起動する。
- プロセス内に `Map<projectId, ProjectState>` を保持する in-memory ストアを実装し、API ハンドラからのみアクセスさせる。`ProjectState` はフロントの `projectStore` と同等の構造（`project`, `candidates`, `participants`, `responses`, `icsText`, `shareTokens`, `versions`）を持つ。
- プロセス再起動＝全データ消失となる点を運用文書に明示し、ステートレスなサンプル用途（PoC/デモ）として扱う。

### API スコープ

- ルート: `/api/projects/:projectId`
- サブリソース:
  - `GET/PUT` `/meta` – プロジェクト名・説明・タイムゾーンなどのメタ情報
  - `GET/POST/PUT/DELETE` `/candidates` – 候補 CRUD、一覧更新（順序変更）には `If-Match` or `candidatesListVersion`
  - `GET/POST/PUT/DELETE` `/participants`
  - `GET/POST/PUT/DELETE` `/responses`
  - `POST` `/share/rotate` – 管理者/参加者トークンの再発行
  - `GET` `/snapshot` – 一括取得。`projectStore` へ流し込める JSON 全体を返す
- レスポンスはフロントと共通の型 (`src/shared/types.ts` を共用予定) を採用し、`version` を必須フィールドとして返す。

### データ分離とバージョン管理

- `ProjectState` 内で以下のバージョン番号を保持する。
  - `metaVersion`
  - `candidatesVersion` と `candidatesListVersion`
  - `participantsVersion`
  - `responsesVersion`（行単位は `Response.version` として保持）
  - `shareTokensVersion`
- 書き込み系 API は `If-Match` ヘッダまたはリクエスト Body の `version` を要求し、不一致の場合は 409 を返却。レスポンスに最新値を含め、クライアントがロールバック後に再送できるようにする。
- 行単位での衝突検知が必要な `Response` は、`{ participantId, candidateId }` キーでバージョンを持たせる。候補一覧や参加者一覧はリスト全体も別バージョンを持つ。

### マルチプロジェクト対応方針（新規）

- これまでは「単一の `demo-project` をブラウザの Web Storage で共有する」前提だったが、今後は **プロジェクト ID ごとに完全に独立した shareTokens/state** を管理する。本番ホスティングを想定した際に、別セッションで以前の管理 URL が表示される挙動は NG。
- API サーバーは `projectId` をキーに `Map<projectId, ProjectState>` を保持し、共有トークン・候補・参加者などすべてをプロジェクト単位で切り分ける。ブラウザが `/`（トークンなし）へアクセスした場合は **新規プロジェクトを生成** し、プレースホルダー shareTokens と空の state を返す。
- 管理 URL (`/a/{token}`) でアクセスされた場合のみ既存プロジェクトをロードする。ルート直叩きや新しいセッションでは、以前に発行したトークンを暗黙に引き継がない。
- 共有 URL を発行したあとにブラウザを閉じても、サーバーに保存された `shareTokens` はそのプロジェクトにのみ紐づく。他セッションで同じ state が見えてしまうのは仕様として許容せず、必ずトークン（もしくは projectId 明示指定）でアクセスした場合だけ既存データが取れるようにする。
- この方針を念頭に、ルーティング／プロジェクト初期化 API／`projectService.resolveProjectFromLocation()` の仕様を段階的に更新する。最終形では「URL を知らない限り他人のプロジェクトを覗けない」ことをサーバー側でも保証する。

### 起動時と終了時の扱い

- プロセス初期化時は空のストアから開始し、リクエストを受けて初めて `ProjectState` を生成する。デモ用途で初期データが必要な場合は、外部 CLI や管理 API から `snapshot` をロードする方針とする。
- シャットダウン時は特別な永続化は行わないが、将来の永続化を見据えて `serializeState()` ヘルパーを用意しておく。
- 監視目的で `/api/healthz` `/api/readyz` の結果に `uptime`, `projectCount` などのメタ情報を追加できるようにする。

### ファイル入出力

- ICS / JSON エクスポートは同期処理で返す。`GET /api/projects/:projectId/export/ics` は `text/calendar`、`GET /api/projects/:projectId/export/json` は `application/json` + `Content-Disposition: attachment`。生成は都度行い、ジョブキューは使わない。
- インポート（JSON/ICS）は `multipart/form-data` または JSON payload とし、サーバ側で `ProjectState` へマージする。現行のフロント `importState` と同じ整合チェック（UID/DTSTAMP 比較）を行う。
- ファイルサイズ上限（例: 1 MB）とリクエストタイムアウトを明文化しておき、413 や 422 の返却ポリシーを合わせて `spec-api-flow.md` へ記載する。
- トークン権限チェック: 管理者トークンのみエクスポート/インポート可。参加者トークンはアクセス拒否（403）。揮発版ではレスポンス生成後に監査ログ（リクエスト ID, tokenType, ファイル種別）を残す。

### 権限・セキュリティ

- 当面は共有トークンをベアラートークンとして利用し、`Authorization: Bearer <token>` ヘッダで認証する。管理者トークンと参加者トークンを区別し、エンドポイントごとに許可範囲をチェックする。
- 管理者トークンでのアクセス時は全 API を許可、参加者トークンでのアクセス時は `GET /snapshot`（回答者向けビュー）と自分の `POST/PUT /responses` のみに限定する。
- ログにはトークン値を直接出さず、ハッシュ化（SHA-256 の先頭数文字など）して記録する。

### 運用上の留意

- プロセスが落ちた場合は復元手段がないため、PoC として扱う。安定運用や SLA が必要になった段階で永続ストレージ（SQLite/PostgreSQL 等）への移行を計画する。
- 定期的に `/snapshot` で取得した JSON を外部へバックアップする CLI を用意すると検証時の再現が容易になる。
- 将来の永続化に備えて、API レイヤはリポジトリインターフェース（`ProjectRepository`）を間に挟み、実装を `MemoryRepository` から `SqlRepository` へ差し替えられるようにする。

### ログ／モニタリング基盤（初期構成）

- **構造化ログ**
  - 書式は JSON 行（1 行 1 レコード）。`{ timestamp, level, message, context }` を基本とし、`context` に `projectId`（ハッシュ化）、`operation`, `tokenType`, `durationMs`, `statusCode`, `requestId` を含める。
  - レベル定義: `info`（通常リクエスト）、`warn`（4xx）、`error`（5xx・未捕捉例外）、`debug`（開発用）。409 は `info`＋`conflict.reason` を記録。
  - 揮発版は stdout へ出力し、ローカル開発では `LOG_LEVEL=debug` で詳細表示。本番想定ではファイルローリングもしくは stdout → Collect Agent を前提とする。

- **保存とマスキング**
  - トークン値・コメント等の個人情報はログに残さない。必要に応じて `hashToken(token)`（SHA-256 の先頭 8 文字）や `sanitizePII(text)` でマスクする。
  - プロジェクト ID は `hashProjectId(projectId)` で匿名化し、アクセス集計時のみ利用。
  - 保存期間は初期段階で 30 日。古いログは自動削除（外部保存先を利用する場合も同水準を目指す）。

- **アクセス監視**
  - API ミドルウェアで Access Log を記録（リクエスト開始時に `requestId` を発行）。レスポンス完了時に `durationMs` を算出し、閾値（例: 1.5s）を超えた場合は `warn` を出力。
  - 重要操作（共有URL発行、ICS/JSON エクスポート、インポート、デモプロジェクトインポート、プロジェクト削除）は `operation` を `critical` とし、別ストリーム（監査ログ）にも複製。

- **メトリクス**
- まずは Application Logs から計算できるサマリ（リクエスト数、4xx/5xx レート、平均レスポンス）を想定。将来的に Prometheus 等を導入する場合は `/api/metrics` エンドポイントで `http_request_duration_seconds` Histogram などを公開する。
- 実装済み: `/api/metrics` でリクエスト数・エラーレート・ルート別ステータス分布・最近のエラーを JSON で取得できる。Prometheus 等に移行する際はこのルートから移し替える。
  - フロントエンドでも `performance.now()` を用いて主要操作の所要時間を計測し、`debug` レベルで出力（将来の RUM 基盤を見据える）。

- **アラート**
  - 初期段階ではダッシュボード上での目視確認を前提。永続環境へ移行する際には以下の閾値でアラートを設定: 5xx レート > 2%（5 分間平均）、平均レスポンス > 2s、連続失敗（共有 URL 発行/エクスポート）3 回以上。

- **ダッシュボード**
  - ログ集約基盤（Datadog, Loki+Grafana 等）を想定し、標準ダッシュボードに「総リクエスト数」「ステータス別件数」「重要操作ログ一覧」「平均レスポンス時間」「エラーメッセージ Top5」を配置する。
  - 監査向けには `operation=critical` のログを日付降順で確認できるビューを用意する。

- **落とし穴と対策**
  - ログ量肥大を避けるため、`debug` ログは開発時のみ。リリース時には `LOG_LEVEL=info`。
  - エラー情報にスタックトレースを含める場合も、個人情報やトークンが混じらないよう `sanitizeError()` を通す。
  - 将来的に永続ストレージへ移行したら、DB 側でも Slow Query ログやエラーログを取る計画を別途策定する。

## サーバー健全性エンドポイント

最小構成の Node.js サーバーでも、稼働監視のためのヘルスチェックを提供する。

- `GET /api/healthz`
  - 目的: プロセスが起動し、HTTP ハンドラが応答できるかを確認するライブネスチェック。
  - 実装: 常に 200/`{"status":"ok"}` を返す（将来的に依存モジュール診断を足しても良い）。外部依存のチェックは含めない。
  - 運用: コンテナの `livenessProbe` や外形監視から定期ポーリング。

- `GET /api/readyz`
  - 目的: 初期化が完了し、リクエストを受け付けられる状態かを判定するレディネスチェック。
  - 実装: 起動時の初期ロード（設定読み込み、キャッシュウォーム、バックグラウンドジョブ初期化など）が完了していれば 200/`{"status":"ready"}`、未完了の場合は 503/`{"status":"starting"}` を返す。
  - 運用: ロードバランサや Kubernetes `readinessProbe` から利用し、503 を受け取った場合はトラフィックを振らない。

レスポンスボディは JSON 固定とし、追加メタデータ（ビルド番号やチェック項目）は `meta` フィールドで拡張する。API 認証は不要だが、外部公開する環境では IP 制限やヘッダ検証を前段で行う。

## テスト・CI への影響（メモ）

- API 層追加後のユニットテスト/統合テスト戦略（未策定）
- CI 上での lint / test 実行コマンドの拡張（TBD）
- ブラウザ E2E テスト導入のタイミング検討

## 未決事項 / ToDo

- [ ] 認証・アクセス制御の方式を検討する
- [ ] 本番ホスティング環境の候補を列挙する
- [ ] データ移行のリハーサル手順を決める

> このファイルは随時更新予定です。決定事項が固まり次第、各セクションを具体化していきます。
