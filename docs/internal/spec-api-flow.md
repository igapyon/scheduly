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

### 同期方式と競合処理

- フロントは当面、ポーリングまたは画面リロードによる定期同期とする（※API 導入後の構成を想定した計画であり、現行 sessionStorage 実装では未対応）。初期フェーズでは WebSocket 等の常時接続は導入せず、UI 側は 30〜60 秒間隔で `GET /api/projects/:id` を呼び出して最新状態に追随する。参加者画面も回答送信後に `projectStore.rehydrateFromServer()`（仮称・未実装）でサーバー値へ寄せる。
- API 層は各リソース（Participants/Candidates/Responses/ShareTokens/ProjectMeta）に `version` を持たせ、更新時にクライアントの `version` と比較する。差異がある場合は 409 を返却し、レスポンスに最新レコードを含める。
- フロントは 409 を受けたらローカルの楽観更新をロールバックし（`projectStore.rollbackPending()` など）、直後に全体再取得を実行。UI 上では最新値を表示しつつ「最新データに更新しました。再入力してください。」等のトーストで利用者へ案内する。
- 楽観更新ヘルパーはサービス層で共通化し、通信失敗時も同じロールバック→再取得→再入力促しのパターンを適用する。

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

最初のオンメモリ版サーバで提供する REST I/F をまとめる。クライアントは管理者トークン（全操作可）または参加者トークン（スナップショット取得と自身の回答のみ）でアクセスする想定。

### 6.1 共通事項

- すべて JSON（日時は ISO8601+TZ）。内部処理は UTC で正規化。
- 書き込み系 API は `version`（または `If-Match`）を要求する。サーバ側の `version` と不一致なら 409 を返し、レスポンスに最新レコードを含める。
- エラーレスポンスの基本形: `{ code, message, fields?, conflict? }`。`fields` は 422、`conflict` は 409 時のみ利用。
- 標準ステータスコード: 200/201/204 正常、400/422 入力エラー、404 不存在、409 競合、413 サイズ超過、429 レート制限。

### 6.2 プロジェクト（Meta / Snapshot）

- `ProjectMetaInput` = `{ name, description?, defaultTzid }`

| Method | Path | 説明 |
| ------ | ---- | ---- |
| POST | `/api/projects` | 空のプロジェクトを作成。body=`{ meta: ProjectMetaInput }`。201: `{ projectId, meta: {..., version} }`。 |
| GET | `/api/projects/:projectId/snapshot` | 管理者/参加者共用の一括取得。レスポンス: `{ project, candidates, participants, responses, shareTokens, versions }`。 |
| PUT | `/api/projects/:projectId/meta` | メタ情報更新。body=`{ meta: ProjectMetaInput, version }`。200: `{ meta: {..., version: newVersion} }`。409: `{ conflict: { meta: latestMeta } }`。 |

### 6.3 候補（Candidates）

- `ScheduleCandidateInput` = `{ candidateId?, summary, description?, location?, dtstart, dtend, tzid, status, version? }`

| Method | Path | 説明 |
| ------ | ---- | ---- |
| POST | `/api/projects/:projectId/candidates` | 候補追加。body=`{ candidate: ScheduleCandidateInput }`。201: `{ candidate: {..., version} }`。 |
| PUT | `/api/projects/:projectId/candidates/:candidateId` | 候補更新。body=`{ candidate: ScheduleCandidateInput, version }`。200: `{ candidate: {..., version: newVersion} }`。409: `{ conflict: { candidate: latestCandidate } }`。 |
| DELETE | `/api/projects/:projectId/candidates/:candidateId` | 候補削除。`If-Match` or body.version 必須。204: 成功。409: `{ conflict: { candidate: latestCandidate } }`。 |
| POST | `/api/projects/:projectId/candidates:reorder` | 並び順更新。body=`{ order: string[], version: candidatesListVersion }`。200: `{ candidates: [...], candidatesListVersion: newVersion }`。 |
| POST | `/api/projects/:projectId/ics/import` | ICS 取り込み。body=`{ source: 'ics', icsText }` または multipart。`version`= `candidatesListVersion`。200: `{ candidates: [...], summary: { added, updated, skipped }, candidatesListVersion: newVersion }`。422: `{ fields: ['icsText'], message }`。 |
| GET | `/api/projects/:projectId/candidates/:candidateId/summary` | 候補単位の派生情報。200: `{ candidate, tally, participants: [...] }`。 |

