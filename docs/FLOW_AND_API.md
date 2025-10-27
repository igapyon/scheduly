# Flow & API Sketch

React 版 Scheduly をオンメモリ構成で動かす際のユーザーフローと、フロントエンド内部で想定する API 面（関数・データハンドラ）のたたき台をまとめる。永続化は行わず、`ProjectState` を 1 つの塊として保持／初期化／破棄する前提。

## 1. 全体像

```
管理者 (admin.jsx)
  ├─ プロジェクト初期化 → ProjectState.load()
  ├─ 候補編集・ICS入出力 → scheduleService.*
  └─ 管理者 URL 発行 → shareService.generateAdminToken()

参加者一覧 (user.jsx)
  └─ 参加者トークンで ProjectState を読み取り → read facade (readonly)

参加者回答編集 (user-edit.jsx)
  ├─ 同じ参加者トークンで ProjectState を読み取り
  └─ 回答を登録 → responseService.upsert()

共通: ProjectState を in-memory store (スコープ内の JS オブジェクト) に保持
```

## 2. コアフロー

### 2.1 プロジェクト作成～候補準備（管理者）

1. 管理画面で「新規プロジェクト」を作成  
   - `projectService.create({ name, description, defaultTzid })`  
   - `ProjectState` の初期構造を生成し、`icsText` は空の VCALENDAR で初期化
2. 手動入力または ICS 取り込みで候補を追加  
   - 手動: `scheduleService.addCandidate(projectId, candidateDraft)` → VEVENT を作成 → `icsText` 再構築  
   - ICS: `scheduleService.importIcs(projectId, fileText)` → VEVENT 群をマージ → `icsText` 更新
3. 参加者の初期データがある場合  
   - `participantService.bulkUpsert(projectId, participants)`（各参加者に固有トークンを付与）

### 2.2 共有準備～閲覧（管理者 → 参加者）

1. 管理者が管理用 URL を生成  
   - `shareService.generateAdminToken(projectId)` → `shareTokens.admin` を更新
2. 参加者一覧／回答編集画面は参加者固有トークンつき URL でアクセス  
   - 例: 一覧 `https://scheduly.app/p/{participantToken}`、回答編集 `https://scheduly.app/r/{participantToken}`（デモ時は `demo-participant-001` のような固定文字列を利用すると便利）
   - `projectService.loadByParticipantToken(participantToken)` を呼び出し、`ProjectState` を読み取り（参加者は日程の更新権限なし）
3. 画面内では `ProjectState.candidates`（UI 内で扱う日程配列）と `responses` を組み合わせてサマリーを表示

### 2.3 参加者回答（参加者）

1. `user-edit.jsx` が参加者識別用のトークンを受け取り、`participantService.resolveByToken()` で `projectId` / `participantId` を取得
2. 回答を送信  
   - `responseService.upsert({ projectId, participantId, candidateId, mark, comment })`
   - 同時に `responses` 内の該当レコードを更新し、`updatedAt` を現在時刻に更新
3. 更新後に `tallyService.recalculate(projectId, candidateId)` で対象候補の集計を再計算（オンデマンド or まとめて）

### 2.4 集計～エクスポート（管理者）

1. 管理画面が `responses` を読み込み、候補ごとの集計値を表示  
2. 確定候補が決まったら `scheduleService.markConfirmed(candidateId)` などで `status` を更新 → VEVENT を再生成  
3. `scheduleService.exportAll(projectId)` で `icsText` をそのままダウンロード

## 3. サービス/関数インターフェース（案）

オンメモリ運用のため、単一の `projectStore` を中心に関数を提供するイメージ。実際の実装では module 単位で分割してもよい。

```ts
type ProjectStateStore = {
  get(projectId: string): ProjectState | undefined;
  set(projectId: string, next: ProjectState): void;
  delete(projectId: string): void;
};
```

### 3.1 Project Service

```ts
projectService.create(payload: {
  name: string;
  description?: string;
  defaultTzid: string;
}): ProjectState

projectService.load(tokenOrId: string): ProjectState
projectService.updateMeta(projectId: string, changes: Partial<Project>)
```

### 3.2 Schedule Service（ICS ハンドリング）

```ts
scheduleService.addCandidate(projectId, draft: CandidateDraft): ScheduleCandidate
scheduleService.updateCandidate(projectId, candidateId, changes: CandidateChanges): ScheduleCandidate
scheduleService.removeCandidate(projectId, candidateId): void

scheduleService.importIcs(projectId, icsText: string): {
  added: number;
  updated: number;
  skipped: number;
}

scheduleService.exportAll(projectId): string // 最新の icsText を返す
scheduleService.markStatus(projectId, candidateId, status: CandidateStatus)
```

