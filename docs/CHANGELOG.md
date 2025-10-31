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
- 共有コンポーネントの JSX ランタイム移行に伴う import 整理と displayName 付与を実施し、永久ログの注意書きを docs/DEVELOPER_NOTES.md に追記。

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
- docs/DEVELOPER_NOTES.md
- public/legacy/scheduly-admin-mock.html
- public/legacy/scheduly-user-byschedule-mock.html (added)
- public/legacy/scheduly-user-byuser-mock.html
- public/legacy/scheduly-user-edit-mock.html (deleted)
- public/legacy/scheduly-user-mock.html (deleted)
- src/frontend/shared/EventMeta.jsx
- src/frontend/user.jsx

Stats
- 8 files changed, 331 insertions(+), 784 deletions(-)
