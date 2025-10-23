# scheduly

スケジュール調整アプリのプロトタイプです。当面はUIモックのみを提供しています。

## 概要

- `src/main/resources/scheduly-mock.html` では、参加者向けにスマートフォンレイアウトの UI モックを実装しています。各候補は `SUMMARY / DTSTART / DTEND / TZID / STATUS / UID / SEQUENCE / DTSTAMP` など ICS 仕様に沿ったメタデータを持ち、モーダルから詳細を参照できます。
- `src/main/resources/scheduly-admin-mock.html` では、管理者向けのイベント作成・管理モック UI を提供します。候補入力フォームは ICS キーに合わせて設計され、UID・SEQUENCE・DTSTAMP などはダイアログで確認する構成になっています。
- React 18（UMD 版）と Tailwind CSS CDN を組み合わせ、長押しで参加者モーダルを開くなどタッチ操作も再現しています。
- モックデータとして候補日（`DAYS`）と参加者の出欠状況（`PARTICIPANTS`）を定義し、回答（○／△／×）やコメント入力、出欠サマリー表示、自動保存トーストなどを確認できます。
- 参加者／管理者双方の画面に、候補ごとに iCal (ICS) をダウンロードする前提のボタン（モック）を配置しており、1候補=1 ICS という運用を想定した UI を確認できます。
- 管理者 UI では [ical.js](https://github.com/mozilla-comm/ical.js/) を利用し、ICS ファイルのインポート（UID と DTSTAMP を比較して追加・更新／古いデータはスキップ可）時に候補ごとの取捨選択ダイアログを表示し、候補単位でのエクスポート動線もモック実装しています。

## モックの動かし方

ブラウザで `src/main/resources/scheduly-mock.html` または `src/main/resources/scheduly-admin-mock.html` を直接開くだけでモックUIを確認できます。Babel Standalone を利用しているためビルドは不要です。

## ライセンス

このリポジトリは [Apache License 2.0](LICENSE) の下で配布されています。
