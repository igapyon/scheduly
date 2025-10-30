# Share URL Generation Spec

共有 URL（管理者用・参加者用）とそれを構成するシークレットトークン（`adminToken` / `participantToken`）の最新仕様。React / webpack 版では `src/frontend/services/share-service.js` と `projectStore` が実装済みで、本ドキュメントはその挙動と今後の拡張ポイントをまとめる。

## 1. Scope & Background

- 対象画面: 管理画面 (`src/frontend/admin.jsx`) の「共有URL」カード。
- 対象機能: 「共有URLを生成」/「再発行」を押下した際に、管理者向け URL と参加者向け URL を管理・表示する処理。
- 実装コンテキスト: ブラウザ内オンメモリ運用。`projectStore` が sessionStorage を介してプロジェクト状態を永続化し、`shareService` がトークン生成・更新・URL 組み立てを担う。複数タブ／ウィンドウ間は `projectStore` の購読で同期される。

## 2. Goals / Non-Goals

### Goals
- プロジェクトごとに一意な管理者トークン・参加者トークンを保持し、常に最新 URL を提示する。
- `shareService.generate()` は既存の有効トークンを再利用しつつ、`baseUrl` やリダイレクト URL を整形して返す。未発行（プレースホルダー）の場合のみ新規生成する。
- `shareService.rotate()` は明示的に再発行し、旧トークンを即時無効化する。
- `projectStore.updateShareTokens()` を通じて sessionStorage へ保存し、リロード後もトークンが維持される。
- トークン情報を `ShareTokenEntry` として管理し、`issuedAt` / `lastGeneratedBy` / `revokedAt` といったメタデータを拡張しやすくする。
- `baseUrl` の sanitize とクロスオリジン遷移の防止を実装し、安全な自動遷移を保証する。
- React コンポーネント側はサービスから返るステートを表示・コピーボタンに渡すだけにし、責務を軽量化する。

### Non-Goals
- 参加者個別トークン（`/r/{participantToken}`）の発行や回答リンク生成は別仕様の対象。
- DB 永続化・API 経由の失効や監査ログは将来のバックエンド移行時に検討する。
- 招待メール送信・QR コード生成など、共有手段の自動化は当面のスコープ外。
- 旧トークンへのアクセス制御ロジックはバックエンド導入後に扱う。

## 3. Terminology

| 用語 | 説明 |
| ---- | ---- |
| 管理者トークン (`adminToken`) | 管理画面へアクセスするための秘密トークン。URL は `https://scheduly.app/a/{adminToken}` または `baseUrl/a/{adminToken}`。 |
| 参加者トークン (`participantToken`) | 参加者へ共有する秘密トークン。URL は `https://scheduly.app/p/{participantToken}` または `baseUrl/p/{participantToken}`。旧称「閲覧トークン」。 |
| Share Link | 管理者・参加者それぞれの URL 全体。 |
| `ShareTokenEntry` | `token` / `url` / `issuedAt`（ISO8601）と、必要に応じて `lastGeneratedBy` / `revokedAt` を保持するレコード。 |
| プレースホルダートークン | `demo-` で始まるダミー値。未発行扱いとし、UI では「–– 未発行 ––」表示。 |
| `shareService` | トークン取得・生成・再発行・URL 組み立て・自動遷移を担うサービス層。 |

## 4. User Stories

1. 管理者が初めてプロジェクトを共有する際に「共有URLを生成」を押すと、管理者 URL / 参加者 URL が生成され、画面とトーストで完了を確認できる。
2. リロード後や別タブで開いた場合でも、最新トークンが `projectStore` から復元され、UI は自動で同期される。
3. 既に発行済みで `baseUrl` だけ変更した場合、「共有URLを生成」はトークンを再利用し、URL を新しいベースに合わせて更新する。
4. セキュリティ上の理由で再発行したい場合、確認ダイアログ後に「再発行」を押すと新規トークンが生成され、旧 URL は即座に無効化される。
5. `navigateToAdminUrl` オプションを指定した生成・再発行では、同一オリジンであれば `/a/{adminToken}` へ自動遷移する。クロスオリジンや window が無い場合は遷移がブロックされ、結果が `navigation` オブジェクトで返る。

