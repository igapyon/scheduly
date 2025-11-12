# Developer Notes

Scheduly のアプリ開発（React/webpack 版）を進める際に参照する開発メモです。全体像は README.md に委譲し、ここでは実装の裏側、デバッグ観点、運用手順、TODO をまとめています。QA 手順は `docs/internal/ref-verify-checklist.md` を参照してください。

外部仕様（方式面・画面挙動・ICS運用）の参照先
- `docs/external/concept-assumptions.md`
- `docs/external/index-screens.md`
- `docs/external/guide-ical-workflow.md`

---

## 1. アプリ構成と開発環境

### 1.1 React / webpack 版（開発中）
- 位置: `src/frontend/`
- エントリーポイント  
  | 画面 | JSX | HTML（初期表示） | 振る舞い |
  | --- | --- | --- | --- |
  | 管理者 | `admin.jsx` | `public/index.html` | `/index.html` → 共有トークン発行後は `/a/{token}` にリダイレクト |
  | 参加者 UI | `user.jsx` | `public/user.html` | `/user.html` → 共有トークン利用時は `/p/{token}` にリダイレクト（`/r/{token}` は後方互換で `/p/{token}` に転送） |
- スタイルは Tailwind を PostCSS/CLI でビルドして適用する（CDN は廃止）。
  - セットアップ: `npm i -D tailwindcss postcss autoprefixer`
  - 初回ビルド: `npm run css:build`（出力: `public/assets/tailwind.css`）
  - 監視ビルド: `npm run css:watch`
  - HTML 側は `<link rel="stylesheet" href="/assets/tailwind.css" />` を読み込む（`public/index.html` / `public/user.html`）
- 開発時: `npm run dev`（`webpack-dev-server` ポート 5173）でホットリロード。  
- ビルド: `npm run build` → `npm run postbuild`（`scripts/copy-static.js` が `public` → `dist` を複製）。  
- **Lint**: UI / ロジック変更時は `npm run lint` をこまめに実行し、共有のコード規約と静的解析の結果を即時フィードバックする。
- **Typecheck**: 共通型や JSDoc 連携の破綻を早期に検知するため、`npm run typecheck`（TypeScript + `checkJs`）も定期実行する。

### 1.2 レガシーモック（HTML 版 / アプリスナップショット）
- 位置: `public/legacy/*.html`
- 技術構成: React 18 (UMD) + Tailwind CDN + Babel Standalone
- 役割: React/webpack 版のスナップショットを定期的に反映する確認用の静的コンテンツ（初期モックとしての役目も残す）
- 確認方法: ブラウザで直接開けば OK

### 1.3 その他の運用メモ
- `public/index.html` / `user.html` で Tailwind CDN を読み込み、管理画面では ical.js CDN も追加読込。  
- 現状はブラウザ `localStorage`（利用不可環境では `sessionStorage`）に状態を保持しているが、本番想定ではサーバー側永続化（API 経由）に移行する前提。
- UI を更新したら `docs/screenshot/*.png` を撮り直し、React 版とレガシーモックの差分を無くす。  
- オンメモリ API サーバの土台が `src/server/` にあり、`npm run api:dev`（既定ポート: 4000）で起動できる。現状は揮発性ストアと基本ルーティング（プロジェクト作成/メタ更新/共有トークン回転に加えて候補の CRUD＋並び替え、参加者の CRUD、回答の upsert/削除/集計ビュー）を提供しており、`docs/internal/spec-server-integration-wip.md` の仕様に沿って順次拡張する。
- `/api/metrics` で直近のアクセス統計（リクエスト数・平均応答時間・ルート別ステータス分布・最新エラー）を JSON で取得できる。簡易監視やローカル検証時に活用する。
- API サーバは `/api/healthz`（常時 200）と `/api/readyz`（起動直後のみ 503、それ以外は 200）で監視でき、すべてのリクエストに `X-Request-ID` と構造化ログを付与している。ログは JSON 1 行形式で `ts/level/msg/...` を含む。`SCHEDULY_API_BODY_LIMIT` で `express.json` の受信上限（既定: `256kb`）を変更できる。共有URLの基準は `SCHEDULY_SHARE_BASE_URL`（または `BASE_URL`）で上書きでき、未指定の場合はフロントエンドから渡された `baseUrl` を優先する。
- フロントエンド側は `window.__SCHEDULY_PROJECT_DRIVER__ = "api"`（または `process.env.SCHEDULY_PROJECT_DRIVER=api`）で API ドライバを有効化できる。ベース URL を変えたい場合は `window.__SCHEDULY_API_BASE_URL__` を指定する。API ドライバ有効時は管理画面のプロジェクト名/説明更新が約600msのディレイ後に PUT `/meta` で同期され、サーバーの `metaVersion` をキャッシュして楽観更新する。同期中は画面上部にステータスが表示され、409/422 等のサーバーエラーはトーストで利用者に通知される。また、共有URLの再発行 (`shareService.rotate`) は API ルートを経由してトークンと `shareTokensVersion` を更新し、初回発行 (`shareService.generate`) も API ドライバ時はサーバー状態に追随する（既存トークンがない場合は自動で `rotate` を呼び出す）。
- 共通のデータ型は `src/shared/types.ts` に TypeScript で集約している。フロント／サーバ双方で `@typedef {import('../shared/types')...}` を用い、プロジェクトスナップショットや共有トークン、候補・参加者の構造を参照する。

