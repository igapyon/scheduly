# Screen Technical Overview

この文書は、Scheduly の画面別技術構成と主要サービスの連携をまとめた内部向けメモです。外部仕様は `docs/external/index-screens.md` を参照してください。

## 1. エントリポイントとルーティング

| 画面 | JSX | 初期 HTML | 本番ルート |
| ---- | --- | --------- | ---------- |
| 管理画面 (Admin Console) | `src/frontend/admin.jsx` | `public/index.html` | 共有URL発行後は `/a/{token}` へ遷移 |
| 参加者 UI (Participant Dashboard) | `src/frontend/user.jsx` | `public/user.html` | 共有URLから `/p/{token}`（`/r/{token}` は後方互換リダイレクト） |

Nginx 側で `/p` / `/r` を `user.html` にリライトし、`/api/` は Express API へ proxy_pass する。

## 2. データフローとサービス層

- 中心ストア: `projectStore`
  - API snapshot を保持し、sessionStorage にプロジェクト ID をキャッシュ。
  - `projectStore.subscribe(projectId, callback)` で UI が派生データを再構築。
  - `projectStore.replaceStateFromApi()` が API 応答を流し込み、`projectService` がルート解決や購読管理を担当。

- サービス層（フロント）
  - `projectService`: プロジェクト解決、snapshot sync、メタ更新、共有トークン回転 (`shareService`) など API 連携の中核。
  - `scheduleService`: 候補 CRUD・順序更新・ICS import/export を API 経由で実行。
  - `participantService`: 参加者の CRUD、命名変更、削除。`tallyService` を再計算。
  - `responseService`: 回答の upsert/delete。成功時に `tallyService.recalculate(projectId, candidateId)` を呼び、最新サマリーを反映。
  - `summaryService`: `tallyService` の結果と state を組み合わせ、日程/参加者タブ向けのビューを生成。

## 3. 画面構成と主要要素

### 管理画面
- プロジェクト情報フォーム（名前/説明/タイムゾーン）。
- 候補カード（確定/仮/取消しバッジ、日時、場所、説明、メニュー）。
- ICS 個別/一括エクスポート、ICS インポートフロー（API import → snapshot 再取得）。
- プロジェクト JSON のエクスポート/インポート。
- 共有 URL パネル（基準 URL、管理者/参加者 URL、発行日時、コピー操作）。
- テスト公開パネル/リロードボタン（API 再取得）。

### 参加者 UI
- タブ切り替え（「日程ごと」「参加者ごと」）。
- 日程サマリー: 候補カード + ○△× 集計 + 参加者リスト。回答ボタンで `InlineResponseEditor` を展開。
- 参加者サマリー: 参加者カードに回答統計/コメント/インライン編集リンクを表示。
- インライン編集: ○△× ボタンとコメント欄 → `responseService.upsert` → ステータスメッセージ表示。
- 回答アクション: ICS 一括エクスポート、Excel エクスポート、注意パネル、リロードボタン。

## 4. 保存・再計算・反映のフロー

1. UI 操作（回答更新/候補編集/共有URL回転など）で対応するサービスが API を呼ぶ。
2. API 応答で `projectStore` を更新し、`tallyService.recalculate` が必要なタリーのみ再計算。
3. `projectStore.subscribe` を介して `summaryService.buildScheduleView` / `buildParticipantView` を再実行。
4. React コンポーネントは `useState`/`useEffect` で派生データを受け取り再描画。ステータスやバナーで同期状況をユーザーに提示。

## 5. 参考リンク

- `docs/external/concept-assumptions.md`: 外部仕様上の前提。
- `docs/internal/spec-server-integration.md`: API / InMemoryStore の詳細。
- `docs/internal/spec-ical-internals.md`: ICS の取り扱い。
- `docs/internal/spec-validation-policy.md`: 入力バリデーション方針。

UI やサービスの挙動を変更した場合は、本ファイルと `docs/external/index-screens.md` の双方を更新して整合を保つこと。
