# iCal (ICS) Internals

この文書は、Scheduly における ICS（iCalendar）処理の内部構成・依存・主要関数の概要を開発者向けにまとめたものです。外部仕様は `docs/external/guide-ical-workflow.md` を参照してください。
<!-- file moved to spec-ical-internals.md by docs prefix policy -->

## コンポーネントと責務

- projectStore
  - 候補・参加者・回答・派生データ（タリー/サマリー）・ICS テキストなどを集約管理（sessionStorage ベース）。
  - `getIcsText()` で最新の ICS テキストを参照可能。

- scheduleService
  - 候補の追加・更新・削除、ICS インポート/エクスポート、SEQUENCE/DTSTAMP の更新。
  - 主要関数例: `replaceCandidatesFromImport()`、`exportCandidateToIcs()`、`exportAllCandidatesToIcs()`、`persistCandidates()`。

- tallyService / summary 派生
  - 回答更新時の再集計、日程別/参加者別のサマリー生成。
  - `tallyService.recalculate()` により派生データを最新化。

- shared/ical-utils.js
  - `ensureICAL()` で `ical.js` の lazy ロードとパース処理を提供。
  - テキストエスケープ、UTC 変換、フォーマット補助などのユーティリティ。

## メタデータと更新規則

- UID: 候補生成時に一意に付与。外部同期時のマージキー。
- DTSTAMP: 更新時刻。出力時に UTC へ正規化。
- SEQUENCE: 版数。候補の意味的更新でインクリメント。
- TZID: 入力がない場合は既定値（例: `Asia/Tokyo`）。必要に応じて X- 拡張で補足。

## デバッグとログ

- サービス層にはロガーを用意（例: `createLogger("schedule-service")`）。
- ICS 関連エラーは候補データを含めて `console.error` に出力。

## 既知の課題・改善ポイント（実装観点）

- `VTIMEZONE` の自動付与。
- インポート差分の通知・再取り込みの UI/スケジューラ。
- フォーマット検証と `TZID` バリデーションの強化。
- バックエンド導入時の ICS 配布（署名付き URL など）。