### 1.4 サービスドライバの切り替え
- `src/frontend/services/service-driver.js` に共通の driver セレクタを追加。`runtimeConfig.getProjectDriver()` の結果または個別オーバーライドで `local` / `api` を選択できる。
- 参加者・回答・候補・共有トークンの各サービスは `createServiceDriver` で実装を束ね、`set*ServiceDriver('api'|'local')` / `clear*ServiceDriver()` をエクスポートしている。E2E や Storybook 等でモックしたい場合はこれらのフックを使って強制的に local/api を切り替える。
- local driver は従来どおり `projectStore` を直接操作し、API driver は `apiClient` 経由の fetch + 楽観更新を行う。UI から見た場合はいずれも同じ Promise ベースのインターフェースとなる。
- `src/frontend/services/sync-events.js` でサーバー同期イベント（`scope: 'snapshot' | 'meta' | 'mutation'` など）を一元配信する。React 側は `projectService.addSyncListener`（内部で同イベントを再エクスポート）を購読しており、Admin/User 画面では初期スナップショット完了・競合によるロールバック・更新失敗をバナー／トーストで通知する。

---

## 2. ICS 連携の要点

| 注意点 | 内容 |
| --- | --- |
| ICS 生成 | `admin.jsx` は候補ごとに `rawVevent` を保持しつつ、エクスポート時に `.ics` を組み立てる。関連関数: `exportCandidateToIcs` / `exportAllCandidatesToIcs` / `projectStore.exportProjectState` / `projectStore.importProjectState` |
| エラー検知 | 生成失敗時は候補データ付きで `console.error` を出力。Chrome DevTools の Console で必ず確認。 |
| インポート | プレビューは既定で全候補 OFF、既存 UID と一致する候補のみ ON。挙動変更時は `handleIcsImport` と UI をセットで検証。 |

---

## 3. レガシーモック更新ワークフロー

この更新作業は自動化しておらず、人手で実施します（DOM のコピーは手動、整形や見栄えの微調整は生成AIと協力して行う）。

1. `npm run dev` で React 版を起動し、対象画面を開く（例: `http://localhost:5173/index.html`）。
2. Chrome DevTools の Elements タブで対象 DOM を `Copy outerHTML`。
3. `public/legacy/*.html` の該当セクション（多くは `<section>` や `<details>`）を丸ごと置き換え、その後に文言やダミーリンクを微調整。部分更新より「全置換→手直し」が安全。
4. 必要に応じて生成 AI に整形を任せる（改行・クラス整理など細部のみ）。
5. レガシーモックへ貼り付ける際は動作ロジックを追加しない。見栄え再現のみ行い、Tailwind クラスはそのまま利用する。
6. ブラウザでレガシーモックを開き、レイアウト崩れや開閉 UI が破綻していないか確認する。

> スクリーンショット (`docs/screenshot/*.png`) は最新版 UI を共有する材料になる。更新後は同じ手順で撮り直し、差異が出ないようにする。

### 3.1 実務で安定した「丸ごと貼り付け」手順（推奨）
- React 側で対象画面を開き、`<body>` 直下の「アプリルート（root）」配下を選択した状態で `Copy outerHTML` する。
- レガシーモック側では `<body>` 内のラッパー（最上位の `.mx-auto ...` など）から末尾までを「丸ごと置換」する。
- 置換後に以下の軽微なチェックを行う（崩れの早期発見のため）:
  - `hover:border-...` などクラス名のタイプミスが混入していないか
  - `<option>...</option>` の閉じタグ欠落がないか
  - 絵文字や全角記号の文字化けがないか（`�` が出ていないか）
  - `details/summary` の開閉初期状態（`open` 属性）の意図が反映されているか
