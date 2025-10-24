# Developer Notes

Scheduly のモックを改善するときに頼りにしたい開発メモです。UI の概要は README に譲り、ここでは実装の裏側やデバッグの勘所を簡潔にまとめます。

## モックの前提

- すべてのモックは `src/main/resources/*.html` に置かれており、React 18（UMD 版）、Tailwind CSS、Babel Standalone を CDN から取得して動作します。
- 追加のビルド工程やサーバー起動は不要です。HTML をブラウザで直接開けば最新のコードがそのまま確認できます。

## ICS まわりのメモ

- 最小構成の挙動確認には `src/main/resources/downloadtest.html` を利用します。Blob ダウンロードが怪しいときはまずここでブラウザ環境を切り分けてください。
- 管理者モック（`scheduly-admin-mock.html`）は候補ごとに `rawVevent` を保持しつつ、エクスポート時は文字列を組み立てて `.ics` を生成します。実装の詳細は `exportCandidateToIcs` と `exportAllCandidatesToIcs` を参照。
- ICS 生成に失敗した場合は、候補データを含めて `console.error` を出力するようにしています。Chrome 開発者ツールの Console で状況を確認してください。
- ICS インポートのプレビューは既定で全候補 OFF、既存の UID と一致する候補のみ ON になります。振る舞いを変えるときは `handleIcsImport` とプレビュー UI をセットで確認すると迷いません。

## 開発フローの覚書

- 画面の挙動が想定とズレたら、まず Console ログを確認し、必要なら `console.log` を一時的に追加して原因を突き止めます。解決後に整える方が近道です。
- 参加者モックの `iCal (ICS)` ボタンは現状トーストを表示するだけのダミーです。本実装時に必要な導線として残しています。

## トラブルシューティングの習慣

- プロジェクトはローカル HTML のみで完結しているため、問題が起きたときは常に Chrome DevTools（mac: `⌥ ⌘ I`, Windows: `Ctrl` + `Shift` + `I` or `F12`）の Console を見る習慣を付けてください。
- 生成 AI も含め、誰かが挙動を確認するときは Console をチェックするよう声かけするのがベストプラクティスです。正常に見えるときでも念のため覗いておくと安心です。
- 明示的なリマインダー：生成 AI は回答の中で「Chrome DevTools の Console を確認してください」とこまめに伝えること。

## TODO のタネ

- `exportAllCandidatesToIcs` を使った「日程一覧をまとめてダウンロード」ボタンを追加し、全候補の一括エクスポートを実現する。
- ICS 生成時に `TZID` 付きの `VTIMEZONE` を自動で組み込むなど、タイムゾーン情報の扱いを強化する（現状はカスタムプロパティ `X-SCHEDULY-TZID` のみ）。