### 6.4 参加者（Participants）

- `ParticipantInput` = `{ participantId?, displayName, email?, status?, version? }`

| Method | Path | 説明 |
| ------ | ---- | ---- |
| POST | `/api/projects/:projectId/participants` | 参加者追加。201: `{ participant: {..., version} }`。 |
| PUT | `/api/projects/:projectId/participants/:participantId` | 参加者更新。body=`{ participant: ParticipantInput, version }`。200: `{ participant: {..., version: newVersion} }`。409: `{ conflict: { participant: latestParticipant } }`。 |
| DELETE | `/api/projects/:projectId/participants/:participantId` | 参加者削除。`If-Match` or version 必須。204: 成功。 |
| GET | `/api/projects/:projectId/participants/:participantId/responses` | 参加者別ビュー。200: `{ participant, responses: [...], tallies }`。参加者トークンは自分自身のみアクセス可。 |

### 6.5 回答（Responses）

- `ResponseInput` = `{ participantId, candidateId, mark, comment?, version }`

| Method | Path | 説明 |
| ------ | ---- | ---- |
| POST | `/api/projects/:projectId/responses` | 回答の upsert。201（新規）または 200（更新）: `{ response: {..., version: newVersion}, summary: { candidateTally, participantTally } }`。409: `{ conflict: { response: latestResponse } }`。 |
| DELETE | `/api/projects/:projectId/responses` | 回答削除。body=`{ participantId, candidateId, version }`。204: 成功。409: `{ conflict: { response: latestResponse } }`。 |
| GET | `/api/projects/:projectId/responses/summary` | 日程別・参加者別集計。200: `{ candidates: [{ candidateId, tally }], participants: [{ participantId, tallies }] }`。 |

### 6.6 共有トークン・エクスポート・インポート

| Method | Path | 説明 |
| ------ | ---- | ---- |
| POST | `/api/projects/:projectId/share/rotate` | 管理者/参加者トークンの再発行。body=`{ version, rotatedBy? }`。200: `{ shareTokens: {..., version: newVersion} }`。 |
| POST | `/api/projects/:projectId/share/invalidate` | 指定トークン失効。body=`{ tokenType: 'admin'|'participant', version }`。204。 |
| GET | `/api/projects/:projectId/export/ics` | サーバ生成の ICS を返す。`Content-Type: text/calendar`、`Content-Disposition: attachment`. |
| GET | `/api/projects/:projectId/export/json` | `snapshot` の JSON を attachment として返す。 |
| POST | `/api/projects/:projectId/import/json` | JSON スナップショットを上書き。body=`{ snapshot, version }`。200: 新しい `snapshot`。 |
| GET | `/api/healthz` / `/api/readyz` | 健全性エンドポイント。body=`{ status: 'ok'|'ready'|'starting', meta? }`。 |

### 6.7 入力制約と並行更新ポリシー

- 文字数や必須条件は `docs/internal/spec-validation-policy.md` をサーバ側でもそのまま踏襲する。
  - Project name / Candidate summary: 120 文字以内、空文字不可。description は 2000 文字まで。
  - Participant displayName: 80 文字以内でプロジェクト内ユニーク、comment は 500 文字以内。
  - Responses の `mark` は `'o' | 'd' | 'x'` のみ受け付ける。その他は 422。
  - `dtstart` < `dtend` を必須チェックとし、タイムゾーンは `tzid` が IANA TZ 形式か `X-SCHEDULY-*` の許容リストに一致すること。