- 生成 AI に依頼する範囲はあくまで体裁の最小整形（インデント・微修正）のみに留める。DOM の意味（順序や入れ子）は変更しない。

補足: 今後のモック更新は、この「React から body 配下を丸ごとコピー → レガシーに丸ごと貼り付け → 最小整形」の方式を原則とする。生成 AI による再構築より、人間のコピペ + 最小整形の方が確実かつ高速に同期できる。

---

## 4. 開発時の基本オペレーション

- レガシーモックはブラウザで直接確認し、修正後はリロードで反映を確認。
- webpack 版は `npm run dev` を常駐させ、ホットリロードで作業効率を上げる。
- 想定と異なる挙動はまず Console を確認。必要なら一時的に `console.log` を挿入し、問題解決後に整える。
- 参加者モックの `ICS` ボタンは `scheduleService.exportAllCandidatesToIcs` を経由して候補一覧から `.ics` ファイルを生成し、ブラウザのダウンロードをトリガーする（モック参加者 UI でも実データの ICS 一括出力が可能）。

---

## 5. トラブルシューティングと共通ルール

- Chrome DevTools（mac: `⌥⌘I`, Windows: `Ctrl+Shift+I` or `F12`）を常時開き、Console を監視する習慣を持つ。
- 生成 AI を含め、挙動を確認する人には Console のチェックを促す。正常に見える場合でも念のため確認する。
- 節目（新機能着手前後・検証直前など）では「Chrome DevTools の Console を確認してください」と明示的にリマインドする。
- **恒久デバッグログの扱い**: 参加者画面のインライン編集で参加者選択が途切れる既知不具合調査のため、`user.jsx` に `console.log` を常駐させている。観測ポイントとして残すこと（無効化する場合もコメント化に留める）。

---

## 6. TODO バックログ

### 優先度: 高
- Scheduly 参加者の締切目安: 2025/05/01 23:59 は不要。除去して。
- Scheduly 参加者 => 参加者ごと の参加者サマリー活用メモ未回答者を抽出して個別フォローしましょう。 は不要。除去して。
- 不具合: 参加者URLをもちいて別のブラウザから開くと参加者用の共有URLが無効です が表示される。おかしい。
- 日程が0件の場合は、共有URLを発行 ボタンを押した時にバリデーションでとどめてメッセージ表示して処理中断して。
- Web Storage ヘルパー導入はやめて単純構成に戻す（localStorage/sessionStorage ハンドリングを直書きでよいか再検討）。
- localStorage の利用をやめ、sessionStorage だけに戻す（別タブ同期は諦める前提で影響調査）。
- ストレージを sessionStorage 単一に固定し、`projectStore` を単一 `projectId` 前提で簡略化（Map/インデックス削除 + トークン逆引きを API 依存に寄せる）。
- サービス層の driver/local/API 両対応を見直し、API 前提で `projectService` / `*_service` を簡素化（`createServiceDriver` や `runOptimisticUpdate` の抽象を整理）。
- そもそも localモード不要かも。api モードだけでいいじゃん。
- apiモードだけになったら不要になる処理やソースコードないかな？
- 設定読取ユーティリティの追加（`.env` の `API_BASE_URL`/`BASE_URL`/`NODE_ENV`/`CORS_ALLOWED_ORIGINS` を参照）
- CORS/CSP 方針の明文化（単一オリジン前提、必要最小の許可のみ）
- I/O の日時表現統一
  - API入出力および内部ストアは UTC 固定かつ ISO8601（例: `2025-11-05T10:00:00Z`）で統一し、受信時に UTC へ正規化して保存、送信時も UTC を返す。必要に応じてレスポンスに `defaultTzid` を含める。
  - UI 表示や入力フォームはプロジェクトの `defaultTzid`（例: `Asia/Tokyo`）またはユーザー選択 TZ でフォーマットし、表示と入力体験をローカルタイムで揃える。
