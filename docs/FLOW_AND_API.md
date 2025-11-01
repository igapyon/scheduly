# Flow & API Sketch

React / webpack 版 Scheduly の現在実装に沿ったフロントエンドフローとサービス API の役割をまとめる。オンメモリ構成（`projectStore` + sessionStorage）を前提に、管理者／参加者の画面遷移と主要サービスの責務を整理する。

## 1. 全体像

```
管理者画面 (admin.jsx)                参加者 UI (user.jsx)
  ├─ projectService.resolveProjectFromLocation()  ─┐
  │                                               │
  ├─ scheduleService.* （候補 CRUD / ICS）        │
  ├─ participantService.* （参加者 CRUD）         │
  ├─ shareService.generate/rotate （共有 URL） ───┤
  ├─ tallyService / summaryService で派生データ   │
  └─ projectStore.subscribeProjectState()         │
                                                  ▼
                                        projectStore（オンメモリ + sessionStorage 永続化）
                                                  │
                                                  └─ shared routeContext / derived tallies / icsText
```

- 管理者・参加者画面はいずれも `/index.html` / `/user.html` から起動し、共有トークン付き URL（`/a/{adminToken}` / `/p/{participantToken}`）へリダイレクトされる。旧 `/r/{participantToken}` は参加者 UI へ後方互換で転送する。
- URL 解析は `projectStore.resolveProjectIdFromLocation()` が担当し、`routeContext` として現在のプロジェクト／参加者情報を保持する。
- すべてのサービスは `projectStore` を介して状態を書き換え、変更後は `tallyService.recalculate()` と `summaryService.*` を通じて派生ビューを構築する。

## 2. コアフロー

### 2.1 プロジェクト初期化と候補整備（管理者）

1. `projectService.resolveProjectFromLocation()` でプロジェクト ID と `routeContext` を決定。
2. 新規作成時は `projectService.create()` → `projectStore.resetProject()` で初期状態を生成。`icsText` は空の VCALENDAR を前提に再計算される。
3. 候補追加・更新は `scheduleService.addCandidate` / `updateCandidate` / `removeCandidate` が担い、処理後に `projectStore.replaceCandidates` と `tallyService.recalculate` を実行。ICS テキストは `scheduleService.persistCandidates()` 内で常に再生成され `projectStore` に保存される。
4. 外部 ICS の取り込みは `scheduleService.replaceCandidatesFromImport()` を経由し、`UID` / `DTSTAMP` の差分を保ったまま候補一覧と `icsText` を更新。

### 2.2 参加者管理と共有 URL

1. 参加者の CRUD は `participantService.addParticipant` / `updateParticipant` / `removeParticipant` / `bulkUpsertParticipants` が提供。トークンは `ensureUniqueToken` で生成され、`projectStore.upsertParticipant` に保存。
2. 共有 URL は `shareService.generate(projectId, { baseUrl, lastGeneratedBy, navigateToAdminUrl })` でプレースホルダーを実利用トークンへ差し替え。既存トークンが有効な場合は URL のみ更新する。
3. 再発行は `shareService.rotate()` を利用し、管理者・参加者トークンを同時に再生成。`projectStore.updateShareTokens` → `shareTokenIndex` を更新。
4. 生成後はオプションにより同一オリジンなら `/a/{adminToken}` へ自動遷移する。クロスオリジン時はブロックされ、`navigation` オブジェクトに理由が格納される。

### 2.3 参加者画面（インライン編集）

1. `user.jsx` は `projectService.resolveProjectFromLocation()` の `routeContext` を読み、`participantService.resolveByToken()` による逆引きで `participantId` を特定。`/r/{token}` でアクセスされた場合も同じルートコンテキストに収束させる。
2. カード内インライン編集では `responseService.upsertResponse()` を通じて回答状態を保存。サービス内で `tallyService.recalculate(projectId, candidateId)` が呼ばれ、派生タリーが更新される。
3. 参加者画面は `summaryService.buildScheduleView()` / `.buildParticipantView()` を利用して日程別／参加者別サマリーを描画。ストア購読により回答更新を即時反映し、単一のインラインエディタ状態を共有する。

### 2.4 集計とエクスポート（管理者/参加者）

