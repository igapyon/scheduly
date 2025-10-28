# Share URL Generation Spec

共有 URL（管理者用・参加者用）を公式に定義し、React 実装へ落とし込むためのテキスト仕様。現在はモックとしてランダムな URL 文字列を生成するだけのダミー実装になっているため、ここで要件と振る舞いを明文化する。

## 1. Scope & Background

- 対象画面: 管理画面 (`src/frontend/admin.jsx`) の「共有URL」カード。
- 対象機能: 「共有URLを生成」ボタンを押下した際に、管理者向け URL と参加者向け URL を発行し、画面へ反映する処理。
- 実装コンテキスト: 現行リリースはオンメモリ運用（`projectStore` を sessionStorage に保持）。将来的な REST API での運用も見据える。

## 2. Goals / Non-Goals

### Goals
- プロジェクトごとに一意な管理者トークンと参加者トークン（`participantToken`）を生成し、それぞれの URL として表示できるようにする。
- トークンは sessionStorage に保存され、ページリロード後も値が維持される。
- トークンを一度発行したら同セッションで再発行できないよう UI をロックする（ボタンを `disabled` にする）。
- UI からコピー・共有しやすい形で提示する（トークン値が空の場合はプレースホルダー表示）。
- 実装を `shareService` / `projectStore` に寄せ、React コンポーネント側の責務を軽くする。

### Non-Goals
- 参加者個別トークン（`/p/{token}` や `/r/{token}`）の発行は本仕様の対象外（別途 Participant 管理で扱う）。
- アクセストークンの永続化（DB 保存）や失効 API の提供は後日検討とする。
- 招待メール送信や QR コード生成など、共有手段の自動化は今回のスコープ外。
- 発行済みトークンの再発行・無効化 UI は今回は扱わない（必要になったときに別途仕様化する）。

## 3. Terminology

| 用語 | 説明 |
| ---- | ---- |
| 管理者トークン (`adminToken`) | 管理画面へアクセスするための秘密 URL に埋め込むトークン。編集権限を持つ。 |
| 参加者トークン (`participantToken`) | 参加者へ共有する秘密の URL に埋め込むトークン。自身の出欠回答やコメントの編集が可能。旧称「閲覧トークン」。 |
| Share Link | 管理者・参加者それぞれの URL 全体。`https://scheduly.app/a/{adminToken}` など。 |
| `shareService` | トークン発行と保存を担うユーティリティ層。React コンポーネントから呼び出す。 |

## 4. User Stories

1. 管理者はプロジェクト準備が整ったタイミングで「共有URLを生成」をクリックする。新しい管理者 URL と参加者 URL が表示され、トーストで発行完了が通知される。
2. トークン未発行状態で画面を開いた場合は、URL 欄に「未発行」表示を出す。生成後は値が即座に更新される。
3. 発行済みの場合はボタンが `disabled` となり、同一セッションでは再度クリックできない。
4. 他のブラウザ／タブで同じプロジェクトを開いていても、初回発行後の値が画面上に反映される（`projectStore` の購読で同期）。

## 5. Functional Requirements

1. **初期状態**
   - `project.project.shareTokens` が存在し、`admin` または `participant` が空文字／`null` の場合は「未発行」表示とする。
   - 初期生成時に `projectStore` がデフォルト値として持っている `demo-admin` などのダミー トークンは、自動で実際の URL に置き換えない（ユーザー操作をトリガーとする）。
   - ダミー値（例: `demo-admin`）やテスト用マーカーは UI 側で「未発行」とみなす。`shareService` に `isPlaceholderToken()` を用意し、ボタンの `disabled` 判定で利用する。

2. **トークン生成**
   - ブラウザの `crypto.getRandomValues` を使い、32 文字の Base62（`[0-9a-zA-Z]`）トークンを生成する。
   - 管理者 URL 形式: `https://scheduly.app/a/{adminToken}`
   - 参加者 URL 形式: `https://scheduly.app/p/{participantToken}`（プロジェクト単位で 1 つ、回答画面へ遷移）
   - 生成時に `issuedAt` と `lastGeneratedBy`（将来のユーザー識別向け）を記録できるよう、オブジェクト構造を採用する。

3. **状態更新**
   - `shareService.generate(projectId)` → `projectStore.updateShareTokens(projectId, nextTokens)` を呼び出す、もしくは同等のロジックを実装する。
   - 更新後、`projectStore` の購読機構を通じて React state (`urls`) を書き換え、UI を再レンダリングする。
   - `sessionStorage` 永続化が有効な場合は自動で保存される。
   - 発行済み（プレースホルダーではない）トークンが `projectStore` に存在する場合のみ、React 側で「共有URLを生成」ボタンを `disabled` 状態にする。未発行とみなす場合は常にクリック可能とする。

4. **UI 連携**
   - URL は `KeyValueList` にテキストで表示。未発行時は `–– 未発行 ––` を表示する。
   - クリック 1 回でクリップボードへコピーする補助ボタンの有無は後日検討。今回は表示のみでも可。
   - トースト文言: 初回発行は「共有URLを発行しました」。発行済みでボタンが無効化された際はサブテキストで「再発行する場合は運用で解決」の旨を表示するかは任意。

