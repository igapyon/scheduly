# Internal Docs Guide

Scheduly の内部仕様・運用ドキュメントを読むための入口です。新しく参加するエンジニアや運用設計担当向けに、読む順序と関連性をまとめています。

## 最初に読むドキュメント
1. `docs/internal/concept-architecture.md` – アプリ構成と技術スタックの全体像
2. `docs/internal/spec-data-model.md` – オンメモリを前提にしたデータモデル
3. `docs/internal/spec-api-flow.md` – フロントエンドサービスと API フローの概要
4. `docs/internal/DEVELOPER_NOTES.md` – 作業メモと TODO、運用ルール

## フロー別の参照先
- 画面の技術詳細: `docs/internal/ref-screen-tech-overview.md`
- サーバー連携計画 (WIP): `docs/internal/spec-server-integration.md`
- 共有 URL 仕様: `docs/internal/spec-share-url-generation.md`
- バリデーション方針: `docs/internal/spec-validation-policy.md`
- ICS 内部仕様: `docs/internal/spec-ical-internals.md`
- 開発プロセス: `docs/internal/guide-development-process.md`
- QA / 目視確認手順: `docs/internal/ref-verify-checklist.md`

## 文書間の関係（概要）
- `spec-data-model.md` を中心に `spec-api-flow.md` や `spec-share-url-generation.md` が依存。
- `ref-screen-tech-overview.md` は UI 関連 spec の補足資料として参照。
- `spec-server-integration.md` は現行のオンメモリ構成からサーバー連携へ移行する際の前提をまとめており、`spec-data-model.md` の永続化方針とリンク。

## 日々の参考資料
- 作業状況や TODO: `docs/internal/DEVELOPER_NOTES.md`
- PR/レビュー時のチェック: `docs/internal/ref-verify-checklist.md`
- ドキュメント命名規約・運用: `docs/internal/DEVELOPER_NOTES.md` 内の「ドキュメント命名規約」節を参照

改善や追記が必要な場合は `DEVELOPER_NOTES.md` の TODO に書き込むか、該当ドキュメントへ直接反映してください。