- サイズとレート制限の仮設定（候補/参加者件数・コメント長・ICSサイズ、IPベースの簡易スロットリング）
- `docs/internal/spec-api-flow.md` に最小API I/Oスキーマと409時の返却ポリシーを追記
- `docs/internal/DEVELOPER_NOTES.md` に ICS UID規則、楽観更新/ロールバック規約、管理/回答のスコープ分離を追記
- About ボタンの挙動を変更し、クリック時に別タブ/別ウィンドウで開く（`target="_blank"` + `rel="noopener"` を付与）。
 - サービス層のエラー構造を `{ code, fields, message }` に統一し、UI での赤枠付け・メッセージ表示を簡素化（422 は `fields: string[]` を推奨）。
 - `docs/internal/spec-api-flow.md` に API I/O サンプルを追記（422 の返却例と UI マッピング表を含む）。
- 共有URLの基準 `BASE_URL` の軽量検証を追加（URL 形式判定、赤枠＋ヒント表示）。
- README に `.env.example` の利用方法（設定例と読み込み経路）を短く追記。
- ルートアクセス時に新しい `projectId` を発行し、shareTokens/ProjectState をプロジェクト単位で完全に隔離する。`/a/{token}` や `projectId` 明示指定でアクセスした場合にのみ既存 state を復元するようサーバ/API/ルーティングを改修する。

### 優先度: 中
 - 重要操作ログのラッパー導入（共有URL発行/回転、ICS入出力、回答upsert を構造化出力）
 - 主要幅でのビジュアル回帰テスト（Playwright）導入。320/375/414/768px のスクショ比較を CI で実施し、「横スクロールなし・文字サイズ不変」をチェックする。
 - （注: 優先度: 高の「サービス層の driver 化」の受け入れ条件として包含）`responseService.upsert` 後は必ず `tallyService.recalculate` を走らせるホットループを維持し、インライン編集コンポーネント（`InlineResponseEditor`）からの更新が参加者一覧とサマリーへ即時反映されるよう整備する。集計表示は `summaryService` に集約し、`user.jsx` は派生データの描画に専念させる。
 - 参加者の登録順を編集できるようにする。
 - `summary-service` の派生データを活用し、「○最多の日程」「未回答者一覧」などハイライト統計を UI に表示する。集計基盤を可視化して意思決定を支援する。
 - レガシーモック（`public/legacy/scheduly-user-edit-mock.html` ほか）を最新のインライン編集 UI／データに合わせて更新し、現行実装との乖離を解消する。（これは人間が手動で操作する）
 - 生成LLM 用の MCP（Model Context Protocol）対応を検討し、可能であれば導入方針・接続ポイント・最小PoCを作成する（優先度: 中）。

### 優先度: 低
- ICS 生成時に `VTIMEZONE` を自動挿入するなど、タイムゾーン情報の扱いを強化する（現状は `X-SCHEDULY-TZID` のみ）。
- 現状は `localStorage`（フォールバックで `sessionStorage`）を利用したオンメモリ実装だが、本番を想定したサーバー側永続化（API 経由）へ移行する。
- 履歴や監査ログを収集できる仕組みを導入する。
- 主要画面のレスポンシブ対応を再検討し、モバイル表示を整備する。
 - 初回利用者向けのヘルプ／オンボーディング導線を整備する。
- `user.html` への直接アクセスを防ぎ、共有 URL（`/p/{token}`）経由のみ許可する仕組みを用意する。
- ICS インポートプレビューで選択した候補だけを適用できるようにし、未選択候補は理由をログ／トースト表示する。
- InfoBadge / SectionCard の利用ガイドを本ドキュメントに整備（左列: `basis-0 grow min-w-0`、右列: `shrink-0`、テキスト: `break-words` の原則）。
 - 参加者/管理の「サマリーをコピー」機能の仕様を詰める（目的、コピー形式、出力先、アクセス権）。決定までUIからは非表示。実装時は `src/frontend/user.jsx` の該当ボタンを復活し、共通ユーティリティへ切り出す。

---

## 6.x Done（完了）