5. **エラー処理**
   - 生成処理中に例外が発生した場合は `console.error` と「共有URLの生成に失敗しました」というトーストを表示。既存トークンは破壊しない。

## 6. Data Model

`Project.shareTokens` を次の構造へ拡張する。

```ts
// Project.shareTokens
{
  admin?: {
    token: string;           // secret. 32 chars Base62
    url: string;             // convenience field
    issuedAt: string;        // ISO timestamp
    revokedAt?: string;      // 再発行時に旧値をマーク（任意）
    lastGeneratedBy?: string; // Operator ID or browser signature (optional)
  };
  participant?: {
    token: string;
    url: string;
    issuedAt: string;
    revokedAt?: string;
    lastGeneratedBy?: string;
  };
}
```

- 互換性: 旧データで `shareTokens: { admin: "demo-admin" }` のように文字列が入っているケースでは、読み込み時にオブジェクトへラップするサニタイズ処理を追加する。
- 旧実装で `guest` キーを使用していた場合は、読み込み時に `participant` キーへ移行するサニタイズを実施する。
- `url` プロパティは画面表示用の冗長データ。URL 形式が変わった際に集中修正できるよう `shareService.buildUrl(type, token)` 関数を用意する。
- `revokedAt`・`lastGeneratedBy` は将来的な再発行／監査機能向けの拡張プロパティであり、今回の仕様では利用しない。

## 7. Service Layer API（案）

```ts
shareService.generate(projectId: string): {
  admin: ShareTokenEntry;
  participant: ShareTokenEntry;
};

shareService.get(projectId: string): {
  admin?: ShareTokenEntry;
  participant?: ShareTokenEntry;
};

shareService.invalidate(projectId: string, type: 'admin' | 'participant'): void;
```

- `generate` は未発行の場合にトークンを生成し、既に実トークンが存在する場合は同値を返す（UI 側では呼び出さない設計だが、二重発行の防御として idempotent にする）。
- `invalidate` は今後の実装余地として定義。現時点では呼び出さず、再発行もサポートしない。
- `ShareTokenEntry` 型は前述のデータモデルを再利用する。

## 8. UI 状態遷移

1. **未発行**
   - `urls.admin === ''` or `undefined`、もしくは `isPlaceholderToken(urls.admin)` が真 → 「–– 未発行 ––」表示。
   - ボタン有効。押下で生成フローが走る。

2. **発行済み**
   - `urls.admin.url` / `urls.participant.url` を表示。
   - ボタンは `disabled`（`disabled` 属性と視覚的な無効化スタイルを適用）。

3. **発行失敗**
   - URL は更新せず現状維持。
   - トーストで失敗メッセージ。Console に詳細ログ。

## 9. Security Considerations

- トークンは 128bit 以上のエントロピーを持つ乱数とする（Base62 32 文字 ≒ 190 bit）。
- HTTPS 経由でのみ配布される前提（`Scheduly` サイトは HTTPS）。
- トークン値はログやアナリティクスに送らない。
- 画面上に QR コードや短縮 URL を表示する場合は別途審査が必要。
- 旧トークンを残したまま公開したくない場合に備え、将来的には `revokedTokens` を保持しアクセス拒否する API を想定する。

## 10. Future API Endpoints（バックエンド化を見据えた草案）

```
POST   /projects/:projectId/share-links
GET    /projects/:projectId/share-links
DELETE /projects/:projectId/share-links/:type   // type = admin | participant
```

- ※再発行や明示的な無効化が必要になった場合のメモ。今回のフロント実装では呼び出さない。
- `POST` は既存トークンを上書き。レスポンスに `admin` / `participant` の URL とメタデータを含める。
- `GET` は現在有効なトークン情報を返す。未発行の場合は 404 または空オブジェクト。
- `DELETE` は単一トークンを無効化する。再生成前の手動失効に利用。

## 11. Edge Cases & Open Questions

| ケース | 対応方針 |
| ------ | -------- |
| トークン生成時に `projectId` が不明 | 例外を投げ、トーストで失敗通知。`resolveProjectIdFromLocation` を見直す。 |
| `sessionStorage` が利用できない環境 | データ保持不可。トーストで警告を出す（`projectStore` が既に持つ fallback を利用）。 |
| URL 形式を `/a/{token}` から変えたくなった | `shareService.buildUrl` の実装を差し替えるだけで済むよう、他の層はトークン値のみに依存する。 |
| 参加者向け URL をプロジェクト固有トークンにする？ | 現状は 1 プロジェクトにつき共通の参加者トークン。個別回答リンクは参加者管理で実装する。 |
| 共有 URL を無効化する UI が必要か | 今後、誤配布時の対処として検討。仕様上は `invalidate` を用意しておく。 |
| プレースホルダートークン（`demo-admin` など）が残っている | `shareService.isPlaceholderToken` で検知し、「未発行」扱いとする。実トークン発行後は無効化ボタンをロック。 |

---

本仕様に沿って `shareService` や `projectStore` の API を整備し、`admin.jsx` 側の `generateUrls` ダミー実装を実機能へ置き換えることを次のステップとする。
