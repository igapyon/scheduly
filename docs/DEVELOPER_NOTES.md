# Developer Notes

Scheduly のモックを改善するときに頼りにしたい開発メモです。UI の概要は README に譲り、ここでは実装の裏側やデバッグの勘所を簡潔にまとめます。現在進行中の作業メモや TODO を残して再開しやすくする役割を担っており、QA 手順は `docs/VERIFY_CHECKLIST.md` に分離しています。

## モックの前提

- レガシーモックは `public/legacy/*.html` に置かれ、React 18（UMD 版）＋ Tailwind CDN ＋ Babel Standalone で動作します。ブラウザで直接開くだけで確認できます。
- React / webpack 版は `src/frontend/` を起点に進めている再構築中のコードです。`npm run dev` や `npm run build` を利用して挙動を確認します。

## ICS まわりのメモ

- 管理者モック（`scheduly-admin-mock.html`）は候補ごとに `rawVevent` を保持しつつ、エクスポート時は文字列を組み立てて `.ics` を生成します。React 版の `admin.jsx` ではこの処理に加え、プロジェクト全体を JSON としてエクスポート／インポートする機能も実装済みです。実装の詳細は `exportCandidateToIcs` ・ `exportAllCandidatesToIcs` ・ `projectStore.exportProjectState` ・ `projectStore.importProjectState` を参照。
- ICS 生成に失敗した場合は、候補データを含めて `console.error` を出力するようにしています。Chrome 開発者ツールの Console で状況を確認してください。
- ICS インポートのプレビューは既定で全候補 OFF、既存の UID と一致する候補のみ ON になります。振る舞いを変えるときは `handleIcsImport` とプレビュー UI をセットで確認すると迷いません。

## モック更新ワークフロー

1. React/webpack 版を `npm run dev` で起動し、目的の画面（例: `http://localhost:5173/index.html`）を表示する。
2. Chrome DevTools の Elements タブで該当 DOM を選択し、右クリック → `Copy` → `Copy outerHTML` でレンダリング後の HTML を取得する。
3. `public/legacy/*.html` を更新するときは、コピーした DOM を該当セクション（多くの場合は `<section>` や `<details>` 単位）に丸ごと置き換え、**その後** 文言やダミーリンクなどを微調整する。部分的な追い足し／削りではなく、一旦全置換 → 手直しの流れにすると齟齬が起きにくい。
4. 取得した DOM を生成 AI などに渡し、トークナイズや改行調整、重複クラスの整理など手作業でやりづらい細部だけ補助させる。
5. モック側に貼り付けるときは動作ロジックを追加しない（トーストやボタンは見栄え再現のみ）。必要があれば Tailwind クラスをそのまま利用する。
5. 反映後はブラウザでレガシーモックを開き、見た目と最低限の開閉などが崩れていないかを目視確認する。

- スクリーンショット (`docs/screenshot/*.png`) は React 版の最新 UI が差異なく再現できているか判断する材料になる。UI 更新を行った場合は同じ手順で撮り直し、ファイルを更新する習慣を付ける。

## 開発フローの覚書

- レガシーモックはブラウザで直接動かし、修正後はリロードで挙動を確認します。
- Webpack 版は `npm run dev` でホットリロードしながら作業します。エントリポイントは管理者向け `src/frontend/admin.jsx`（`public/index.html`）、参加者回答一覧 `src/frontend/user.jsx`（`public/user.html`）、参加者回答編集 `src/frontend/user-edit.jsx`（`public/user-edit.html`）。
- 画面の挙動が想定とズレたら、まず Console ログを確認し、必要なら `console.log` を一時的に追加して原因を突き止めます。解決後に整える方が近道です。
- 参加者モックの `ICS` ボタンは現状トーストを表示するだけのダミーです。本実装時に必要な導線として残しています。

## トラブルシューティングの習慣

- プロジェクトはローカル HTML のみで完結しているため、問題が起きたときは常に Chrome DevTools（mac: `⌥ ⌘ I`, Windows: `Ctrl` + `Shift` + `I` or `F12`）の Console を見る習慣を付けてください。
- 生成 AI も含め、誰かが挙動を確認するときは Console をチェックするよう声かけするのがベストプラクティスです。正常に見えるときでも念のため覗いておくと安心です。
- 明示的なリマインダー：生成 AI は節目ごと（新機能着手前後や検証の直前など）に「Chrome DevTools の Console を確認してください」と促し、毎返信ではなく適度な頻度で案内すること。

## Webpack への移行メモ

