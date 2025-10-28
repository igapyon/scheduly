# Share URL Generation Spec

共有 URL（管理者用・参加者用）と、それを構成するシークレットトークン（`adminToken` / `participantToken`）を公式に定義し、React 実装へ落とし込むためのテキスト仕様。現在はモックとしてランダムな URL 文字列を生成するだけのダミー実装になっているため、ここで要件と振る舞いを明文化する。

## 1. Scope & Background

- 対象画面: 管理画面 (`src/frontend/admin.jsx`) の「共有URL」カード。
- 対象機能: 「共有URLを生成」ボタンを押下した際に、管理者向け URL と参加者向け URL を発行し、画面へ反映する処理。
- 実装コンテキスト: 現行リリースはオンメモリ運用（`projectStore` を sessionStorage に保持）。将来的な REST API での運用も見据える。

## 2. Goals / Non-Goals

### Goals
- プロジェクトごとに一意な管理者トークンと参加者トークン（`participantToken`）を生成し、それぞれの URL として表示できるようにする。
- 各プロジェクトは管理者トークン・参加者トークンをそれぞれ 1 つだけ保持し、そこから導出した URL を常に最新状態で提示する。
- トークンは sessionStorage に保存され、ページリロード後も値が維持される。
- 再発行を行った場合は新しいトークンを保存し、既存の URL を即座に廃棄する。
- UI からコピー・共有しやすい形で提示する（トークン値が空の場合はプレースホルダー表示）。
- 実装を `shareService` / `projectStore` に寄せ、React コンポーネント側の責務を軽くする。

### Non-Goals
- 参加者個別トークン（`/p/{token}` や `/r/{token}`）の発行は本仕様の対象外（別途 Participant 管理で扱う）。
- アクセストークンの永続化（DB 保存）や失効 API の提供は後日検討とする。
- 招待メール送信や QR コード生成など、共有手段の自動化は今回のスコープ外。
- 個々の旧トークンへのアクセス制御ロジックはバックエンド導入時に検討する。

## 3. Terminology

| 用語 | 説明 |
| ---- | ---- |
| 管理者トークン (`adminToken`) | 管理画面へアクセスするための秘密トークン。URL は `https://scheduly.app/a/{adminToken}` の形式で導出され、編集権限を持つ。 |
| 参加者トークン (`participantToken`) | 参加者へ共有する秘密トークン。自身の出欠回答やコメントを入力する URL は `https://scheduly.app/p/{participantToken}` から生成される。旧称「閲覧トークン」。 |
| Share Link | 管理者・参加者それぞれの URL 全体。`https://scheduly.app/a/{adminToken}` など。 |
| `shareService` | トークン発行と保存を担うユーティリティ層。React コンポーネントから呼び出す。 |

## 4. User Stories

1. 管理者はプロジェクト準備が整ったタイミングで「共有URLを生成」をクリックする。新しい管理者 URL と参加者 URL が表示され、トーストで発行完了が通知される。
2. トークン未発行状態で画面を開いた場合は、URL 欄に「未発行」表示を出す。生成後は値が即座に更新される。
3. 発行済みの場合は「再発行」操作を提供し、確認後に新しいトークンへ更新する（旧 URL は即時無効）。
4. 他のブラウザ／タブで同じプロジェクトを開いていても、発行・再発行後の最新値が画面上に反映される（`projectStore` の購読で同期）。

## 5. Functional Requirements

1. **初期状態**
   - `project.project.shareTokens` が存在し、`admin` または `participant` が空文字／`null` の場合は「未発行」表示とする。
   - 初期生成時に `projectStore` がデフォルト値として持っている `demo-admin` などのダミー トークンは、自動で実際の URL に置き換えない（ユーザー操作をトリガーとする）。
   - ダミー値（例: `demo-admin`）やテスト用マーカーは UI 側で「未発行」とみなす。`shareService` に `isPlaceholderToken()` を用意し、ボタンの `disabled` 判定で利用する。

2. **トークン生成**
   - ブラウザの `crypto.getRandomValues` を使い、32 文字の Base62（`[0-9a-zA-Z]`）トークンを生成する。
   - 管理者 URL は「基準 URL（baseUrl）+ `/a/{adminToken}`」、参加者 URL は「基準 URL + `/p/{participantToken}`」で生成する。
   - `baseUrl` は UI 上に入力欄を用意し、初期値として `window.location.origin` をセットするが、ユーザーが適宜書き換えられるようにする。
   - サーバー（またはビルド設定）では `baseUrl` をホワイトリスト検証し、許可されたドメイン以外は拒否する。
   - 生成時に `issuedAt` と `lastGeneratedBy`（将来のユーザー識別向け）を記録できるよう、オブジェクト構造を採用する。

3. **状態更新**
   - `shareService.generate(projectId)` → `projectStore.updateShareTokens(projectId, nextTokens)` を呼び出す、もしくは同等のロジックを実装する。
   - 更新後、`projectStore` の購読機構を通じて React state (`urls`) を書き換え、UI を再レンダリングする。
   - `sessionStorage` 永続化が有効な場合は自動で保存される。
   - 発行済み（プレースホルダーではない）トークンが存在する場合は、「共有URLを生成」ボタンを「再発行」表示に切り替え、押下時に確認ダイアログを出した上で `shareService.rotate(projectId)` を呼び出す。

