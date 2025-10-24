# scheduly

Scheduly は、ICS（iCalendar）との連携を念頭に置いたスケジュール調整アプリの UI プロトタイプです。現時点ではブラウザで開くだけで動作するモックを提供し、参加者向け・管理者向けの双方から操作感を確認できます。

## プロジェクトについて

- すべてのモックは `src/main/resources/` 配下の HTML として収録されており、React 18（UMD 版）、Tailwind CSS、Babel Standalone を CDN から読み込んで動作します。
- ビルドやサーバーのセットアップは不要で、ブラウザでファイルを直接開くだけで利用できます。
- ICS の `SUMMARY` / `DTSTART` / `DTEND` / `TZID` / `STATUS` / `UID` / `SEQUENCE` / `DTSTAMP` といったメタデータを UI 上で扱うことを意識して設計しています。

## 主要モック

### 参加者向けモック（`src/main/resources/scheduly-mock.html`）
- スマートフォンを想定したタッチ操作 UI を再現し、候補ごとの詳細を長押しで確認できます。
- 各候補は ICS 仕様に沿ったメタデータを持ち、参加者の出欠集計（○／△／×）を一覧表示します。
- ICS ダウンロードを想定したボタンや、回答・コメントの入力、トースト通知などをモックとして体験できます。

### 管理者向けモック（`src/main/resources/scheduly-admin-mock.html`）
- ical.js を活用して ICS ファイルをインポートし、UID と DTSTAMP を基準に候補の追加・更新を判定するプレビュー UI を備えています。
- ICS キーに合わせた候補入力フォームを提供し、UID・SEQUENCE・DTSTAMP の編集や確認をダイアログで行えます。
- 候補単位でのエクスポートを Blob ダウンロードとしてモック実装しており、最終的な ICS 出力の流れを確認できます。

### ダウンロード確認用ページ（`src/main/resources/downloadtest.html`）
- ブラウザが Blob 生成からのファイルダウンロードを正しく処理できているかを単独で検証するための最小構成サンプルです。

## 使い方

1. 利用したい HTML ファイルをブラウザで直接開きます。
2. 画面上のボタンやフォームを操作して、想定されるユーザーフローや ICS との連動イメージを確認します。
3. 挙動が想定と異なる場合は Google Chrome の開発者ツール（mac: `⌥ ⌘ I`, Windows: `Ctrl` + `Shift` + `I` もしくは `F12`）を開き、Console のログをチェックしてください。

## 開発・デバッグのヒント

- Babel Standalone を使っているため、ブラウザをリロードするだけで変更を反映できます。
- 調査のための `console.log` 追加は遠慮なく実施し、原因が特定できたら必要に応じて整理してください。
- ICS 生成が失敗した際には `console.error` に候補データが出力されます。ログの確認がトラブルシューティングの近道です。

## TODO の種

- `exportAllCandidatesToIcs` を活用し、候補を一括ダウンロードできる UI を追加する。
- `TZID` 付きの `VTIMEZONE` を自動付与するなど、タイムゾーン情報の扱いを強化する。

## ライセンス

このリポジトリは [Apache License 2.0](LICENSE) の下で配布されています。