- サーバは入力検証に失敗した場合 422 を返し、`fields` に NG 項目を列挙する。複数フィールドが同時に失敗した場合は配列で返す（例: `['summary','dtstart']`）。
- 書き込み成功時は対象リソースの `version` と `updatedAt`（または ICS の場合は `dtstamp`）をサーバで再計算する。クライアント送信値は信用しない。
- 409 競合時はレスポンスに最新レコードを含め、`conflictReason`（`'version_mismatch' | 'deleted' | 'list_mismatch'`）を付与する。クライアントは
  1. ローカルの楽観更新をロールバック
  2. `GET /snapshot` もしくは対象エンティティの再取得で最新を同期
  3. ユーザに再入力/再送信を促す
- リスト系（`candidates:reorder`, `import/json`, `ics/import`）は `candidatesListVersion` を `If-Match` または body で必須とし、差分マージは行わず 409 による再取得 → 再送を基本とする。
- 参加者トークンからのアクセスで 409 が発生した場合は、最新レスポンスだけを返す（管理者向け詳細は含めない）。メッセージは UI で「他の参加者が更新しました。最新に更新してから再度送信してください。」等に合わせる。
- サーバは `updatedAt` と `version` をもとに並行更新の監査ログ（タイムスタンプ＋トークン種別＋操作種別）を残す前提で設計する。オンメモリ版ではログをコンソール出力し、永続版では構造化ログへ切り替える。

### 楽観排他の粒度
- Responses: 1行（participantId × candidateId）。`version` 必須。
- Candidates: 個票ごとに `version`。一覧操作は `candidatesListVersion` を If-Match。
- Participants: 個票ごとに `version`。
- Project Meta: `projectMeta.version`。
- Share Tokens: `shareTokens.version`。

### クライアントの競合処理（指針）
- 409 時は最新を取得してマージ/やり直し導線を提示。Responses は行差分を画面へ反映、Candidates/Participants はフォーム再読込、一覧操作/ICS は同期→再試行。

### 6.8 バリデーション実装計画（Zod 共通スキーマ）

> TODO から移行: フロント/サーバ共通のスキーマ管理と実行時検証を段階的に導入する。

- **モジュール構成**
  - `src/shared/schema/index.ts`（新規）に Zod スキーマをまとめる。`ProjectMetaSchema`, `CandidateSchema`, `ParticipantSchema`, `ResponseSchema`, `ShareTokensSchema`, `SnapshotSchema` など。
  - `src/shared/types.ts` はスキーマから `z.infer<typeof CandidateSchema>` で型を生成し、既存の型定義を置き換える。
  - クライアント／サーバ双方で `src/shared/schema/index.js` の Zod スキーマを利用し、`safeParse` からフィールド名を抽出して UI へ返す。

- **サーバ側パイプライン**
  - Express ミドルウェア `validateBody(schema)` / `validateQuery(schema)` を用意し、各ルートで適用。
  - 成功時は `req.validatedBody` をセットし、エンドポイントロジックでは型安全にアクセス。
  - 失敗時は `{ code: 422, message, fields }` を構築し `next(new ValidationError(...))` でエラーハンドラへ委譲。
  - レスポンス生成時も必要に応じて `SnapshotSchema.parse()` を通し、バグがあれば即座に検知する。

- **エラーフォーマッタ**
  - 共通ユーティリティ `mapZodIssuesToFields(issues)` を実装し、`['summary','dtstart']` のようなフィールド配列へ変換。
  - UI のトースト文言に合わせて `messageCatalog`（`summary: '日程タイトルは120文字以内で入力してください'` 等）を `shared/schema/messages.ts` へまとめる。サーバは `messageCatalog[field]` を使用し、併せて英語 fallback を持つ。

- **移行ステップ**
  1. 既存のフロントバリデーションを Zod に置換（`build*Rules` を削除）。
  2. API サーバのルートごとにミドルウェアを組み込み、旧来の手書きチェックを削除。
  3. テスト: `schema.test.ts` で代表的な成功/失敗ケースを `z.parse` で検証。API では supertest 等で 422/409 パスを確認。
  4. ドキュメント (`spec-validation-policy.md`) を更新し、スキーマの単一ソースを `shared/schema` と明記。

- **補足**
  - Zod を採用しない方針になった場合でも同モジュール構造を保ち、`typebox` や `yup` など別ライブラリで代替できるよう抽象化（インターフェース）を提供する。
  - スキーマバージョン管理が必要になった場合は `schemaVersion`（数値）を `Snapshot` に含め、サーバが互換性判断を行う。

