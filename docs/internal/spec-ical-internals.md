# iCal (ICS) Internals — 2025 Edition

Scheduly の ICS（iCalendar）処理は、フロントエンドと API サーバーの双方で責務を分担しています。ここでは現行実装のコンポーネント、主要フロー、メタデータ運用、既知の課題を整理します。外部仕様は `docs/external/guide-ical-workflow.md` を参照してください。

## 1. コンポーネント構成

| レイヤ | モジュール | 役割 |
| ------ | ---------- | ---- |
| フロント (React) | `scheduleService` | API への ICS import/export 呼び出し、候補 CRUD、プレビュー表示。 |
| フロント | `shared/ical-utils.js` | `ical.js` のラッパー、日時フォーマット、テキストエスケープ。 |
| API (Express) | `src/server/store.js` (`InMemoryProjectStore`) | `icsText` と `candidates` を正として保持。UID/DTSTAMP/SEQUENCE を更新し、JSON snapshot を返す。 |
| API | `routes/projects.js` | `/api/projects/:projectId/import`／`/ics`／`/export` のエンドポイント。import では ICS を解析して state を差し替え、export は `icsText` をそのまま返す。 |

### データの正

- `ProjectState.icsText`: API サーバーの InMemoryStore が常に最新 ICS を保持する。
- `candidates[]`: `icsText` のパース結果。`uid`, `sequence`, `dtstamp`, `status`, `summary`, `description`, `location`, `tzid`, `dtstart`, `dtend`, `rawVevent` を持つ。
- フロントでの編集操作は API 経由で `candidates` を更新し、その結果として `icsText` が再生成される。

## 2. 主要フロー

### 2.1 ICS インポート

1. 管理画面でファイルを選択すると `scheduleService.previewImport(file)` が `ical.js` でプレビューを生成。
2. 確定時に `scheduleService.importFromIcs(projectId, file)` が `POST /api/projects/:projectId/import` を呼び、サーバーにて:
   - `ical.js` で VEVENT を解析。
   - `UID + DTSTAMP` をキーに既存候補を更新、未知 UID は新規追加。
   - `icsText` を丸ごと差し替え、`candidates` を再構築。
3. API 応答を `projectStore.replaceStateFromApi()` が受け取り、`summaryService` でビューを再生成。

### 2.2 ICS エクスポート

- 個別候補: `GET /api/projects/:projectId/ics?candidateId=...` → `scheduleService.downloadCandidateIcs()` がブラウザでファイル化。
- 全候補: `GET /api/projects/:projectId/ics`（または `/export` で JSON + ICS を同梱）。参加者画面の「日程を ICS に一括エクスポート」もこのエンドポイントを利用。
- エクスポート時はサーバーの `icsText` をそのまま返すため、フロント側で再生成する必要はない。ダウンロードボタンは Blob を作成して保存させる。

### 2.3 候補 CRUD

- `scheduleService.addCandidate/updateCandidate/removeCandidate` が API を呼び、サーバーが `rawVevent` と `icsText` を更新。
- `UID` はサーバー生成（`generateId("slot")` + `uid` 同期）で一意性を確保。
- 更新後は `tallyService.recalculate(projectId)` を経て集計値を再反映。

## 3. メタデータポリシー

| フィールド | 役割 / 更新タイミング |
| ---------- | -------------------- |
| `UID` | 候補の一意性。インポート時は既存 UID との突き合わせに使用。新規候補生成時はランダム ID。 |
| `DTSTAMP` | 最終更新時刻。サーバー側で `new Date().toISOString()` を付与。インポート時は外部ファイルの値を尊重。 |
| `SEQUENCE` | 意味的更新ごとに +1。API 側で更新し、ICS 再生成時に反映。 |
| `TZID` | プロジェクトの `defaultTzid` を既定とし、候補ごとに上書き可能。インポート時は VEVENT の `TZID` を優先。 |
| `LOCATION` / `DESCRIPTION` / `STATUS` | UI 編集と連動。ICS へは `ical.js` のプロパティとして書き戻す。 |
| `VTIMEZONE` | 現状は最小限（`TZID` のテキスト）で出力。将来的に詳細定義を付与する計画あり。 |

## 4. エラーハンドリング / ロギング

- フロント: `scheduleService` が import/export の成功/失敗をトースト表示。プレビューエラーはモーダル内で表示。
- サーバー: `logger` で `ics.import` / `ics.export` の開始・成功・エラーを記録。失敗時は 400/422 とメッセージを返す。
- 代表的な失敗: 無効な ICS（パース不可）、UID 競合、許容サイズ超過、バリデーション違反。

## 5. 既知の課題

- `VTIMEZONE` の自動生成（現状は TZID 名のみ）。
- インポート差分の可視化（プレビュー → 適用差分を UI 上で明示）。
- 共有 URL ごとのアクセス制御: ICS エクスポートに簡易トークン保護を導入する案。
- 大規模インポートでのパフォーマンス最適化（おおむね数百件までは実測で問題なし）。

## 6. 関連ドキュメント

- `docs/internal/spec-api-flow.md` — API ルーティングと処理フロー。
- `src/server/store.js` — InMemoryProjectStore の実装。
- `src/frontend/services/schedule-service.js` — フロント側 ICS 処理のエントリ。

実装を変更した際は、本ドキュメントと `guide-ical-workflow.md` を合わせて更新してください。
