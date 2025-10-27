# Data Model

React 版 Scheduly は、**オンメモリのみ**でデータを保持する前提（アプリ終了で揮発、永続 DB なし）で設計を進めます。必要になったときにサーバーやストレージへ移行できるよう、扱う構造だけ整理しておきます。

データ領域は次の 3 つに大別されます。

1. **Project** – プロジェクト（調整対象）のメタ情報と共通設定  
2. **Schedule Candidates (ICS)** – 候補日／イベント情報。ICS（iCalendar）との相互変換を前提にする  
3. **Participant Responses** – 参加者ごとの出欠／コメント

## 1. Project

| 項目 | 型 | 必須 | 説明 |
| ---- | --- | ---- | ---- |
| `id` | string (UUID/slug) | ◯ | プロジェクト識別子。URL やデータツリーのキーに利用 |
| `name` | string | ◯ | UI 上のタイトル。管理画面では「プロジェクト名」 |
| `description` | string | △ | 任意の説明文。管理画面のテキストエリアと 1:1 |
| `defaultTzid` | string | ◯ | 候補作成時の初期タイムゾーン (`Asia/Tokyo` など) |
| `shareTokens` | { `admin`, `guest` } \| null | △ | 共有 URL 作成時に一時的に生成。オンメモリ保持で十分 |
| `createdAt` / `updatedAt` | ISO string | ◯ | 表示用途・ソートなどで使用。オンメモリでも毎回生成する |

> **備考**  
> 今回はオンメモリ運用のため `owner` や追加 `settings` は持たず、必要になった時点で拡張する。

## 2. Schedule Candidates

候補データの **正** を ICS として保持し、常に文字列（あるいは VEVENT JSON）で再構築できる状態を維持する方針にします。プロジェクト単位で以下のような構造を想定します。

```ts
type ProjectState = {
  project: Project;
  icsText: string;              // 最新の ICS 全文。編集後はここを書き換える
  // UI 用にキャッシュしたパース結果（必要時に再生成可）
  candidates: ScheduleCandidate[];
  participants: Participant[];
  responses: Response[];
};
```

`icsText` が常にプロジェクトの「正」となる。初期ロード時や編集後は、`icsText` をパースして `candidates` を再生成する。UI 操作で候補を追加・編集した場合は、`ScheduleCandidate` を更新 → `rawVevent` を再構築 → `icsText` 全体を書き換える、というサイクルを徹底することで、ICS 文字列と UI 表示が乖離しない。

> **ポイント**  
> - `candidates` / `participants` / `responses` は UI レンダリングや操作用の派生データ。必要になればいつでも再生成できる。  
> - プロジェクト単位でこの `ProjectState` を丸ごと保持／廃棄すればよい（オンメモリ運用）。  
> - ICS のインポートは `icsText` 差し替え → 再パース、エクスポートは `icsText` をそのまま書き出すだけで済む。

### ScheduleCandidate (derived)

| 項目 | 型 | 必須 | ICS との対応 | 説明 |
| ---- | --- | ---- | ---- | ---- |
| `id` | string (UUID) | ◯ | — | クライアント内部 ID。`uid` と同じ値を採用してよい |
| `projectId` | string | ◯ | — | 親プロジェクトとの紐付け |
| `uid` | string | ◯ | `UID` | ICS 上の識別子。差分突合せにも使用 |
| `sequence` | number | △ | `SEQUENCE` | 参照のみ。更新時は VEVENT の値を書き換える |
| `dtstamp` | ISO string | △ | `DTSTAMP` | 参照のみ。必要なら UI に表示 |
| `status` | `'CONFIRMED' \| 'TENTATIVE' \| 'CANCELLED'` | ◯ | `STATUS` | UI 表示用。変更時は VEVENT を更新 |
| `summary` | string | ◯ | `SUMMARY` | 候補名 |
| `description` | string | △ | `DESCRIPTION` | 詳細説明 |
| `location` | string | △ | `LOCATION` | 会場情報 |
| `timezone` (`tzid`) | string | ◯ | `TZID` or `X-SCHEDULY-TZID` | 開催タイムゾーン |
| `startsAt` | ISO string | ◯ | `DTSTART` | UTC or ローカル ISO。UI ではローカル入力形式に変換 |
| `endsAt` | ISO string | ◯ | `DTEND` | 同上 |
| `rawVevent` | string (ICS) or JSON | ◯ | VEVENT 全体 | **正規データ**。再出力時に利用 |

> **編集方針**  
> UI で編集 → `ScheduleCandidate` を更新 → `rawVevent` を再生成 → `icsText` を再構築、という順で処理すれば ICS を常に最新状態で保持できる。

