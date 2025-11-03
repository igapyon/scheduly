# Screen Technical Overview

この文書は、Scheduly の画面構成の技術的観点をまとめた内部向けガイドです。外部向けの概要は `docs/external/index-screens.md` を参照してください。
<!-- file moved to ref-screen-tech-overview.md by docs prefix policy -->

## 1. エントリポイントとルーティング

- 管理画面（Admin Console）
  - JSX: `src/frontend/admin.jsx`
  - 初期表示: `public/index.html`
  - 共有トークン発行後の遷移: `/a/{token}`

- 参加者 UI（Participant Dashboard）
  - JSX: `src/frontend/user.jsx`
  - 初期表示: `public/user.html`
  - 共有トークン利用時の遷移: `/p/{token}`（後方互換で `/r/{token}` は `/p/{token}` に転送）

## 2. データフローと主要サービス

- 中心ストア: `projectStore`
  - 役割: アプリ状態（プロジェクト、候補、参加者、回答）を保持（sessionStorage ベース）
  - 購読/通知: `projectStore.subscribe` による購読で派生データ再計算をトリガ

- サービス層
  - `scheduleService`: 候補/メタの編集、ICS インポート/エクスポート
    - ICS インポート反映: `scheduleService.replaceCandidatesFromImport()`
    - ICS エクスポート: `scheduleService.exportCandidateToIcs()` / `scheduleService.exportAllCandidatesToIcs()`
  - `tallyService`: 回答の派生タリー/サマリーを再計算（`tallyService.recalculate()`）
  - `summaryService`: サマリービュー用の派生データ構築（schedule/participants 両タブ）
  - `responseService`: 回答の upsert、保存成否の通知

## 3. 画面構成（技術要点）

- 管理画面
  - プロジェクト情報フォーム（タイトル・説明）
  - 候補日カード（確定/仮/取消し、日時、場所、メモ）
  - ICS 個別/一括エクスポート、ICS インポートプレビュー（上記サービス関数を使用）
  - プロジェクト JSON のエクスポート/インポート
  - 共有 URL（管理者/参加者）生成と表示（オンメモリ生成）

- 参加者 UI
  - 「日程ごと」「参加者ごと」のタブ切り替え
  - カード内インライン編集（○△×/コメント）で即時保存 → 再計算 → 反映
  - Excel エクスポート: `exceljs` を利用して回答一覧をワークブック出力

## 4. 保存・再計算・反映の流れ

1. UI 操作で `responseService.upsert` 等を呼び出し保存
2. 保存完了/失敗のステータスを UI に反映
3. `tallyService.recalculate()` により派生データを更新
4. `projectStore` の購読先で `summaryService` がビュー用データを再構築

## 5. 参考

- 外部仕様の前提・制約: `docs/external/concept-assumptions.md`
- バリデーション方針: `docs/internal/VALIDATION_POLICY.md`
- ICS 内部仕様: `docs/internal/ICAL_INTERNALS.md`
