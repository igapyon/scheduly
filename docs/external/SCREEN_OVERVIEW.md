# Screen Overview

Scheduly の React 版 UI は現状、次の 2 画面で構成されます。ここでは役割と主要要素、画面間の関係を簡潔に整理します。すべて `src/frontend/` に JSX 実装があり、`public/*.html` からエントリーポイントとして読み込まれます。アクセス方式や保存ポリシーなど、通常のWebアプリと異なる前提は `docs/external/EXTERNAL_ASSUMPTIONS.md` を参照。

## 管理画面（Admin Console）

- **エントリ**: `src/frontend/admin.jsx` / 初期表示: `public/index.html`（共有トークン発行後は `/a/{token}` へリダイレクト）
- **目的**: プロジェクト情報の編集、候補日（イベント）管理、ICS のインポート／エクスポート、共有 URL の生成など主催者向け操作をまとめる。
- **主要 UI**:
  - プロジェクト情報フォーム（タイトル・説明）
  - 候補日カード（確定／仮／取消しラベル、日時、場所、メモ）
  - ICS 個別／一括エクスポート、ICS インポートプレビュー
  - プロジェクト JSON のエクスポート／インポート
  - 共有 URL（管理者／参加者）生成と表示
- **データ入出力**:
  - `projectStore` を中心に状態を保持（sessionStorage ベース）。候補やメタの更新は `scheduleService` などのサービス層を介して行う。
  - ICS インポートは `scheduleService.replaceCandidatesFromImport()` で反映し、ICS エクスポートは `scheduleService.exportCandidateToIcs()` / `exportAllCandidatesToIcs()` を利用。
  - 共有 URL の生成はオンメモリ。発行後は `/a/{token}` にリダイレクトして管理画面を再表示する。

## 参加者 UI（Participant Dashboard）

- **エントリ**: `src/frontend/user.jsx` / 初期表示: `public/user.html`（共有トークン利用時は `/p/{token}` へリダイレクト。後方互換で `/r/{token}` は `/p/{token}` に転送）
- **目的**: 参加者・主催者の双方が全候補の概要と回答サマリーを確認し、出欠状況を把握・更新できるようにする。
- **主要 UI**:
  - 「日程ごと」「参加者ごと」のタブ切り替え
  - 各候補日カード：日付・時間・場所・説明・回答サマリー（○△×）
  - 個別参加者の回答一覧（参加者タブ）とカード内インライン編集（○△× とコメント）
- **データ入出力**:
  - `projectStore` の派生データ（タリー/サマリー）を利用して日程別・参加者別のビューを構成。再計算は `tallyService.recalculate()` が担当。
  - インライン編集で回答を更新すると即時保存され、派生データが再計算されてリアルタイムに反映される。
  - 回答全体を Excel 形式（exceljs）でエクスポート可能。列は「日付/開始/終了/タイトル/ステータス/場所/説明 + 参加者ごとの(回答, コメント) + 右端集計（○/△/×/ー）」で構成される。

## 画面間の関係

1. **管理画面**で候補やプロジェクト情報を編集し、参加者向け URL を発行する。
2. 参加者は共有された **参加者 UI** で概要を確認し、カード内のインライン編集で自身の回答（○△×／コメント）を更新する。
3. 回答更新は即時集計され、タブ/カードに反映される。

現状は `projectStore` を中心とした in-memory データレイヤーで 2 画面が同期しており、共有トークンや URL パラメータを経由して状態を切り替える。保存方針やバリデーション原則は `docs/external/EXTERNAL_ASSUMPTIONS.md` と `docs/internal/VALIDATION_POLICY.md` を参照。今後サーバー/API を導入する際は、このデータモデル（Project / Candidate / Participant / Response）を REST などに移行し、同じ参照構造を維持する想定。