1. `admin.jsx` の集計パネルは `summaryService` を利用し、`projectStore` の派生タリーを表示。
2. 確定候補などステータス変更は `scheduleService.updateCandidate()` で `status` / `sequence` / `dtstamp` を更新。
3. ICS エクスポートは `scheduleService.exportAllCandidatesToIcs()` / `exportCandidateToIcs()` を呼び、`projectStore.getIcsText()` を活用してファイルダウンロードを行う。
4. 参加者 UI は exceljs を用いた Excel エクスポートを提供。フロントで `Workbook` を生成し、Blob ダウンロードする。列は「日付/開始/終了/タイトル/ステータス/場所/説明」に続き、参加者ごとの(回答, コメント)の2列ペア、右端に ○/△/×/ー の集計と総合計行を出力する。
4. プロジェクト全体のスナップショットは `projectService.exportState()`（JSON）で取得でき、`importState()` で復元可能。

## 3. サービス API サーフェス

主要サービスは `src/frontend/services/` 配下に実装済み。ここでは代表的な関数と用途を示す（抜粋）。

### 3.1 project-service

| 関数 | 役割 |
| ---- | ---- |
| `create(payload)` | 新規プロジェクト ID を生成し初期化。 |
| `resolveProjectFromLocation()` | 共有トークン付き URL を解析し、`projectId` と `routeContext` を返す。 |
| `load(identifier)` | プロジェクト ID・管理者トークン・参加者トークンのいずれかで状態を取得。 |
| `updateMeta(projectId, changes)` | プロジェクトのメタ情報更新。 |
| `exportState(projectId, { returnJson })` / `importState(projectId, payload)` | JSON スナップショットの入出力。 |
| `subscribe(projectId, callback)` | ストア変更の購読。 |

### 3.2 schedule-service（ICS ハンドリング）

| 関数 | 役割 |
| ---- | ---- |
| `addCandidate` / `updateCandidate` / `removeCandidate` | 候補 CRUD。保存時に ICS とタリーを再計算。 |
| `replaceCandidatesFromImport(projectId, vevents, sourceIcsText)` | ICS ファイル取り込み。 |
| `exportAllCandidatesToIcs(projectId)` / `exportCandidateToIcs(projectId, candidateId)` | ICS テキストを生成しファイル名・シーケンスを整備。 |
| `createBlankCandidate()` / `createCandidateFromVevent()` | UI で利用する候補テンプレート・ICS パース。 |

### 3.3 participant-service

| 関数 | 役割 |
| ---- | ---- |
| `addParticipant` / `updateParticipant` / `removeParticipant` | 参加者 CRUD。トークン重複・表示名重複を検証。 |
| `bulkUpsertParticipants` | CSV インポート等の差分 upsert。 |
| `resolveByToken(token)` | 参加者トークンから `projectId` / `participantId` を逆引き。 |
| `listParticipants(projectId)` / `getToken(projectId, participantId)` | 表示・共有用のユーティリティ。 |

### 3.4 response-service

| 関数 | 役割 |
| ---- | ---- |
| `upsertResponse(projectId, payload)` | 回答を登録・更新し、候補タリーを即時再計算。 |
| `bulkImportResponses(projectId, list)` | バルクインポート（重複 ID は上書き）。 |
| `clearResponsesForParticipant(projectId, participantId)` | 指定参加者の回答をリセット。 |
| `listResponses` / `getResponse` | 現在状態の参照。 |

### 3.5 share-service

| 関数 | 役割 |
| ---- | ---- |
| `generate(projectId, { baseUrl, lastGeneratedBy, navigateToAdminUrl })` | 未発行トークンを発行、既存トークンは URL のみ更新。 |
| `rotate(projectId, { ... })` | 管理者・参加者トークンを強制再発行。 |
| `invalidate(projectId, type)` | 指定種別を削除（将来 UI 用）。 |
| `buildUrl(type, token, baseUrl)` / `isPlaceholderToken(token)` | URL 組み立て・プレースホルダー判定。 |

### 3.6 tally-service / summary-service

| サービス | 関数 | 役割 |
| -------- | ---- | ---- |
| tally-service | `recalculate(projectId, candidateId?)` | 候補・参加者単位の派生タリーを更新。 |
| summary-service | `buildScheduleView(projectId, options?)` / `buildParticipantView` | UI 表示用の集計ビューを生成。 |

## 4. API 呼び出し例

### 候補を追加し即座に再描画

```ts
const { projectId } = projectService.resolveProjectFromLocation();
const candidate = scheduleService.addCandidate(projectId, {
  summary: "キックオフ会議",
  dtstart: "2025-11-04T10:00",
  dtend: "2025-11-04T11:00",
  tzid: "Asia/Tokyo",
  location: "オンライン"
});

projectService.subscribe(projectId, (state) => {
  renderSchedule(summaryService.buildScheduleView(projectId, { state }));
});
```

