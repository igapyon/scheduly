# Scheduly

Scheduly は、iCalendar（ICS）と連携して日程候補の作成・共有・回答収集・配布を素早く行える軽量なスケジュール調整アプリです。管理者用と参加者用の秘密URLでシンプルに共有でき、ブラウザだけで完結します。

## 主な特徴
- ICS のインポート/エクスポートで外部カレンダーと連携
- 管理者URL・参加者URL（秘密URL）で簡易に共有・アクセス
- 回答のインライン編集とリアルタイム反映、Excel 出力に対応
- セッションごとに独立したプロジェクトを作成（トップページへアクセスするたびに新しいプロジェクト ID を払い出し、共有URLを発行しない限り他のセッションには共有されない）
- インメモリ運用（短期利用向け）。必要に応じて ICS/JSON で外部保全

> セキュリティ注意: 秘密URLを前提とした簡易モデルです。URLの取り扱いにはご注意ください。認証・承認が必要な運用では別途の仕組みを導入してください。

## 想定ユースケース
- チームやコミュニティが候補日をまとめて提示し、参加者が ○/△/× とコメントでリアクションして即時に集計したいとき
- 認証基盤を用意せずに、URL を共有するだけで管理者/参加者の画面を切り替えて使いたい場合
- イベントや会議の日程調整を素早く進め、確定候補を ICS で配布・外部カレンダーへ取り込みたいケース

> 参加者URLが第三者に漏れると誰でも回答を更新できるため、URL を知っている人のみがアクセスできる前提で運用してください。

## はじめに（ローカル動作）
1) `npm install`
2) `npm run dev`（http://localhost:5173）
   - 管理者: `/index.html`、参加者: 管理者画面の 参加者URL
3) 本番ビルド: `npm run build` → 静的資産コピー: `npm run postbuild`

## 基本の流れ（外部仕様・概要）
以下のように、日程調整をすばやく効果的に実現できます。
- 管理者が日程（候補日）を用意する（画面で直接入力、または ICS をインポート）
- 共有トークンで管理者URL/参加者URLを発行し、参加者URLを参加者へ共有する
- 参加者が各候補に ○/△/× とコメントで回答する
- 一覧やサマリーで回答状況を確認し、必要に応じて Excel/ICS をエクスポート
- 確定した日程を ICS として配布する（外部カレンダーで利用可能）

より詳しい説明は `docs/external/guide-ical-workflow.md` を参照してください。

## 外部仕様

外部仕様を理解するための主要ドキュメントは次の3つです。
- [docs/external/concept-assumptions.md](docs/external/concept-assumptions.md)
- [docs/external/index-screens.md](docs/external/index-screens.md)
- [docs/external/guide-ical-workflow.md](docs/external/guide-ical-workflow.md)

> ⚠ **匿名アクセスの注意**  
> 現状のモック実装は匿名でログインでき、管理画面・参加者画面ともに誰でもデータを書き換え可能な仕様です。ハッシュ値付き URL で画面を出し分けるのみで認証やアクセス制御は行っていません。セキュアな運用が必要な場合は必ず別途認証・承認の仕組みを導入してください。

## Documentation Index

- ドキュメントの読み方と読者別索引: `docs/README.md`
- **外部向け** `docs/external/README.md`: 読み始める順番と目的別リンク
- **外部向け** [docs/external/index-screens.md](docs/external/index-screens.md): 画面役割と回答管理 UI の詳細
- **外部向け** [docs/external/guide-ical-workflow.md](docs/external/guide-ical-workflow.md): ICS 連携の運用メモ
- **外部向け** [docs/external/concept-assumptions.md](docs/external/concept-assumptions.md): 外部仕様の前提・制約（通常と異なる方式）
- **外部向け** [docs/external/ref-disclaimer.md](docs/external/ref-disclaimer.md): 免責事項と利用時の注意点
- **外部向け** [docs/external/ref-changelog.md](docs/external/ref-changelog.md): 変更履歴のメモ
- **外部向け** [docs/external/guide-contributing.md](docs/external/guide-contributing.md): コントリビューション手引き
- **外部向け** [docs/external/ref-contributors.md](docs/external/ref-contributors.md): コントリビューター一覧
- **外部向け** [docs/external/glossary.md](docs/external/glossary.md): 用語集
- **内部向け** `docs/internal/README.md`: 内部仕様の読み方と依存関係ガイド
- **内部向け** [docs/internal/concept-architecture.md](docs/internal/concept-architecture.md): 画面構成とバンドル構造
- **内部向け** [docs/internal/spec-data-model.md](docs/internal/spec-data-model.md): オンメモリ前提のデータモデル整理
- **内部向け** [docs/internal/spec-api-flow.md](docs/internal/spec-api-flow.md): in-memory サービスと API 草案
- **内部向け** [docs/internal/spec-server-integration-wip.md](docs/internal/spec-server-integration-wip.md): サーバー導入時の検討事項（WIP）
- **内部向け** [docs/internal/ref-verify-checklist.md](docs/internal/ref-verify-checklist.md): QA・目視確認の手順
- **内部向け** [docs/internal/guide-development-process-wip.md](docs/internal/guide-development-process-wip.md): 現行の開発プロセス定義（WIP）と経緯の要点
- **内部向け** [docs/internal/DEVELOPER_NOTES.md](docs/internal/DEVELOPER_NOTES.md): 作業メモと TODO の整理

| 種別 | 主な用途 | 配置 | 起動方法 / 挙動 |
| ---- | -------- | ---- | -------- |
| React / webpack 版 | 本番想定のアプリ実装（共有トークンで `/a/{token}` / `/p/{token}` へリダイレクト。`/r/{token}` は後方互換で `/p/{token}` に転送） | `src/frontend/` | `npm run dev` / `npm run build` |
| レガシーモック | 最新アプリ UI のスナップショット確認用静的コンテンツ | `public/legacy/` | ブラウザで直接開くだけ |

どの構成でも、動作確認時には Chrome DevTools の Console を開き、警告やエラーを把握する習慣を徹底してください。ICS まわりの詳細な運用は [docs/external/guide-ical-workflow.md](docs/external/guide-ical-workflow.md) にまとめています。

### Sample Data

まずは触ってみたい方向けに、すぐに使えるデモデータを用意しています。管理画面からプロジェクトJSONを読み込むか、ICSをインポートすれば即座に体験できます。

- Project JSON: `public/proj/scheduly-project-sampledata-001.json`
- ICS: `public/ics/scheduly-ics-sampledata-001.ics`

## 開発者向け情報

開発手順やビルド、レガシーモックの詳細は開発者向けドキュメントにまとめています。開発・運用に関わる方は以下を参照してください。

- `docs/internal/DEVELOPER_NOTES.md`

## ライセンス

このリポジトリは [Apache License 2.0](LICENSE) の下で配布されています。利用上の注意事項や免責については `docs/external/ref-disclaimer.md` も参照してください。