**実装メモ**  
すべての更新は管理者権限でのみ許可し、`ProjectState.icsText` を再生成 → `ProjectState.candidates` を再パースするサイクルで一元管理する。参加者向け API／UI からは `scheduleService` の更新系を公開せず、読み取り専用のビュー（`summaryService.*`）を経由させることでセキュリティを担保する。`CandidateDraft` → VEVENT 変換には既存の `shared/ical-utils` 関数を流用できる。REST API 化する場合はリソース名を「日程」に合わせて `/projects/:projectId/schedules` を採用すると自然（内部プロパティ名は ICS 由来の `candidates` を維持しても、英語圏では “schedule candidates” として違和感は少ない）。

### 3.3 Share Service（共有トークン）

```ts
shareService.generateAdminToken(projectId): string
shareService.getAdminToken(projectId): string | null
shareService.invalidateAdminToken(projectId): void
```

> 管理者向けの制御用 URL に付与するトークンを生成・管理する。オンメモリ構成では `Project.shareTokens.admin` に保存するだけでよいが、REST API としては `POST /projects/:projectId/share-tokens/admin`（生成）、`GET /projects/:projectId/share-tokens/admin`（取得）、`DELETE /projects/:projectId/share-tokens/admin`（無効化）といったエンドポイントを想定。

### 3.4 Participant Service

```ts
participantService.add(projectId, payload: { displayName: string; email?: string }): Participant // トークン生成含む
participantService.update(projectId, participantId, changes: Partial<Participant>): Participant
participantService.remove(projectId, participantId): void

participantService.bulkUpsert(projectId, list: Participant[]): void // 既存を残しつつ差分 upsert
participantService.resolveByToken(participantToken: string): { projectId: string; participantId: string }
participantService.getToken(projectId, participantId): string
```

> REST API 化する場合は `POST /projects/:projectId/participants:bulk` のように `POST` を使ったバルク upsert エンドポイントを用意し、既存レコードは維持したまま追加・更新のみ行う想定。全置き換えが必要になったら `PUT /projects/:projectId/participants` を別途定義する。  
> `participantService.resolveByToken` は参加者 URL に埋め込まれたトークンから `projectId` と `participantId` を逆引きする役割。REST API に落とす場合は `POST /participants:resolve`（ボディに token）や `GET /participants/resolve?token=...` といったエンドポイントが考えられる。URL 生成時は `/p/{token}`（一覧）と `/r/{token}`（回答）の両方に同一トークンを埋め込む。

### 3.5 Response Service

```ts
responseService.upsert(projectId, response: {
  participantId: string;
  candidateId: string;
  mark: 'o' | 'd' | 'x';
  comment?: string;
}): Response

responseService.bulkImport(projectId, list: Response[]): void
responseService.clear(projectId, participantId): void
```

更新後は `response.updatedAt` を現在時刻で上書き。必要に応じて `tallyService.recalculate` を呼ぶ。

### 3.6 Tally / Summary Service

```ts
tallyService.recalculate(projectId): void // 全候補まとめて
tallyService.recalculate(projectId, candidateId): void // 単一候補

// ビュー用の派生データ
summaryService.buildScheduleView(projectId): ScheduleCandidateView[] // 日程ごとの一覧
summaryService.buildParticipantView(projectId): ParticipantSummary[] // 参加者ごとの一覧
```

## 4. API 呼び出し例

### 候補を 1 件追加するフロー

```ts
const candidate = scheduleService.addCandidate(projectId, {
  summary: "秋の合宿 調整会議 Day5",
  startsAt: "2025-11-04T10:00:00+09:00",
  endsAt: "2025-11-04T12:00:00+09:00",
  tzid: "Asia/Tokyo",
  status: "TENTATIVE",
  location: "オンライン",
  description: "予備日その2"
});

// UI では ProjectState から candidates（日程）を再取得して再描画する
const state = projectStore.get(projectId);
renderCandidates(state.candidates);
```

### 参加者が回答を送信するフロー

```ts
responseService.upsert(projectId, {
  participantId,
  candidateId,
  mark: 'o',
  comment: '15:00 まで在宅です'
});

tallyService.recalculate(projectId, candidateId);
```

## 5. 残課題・検討メモ

- トークン認証やアクセス制御は未定義。現在はフロント内のみの想定なので、インターフェースレベルで抽象化しておく。
- 複数プロジェクトを同時に扱う場合は `projectStore` を Map として保持すれば対応できる。UI 側でアクティブな `projectId` を渡す設計にする。
- 将来的にバックエンド API が導入された場合、ここで定義したサービス関数を fetch ベースに差し替えれば、React コンポーネント側の呼び出しはそのまま流用できる見込み。
