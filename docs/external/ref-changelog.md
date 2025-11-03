# Changelog

Scheduly の変更履歴を記録するドキュメントです。まだ公式リリース前のため、暫定的なメモとして運用します。

## 2025-10-29

- About/免責事項/コントリビューターの静的ページを新規追加しました。
- 主要セクションにクリック式ツールチップ InfoBadge を追加し、管理画面・参加者一覧・回答編集の各画面で操作の意図や使い方を参照できるようにしました
- 共有 URL 発行やサンプル JSON／ICS データを含むドキュメント群を拡充し、仕様とモックの実態が一致するよう整備しました

## 2025-10-30

フロントエンドのサービス層を統合し、参加者引き継ぎ問題を修正

概要

- project-service・tally-service・summary-service を追加し、プロジェクト状態管理／集計／派生ビュー生成を集中管理。
- admin.jsx / user.jsx / user-edit.jsx を新サービス経由の購読に差し替え、共通ストアからの同期とタリー更新を統一。
- 参加者画面→回答編集画面で選択が失われないよう最後に選んだ参加者 ID を保持しつつ、恒久的に利用するデバッグログをコードとドキュメントに明記。
- project-store.js を拡張して派生タリーを永続化し、新しいゲッター／ルートコンテキストの連携を整備。
- 共有コンポーネントの JSX ランタイム移行に伴う import 整理と displayName 付与を実施し、永久ログの注意書きを docs/internal/DEVELOPER_NOTES.md に追記。

## 2025-10-31

Commits
- Cherry-pick: モックを最新で更新 (#32)
- Cherry-pick: UI操作性の改善 (#33)

Highlights
- Update legacy mock HTML files and add schedule-based mock page.
- Remove obsolete legacy mock pages.
- Improve UI operability in participant/user screens.
- Update developer notes.

Files Changed (overview)
- docs/internal/DEVELOPER_NOTES.md
- public/legacy/scheduly-admin-mock.html
- public/legacy/scheduly-user-byschedule-mock.html (added)
- public/legacy/scheduly-user-byuser-mock.html
- public/legacy/scheduly-user-edit-mock.html (deleted)
- public/legacy/scheduly-user-mock.html (deleted)
- src/frontend/shared/EventMeta.jsx
- src/frontend/user.jsx

Stats
- 8 files changed, 331 insertions(+), 784 deletions(-)

## 2025-10-31b

### 概要
- 管理画面の操作性改善（1カード開閉、長押し展開、視覚強調、住所/説明の省略制御）
- 参加者画面の Excel 出力（exceljs）を新規実装＋見やすさ改善多数
- Tailwind 本番ビルド導入の足場づくり（CDNフォールバック付）
- favicon 404 解消
- ドキュメント（README/DEVELOPER_NOTES/SCREEN_OVERVIEW/FLOW_AND_API）を最新化

### 変更点（ハイライト）
#### 管理画面（admin.jsx）
- 開いている日程は常に1件のみ（トグルで全閉も可）
- サマリー部を開いた時だけ薄い緑背景で強調（閉時は白のまま）
- タイトルは常に表示、説明と場所は閉時のみ省略表示
  - 場所（LOCATION）閉時は40chで省略
- 日程サマリーを長押し（500ms）で展開可能（クリックと共存）
- ICS 詳細モーダルを撤廃し、UIDは隠し要素（data-uid）でDOMに埋め込み
- プロジェクト情報セクションは“編集中”を示す薄緑背景へ

#### 参加者画面（user.jsx）— Excel 出力（新規）
- exceljs（MIT）でフロントからExcel生成・DL
- 列構成
  - A: 日付 / B: 開始 / C: 終了 / D: タイトル（SUMMARY）
  - E: ステータス（STATUS） / F: 場所（LOCATION） / G: 説明（DESCRIPTION）
  - H以降: 参加者ごとに2列ペア（回答 記号, コメント）
  - 右端4列: ○ / △ / × / ー の日程別集計、最後に総合計行
- 見た目・可読性
  - 1行目を水色背景（太字）
  - 記号セル（○△×ー）の文字色を緑/黄/赤/灰に着色
  - 合計行は薄オレンジ背景（太字）
  - 列幅を用途ごとに固定（タイトル/説明/場所は広め、記号/集計は狭め）
- 追加仕様
  - コメントは参加者の記号列の直後に出力（2列ペア）
  - 日程データ直下に4行（○/△/×/ー）の参加者別カウントを縦に揃えて出力
  - ダウンロード名: `scheduly-participant-responses_YYYY-MM-DD.xlsx`

#### ビルド/配布まわり
- Tailwind 本番ビルド用設定（tailwind.config.js / postcss.config.js / `src/styles/tailwind.css`）
- HTML（`public/index.html`, `public/user.html`）はビルドCSSを優先、存在しない場合のみCDNを自動読込（エラー抑止）
- favicon 404 解消（`public/favicon.ico` と `<link rel="icon">` 追加）

#### ドキュメント更新
- README.md: 参加者UIがExcel出力対応である旨を追記
- DEVELOPER_NOTES.md: AppendixにExcel出力の仕様/列幅/見た目/導入手順を追加
- SCREEN_OVERVIEW.md: 参加者UIのデータ入出力にExcelエクスポートを追記
- FLOW_AND_API.md: エクスポート節にexceljsワークフローを追加

### 影響範囲
- 既存UIの挙動は後方互換（管理サマリーの長押し/単一開閉はUX改善）
- Excel出力は新規機能（依存: `exceljs`）。未導入環境ではDL時に案内を表示
- TailwindはビルドCSS優先だが、ビルド物が無い開発時もCDNで崩れない

### 動作確認（推奨）
- 管理
  - 日程カードが1件のみ開くこと、閉時の省略/開時のフル表示/背景強調
  - 長押しで展開でき、クリックと二重トグルにならない
  - ICS詳細ボタンが無いこと、UIDがDOMに埋め込まれていること
- 参加者
  - 「全回答を Excelブックでダウンロード」で仕様通りのブック生成
  - 記号セルの色・列幅・集計/総合計・ファイル名に日付が入ること
- 共通
  - favicon の 404 が出ない
  - HTML読み込みで Tailwind の 404/MIME エラーが出ない

### 既知事項/今後の余地（参考）
- Excel: コメント列の折返し（wrapText）/ Freeze panes / AutoFilter は後続で追加可能
- 参加者/管理のガイド文言（InfoBadge）は運用に合わせて調整余地あり