### 6.9 データ型の一本化（`src/shared/types.ts`）

- **目的**  
  ドメインモデルの型を単一ファイルに集約し、フロント／サーバ／検証スキーマで同じソースを参照する。現状は JS の慣習と個別定義に依存しており、齟齬が起きやすい。

- **構成案**
  - `src/shared/types.ts` を新規作成し、`ProjectMeta`, `ProjectState`, `ScheduleCandidate`, `Participant`, `Response`, `ShareTokens`, `ProjectSnapshot`, `Versioned<T>`, `ConflictReason`, `ApiErrorResponse` 等を TypeScript で定義。
  - `tsconfig.json` を追加して `allowJs: true`, `checkJs: true`, `declaration: false` とし、JSDoc からの型チェックを有効化。ビルド時は Vite/ESBuild が TS ファイルをトランスパイルするよう設定。
  - JS ファイルでは `/** @typedef {import('../shared/types').ScheduleCandidate} ScheduleCandidate */` のように JSDoc 参照を追加し、エディタの補完と型検証を活用する。

- **フロント側適用**
  - `projectStore`, `responseService`, `share-service`, `summaryService` などで重複している構造体定義を削除し、JSDoc import に置換。
  - `public/proj/scheduly-project-sampledata-001.json` などデモ用サンプルも `/** @type {ProjectSnapshot} */` の型を守る（インポート時にバリデーションする）。
  - `validation.js` やコンポーネントで `import type` もしくは JSDoc 参照を利用し、引数・戻り値の型を共有する。

- **サーバ側適用**
  - Express ルートで `import type` を用い、Zod スキーマから `z.infer` した型と `types.ts` を一致させる。  
  - OpenAPI 生成などを行う場合は `ts-json-schema-generator` から JSON Schema を抽出し、ドキュメント生成に活用する。

- **移行ステップ**
  1. `src/shared/types.ts` を追加し、`npm run typecheck`（`tsc --project tsconfig.json --noEmit`）をセットアップ。
  2. 主要サービスから順に JSDoc 型参照を追加。既存の `PropTypes` や ad-hoc コメントは削除。
  3. CI に型チェックを組み込み、PR 時の型崩れを検知。
  4. 将来的に `.tsx` へ移行する場合は段階的にファイル拡張子を変更し、Vite 設定を更新する。

- **補足**
  - 型ファイルは純粋なデータ構造のみを扱い、副作用やロジックを含めない。
  - エイリアス（例: `@shared/types`）を `vite.config.js` と `tsconfig.json` に設定し、参照パスを簡潔にする。

### 6.10 楽観更新ヘルパーの設計

- **目的**  
  フロントエンドでの更新操作（参加者回答、候補編集、参加者編集、共有トークン操作）が API 呼び出しより先に UI に反映される “optimistic update” を安全に扱う仕組みを提供する。成功時はそのまま維持し、409 やネットワーク失敗時は自動でロールバック→再取得→ユーザーへの再入力促しを行う。

- **抽象ヘルパー**  
  `src/frontend/shared/optimistic-helpers.js`（仮称）に以下の関数を定義する。
  ```js
  export async function runOptimisticUpdate({
    applyLocal,        // () => rollbackToken
    request,           // () => Promise<ResponsePayload>
    onSuccess,         // (payload) => void
    onConflict,        // (payload) => void
    onNetError,        // (error) => void
    refetch,           // () => Promise<void>
    toast,             // { success(msg), warn(msg), error(msg) }
    labels,            // { success, conflict, netError }
    onSettled,         // () => void
  }) { /* ... */ }
  ```
  - `applyLocal` はストア更新を行い、後で呼び出せる `rollback` 関数（またはトークン）を返す。
  - `request` で API を呼び出し、成功時は `onSuccess` を実行し `toast.success(labels.success)` を表示。
  - 409/422 など競合時は `rollback()` → `refetch()` → `onConflict(payload)` → `toast.warn(labels.conflict)` の順に処理。
  - ネットワーク/5xx 時は `rollback()` → `toast.error(labels.netError)`、必要に応じて「再試行」ボタンが露出する UI コンポーネントに通知。
  - `onSettled` はローディング解除やフォーカス制御用に常に呼び出す。

