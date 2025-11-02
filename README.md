# Scheduly

Scheduly は、iCalendar（ICS）と連携して日程候補の作成・共有・回答収集・配布を素早く行える軽量なスケジュール調整アプリです。管理者用と参加者用の秘密URLでシンプルに共有でき、ブラウザだけで完結します。

## 主な特徴
- ICS のインポート/エクスポートで外部カレンダーと連携
- 管理者URL・参加者URL（秘密URL）で簡易に共有・アクセス
- 回答のインライン編集とリアルタイム反映、Excel 出力に対応
- インメモリ運用（短期利用向け）。必要に応じて ICS/JSON で外部保全

> セキュリティ注意: 秘密URLを前提とした簡易モデルです。URLの取り扱いにはご注意ください。認証・承認が必要な運用では別途の仕組みを導入してください。

## はじめに（ローカル動作）
1) `npm install`
2) `npm run dev`（http://localhost:5173）
   - 管理者: `/index.html`、参加者: `/user.html`
3) 本番ビルド: `npm run build` → 静的資産コピー: `npm run postbuild`

## 外部仕様

外部仕様を理解するための主要ドキュメントは次の3つです。
- [docs/EXTERNAL_SPEC.md](docs/EXTERNAL_SPEC.md)
- [docs/SCREEN_OVERVIEW.md](docs/SCREEN_OVERVIEW.md)
- [docs/ICAL_WORKFLOW.md](docs/ICAL_WORKFLOW.md)

> ⚠ **匿名アクセスの注意**  
> 現状のモック実装は匿名でログインでき、管理画面・参加者画面ともに誰でもデータを書き換え可能な仕様です。ハッシュ値付き URL で画面を出し分けるのみで認証やアクセス制御は行っていません。セキュアな運用が必要な場合は必ず別途認証・承認の仕組みを導入してください。

## Documentation Index

- [docs/DEVELOPMENT_JOURNEY.md](docs/DEVELOPMENT_JOURNEY.md): ローカルモックから現在までの開発プロセスを俯瞰
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): 画面構成とバンドル構造
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): オンメモリ前提のデータモデル整理
- [docs/FLOW_AND_API.md](docs/FLOW_AND_API.md): in-memory サービスと API 草案
- [docs/SCREEN_OVERVIEW.md](docs/SCREEN_OVERVIEW.md): 画面役割と回答管理 UI の詳細
- [docs/ICAL_WORKFLOW.md](docs/ICAL_WORKFLOW.md): ICS 連携の運用メモ
- [docs/VERIFY_CHECKLIST.md](docs/VERIFY_CHECKLIST.md): QA・目視確認の手順
- [docs/DEVELOPER_NOTES.md](docs/DEVELOPER_NOTES.md): 作業メモと TODO の整理
- [docs/SERVER_INTEGRATION.md](docs/SERVER_INTEGRATION.md): サーバー導入時の検討事項（WIP）
- [docs/DISCLAIMER.md](docs/DISCLAIMER.md): 免責事項と利用時の注意点
- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md): コントリビューション手引き
- [docs/CONTRIBUTORS.md](docs/CONTRIBUTORS.md): コントリビューター一覧
- [docs/CHANGELOG.md](docs/CHANGELOG.md): 変更履歴のメモ
- [docs/EXTERNAL_SPEC.md](docs/EXTERNAL_SPEC.md): 外部仕様（通常と異なる方式上の特徴）

| 種別 | 主な用途 | 配置 | 起動方法 / 挙動 |
| ---- | -------- | ---- | -------- |
| React / webpack 版 | 本番想定のアプリ実装（共有トークンで `/a/{token}` / `/p/{token}` へリダイレクト。`/r/{token}` は後方互換で `/p/{token}` に転送） | `src/frontend/` | `npm run dev` / `npm run build` |
| レガシーモック | 最新アプリ UI のスナップショット確認用静的コンテンツ | `public/legacy/` | ブラウザで直接開くだけ |

