# Developer Notes

Scheduly のモックを改善するときに頼りにしたい開発メモです。UI の概要は README に譲り、ここでは実装の裏側やデバッグの勘所を簡潔にまとめます。

## モックの前提

- レガシーモックは `public/legacy/*.html` に置かれ、React 18（UMD 版）＋ Tailwind CDN ＋ Babel Standalone で動作します。ブラウザで直接開くだけで確認できます。
- React / webpack 版は `src/frontend/` を起点に進めている再構築中のコードです。`npm run dev` や `npm run build` を利用して挙動を確認します。

## ICS まわりのメモ

- 最小構成の挙動確認には `public/legacy/downloadtest.html` を利用します。Blob ダウンロードが怪しいときはまずここでブラウザ環境を切り分けてください。
- 管理者モック（`scheduly-admin-mock.html`）は候補ごとに `rawVevent` を保持しつつ、エクスポート時は文字列を組み立てて `.ics` を生成します。実装の詳細は `exportCandidateToIcs` と `exportAllCandidatesToIcs` を参照。
- ICS 生成に失敗した場合は、候補データを含めて `console.error` を出力するようにしています。Chrome 開発者ツールの Console で状況を確認してください。
- ICS インポートのプレビューは既定で全候補 OFF、既存の UID と一致する候補のみ ON になります。振る舞いを変えるときは `handleIcsImport` とプレビュー UI をセットで確認すると迷いません。

## 開発フローの覚書

- レガシーモックはブラウザで直接動かし、修正後はリロードで挙動を確認します。
- Webpack 版は `npm run dev` でホットリロードしながら作業します。エントリポイントは `src/frontend/index.jsx` と `src/frontend/admin.jsx`。
- 画面の挙動が想定とズレたら、まず Console ログを確認し、必要なら `console.log` を一時的に追加して原因を突き止めます。解決後に整える方が近道です。
- 参加者モックの `iCal (ICS)` ボタンは現状トーストを表示するだけのダミーです。本実装時に必要な導線として残しています。

## トラブルシューティングの習慣

- プロジェクトはローカル HTML のみで完結しているため、問題が起きたときは常に Chrome DevTools（mac: `⌥ ⌘ I`, Windows: `Ctrl` + `Shift` + `I` or `F12`）の Console を見る習慣を付けてください。
- 生成 AI も含め、誰かが挙動を確認するときは Console をチェックするよう声かけするのがベストプラクティスです。正常に見えるときでも念のため覗いておくと安心です。
- 明示的なリマインダー：生成 AI は節目ごと（新機能着手前後や検証の直前など）に「Chrome DevTools の Console を確認してください」と促し、毎返信ではなく適度な頻度で案内すること。

## Webpack への移行メモ

- `src/frontend/` に React エントリ（参加者向け `index.jsx`、管理者向け `admin.jsx`）を配置し、スタイルは当面 HTML 側で読み込む Tailwind CDN と最小限のインライン CSS で対応。バンドルは `webpack.config.js` で `index.bundle.js` / `admin.bundle.js` として生成する。
- `public/index.html` / `public/admin.html` で Tailwind CDN を読み込み、`public/admin.html` では ical.js CDN も読み込む。React 側はこれらのグローバルを前提としている。
- 開発時は `npm run dev` で `webpack-dev-server`（ポート 5173）を起動。`public/index.html` や `public/admin.html` を開き、必要に応じて `http://localhost:5173/admin.html` へアクセスする。Console を必ず確認。
- ビルドは `npm run build` → `npm run postbuild` の流れ（`postbuild` は `scripts/copy-static.js` により `public` ディレクトリを `dist` へ複製）。生成された `dist` を静的ホスティングへ配置できる。
- 既存の HTML モックを移行する際は、まず共通関数（ICS のユーティリティなど）を `src/frontend/utils/` に切り出し、小さなコンポーネント単位で JSX に置き換える。UI の差異が出ないよう段階的に差し替える。

## TODO のタネ

- `exportAllCandidatesToIcs` を使った「日程一覧をまとめてダウンロード」ボタンを追加し、全候補の一括エクスポートを実現する。
- ICS 生成時に `TZID` 付きの `VTIMEZONE` を自動で組み込むなど、タイムゾーン情報の扱いを強化する（現状はカスタムプロパティ `X-SCHEDULY-TZID` のみ）。