4. **再発行**
   - `shareService.rotate(projectId)` は新しい管理者トークン・参加者トークンを生成し、`projectStore.updateShareTokens` で置き換える。
   - 旧トークンは返却しない。必要であれば `revokedAt` に記録しておくが、`shareTokens` には保持しない。
   - 再発行成功後にトーストで「共有URLを再発行しました（以前のリンクは無効です）」などの文言を表示する。

5. **UI 連携**
   - URL は `KeyValueList` にテキストで表示。未発行時は `–– 未発行 ––` を表示し、発行済み時は「再発行」ボタンにラベルを切り替える。
   - クリック 1 回でクリップボードへコピーする補助ボタンの有無は後日検討。今回は表示のみでも可。
   - トースト文言: 初回発行は「共有URLを発行しました」、再発行時は「共有URLを再発行しました（以前のリンクは無効です）」とする。
   - 基準 URL の入力欄（プレースホルダー: `https://scheduly.app`）を用意し、初期値には `window.location.origin` をセットする。入力値はトークン生成・再発行時に送信する。

6. **エラー処理**
   - 生成処理中に例外が発生した場合は `console.error` と「共有URLの生成に失敗しました」というトーストを表示。既存トークンは破壊しない。

7. **エクスポート**
   - プロジェクトのエクスポート操作は管理者トークンを所持しているユーザー（=管理画面）からのみ実行できる。
   - エクスポートダイアログに「管理者トークンを含める」「参加者トークンを含める」のチェックボックスを設け、初期状態はオフとする。
   - チェックを外した場合は `shareTokens.admin` / `shareTokens.participant` をそれぞれ `null` または非包含で書き出し、JSON へ機密トークンが流出しないようにする。
   - チェックを入れてエクスポートした場合は、ファイルが第三者に渡らないよう注意喚起するメッセージをダイアログに表示する。

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
- `shareTokens` オブジェクト内で `admin` / `participant` はそれぞれ単一の有効トークンを保持し、複数値を蓄積しない。
- エクスポート時にトークンを除外する場合は、当該プロパティを削除するか `null` に置き換えることで秘匿状態を保つ。

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

shareService.rotate(projectId: string, options?: { confirm?: boolean; baseUrl: string }): {
  admin: ShareTokenEntry;
  participant: ShareTokenEntry;
};

shareService.invalidate(projectId: string, type: 'admin' | 'participant'): void;
```

- `generate` は未発行の場合にトークンを生成し、既存値がある場合はそのまま返す。`baseUrl` が入力された場合はバリデーションを通してから保存する。
- `rotate` は明示的な再発行操作用。新しいトークンを生成し、旧値を破棄する。`baseUrl` を指定した場合は同様に検証する。
- `invalidate` は手動で特定種別だけを無効化したい場合の将来用 API（今回のフロントからは呼び出さない）。
- `ShareTokenEntry` 型は前述のデータモデルを再利用する。

## 8. UI 状態遷移

1. **未発行**
   - `urls.admin === ''` or `undefined`、もしくは `isPlaceholderToken(urls.admin)` が真 → 「–– 未発行 ––」表示。
   - ボタン有効。押下で生成フローが走る。

2. **発行済み**
   - `urls.admin.url` / `urls.participant.url` を表示。
   - ボタンは「再発行」ラベルの有効状態で表示し、押下時に確認ダイアログ → `shareService.rotate` を呼び出す。

3. **発行失敗**
   - URL は更新せず現状維持。
   - トーストで失敗メッセージ。Console に詳細ログ。

## 9. Security Considerations

- トークンは 128bit 以上のエントロピーを持つ乱数とする（Base62 32 文字 ≒ 190 bit）。
- HTTPS 経由でのみ配布される前提（`Scheduly` サイトは HTTPS）。
- トークン値はログやアナリティクスに送らない。
- URL はあくまでトークンをラップした表示形式であり、`adminToken` / `participantToken` 自体を最重要機密として扱う。共有時はトークン値が露出しないよう注意する。
- 画面上に QR コードや短縮 URL を表示する場合は別途審査が必要。
- 旧トークンを残したまま公開したくない場合に備え、将来的には `revokedTokens` を保持しアクセス拒否する API を想定する。

## 10. Future API Endpoints（バックエンド化を見据えた草案）

当面はブラウザ内オンメモリ運用（1 ブラウザ = 1 プロジェクト）であり、トークンもセッション単位で管理される。しかし将来 Node.js などの常駐サーバーへ移行した場合は、1 サーバーで複数プロジェクトをホストする前提になる。バックエンド側では `projectId` をキーとしたデータストアと API を用意し、トークンの生成・無効化・重複チェックをプロジェクト単位で行う必要がある。

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
| 再発行後に旧 URL へアクセスされた場合 | サーバー側で無効扱いとし、適切なエラー画面を返す（将来のバックエンド実装で定義）。 |

---

本仕様に沿って `shareService` や `projectStore` の API を整備し、`admin.jsx` 側の `generateUrls` ダミー実装を実機能へ置き換えることを次のステップとする。