どの構成でも、動作確認時には Chrome DevTools の Console を開き、警告やエラーを把握する習慣を徹底してください。ICS まわりの詳細な運用は [docs/ICAL_WORKFLOW.md](docs/ICAL_WORKFLOW.md) にまとめています。

### Sample Data

- ICS: `public/ics/scheduly-ics-sampledata-001.ics`
- Project JSON: `public/proj/scheduly-project-sampledata-001.json`

## React / webpack 版（`src/frontend/`）

- `admin.jsx`（ビルド後は `index.bundle.js`）: 管理者向けアプリ。候補編集・ICS 入出力・プロジェクト JSON 入出力を備え、`public/index.html` から共有トークン発行後は `/a/{token}` へリダイレクトされます。
- `user.jsx`（ビルド後は `user.bundle.js`）: 参加者の回答閲覧・編集を一画面で提供する UI。日程別／参加者別タブのほか、カード内で直接 ○△× とコメントを更新できます。`public/user.html` から共有トークン利用時は `/p/{token}` へ遷移します。Excel 出力（exceljs 利用）にも対応。
 - スタイルは Tailwind を PostCSS/CLI でビルドして適用します（出力: `public/assets/tailwind.css`）。セットアップや運用は `docs/DEVELOPER_NOTES.md` を参照してください。
- 開発フロー
  1. 依存関係のインストール（初回のみ）: `npm install`
  2. 開発サーバー起動: `npm run dev`（Webpack Dev Server, ポート 5173）
    - `http://localhost:5173/index.html`（管理者）、`http://localhost:5173/user.html`（参加者 UI）を必要に応じて開く
     - Console の警告・エラーを節目ごとに確認
    - **Lint**: コード変更後は `npm run lint` をこまめに実行し、スタイルガイドと静的解析の結果を即時に確認する
  3. 本番ビルド: `npm run build`
  4. 静的資産のコピー: `npm run postbuild`（`dist/` に `public/` 内容がコピーされます）
- React / ReactDOM を含むためバンドルは大きめです。最終的な最適化は移植後に検討します。
- プロジェクト全体を JSON としてエクスポート／インポートできるようになりました。管理画面の「管理アクション」にあるボタンから、`projectStore` のスナップショットをそのまま保存したり、別環境で読み込んだりできます。インポート時は既存データが置き換わるので注意してください。

## 開発・デバッグのヒント

- 想定外の挙動はまず Console ログを確認する。必要に応じて `console.log` を仕込み、原因把握後に整理する。
- ICS 生成が失敗した場合は `console.error` に候補データを出力しているため、Console が最短の手掛かりになります。
- レガシーモックはリロードだけで変更を反映できます。Webpack 版はホットリロードしつつ Console をウォッチしてください。

## レガシーモック（`public/legacy/`）

- React 18（UMD 版）・Tailwind CDN・Babel Standalone による静的モック。ビルドやサーバーなしでブラウザから直接開けますが、**動作は「見栄え再現」が主目的**であり、React 版と同等の機能は搭載していません。
- 主なファイル
  - `scheduly-user-mock.html`: 参加者回答一覧ビュー（タブ切り替え含む）のワイヤーフレーム。表示のみで実データ連携は行いません。
- `scheduly-user-edit-mock.html`: 旧・個別回答編集画面のスナップショット。現行アプリではカード内インライン編集へ移行済みのため、参考用途のみで利用してください。
- 使い方
  1. 対象の HTML をブラウザで直接開く
  2. レイアウトやスタイル差分を確認する（挙動は React 版を参照）
  3. UI 差異があれば React 側の DOM をコピーしてモックを更新する

## ライセンス

このリポジトリは [Apache License 2.0](LICENSE) の下で配布されています。利用上の注意事項や免責については `docs/DISCLAIMER.md` も参照してください。