- Tailwind を本番ビルドへ移行（PostCSS/CLI, 生成CSS適用, CDN警告解消）
- `docs/external/ref-disclaimer.md` に参加者コメントの個人情報取扱い注意を追記
- サーバ連携移行時の初期フェーズ前提（単一プロセス/オンメモリ運用）を `docs/internal/spec-server-integration-wip.md` に明記
- 揮発性バックエンド初期実装方針（in-memory Node.js サーバ、API 範囲、version 管理）を `docs/internal/spec-server-integration-wip.md` に整理
- REST API の CRUD/サマリーエンドポイント仕様を `docs/internal/spec-api-flow.md` に定義
- 入力制約と並行更新時の振る舞い（version/timestamp/409 ハンドリング）を `docs/internal/spec-api-flow.md` に整理
- エラーハンドリング標準化（409/413/401/403/ネットワーク）を `docs/internal/spec-api-flow.md` に整理
- バリデーション共通スキーマ導入計画（Zod ベースの shared/schema）を `docs/internal/spec-api-flow.md` に記載
- 共有データ型を `src/shared/types.ts` に集約し、TypeScript/JSDoc 型チェックを導入
- バリデーション共通スキーマ（Zod）を実装し、フロント/サーバが `src/shared/schema` を共有する
- 楽観更新ヘルパーを実装し、API ドライバ操作（回答/候補/参加者/共有トークン）へ段階的に適用
- 共有URL再発行時は常に新しい管理者URLへ遷移させる（UIトグル廃止、挙動一本化）
- 共有URL再発行ボタンへ「REISSUE」入力必須の確認ダイアログを導入し、誤操作防止を強化
- ICS/JSON エクスポートを同期レスポンスで提供し、管理者トークンのみアクセス可とする方針を `docs/internal/spec-server-integration-wip.md` に記載
- 共有データ型の一本化計画（`src/shared/types.ts` と JSDoc 連携）を `docs/internal/spec-api-flow.md` に記載
- サブリソースごとの version 粒度と 409 時の再送導線を `docs/internal/spec-api-flow.md` の 6.7 節に整理
- 楽観更新ヘルパー設計（共通ヘルパー/ロールバック/再試行フロー）を `docs/internal/spec-api-flow.md` に記載
- API エラーログとアクセス監視基盤の方針を `docs/internal/spec-server-integration-wip.md` に記載
- 共有トークン運用ポリシー（桁数/文字種/ログ方針/回転手順）を `docs/internal/spec-share-url-generation.md` に追記
- サーバ健全性エンドポイント（`GET /api/healthz` / `GET /api/readyz`）の仕様を `docs/internal/spec-server-integration-wip.md` に追記
- ポーリング同期と楽観更新ロールバック方針を `docs/internal/spec-api-flow.md` に追記
- GDPR 対応方針（保管期間・アクセス制御・ログ扱い）を `docs/internal/spec-data-model.md` に整理
- Excel 形式でのエクスポートを実装（exceljs）
- favicon 404 を解消（`public/favicon.ico` 追加 + `<link rel="icon">` 明示）

### ナビゲーション/UX 調整
- 日程タブ／参加者タブの「回答」ボタンで開いたインライン編集が、切り替え時に意図せず閉じないようフォーカスとスクロール挙動を最適化する。
- ICS の UID を用いた日程初期選択と、参加者名の重複チェックを組み合わせて URL クエリ/state を整備する。
- インライン編集を閉じたあとでも直前に編集中だった参加者や日程へスムーズに戻れるよう、状態復元とハイライトの仕組みを検討する。

### 継続タスク・メモ
- 管理・参加者 UI の間でデータ構造や表示ロジックに齟齬がないか定期的に点検する（説明文・ステータス・タイムゾーンなど）。
- 管理画面で「ICS インポート or 手入力 → 参加者登録 → 回答入力」という一連フローが破綻なく成立するか継続的に検証する。
- `docs/internal/spec-api-flow.md` に記載のサービス分離は優先度: 中の TODO として進行中。
- 参加者画面でのインライン編集時に参加者選択が途切れる問題は常駐ログで監視中（削除禁止）。

---

## 7. あえて実装しない機能（初期リリース）

- ユーザ管理（ログイン・招待・権限ロール）は初期リリースでは提供しない。運用要件が固まった段階で再検討する。あるいは認証なしを基本仕様としてこれは対応しない。
- 通知・リマインダー（メール、Slack 等）は初期バージョンでは実装しない。スケジュール確定フローが固まったのちに優先度を判断する。通知やリマインダーは運用リスクや実行時コストがかかるため、恒久的に対応しない可能性がある。
- 画面内検索／フィルタ機能は現状提供しない。データ量が増加した段階で優先度を見直す。

---