## 5. Functional Requirements

### 5.1 初期状態
- `project.project.shareTokens` に `ShareTokenEntry` が存在しない、またはプレースホルダーのみの場合は「未発行」表示とし、コピー操作を無効化する。
- `projectStore` の初期化時はダミー `demo-admin` を保持するが、UI では `shareService.isPlaceholderToken()` を利用して未発行扱いとする。
- sessionStorage に保存された値があれば、ロード時に復元される。

### 5.2 トークン生成（`shareService.generate`）
- `baseUrl` は `sanitizeBaseUrl` でプロトコル検証・パス/クエリの除去・末尾スラッシュ削除を行い、指定が無い場合は `window.location.origin` を使用する（ブラウザで取得不可のときは `https://scheduly.app` を使用）。
- 既存トークンが有効な場合は再利用し、URL を `baseUrl` で再構築する。未発行もしくはプレースホルダーの場合は新規トークンを発行する。
- トークン生成には `crypto.getRandomValues` が利用可能であれば使用し、32 文字の Base62 文字列を生成する（フォールバックとして `Math.random`）。
- `issuedAt` は ISO8601 文字列で記録し、`lastGeneratedBy` が渡されれば付与する。
- 返り値は `{ admin, participant, navigation }`。`admin` / `participant` はクローン済み `ShareTokenEntry`。

### 5.3 再発行（`shareService.rotate`）
- 常に新しいトークンを発行し、`projectStore.updateShareTokens` で現在値を置き換える。
- 旧トークンは即時に `shareTokenIndex` から削除され、参加者 URL も無効化される。
- `navigation` の扱いは `generate` と同様。

### 5.4 無効化（`shareService.invalidate`）
- 今後の UI 要件に備えて、`admin` / `participant` 別にエントリを削除する API を提供する。現行 UI では呼び出していないが、バックエンド実装時のフックポイントとして保持する。

### 5.5 自動遷移（`navigateToAdminUrl`）
- 管理者 URL へ自動遷移する場合は、`generate` / `rotate` のオプションで `navigateToAdminUrl: true` を指定する。
- `window.location.assign` が利用不可、URL が未生成、またはオリジンが現在と異なる場合は遷移をブロックし、理由（`missing_url` / `cross_origin` / `no_window`）を `navigation` に含める。

### 5.6 同期と通知
- `projectStore.notify` により購読者へ変更が配信され、`admin.jsx` ではストア購読を通じて最新トークンを表示する。
- sessionStorage へ保存されたトークンは、異なるタブでロード後に `StorageEvent` を介して同期される。

## 6. Data Model & Persistence

```
project.project.shareTokens = {
  admin: {
    token: "Base62 string",
    url: "https://example.com/a/{token}",
    issuedAt: "2025-10-30T12:34:56.789Z",
    lastGeneratedBy?: "user@example.com",
    revokedAt?: "2025-11-01T01:23:45.000Z"
  },
  participant: {
    token: "Base62 string",
    url: "https://example.com/p/{token}",
    issuedAt: "...",
    lastGeneratedBy?: "...",
    revokedAt?: "..."
  }
}
```

- `projectStore` は `normalizeShareTokens()` で入力を正規化し、プレースホルダーや空文字を除外する。
- データは sessionStorage（キー `scheduly:project-store`）に JSON として保存され、再読込時に `ensureProjectStateShape` を通じて復元・検証される。
- `shareTokenIndex` によりトークン → プロジェクトの逆引きを保持し、`/a/{token}` などからのルーティングに利用する。

## 7. Service API Surface

| 関数 | 役割 |
| ---- | ---- |
| `get(projectId)` | 現在の `ShareTokenEntry` を取得する（クローン済み）。 |
| `generate(projectId, { baseUrl, lastGeneratedBy, navigateToAdminUrl })` | 未発行分の生成および URL 再計算。`navigation` 結果を返す。 |
| `rotate(projectId, { baseUrl, lastGeneratedBy, navigateToAdminUrl })` | 両トークンを強制再発行する。 |
| `invalidate(projectId, type)` | 指定トークン種別を削除する（UI からは未使用）。 |
| `buildUrl(type, token, baseUrl)` | トークンから URL を構築するユーティリティ。 |
| `isPlaceholderToken(token)` | プレースホルダー判定。UI の「未発行」表示に利用。 |