- **サービス層での利用**
  - `responseService.upsert`, `scheduleService.updateCandidate`, `participantService.updateParticipant`, `shareService.rotate` など、現在個別に実装している処理を `runOptimisticUpdate` でラップする。
  - 成功シナリオではレスポンスに含まれる最新 `version` をストアへ反映するロジックを共通化できる。
  - 409 競合時はヘルパーが `conflict.latest` を UI に渡し、差分ハイライトや再入力促しを行う。

- **ロールバック実装**
  - `applyLocal` 内で `const snapshot = projectStore.getState()` を取得し、更新後に `return () => projectStore.replaceState(snapshot)` を返す方式を想定。
  - 大規模なコピーを避けるため、`projectStore` に `captureSnapshot()` / `restoreSnapshot(snapshot)` ユーティリティを追加する。

- **UI 連携**
  - ネットワークエラー時はグローバルな「再試行」パネルを開き、`retry()` で同じ `runOptimisticUpdate` を再実行。
  - 409 時にはトーストに「最新データに更新しました。再度入力してください。」を表示し、該当フォームをフォーカス。

- **テスト計画**
  - 単体テスト: jest でヘルパーを直接呼び出し、成功・409・ネットワーク例外の副作用を検証。
  - E2E テスト: Playwright 等で競合再現シナリオを用意し、ロールバック → 再取得 → 再入力案内の流れを確認。

- **ドキュメント連携**
  - `docs/internal/spec-validation-policy.md` に「409/ネットワークエラー時の挙動は楽観更新ヘルパーに統一」と追記する。
  - `docs/internal/ref-verify-checklist.md` に QA 項目（競合発生 → ロールバック → 再入力案内）を追加する。

### 6.11 UI での競合解決フロー（Responses / Candidates）

- **目的**  
  409 競合や他クライアント更新が発生した際、ユーザーが迷わず差分を確認し、再入力やマージを行えるようにする。

- **共通フロー**
  1. `runOptimisticUpdate` が 409 を検知 → `rollback()` → `refetch()` を実行。
  2. `conflict.latest` を UI へ渡し、該当エンティティの比較ビューを表示。
  3. トーストに「最新データを取得しました。内容を確認して再入力してください。」を表示し、対象カードにスクロール＆フォーカス。

- **Responses 競合（参加者回答）**
  - ハイライト: 競合した候補カードを黄色で縁取り、最新更新者・時刻（`response.updatedAt`）を表示。
  - 差分表示: 旧値（自分の入力）と最新値を上下に並べ、ユーザー選択で採用する値を決める UI を提供（初期実装では最新値を表示し直し、再入力のみでも可）。
  - コメント欄は最新値で上書きするが、ユーザーが保持したい場合用に「元の入力をコピー」リンクを提供。

- **Candidates 競合（候補編集）**
  - 対象候補カードに「他のユーザーが更新しました」とバナー表示。`candidate.updatedAt` と diff を表示（タイトル/場所/日時毎に before/after を1列で表示）。
  - ユーザーが「最新内容を採用」or「自分の入力を再適用」ボタンを選択できるコンフリクトダイアログを用意。後者は最新候補をベースに再入力フォームを開き直す。
  - 並び順変更が競合した場合は、再取得後に現在の並びを再表示し、「再度並べ替える」ボタンで操作を続行できるようにする。

- **更新者情報**
  - `Response` / `Candidate` に `updatedBy`（表示名）と `updatedAt` を保持し、競合ダイアログに表示する。サーバはトークン種別から表示名を解決（管理者の場合は `admin@project` 等、参加者は displayName）。

- **再入力ガイド**
  - 競合後にフォームが再表示された際、フィールドラベルに「最新: ...」や「あなたの前回入力: ...」をサブテキストとして表示し、ユーザーが再入力しやすいようにする。
  - コメントや説明文はクリップボードコピーアイコンを用意し、ユーザーが以前の入力をそのまま再利用できるようにする。