## 8. 参加者画面インライン編集
- 参加者一覧 (`user.jsx`) の「回答」ボタンでカード内に `InlineResponseEditor` を展開し、同一参加者・日程のみが同時に開くトグル制御になっている。再押下または別カード操作で閉じる。
- `InlineResponseEditor` は ○△× の 3 ボタンとコメント欄を備え、操作ごとに `responseService.upsert` で回答を保存 → `tallyService.recalculate` が派生タリーを更新 → `projectStore.subscribe` の購読側で `summaryService.build*View` を再構築する流れ。状態は自動保存で、成否をステータスメッセージでフィードバックする。
- スケジュール側／参加者側の両サマリーから共通コンポーネントを呼び出しており、`toggleInlineEditor` が対象カードの開閉を一元管理する。アンマウント時にタイマー等もクリーンアップする。
- モバイル表示では縦積みレイアウトで自然に収まり、開いている枠が 1 件に限定されるため表示領域にも余裕がある。既存の「別画面で回答」リンクはフォールバックとして残している。

### 8.1 最近のUI調整（要点）
- 省略表示（トランケーション）
  - 日程ごとサマリー・参加者ごとの各行で、説明・場所・コメントは閉じている時のみ `truncate max-w-[40ch]` を適用。展開時はフル表示に戻す。
  - 省略時は `title` を付与して全文をツールチップで確認可能。
- 編集時の右カラム整理
  - 編集中は行右肩の丸バッジ（○/△/×）と「閉じる」ボタンを非表示。閉じる操作はエディタ内のボタンに一本化。
- 狭幅時のレイアウト耐性
  - 行コンテナに `overflow-hidden`、本文側に `min-w-0`、ボタン側に `shrink-0` を付与し、右側の「回答」ボタンが常に見えるようにした。
- 長押しで編集を開く
  - 非編集時、行テキスト領域の長押し（既定 500ms）で回答編集を開く。ボタンが見切れていても操作できる。実装は `createLongPressHandlers`（hooks 非依存）。


---

## 9. PR コメント共有メモ

- GitHub PR の説明文やコミットサマリを依頼されるケースでは、Markdown を ``` markdown ``` で囲んだコードブロックとして出力するとコピペしやすい。
- 箇条書き、強調、テストコマンドは通常の Markdown 記法で記述しつつ、全体をコードブロックに包む。
- 例:
```markdown
- 変更点1
- 変更点2
```

**Testing**

必要に応じて都度 lint でチェックすること。

```
- `npm run lint`
- `npm run typecheck`
```

- コメントを提出する前に、lint やテスト実行コマンドが最新の状態か再確認する。
- PR 依頼の都度フォーマットが変わる場合は、このメモに補足を追記する。

---

## 10. Codex（支援AI）の権限と作業範囲

Appendix: Excel 出力（参加者 UI）

- 依存: `exceljs`（MIT）
  - インストール: `npm i exceljs`
- 使い方: 参加者画面の「全回答を Excelブックでダウンロード」ボタン
- 仕様（シート: `Responses`）
  - 列: A=日付, B=開始, C=終了, D=タイトル（SUMMARY）, E=ステータス（STATUS）, F=場所（LOCATION）, G=説明（DESCRIPTION）
  - H以降: 参加者ごとに2列ペア（回答 記号, コメント）
  - 右端4列: ○/△/×/ー の日程別集計、最後に総合計行
  - 見た目: 1行目は水色背景（sky-100）、記号セルは緑/黄/赤/灰の文字色、合計行は薄オレンジ背景（amber-100）
  - 列幅: タイトル=44, ステータス=14, 場所=40, 説明=64, 回答=6, コメント=24, 集計=8

- リポジトリ操作の原則
  - 本AIはリモートへの `git push`、GitHub 上での PR 作成・マージ・ラベル操作などの「外部サービスへの書き込み」を行わない。
  - 実施可能なのはローカル作業（ブランチ作成、ローカルコミット、差分抽出、PR本文のドラフト作成、CHANGELOG/ドキュメント更新）まで。
- 依頼時の期待値
  - PR を作りたい場合は、AIは「ローカルで比較用ブランチの用意」「`pr/*.md` にPR文面ドラフト作成」「`docs/CHANGELOG.md` の更新」までを支援し、最終的な `git push` と GitHub 上の PR 作成は人間が実施する。
  - ネットワーク権限が必要な操作（パッケージの取得、GitHub CLI でのPR生成等）はスコープ外。必要に応じて実行手順のみ提示する。
  - 例（想定ワークフロー）
  - タグ `tagYYYYMMDD` 以降の変更を調査 → ローカルで `release/after-tagYYYYMMDD` を作成 → cherry-pick で差分を限定 → `pr/release-after-tagYYYYMMDD.md` を生成 → 人間が `git push` と PR 作成を実行。

