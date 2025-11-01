# Developer Notes

Scheduly のアプリ開発（React/webpack 版）を進める際に参照する開発メモです。UI の全体像は README に委譲し、ここでは実装の裏側、デバッグ観点、運用手順、TODO をまとめています。QA 手順は `docs/VERIFY_CHECKLIST.md` を参照してください。

---

## 1. モック構成と開発環境

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

### 1.2 レガシーモック（HTML 版 / アプリスナップショット）
- 位置: `public/legacy/*.html`
- 技術構成: React 18 (UMD) + Tailwind CDN + Babel Standalone
- 役割: React/webpack 版のスナップショットを定期的に反映する確認用の静的コンテンツ（初期モックとしての役目も残す）
- 確認方法: ブラウザで直接開けば OK

### 1.3 その他の運用メモ
- `public/index.html` / `user.html` で Tailwind CDN を読み込み、管理画面では ical.js CDN も追加読込。  
- UI を更新したら `docs/screenshot/*.png` を撮り直し、React 版とレガシーモックの差分を無くす。  
- 現状はブラウザ `sessionStorage` に状態を保持しているが、本番想定ではサーバー側永続化（API 経由）に移行する前提。

---

## 2. ICS 連携の要点

| 注意点 | 内容 |
| --- | --- |
| ICS 生成 | `admin.jsx` は候補ごとに `rawVevent` を保持しつつ、エクスポート時に `.ics` を組み立てる。関連関数: `exportCandidateToIcs` / `exportAllCandidatesToIcs` / `projectStore.exportProjectState` / `projectStore.importProjectState` |
| エラー検知 | 生成失敗時は候補データ付きで `console.error` を出力。Chrome DevTools の Console で必ず確認。 |
| インポート | プレビューは既定で全候補 OFF、既存 UID と一致する候補のみ ON。挙動変更時は `handleIcsImport` と UI をセットで検証。 |

---

## 3. レガシーモック更新ワークフロー

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
- 動的サーバ移行の前提整備（オンメモリ/単一プロセス想定を明記）
- 共有データ型の一本化（`src/shared/types.ts` に Project/Participant/Candidate/Response/ShareTokens/RouteContext）
- バリデーション導入（zod 等で型スキーマ定義しフロント/サーバ共用）
- バージョニング付与（サブリソースごとに整数 version を持たせる）
- 楽観排他の粒度設計を実装（回答=行単位、候補=個票、候補一覧=リスト、参加者=個票、メタ=メタ、共有トークン=セット）
- Responses の行粒度API（`POST /api/projects/:id/responses`、bodyに version を同梱、409時は最新返却）
- Candidates の個票更新API（`PUT /api/projects/:id/candidates/:cid`、version必須）
- Candidates 一覧操作API（`POST /api/projects/:id/candidates:reorder`、`POST /api/projects/:id/ics/import` は `candidatesListVersion` でIf-Match）
- Participants の個票更新API（`PUT /api/projects/:id/participants/:pid`、version必須）
- Project メタ更新API（`PUT /api/projects/:id/meta`、`projectMeta.version` でIf-Match）
- Share トークン回転API（`POST /api/projects/:id/share/rotate`、`shareTokens.version` でIf-Match）
- 全体取得API（`GET /api/projects/:id` に各サブリソースの version を含める）
- ヘルスチェックAPI（`GET /api/healthz` / `GET /api/readyz`）
- サービス層の driver 化（`driver: 'local'|'api'`、現状は `local` 実装で等価動作）
- `projectStore` の役割固定（キャッシュ/購読/派生計算トリガーに限定、永続はAPI側）
- 楽観更新ヘルパー実装（成功はそのまま、409/通信失敗時はロールバック＋再取得UI）
- エラーハンドリング標準化（409/413/権限/ネットワークの文言と再試行導線）
- `.env.example` 追加（`API_BASE_URL`/`BASE_URL`/`NODE_ENV`/CORS想定）と設定読取ユーティリティ
- CORS/CSP 方針の明文化（単一オリジン前提、必要最小の許可のみ）
- トークン運用ポリシーの明文化（桁数/文字種、ログ非出力、回転と失効）
- 重要操作ログのラッパー導入（共有URL発行/回転、ICS入出力、回答upsert を構造化出力）
- I/O の日時表現統一（APIはISO8601+TZ、内部はUTC正規化）
- サイズとレート制限の仮設定（候補/参加者件数・コメント長・ICSサイズ、IPベースの簡易スロットリング）
- `docs/FLOW_AND_API.md` に最小API I/Oスキーマと409時の返却ポリシーを追記
- `docs/DEVELOPER_NOTES.md` に ICS UID規則、楽観更新/ロールバック規約、管理/回答のスコープ分離を追記
- 管理画面に「デモ用プロジェクトをインポート」ボタンを追加（配置: プロジェクト削除のさらに下）。クリックで `public/proj/scheduly-project-sampledata-001.json` を読み込み、現在プロジェクトとしてインポートできるようにする（確認ダイアログあり／既存データは置換）。
 - About ボタンの挙動を変更し、クリック時に別タブ/別ウィンドウで開く（`target="_blank"` + `rel="noopener"` を付与）。