- **QA チェック**
  - `docs/internal/ref-verify-checklist.md` に「競合発生時に差分ダイアログが表示され、再入力後に保存できるか」のテスト項目を追加する。
  - E2E テストで、2 クライアント同時操作→409→再入力→保存成功のシナリオを追加する。

---

## 7. エラーモデルと UI 対応（標準化）

### 7.1 共通レスポンス

- API 失敗時は `{ code, message, fields?, conflict?, meta? }` を返す。
  - `fields`: 422 のみ。UI は対象フィールドを赤枠＋メッセージ表示。
  - `conflict`: 409 のみ。`{ entity, reason }` を返し、`reason` は `'version_mismatch'|'deleted'|'list_mismatch'|'unauthorized'` のいずれか。
  - `meta`: 429/503 などで待機秒数や再試行推奨回数を入れる（例: `{ retryAfterMs: 3000 }`）。
- エラー時でも HTTP ボディは JSON で統一し、ブラウザ側がステータスコードと `code` を突き合わせて処理する。

### 7.2 ステータス別ガイドと UI 表示

| Status | シナリオ/例外 | サーバーレスポンス例 | UI の挙動 |
| ------ | ------------- | -------------------- | -------- |
| 400 / 422 | バリデーション違反、必須パラメータ欠落 | `{ code: 422, message: 'コメントは500文字以内で入力してください', fields: ['comment'] }` | フォーム値を保持し、該当フィールドを赤枠。トーストは警告色で短文。Console には `debug` レベルで記録。 |
| 401 | トークン未送信/期限切れ | `{ code: 401, message: '管理者トークンを再発行してください' }` | 強制ログアウト扱い。管理者画面では「共有URLを再発行」導線を提示し、再読み込みを案内。参加者画面はエラーパネルのみ表示。 |
| 403 | トークン種別が操作に不足（参加者が管理者 API を叩いた等） | `{ code: 403, message: 'この操作は管理者のみ実行できます' }` | ダイアログまたはバナーで権限不足を表示。再試行ボタンは表示せず、操作を無効化。 |
| 409 | version 競合・対象削除 | `{ code: 409, message: '他のユーザーが更新しました', conflict: { entity: 'candidate', reason: 'version_mismatch', latest: {...} } }` | 楽観更新をロールバック → 最新データをフェッチ → トーストで「最新内容を取得しました。再入力してください。」を表示。必要に応じて差分をハイライト。 |
| 413 | ファイル／リクエストサイズ超過（ICS, JSON import） | `{ code: 413, message: 'ファイルサイズは 1MB 以内にしてください' }` | トースト＋説明行で制限を明示。ファイル選択状態は維持せずクリア。必要があれば「制限値」をモーダルで案内。 |
| 429 / 503 | サーバー側レート制限・一時的な待機要求 | `{ code: 429, message: 'しばらく待ってから再度お試しください', meta: { retryAfterMs: 5000 } }` | スピナー付きの「再試行」ボタンをダイアログで提供。 `retryAfterMs` 経過後に自動再実行する仕組みを検討。 |
| ネットワーク/タイムアウト | Fetch 例外、オフライン | UI 側で例外捕捉（レスポンスなし）。 | 状態に応じて「ネットワークに接続できません」「タイムアウトしました (10s)」などをトースト表示。再試行ボタンとサポートリンクを併記。オフライン API の場合はブラウザの `navigator.onLine` を監視し復帰時に再同期。 |

### 7.3 ログと運用

- サーバーは 4xx を WARN、5xx を ERROR として構造化ログ出力する。409 は INFO で十分だが `conflict.reason` を必ず記録する。
- フロントは 422/409 を `console.debug`、401/403/413 を `console.warn`、ネットワークエラーと 5xx を `console.error` で記録する。テスト時も同一ポリシー。
- ユーザーが再試行できるエラー（409/413/429/ネットワーク）は「再試行」ボタンを常設し、成功時は直前のメッセージを自動で閉じる。
- 詳細な文言・フィールド別ルールは `docs/internal/spec-validation-policy.md` および `docs/internal/ref-verify-checklist.md` の QA 項目に追記して同期を取る。
