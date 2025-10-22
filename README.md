# scheduly

スケジュール調整アプリのプロトタイプです。当面はUIモックのみを提供しています。

## 概要

- `src/main/resources/scheduly-mock.html` にモバイル想定のUIモックを実装しています。
- `src/main/resources/scheduly-admin-mock.html` に管理者向けのイベント作成・管理モックUIを実装しています。
- React 18（UMD版）と Tailwind CSS CDN を組み合わせ、長押しで参加者モーダルを開くなどタッチ操作も再現しています。
- モックデータとして候補日（`DAYS`）と参加者の出欠状況（`PARTICIPANTS`）を定義し、回答（○/△/×）やコメント入力、出欠サマリー表示、自動保存トーストなどを確認できます。
- 管理画面は将来的に iCal (ICS) ファイルと相互連携できる構成を想定しており、主要フィールド（タイトル／日付／場所など）を扱う計画です。

## モックの動かし方

ブラウザで `src/main/resources/scheduly-mock.html` または `src/main/resources/scheduly-admin-mock.html` を直接開くだけでモックUIを確認できます。Babel Standalone を利用しているためビルドは不要です。

## ライセンス

このリポジトリは [Apache License 2.0](LICENSE) の下で配布されています。