## 8. UI 状態遷移

1. **未発行**
   - `isPlaceholderToken(entry.token)` が真、または `entry` が存在しない。
   - 管理者/参加者 URL 欄は「–– 未発行 ––」表示。コピー操作は無効。
   - ボタンは「共有URLを生成」。押下で `shareService.generate` を呼び出し、結果をストアへ反映。

2. **発行済み**
   - `entry.url` を表示し、コピー操作を有効化。
   - ボタンは「再発行」ラベル。押下時に確認ダイアログを表示し、承認後に `shareService.rotate`。
   - `baseUrl` 入力の変更は即座に状態へ保存し、次回の生成／再発行時に反映する。

3. **発行失敗**
   - `shareService` から例外が投げられた場合はトーストで通知し、現状値を保持する。
   - `navigation.blocked === true` の場合は警告トーストを出し、理由を Console ログへ出力する。

## 9. Security Considerations

- トークンは Base62 32 文字（約 190 bit）で生成し、推測困難性を確保する。
- HTTPS 前提で配布し、トークン値をログやアナリティクスに送信しない。
- `projectStore` の永続化データはブラウザ内（sessionStorage）に限定され、他アプリからは参照されない。
- クロスオリジン遷移は `shareService` で検出し、自動遷移をブロックする。
- 将来的にバックエンドを導入する際は、旧トークンを `revokedTokens` として保持しアクセス遮断する検証を行う。

## 10. Future API Endpoints（バックエンド化を見据えた草案）

ブラウザ内オンメモリ運用が前提だが、将来的に複数プロジェクトをホストする REST バックエンドを導入する場合、以下の API を想定する。

```
POST   /projects/:projectId/share-links
GET    /projects/:projectId/share-links
DELETE /projects/:projectId/share-links/:type   // type = admin | participant
```

- `POST` は既存トークンを上書きし、レスポンスに `ShareTokenEntry` を返す。
- `GET` は現在有効なトークン情報を返す。未発行の場合は 404 または空オブジェクト。
- `DELETE` は単一トークンを無効化する。再生成前の手動失効などで利用。

## 11. Edge Cases & Open Questions

| ケース | 対応方針 |
| ------ | -------- |
| トークン生成時に `projectId` が不明 | 例外を投げ、トーストで失敗通知。`resolveProjectIdFromLocation` を見直す。 |
| `sessionStorage` が利用できない環境 | 永続化不可。警告を表示し、現セッション内のみ有効とする。 |
| `baseUrl` が不正 URL | `sanitizeBaseUrl` で現在オリジンへフォールバックし、Console にデバッグログを出す。 |
| 自動遷移でクロスオリジン URL が指定された | ブロックし、理由を `navigation.reason` に格納する。 |
| `/a/{token}` などのパス形式を変更したい | `shareService.buildUrl` を差し替えるだけで済むよう、他レイヤーは `token` に依存する。 |
| 参加者 URL をプロジェクト固有トークンにする？ | 現在はプロジェクト共有トークンを採用。個別回答リンクは別仕様（参加者管理）で扱う。 |
| プレースホルダートークンが残っている | `isPlaceholderToken` で検出し、「未発行」扱いで UI をロックする。 |

## 12. Routing Notes

- `npm run dev` 時は webpack-dev-server の `historyApiFallback` で `/a/*` → `index.html`、`/p/*` → `user.html`、`/r/*` → `user-edit.html` へリライトする。
- 本番静的ホスティングでも同様のリダイレクト設定を行い、トークン付きパスを 404 にしない（例: Netlify `_redirects`、Firebase rewrites）。
- クライアント側では `projectStore.resolveProjectIdFromLocation()` が `/a/{adminToken}` / `/p/{participantToken}` / `/r/{participantToken}` を解析し、対応するプロジェクトをロードする。

---

`shareService` とストアの実装は既に React 版へ統合済み。今後は本仕様を基準に UI やバックエンド機能を拡張する。