### 優先度: 中
 - 主要幅でのビジュアル回帰テスト（Playwright）導入。320/375/414/768px のスクショ比較を CI で実施し、「横スクロールなし・文字サイズ不変」をチェックする。
 - （注: 優先度: 高の「サービス層の driver 化」の受け入れ条件として包含）`responseService.upsert` 後は必ず `tallyService.recalculate` を走らせるホットループを維持し、インライン編集コンポーネント（`InlineResponseEditor`）からの更新が参加者一覧とサマリーへ即時反映されるよう整備する。集計表示は `summaryService` に集約し、`user.jsx` は派生データの描画に専念させる。
 - 参加者の登録順を編集できるようにする。
 - `summary-service` の派生データを活用し、「○最多の日程」「未回答者一覧」などハイライト統計を UI に表示する。集計基盤を可視化して意思決定を支援する。
 - レガシーモック（`public/legacy/scheduly-user-edit-mock.html` ほか）を最新のインライン編集 UI／データに合わせて更新し、現行実装との乖離を解消する。（これは人間が手動で操作する）
 - 生成LLM 用の MCP（Model Context Protocol）対応を検討し、可能であれば導入方針・接続ポイント・最小PoCを作成する（優先度: 中）。

### 優先度: 低
- ICS 生成時に `VTIMEZONE` を自動挿入するなど、タイムゾーン情報の扱いを強化する（現状は `X-SCHEDULY-TZID` のみ）。
- 現状は `sessionStorage` を利用したオンメモリ実装だが、本番を想定したサーバー側永続化（API 経由）へ移行する。
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
- Excel 形式でのエクスポートを実装（exceljs）
- favicon 404 を解消（`public/favicon.ico` 追加 + `<link rel="icon">` 明示）

### ナビゲーション/UX 調整
- 日程タブ／参加者タブの「回答」ボタンで開いたインライン編集が、切り替え時に意図せず閉じないようフォーカスとスクロール挙動を最適化する。
- ICS の UID を用いた日程初期選択と、参加者名の重複チェックを組み合わせて URL クエリ/state を整備する。
- インライン編集を閉じたあとでも直前に編集中だった参加者や日程へスムーズに戻れるよう、状態復元とハイライトの仕組みを検討する。

### 継続タスク・メモ
- 管理・参加者 UI の間でデータ構造や表示ロジックに齟齬がないか定期的に点検する（説明文・ステータス・タイムゾーンなど）。
- 管理画面で「ICS インポート or 手入力 → 参加者登録 → 回答入力」という一連フローが破綻なく成立するか継続的に検証する。
- `docs/FLOW_AND_API.md` に記載のサービス分離は優先度: 中の TODO として進行中。
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
- バリデーションは `src/frontend/shared/validation.js` の薄いヘルパで実施（後で zod に置換可能）。
- 管理UIの候補編集は、未完成フォーマット時は検証スキップ、完成時のみ検証。順序NG時も入力は保存し、赤枠とトーストのみ。

詳細説明は `docs/VALIDATION_POLICY.md` を参照。