関連ドキュメント
- 通常のWebアプリと異なる方式上の特徴は外部仕様に集約しています。`docs/external/concept-assumptions.md` を参照してください。

---

## 11. 動的サーバ移行の前提（設計ノート）

- ICS UID/DTSTAMP 規則（要約）
  - UID は候補生成時に一意（変更不可）。ステータス/時刻更新時は `SEQUENCE`/`DTSTAMP` を更新し履歴性を担保する。
  - インポート時は同 UID の候補にマージ。欠落フィールドは既存値を尊重し、破壊的上書きは行わない。

- 楽観更新/ロールバック規約
  - 送信前に対象レコードの `version` を保持。409 受信時は最新を取得→UIへ差分提示→ユーザ操作で再送。
  - Responses は行（`participantId × candidateId`）を原子的に更新（`mark` と `comment` セット）。
  - Candidates/Participants は個票の `version`。並び替え/ICS 一括は `candidatesListVersion` で検出。
  - Project メタは `projectMeta.version`、共有トークンは `shareTokens.version` を用いる。

- 管理スコープと回答スコープの分離原則
  - 管理操作（メタ/候補/トークン）は参加者の回答スコープと独立。回答の更新は管理スコープのロックに影響しない。
  - これにより参加者の同時操作が多い状況でも、管理UIの編集体験を阻害しない。

- 環境変数/運用
  - `.env.example` に `API_BASE_URL` / `BASE_URL` / `NODE_ENV` / `CORS_ALLOWED_ORIGINS` などを追加。
  - CSP/CORS は単一オリジン前提で最小許可を基本とする。

---

## 12. 入力UXとバリデーション方針（フロント）

- 共通原則
  - 値は可能な限り消さない。検証NG時は赤枠＋トースト（またはステータス表示）で促す。
  - Console の想定内エラー（422 相当）は `console.debug` に格下げし、通常の操作を邪魔しない。

- 管理UI（日時編集）
  - `datetime-local` は入力途中の未完成値を許容し、完成時のみ構造検証と順序検証（`dtend > dtstart`）。
  - `dtend ≤ dtstart` の場合でも、ユーザ入力は保存（継続編集可能）し、トースト＋赤枠で通知。
  - フィールド毎の軽量バリデーション（長さ・必須・列挙）は422相当で通知し、値は保持。

- 参加者UI（インライン編集）
  - マーク（○/△/×）はクリック即保存。
  - コメントは blur 時のみ保存（編集中は保存しない）。
  - コメントは500文字上限。超過時は保存せず赤枠＋「コメントは500文字以内で入力してください」表示。値は保持。
  - ステータスメッセージは一定時間で自動消滅（最新入力でタイマーを更新）。

実装メモ
- バリデーションは `src/shared/schema/index.js` の Zod スキーマで実施し、フロント／サーバ双方が同じ定義を参照する。
- 管理UIの候補編集は、未完成フォーマット時は検証スキップ、完成時のみ検証。順序NG時も入力は保存し、赤枠とトーストのみ。

詳細説明は `docs/internal/spec-validation-policy.md` を参照。

---

## 13. 将来計画: 参加者回答管理ビュー

- 位置付け: `user.jsx`（参加者一覧）を拡張し、管理者が回答状況を俯瞰・編集できるビューを追加する構想。ファーストリリースからは除外し、将来計画として維持。現行仕様では、回答更新は即時集計されタブ/カードへ反映されるが、管理者向けのマトリクス編集や確定操作の強化は今後の改善項目に留める。

- 目的
  - 参加者ごとの回答を検索・フィルタリングし、候補別の賛否を素早く把握する。
  - 確定候補を決める際の判断材料として、マトリクス集計や詳細カードを提供する。
  - 必要に応じて管理者が回答を修正したりコメントを追記したりできる導線を用意する。

- レイアウト案
  1. 上部コントロールにプロジェクト概要・フィルター・検索。
  2. メイン領域に「参加者 × 候補」のマトリクス＋クリックで開く詳細カード。
  3. サイドパネルに候補ごとの集計（○△×数、コメント有無、確定操作）。モバイルでは縦積み＋横スクロール対応。

