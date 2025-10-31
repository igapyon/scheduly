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
- N/A

### 優先度: 中
- Tailwind を本番ビルドへ移行（CDN 依存を解消）。PostCSS/CLI を導入し、`tailwind.config.js` の `content` を `public/**/*.html` と `src/frontend/**/*.{js,jsx}` に設定、生成 CSS を HTML へ適用する。CDN 警告を解消する。
- 主要幅でのビジュアル回帰テスト（Playwright）導入。320/375/414/768px のスクショ比較を CI で実施し、「横スクロールなし・文字サイズ不変」をチェックする。
- `docs/FLOW_AND_API.md` で整理した in-memory サービス群（`projectService` / `scheduleService` / `participantService` / `responseService` / `shareService` / `tallyService` / `summaryService`）を実装し、更新処理を `projectStore` 経由に集約する。React 3 画面はこれらのファサードを経由してデータ取得・更新を行い、`projectStore.subscribe` を用いた状態同期を整える（スコープ外画面は読み取り専用ファサードに限定）。
- `responseService.upsert` 後は必ず `tallyService.recalculate` を走らせるホットループを維持し、インライン編集コンポーネント（`InlineResponseEditor`）からの更新が参加者一覧とサマリーへ即時反映されるよう整備する。集計表示は `summaryService` に集約し、`user.jsx` は派生データの描画に専念させる。
- 参加者の登録順を編集できるようにする。
- `summary-service` の派生データを活用し、「○最多の日程」「未回答者一覧」などハイライト統計を UI に表示する。集計基盤を可視化して意思決定を支援する。
- レガシーモック（`public/legacy/scheduly-user-edit-mock.html` ほか）を最新のインライン編集 UI／データに合わせて更新し、現行実装との乖離を解消する。

### 優先度: 低
- ICS 生成時に `VTIMEZONE` を自動挿入するなど、タイムゾーン情報の扱いを強化する（現状は `X-SCHEDULY-TZID` のみ）。
- `src/frontend` 側の UI 変更をレガシーモックへも随時バックポートし、見た目のギャップを最小化する。
- 現状は `sessionStorage` を利用したオンメモリ実装だが、本番を想定したサーバー側永続化（API 経由）へ移行する。
- 履歴や監査ログを収集できる仕組みを導入する。
- 主要画面のレスポンシブ対応を再検討し、モバイル表示を整備する。
- Excel 形式でのエクスポートを実装し、CSV との差別化を図る。
- 初回利用者向けのヘルプ／オンボーディング導線を整備する。
- `user.html` への直接アクセスを防ぎ、共有 URL（`/p/{token}`）経由のみ許可する仕組みを用意する。
- ICS インポートプレビューで選択した候補だけを適用できるようにし、未選択候補は理由をログ／トースト表示する。
- favicon 404 を解消（`public/favicon.ico` 追加、または `<link rel="icon">` を明示）。
- InfoBadge / SectionCard の利用ガイドを本ドキュメントに整備（左列: `basis-0 grow min-w-0`、右列: `shrink-0`、テキスト: `break-words` の原則）。

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

- リポジトリ操作の原則
  - 本AIはリモートへの `git push`、GitHub 上での PR 作成・マージ・ラベル操作などの「外部サービスへの書き込み」を行わない。
  - 実施可能なのはローカル作業（ブランチ作成、ローカルコミット、差分抽出、PR本文のドラフト作成、CHANGELOG/ドキュメント更新）まで。
- 依頼時の期待値
  - PR を作りたい場合は、AIは「ローカルで比較用ブランチの用意」「`pr/*.md` にPR文面ドラフト作成」「`docs/CHANGELOG.md` の更新」までを支援し、最終的な `git push` と GitHub 上の PR 作成は人間が実施する。
  - ネットワーク権限が必要な操作（パッケージの取得、GitHub CLI でのPR生成等）はスコープ外。必要に応じて実行手順のみ提示する。
- 例（想定ワークフロー）
  - タグ `tagYYYYMMDD` 以降の変更を調査 → ローカルで `release/after-tagYYYYMMDD` を作成 → cherry-pick で差分を限定 → `pr/release-after-tagYYYYMMDD.md` を生成 → 人間が `git push` と PR 作成を実行。