- `src/frontend/` に React エントリ（管理者向け `admin.jsx` → `index.bundle.js`、参加者回答一覧 `user.jsx` → `user.bundle.js`、参加者回答編集 `user-edit.jsx` → `userEdit.bundle.js`）を配置し、スタイルは当面 HTML 側で読み込む Tailwind CDN と最小限のインライン CSS で対応。
- `public/index.html`（管理画面） / `public/user.html`（参加者回答一覧） / `public/user-edit.html`（参加者回答編集）で Tailwind CDN を読み込みます。管理画面では ical.js CDN も読み込んでいます。
- 開発時は `npm run dev` で `webpack-dev-server`（ポート 5173）を起動。`http://localhost:5173/index.html`（管理者）、`http://localhost:5173/user.html`（参加者回答一覧）、`http://localhost:5173/user-edit.html`（参加者回答編集）を必要に応じて開く。Console を必ず確認。
- ビルドは `npm run build` → `npm run postbuild` の流れ（`postbuild` は `scripts/copy-static.js` により `public` ディレクトリを `dist` へ複製）。生成された `dist` を静的ホスティングへ配置できる。
- 既存の HTML モックを移行する際は、まず共通関数（ICS のユーティリティなど）を `src/frontend/utils/` に切り出し、小さなコンポーネント単位で JSX に置き換える。UI の差異が出ないよう段階的に差し替える。

## TODO のタネ

- ICS 生成時に `TZID` 付きの `VTIMEZONE` を自動で組み込むなど、タイムゾーン情報の扱いを強化する（現状はカスタムプロパティ `X-SCHEDULY-TZID` のみ）。
- 参加者の名前変更／削除フローを実装し、現在のモックボタンを実処理に置き換える。
- 「参加者を新規登録」ボタンから起動する登録モーダル（もしくは画面）を作成し、管理画面とデータ連携できるようにする。
- `src/frontend` 側の UI 変更は直近バックポート済み。今後差分が出たときは `public/legacy` の HTML モックへ随時反映してギャップを最小化する。
- 現状のオンメモリ実装ではブラウザの `sessionStorage` に状態を保持しています。将来的に本番運用する際はサーバー側の永続化（API 経由のストア）へ置き換えること。
- TODO: 全く同じ名前の参加者を登録できないようバリデーションを追加する。
- TODO: 参加者の表示名を変更できる機能を追加する。
- TODO: 参加者の登録順を編集できるようにする。
- TODO: 将来的に `user.html` や `user-edit.html` への直接アクセスを防ぐ仕組み（例: 共有URLからの遷移のみ許可）を導入する。
- 管理・参加者・回答編集の 3 画面でデータ構造や表示ロジックが矛盾していないか確認し、必要に応じて調整する（説明文・ステータス・タイムゾーンなど）。
- 管理画面で ICS をインポートまたは手入力 → 参加者登録 → 回答入力、という一連のフローが技術的に破綻なく成立するか検証する。
- `docs/FLOW_AND_API.md` で整理した in-memory サービス群（`projectStore` / `scheduleService` / `participantService` / `responseService` / `summaryService`）を実装し、React 3 画面から呼び出す。スコープ外の画面からは読み取り専用 API のみ公開する。
- 管理者用 URL（例: `/a/{adminToken}`）と参加者用 URL（`/p/{participantToken}` / `/r/{participantToken}`）を発行し、匿名アクセスでも画面単位で動作が混ざらないようにする。必要に応じて `demo-admin` / `demo-participant-001` のような固定トークンも用意する。
- `summaryService.buildScheduleView` / `buildParticipantView` に対応するタブ表示を `user.jsx` に実装し、レスポンス更新時に再計算する。
- `responseService.upsert` の結果を使って `tallyService.recalculate` を反映するホットリロードループを `user-edit.jsx` から組み込み、○△× 更新とコメント保存がリアルタイムで一覧に反映されるよう整える。
- 参加者側 (`user.jsx` / `user-edit.jsx`) でも `projectStore` と `scheduleService` を利用して候補データを取得し、管理画面との表示差分をなくす（サマリー表示と回答編集の両方）。
- ICS インポートプレビューから選択した候補のみをストアへ適用できるようにし、未選択候補のスキップ理由を含めたログ／トースト表示を整える。
- TODO: ICS インポート時にタイムゾーンが UTC 固定になる問題を解消し、デフォルト `Asia/Tokyo` を適用できるようにする。
- TODO: 日程ごとの「回答」ボタンから遷移した際、回答編集画面でも同じ日程が選択された状態で開くように調整する。
