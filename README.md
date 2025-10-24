# scheduly

Scheduly は、ICS（iCalendar）との連携を念頭に置いたスケジュール調整アプリです。React / webpack 版を主軸に開発を進めつつ、混乱回避のためにレガシーモックも最小限維持しています。全体像は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) を参照してください。

| 種別 | 主な用途 | 配置 | 起動方法 |
| ---- | -------- | ---- | -------- |
| React / webpack 版 | レガシー UI を段階的に移植中 | `src/frontend/` | `npm run dev` / `npm run build` |
| レガシーモック | 既存 HTML のまま UI を確認したい時 | `public/legacy/` | ブラウザで直接開く |

どの構成でも、動作確認時には Chrome DevTools の Console を開き、警告やエラーを把握する習慣を徹底してください。ICS まわりの詳細な運用は [docs/ICAL_WORKFLOW.md](docs/ICAL_WORKFLOW.md) にまとめています。

## React / webpack 版（`src/frontend/`）

- `admin.jsx`（ビルド後は `index.bundle.js`）: 管理者モックの React 版。ics インポート／エクスポート、候補一覧編集、プレビューなどを再現しており、`public/index.html` で読み込みます。ヘッダーから参加者回答一覧（`user.html`）や回答入力画面（`user-edit.html`）へのリンクを設置済みです。
- `user.jsx`（ビルド後は `user.bundle.js`）: 参加者向けモバイル UI を React 化した画面。長押しモーダル、○△× 回答、コメント入力などを備え、`public/user-edit.html` からアクセスできます。
- `admin-responses.jsx`（ビルド後は `responses.bundle.js`）: 参加者回答一覧の React モック。日程別／参加者別のタブ切り替え、ハイライトカード、アクション類を試作しており、`public/user.html` で読み込みます。
- スタイルは当面 HTML テンプレートで読み込む Tailwind CDN と最小限のインライン CSS で賄っています。必要に応じて順次整理予定です。
- 開発フロー
  1. 依存関係のインストール（初回のみ）: `npm install`
  2. 開発サーバー起動: `npm run dev`（Webpack Dev Server, ポート 5173）
    - `http://localhost:5173/index.html`（管理者）、`http://localhost:5173/user.html`（参加者回答一覧）、`http://localhost:5173/user-edit.html`（参加者入力画面）を必要に応じて開く
     - Console の警告・エラーを節目ごとに確認
  3. 本番ビルド: `npm run build`
  4. 静的資産のコピー: `npm run postbuild`（`dist/` に `public/` 内容がコピーされます）
- React / ReactDOM を含むためバンドルは大きめです。最終的な最適化は移植後に検討します。

## 開発・デバッグのヒント

- 想定外の挙動はまず Console ログを確認する。必要に応じて `console.log` を仕込み、原因把握後に整理する。
- ICS 生成が失敗した場合は `console.error` に候補データを出力しているため、Console が最短の手掛かりになります。
- レガシーモックはリロードだけで変更を反映できます。Webpack 版はホットリロードしつつ Console をウォッチしてください。

## TODO の種

- `exportAllCandidatesToIcs` を活用し、候補を一括ダウンロードできる UI を追加する。
- `TZID` 付きの `VTIMEZONE` を自動付与するなど、タイムゾーン情報の扱いを強化する。
- 参加者回答一覧の React 版（`admin-responses.jsx`）をもとに、実データ連携やマトリクス表示を整備する。
- レガシーモックの UI を React 版へ段階的に移植し、最終的に `public/legacy/` を整理する。

## レガシーモック（`public/legacy/`）

- React 18（UMD 版）・Tailwind CDN・Babel Standalone による HTML モック。ビルドやサーバーなしでブラウザから直接動かせます。
- 主なファイル
  - `scheduly-mock.html`: 参加者向けスマホ UI。候補の長押しによる詳細表示、○△× 回答、コメント入力などを体験できます。
  - `scheduly-admin-mock.html`: 管理者向け UI。ical.js によるインポート／エクスポート、UID・SEQUENCE・DTSTAMP の確認、Blob ダウンロード動線をモックしています。
  - `downloadtest.html`: Blob ダウンロードがブラウザで正常に動作するか単独で検証するページ。
- 使い方
  1. 対象の HTML をブラウザで直接開く
  2. 画面を操作して挙動を確認する
  3. 想定外の動きがあれば Console ログを確認し、必要に応じて `console.log` 等で原因を追跡する

## ライセンス

このリポジトリは [Apache License 2.0](LICENSE) の下で配布されています。
