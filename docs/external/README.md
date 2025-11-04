# External Docs Guide

Scheduly を利用者・運用担当として把握するための入口です。最初に読むべき資料と、目的別の参照先をまとめています。

## 読み始める順番
- `docs/external/concept-assumptions.md` – 想定している利用シナリオと前提条件
- `docs/external/index-screens.md` – 画面の全体像と主要機能
- `docs/external/guide-ical-workflow.md` – ICS を使った運用手順
- `docs/external/glossary.md` – 用語集（不明な単語があれば参照）

## 想定シナリオ
- 主催者が候補日をまとめて提示し、参加者に○/△/×とコメントで回答してもらう日程調整
- URL を共有するだけで管理者画面と参加者画面を切り替え、認証設定を行わずに素早く運用したいケース
- 確定した候補を ICS で共有し、社内/外部カレンダーに取り込みたい場合

> 秘密URLは URL を知っている人なら誰でもアクセスできる仕組みです。共有範囲に注意し、不要になったプロジェクトは破棄する運用を推奨します。

## 目的別リファレンス
- 運用フローとよくある手順: `docs/external/guide-ical-workflow.md`
- 利用ルールや免責: `docs/external/ref-disclaimer.md`
- 変更履歴: `docs/external/ref-changelog.md`
- コミュニティ/貢献方法: `docs/external/guide-contributing.md`
- コントリビューター一覧: `docs/external/ref-contributors.md`

## 表記・リンクの見方
- 当プロジェクトでは「管理者URL」「参加者URL」を秘密URLとして扱います。
- 「トークン」は URL 内のランダムな文字列で、コピペ時に失わないよう注意してください。
- 詳細な用語は `docs/external/glossary.md` に一覧化しています。

## セキュリティ運用の注意
- 参加者へ共有するのは参加者URLのみ。管理者URLは本人または限定された管理者にとどめる。
- 秘密URLを共有する際は対象者を限定し、不要になったらプロジェクトを破棄する。
- ブラウザのオートコンプリートや履歴に URL が残る場合があるため、共有端末ではクリアする。
- URL が漏洩した場合に備え、重要なプロジェクトでは外部認証や代替手段を検討する。

不明点や追加してほしい情報があれば `docs/internal/DEVELOPER_NOTES.md` の TODO に追記するか、Issue で相談してください。
