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
  | 参加者一覧 | `user.jsx` | `public/user.html` | `/user.html` → 共有トークン利用時は `/p/{token}` にリダイレクト |
  | 参加者編集 | `user-edit.jsx` | `public/user-edit.html` | `/user-edit.html` → 共有トークン利用時は `/r/{token}` にリダイレクト |
- スタイルは Tailwind CDN と最小限のインライン CSS に依存。  
- 開発時: `npm run dev`（`webpack-dev-server` ポート 5173）でホットリロード。  
- ビルド: `npm run build` → `npm run postbuild`（`scripts/copy-static.js` が `public` → `dist` を複製）。  
- **Lint**: UI / ロジック変更時は `npm run lint` をこまめに実行し、共有のコード規約と静的解析の結果を即時フィードバックする。

### 1.2 レガシーモック（HTML 版 / アプリスナップショット）
- 位置: `public/legacy/*.html`
- 技術構成: React 18 (UMD) + Tailwind CDN + Babel Standalone
- 役割: React/webpack 版のスナップショットを定期的に反映する確認用の静的コンテンツ（初期モックとしての役目も残す）
- 確認方法: ブラウザで直接開けば OK

### 1.3 その他の運用メモ
- `public/index.html` / `user.html` / `user-edit.html` で Tailwind CDN を読み込み、管理画面では ical.js CDN も追加読込。  
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

---

## 4. 開発時の基本オペレーション

- レガシーモックはブラウザで直接確認し、修正後はリロードで反映を確認。
- webpack 版は `npm run dev` を常駐させ、ホットリロードで作業効率を上げる。
- 想定と異なる挙動はまず Console を確認。必要なら一時的に `console.log` を挿入し、問題解決後に整える。
- 参加者モックの `ICS` ボタンは現在トーストを表示するダミー。将来の本実装に備えた導線として残している。

---

## 5. トラブルシューティングと共通ルール

- Chrome DevTools（mac: `⌥⌘I`, Windows: `Ctrl+Shift+I` or `F12`）を常時開き、Console を監視する習慣を持つ。
- 生成 AI を含め、挙動を確認する人には Console のチェックを促す。正常に見える場合でも念のため確認する。
- 節目（新機能着手前後・検証直前など）では「Chrome DevTools の Console を確認してください」と明示的にリマインドする。
- **恒久デバッグログの扱い**: 参加者画面→回答編集画面で参加者選択が途切れる既知不具合調査のため、`user.jsx` / `user-edit.jsx` に `console.log` を常駐させている。観測ポイントとして残すこと（無効化する場合もコメント化に留める）。

---

## 6. TODO バックログ

### 優先度: 高
- `summary-service` の派生データを活用し、「○最多の日程」「未回答者一覧」などハイライト統計を UI に表示する。集計基盤を可視化して意思決定を支援する。

### 優先度: 中
- `docs/FLOW_AND_API.md` で整理した in-memory サービス群（`projectService` / `scheduleService` / `participantService` / `responseService` / `shareService` / `tallyService` / `summaryService`）を実装し、更新処理を `projectStore` 経由に集約する。React 3 画面はこれらのファサードを経由してデータ取得・更新を行い、`projectStore.subscribe` を用いた状態同期を整える（スコープ外画面は読み取り専用ファサードに限定）。
- `responseService.upsert` 後は必ず `tallyService.recalculate` を走らせるホットリロードループを `user-edit.jsx` に組み込み、○△× 更新やコメント保存を参加者一覧へリアルタイム反映させる。集計表示は `summaryService` に集約し、`user.jsx` は派生データの描画に専念させる。
- 参加者の登録順を編集できるようにする。

### 優先度: 低
- ICS 生成時に `VTIMEZONE` を自動挿入するなど、タイムゾーン情報の扱いを強化する（現状は `X-SCHEDULY-TZID` のみ）。
- `src/frontend` 側の UI 変更をレガシーモックへも随時バックポートし、見た目のギャップを最小化する。
- 現状は `sessionStorage` を利用したオンメモリ実装だが、本番を想定したサーバー側永続化（API 経由）へ移行する。
- 履歴や監査ログを収集できる仕組みを導入する。
- 主要画面のレスポンシブ対応を再検討し、モバイル表示を整備する。
- Excel 形式でのエクスポートを実装し、CSV との差別化を図る。
- 初回利用者向けのヘルプ／オンボーディング導線を整備する。
- `user.html` / `user-edit.html` への直接アクセスを防ぎ、共有 URL 経由のみ許可する仕組みを用意する。
- ICS インポートプレビューで選択した候補だけを適用できるようにし、未選択候補は理由をログ／トースト表示する。

### ナビゲーション/UX 調整
- 日程ごとの「回答」ボタンから遷移した際、回答編集画面でも同じ日程が選択された状態で開けるよう調整する。
- ICS の UID を用いた日程初期選択と、参加者名の重複チェックを組み合わせて URL クエリ/state を整備する。
- 回答編集から「参加者一覧へ」を押した際、元が日程タブなら直前に操作した日程が開いた状態で戻せるようにする。
- 同様に、元が参加者タブなら該当参加者のカードが開いた状態で戻せるようにする。

### 継続タスク・メモ
- 管理・参加者・回答編集の 3 画面でデータ構造や表示ロジックに矛盾がないか定期的に点検する（説明文・ステータス・タイムゾーンなど）。
- 管理画面で「ICS インポート or 手入力 → 参加者登録 → 回答入力」という一連フローが破綻なく成立するか継続的に検証する。
- `docs/FLOW_AND_API.md` に記載のサービス分離は優先度: 中の TODO として進行中。
- 参加者画面→回答編集画面間での参加者選択問題は常駐ログで監視中（削除禁止）。

---

## 7. あえて実装しない機能（初期リリース）

- ユーザ管理（ログイン・招待・権限ロール）は初期リリースでは提供しない。運用要件が固まった段階で再検討する。
- 通知・リマインダー（メール、Slack 等）は初期バージョンでは実装しない。スケジュール確定フローが固まったのちに優先度を判断する。
- 画面内検索／フィルタ機能は現状提供しない。データ量が増加した段階で優先度を見直す。