### 参加者が回答を送信

```ts
const { projectId, routeContext } = projectService.resolveProjectFromLocation();
responseService.upsertResponse(projectId, {
  participantId: routeContext.participantId,
  candidateId: selectedCandidateId,
  mark: "o",
  comment: "この時間なら対応できます"
});
```

### 共有 URL を再発行し管理画面へ遷移

```ts
shareService.rotate(projectId, {
  baseUrl: window.location.origin,
  lastGeneratedBy: currentUserEmail,
  navigateToAdminUrl: true
});
```

## 5. 検討メモと今後の拡張

- `routeContext` を軸にした画面遷移（タブ復元やスクロール位置保存など）の整備。
- `summary-service` の派生データを活かした UI 拡張（最多回答日・未回答者一覧など）を優先 TODO として管理。
- バックエンド実装時は、ここで定義したサービス層を fetch/API 呼び出しへ置き換える想定。`projectStore` はキャッシュ層として流用できる。
- アクセス制御や監査ログ、トークン失効 API は今後のサーバーサイド連携で検討。現状はフロント内で `shareService.isPlaceholderToken` を活用し、プレースホルダー値を意図的に除外している。

---

## 6. Server API（Minimum, In-Memory）

本節は最初のオンメモリ版サーバの I/F と、楽観排他（行/個票/リスト/メタ/トークン）の前提を定義する。永続DBへ移行してもエンドポイントと I/O は維持する。

- 共通事項
  - すべて JSON。日時は ISO8601（タイムゾーン付与）、内部処理は UTC 正規化。
  - サブリソースごとに整数 `version` を持つ。更新時はクライアントの `version` を受け取り一致しなければ 409。
  - 失敗時の代表コード: 400/422=バリデーション、409=競合、413=サイズ超過、429=レート制限。

- 取得
  - GET `/api/projects/:id`
    - returns: `{ meta, candidates[], candidatesListVersion, participants[], responses[], shareTokens, derived?, versions }`
    - 各要素に `version` を含める。`responses` は `(participantId,candidateId)` 行単位の `version` を持つ。

- 回答（Responses）
  - POST `/api/projects/:id/responses`
    - body: `{ participantId, candidateId, mark, comment, version }`
    - 200: `{ response: {..., version: newVersion} }`
    - 409: `{ conflict: { response: latestRow } }`

- 候補（Candidates）
  - PUT `/api/projects/:id/candidates/:cid`
    - body: `{ ...candidateFields, version }`
  - POST `/api/projects/:id/candidates:reorder`
    - headers/body: `If-Match` or `{ candidatesListVersion }`
  - POST `/api/projects/:id/ics/import`
    - headers/body: `If-Match` or `{ candidatesListVersion }`, payload: `icsText | items[]`

- 参加者（Participants）
  - PUT `/api/projects/:id/participants/:pid`
    - body: `{ ...participantFields, version }`

- プロジェクトメタ / 共有トークン
  - PUT `/api/projects/:id/meta`（`projectMeta.version`）
  - POST `/api/projects/:id/share/rotate`（`shareTokens.version`）

- 運用
  - GET `/api/healthz` / GET `/api/readyz`

### 楽観排他の粒度
- Responses: 1行（participantId × candidateId）。`version` 必須。
- Candidates: 個票ごとに `version`。一覧操作は `candidatesListVersion` を If-Match。
- Participants: 個票ごとに `version`。
- Project Meta: `projectMeta.version`。
- Share Tokens: `shareTokens.version`。

### クライアントの競合処理（指針）
- 409 時は最新を取得してマージ/やり直し導線を提示。Responses は行差分を画面へ反映、Candidates/Participants はフォーム再読込、一覧操作/ICS は同期→再試行。

---

## 7. エラーモデルと UI 対応（簡潔）

- レスポンスの標準形（バリデーション）
  - 422: `{ code: 422, message: string, fields?: string[] }`
  - `fields` は UI で赤枠を付ける対象キー（例: `['summary', 'description']`）。
- 競合・サイズ等の代表コード
  - 409 競合、413 サイズ超過、429 レート制限、400/422 入力エラー。
- UI 方針（要約）
  - 値は保持、NG は赤枠＋短いメッセージ（トースト/ステータス）。
  - Datetime は編集途中は許容、完成時のみ厳密検証。順序 NG は保存をブロックせず通知。
- 運用メモ
  - 422 を `console.debug` に格下げし、操作を阻害しない。
  - 詳細は `docs/VALIDATION_POLICY.md` を参照。