- データモデルのメモ
  - `Participant` / `Response` / `Candidate` を組み合わせてマトリクスを構成。`Response.mark` は `'o' | 'd' | 'x' | null`。
  - 現状は `projectStore` 上に派生データ（サマリー・タリー）を保持。将来的に REST API で永続化する際も同様モデルを提供する想定。

- 段階的実装ステップ（候補）
  1. React state による UI モック作成（既存データの可視化）。
  2. 管理者が回答を修正できるアクションの追加。
  3. ICS 連携・通知フローとの連動を整理。
  4. サーバー/API 実装時に CRUD と認証を整備。

- 補足
  - 参加者が自己編集できる前提の場合、履歴管理やアラートの検討が必要になる可能性。
  - 大規模データ向けに仮想スクロールやページネーション等のパフォーマンス対策を検討。

---

## 14. ICS に関する今後の検討事項（外部仕様外の計画）

- `VTIMEZONE` の自動付与（海外メンバー向けの適切なタイムゾーン情報配布）。
- 外部 ICS との差分通知や、定期的な再インポートのための UI/スケジューラ整備。
- ICS 入出力時の検証強化（不正フォーマット防止、`TZID` バリデーションなど）。
- バックエンド導入時に ICS を API で配布する仕組み（署名付き URL 等）の設計。

関連: 内部の実装詳細は `docs/internal/spec-ical-internals.md` に整理。

---

## 15. 現状の課題メモ（概要）

- (優先度低) `TZID` 付きの `VTIMEZONE` を自動付与するなど、タイムゾーン情報の扱いを強化する。
- 参加者回答一覧（`user.jsx`）の実データ連携／マトリクス表示の整備。
- レガシーモックの UI を React 版へ段階的に移植し、最終的に `public/legacy/` を整理する。

---

## 16. ドキュメント命名規約（docs/ 配下）

ドキュメントは外部（利用者/運用者向け）と内部（開発/運用設計向け）に分け、さらに種別プレフィックスで命名を統一する。索引は `docs/README.md` を入口とし、必要に応じて `docs/external/README.md` / `docs/internal/README.md` を設ける。

### 16.1 種別プレフィックス
- `concept-` 概念・背景・設計思想
- `spec-` 仕様（契約・I/F・制約）
- `guide-` 手順・ハウツー（セットアップ/操作/開発手順）
- `runbook-` 運用・障害対応・定常手順
- `adr-` 意思決定（Architecture Decision Record）
- `ref-` 参照資料（ポリシー、一覧、チェックリスト、免責等）
- `index-` 目次/索引（エリアの入口）

補足ルール
- 単語区切りはハイフン、英語ベースで簡潔にする。
- 対象領域は末尾に付与（例: `-ics`, `-ui`, `-server`）。
- 下書き/WIP は末尾に `-wip` を付ける（例: `spec-server-integration-wip.md`）。
- 既存の拡張子や相対リンクは維持する（拡張子は `.md`）。

例
- `spec-api-flow.md`
- `guide-local-dev.md`
- `runbook-ical-ops.md`
- `ref-verify-checklist.md`

### 16.2 既存ファイルのリネーム指針（段階移行）
リポジトリ運用への影響を抑えるため、バッチ一括ではなく段階的に進める。

1) 命名規約の合意（本節）。
2) `docs/README.md` から新旧名称の入口を併記してブリッジ期間を設ける。
3) 衝突の少ないものから順次リネームし、参照リンクを更新。
4) 変更は外部向けは `docs/external/ref-changelog.md`、内部メモは本ファイルに簡易ログとして残す。

（主な対応候補例）
- `docs/internal/DATA_MODEL.md` → `docs/internal/spec-data-model.md`
- `docs/internal/FLOW_AND_API.md` → `docs/internal/spec-api-flow.md`
- `docs/internal/VALIDATION_POLICY.md` → `docs/internal/spec-validation-policy.md`
- `docs/external/ICAL_WORKFLOW.md` → `docs/external/guide-ical-workflow.md`
- `docs/external/CONTRIBUTING.md` → `docs/external/guide-contributing.md`

必要になれば、`docs/internal/DOCS_NAMING.md` として本節を独立させ、テンプレート（`docs/internal/_TEMPLATE_SPEC.md` など）を追加する。