### 2.1 Tally / 集計

候補ごとの回答集計は派生情報として管理する。API で計算済みを返す場合は以下の形を想定。

```ts
type CandidateTally = {
  o: number; // 参加可 (○)
  d: number; // 条件付き (△)
  x: number; // 参加不可 (×)
};
```

UI では `ScheduleCandidate` 本体に `tally?: CandidateTally` を付与して扱っている。未計算の場合は `undefined` を許容する。計算は `responses` からその場で求めてもよい。

## 3. Participants & Responses

### 3.1 Participant

| 項目 | 型 | 必須 | 説明 |
| ---- | --- | ---- | ---- |
| `id` | string (UUID) | ◯ | 参加者識別子。回答との紐付けに使用 |
| `projectId` | string | ◯ | 所属プロジェクト |
| `displayName` | string | ◯ | 表示名。匿名の場合はダミー名でも OK |
| `email` | string | △ | 通知等に利用する場合のみ |
| `status` | `'active' \| 'archived'` | △ | 退席済み管理などに利用可能 |
| `createdAt` / `updatedAt` | ISO string | ◯ | 監査用 |

### 3.2 Response

1 参加者 × 1 候補の回答。UI 上の ○ / △ / × とコメントを保持する。

| 項目 | 型 | 必須 | 説明 |
| ---- | --- | ---- | ---- |
| `id` | string (UUID) | ◯ | レコード識別子（参加者 ID + 候補 ID の複合キーでも可） |
| `projectId` | string | ◯ | プロジェクト参照 |
| `participantId` | string | ◯ | 参加者参照 |
| `candidateId` | string | ◯ | 候補参照 |
| `mark` | `'o' \| 'd' \| 'x'` | ◯ | ○/△/× を小文字 1 文字で保持（UI と一致） |
| `comment` | string | △ | 任意コメント。空文字を許容 |
| `updatedAt` | ISO string | ◯ | 最終更新日時 |
| `source` | `'web' \| 'ics' \| 'import' \| ...` | △ | どの経路で登録されたか（任意） |

> 参加者が候補を未回答の場合、`Response` 自体を作らないか、`mark: null` として保持するかは実装ポリシー次第。現行モックでは「未回答」を UI 側で計算して表示している。

### 3.3 集計とビュー用の派生構造

参加者別ビューでは次のような構造を組み立てている。API がこの形式を返せばクライアントの整形コストを減らせる。

```ts
type ParticipantSummary = {
  participant: Participant;
  responses: Array<{
    candidateId: string;
    mark: 'o' | 'd' | 'x' | null;
    comment?: string;
    candidateSnapshot: {
      summary: string;
      startsAt: string;
      endsAt: string;
      timezone: string;
      status: ScheduleCandidate['status'];
      location?: string;
      description?: string;
    };
  }>;
  tallies: CandidateTally; // 自分の回答集計 (○△× の個数)
};
```

## 4. 関係性まとめ

- `Project` 1 件に対し、`ScheduleCandidate` が N 件  
- `Project` 1 件に対し、`Participant` が N 件  
- `Response` は (`projectId`, `participantId`, `candidateId`) の組で一意  
- `ScheduleCandidate` ↔ `Response` 間の集計から `CandidateTally` を算出  
- ICS のインポート／エクスポートは `ScheduleCandidate` を基に行い、`uid` / `sequence` / `dtstamp` をキーとして更新判定する

## 5. 実装メモ

- 状態はすべてオンメモリで保持し、アプリ終了時に揮発させる前提。将来永続化が必要になった場合は `icsText` や `responses` をそのまま保存すればよい。
- ICS から読み取れない情報（参加者名、コメントなど）は `Response` 側でのみ管理する。ICS への逆変換が必要な場合は拡張プロパティ（`X-SCHEDULY-*`）を導入するか、別チャネルで共有する設計を検討する。
- `timezone` は ICS より `TZID` として渡される場合と、Chrome DevTools からコピーした DOM のようにテキストとしてのみ存在する場合がある。保存時は `sanitizeTzid` 相当の正規化処理を行う。
- 将来的に API を設計する場合は、`Project` をルートとした REST（例: `/projects/:id/candidates`, `/projects/:id/participants`）か、GraphQL / tRPC などでまとめて取得する形を想定すると UI 実装との整合が取りやすい。

このドキュメントは仕様検討フェーズのベースラインとして利用し、実装着手後にフィールド追加・命名変更が必要になった場合は随時更新する。
