# Contributing Guide

Scheduly へ貢献いただく際の基本的な流れとルールをまとめます。初めての方でも迷わず参加できるよう、環境構築から Pull Request 提出までの手順を簡潔に記載しています。

## 開発環境の準備

1. リポジトリを fork / clone する  
   ```bash
   git clone https://github.com/igapyon/scheduly.git
   cd scheduly
   ```
2. 依存関係をインストール  
   ```bash
   npm install
   ```
3. 開発サーバーを起動（必要に応じて）  
   ```bash
   npm run dev
   ```
   - `http://localhost:5173/index.html` などで画面を確認します。
   - Chrome DevTools の Console を開きっぱなしにして警告・エラーを必ずチェックしてください。

## 作業の進め方

- `main` ブランチから派生したトピックブランチを作成し、小さな単位でコミットすることを推奨します。
- 作業ノートや TODO は `docs/internal/DEVELOPER_NOTES.md` に追記し、途中で中断しても再開しやすくしてください。
- 目視確認は `docs/internal/ref-verify-checklist.md` に沿って実施します。必要に応じて手順をアップデートしてください。

## コーディング規約・Lint

- ESLint を導入済みです。PR 前に必ず実行し、エラーがないことを確認してください。  
  ```bash
  npm run lint
  ```
- Tailwind クラスは既存のスタイルに合わせて使用し、不要なカスタム CSS を増やさないようにします。
- 非 ASCII 文字を新たに導入する場合は理由をコメントで説明するか、既存の慣習に従ってください。

## テスト
<!-- file moved to guide-contributing.md by docs prefix policy -->

- 現状は主に手動確認が中心です。将来自動テストが導入された際は、PR 時に該当コマンドを実行し、結果を共有してください。
- ICS 連携など副作用が大きい機能を触る場合は、再現手順と確認結果を PR 説明に記載してください。

## Pull Request

1. PR タイトルと説明には、変更内容・目的・確認手順を明記します。
2. UI の変更がある場合はスクリーンショットや動作確認 GIF を添付するとレビューがスムーズです。
3. 関連する Issue があれば `Closes #123` のように明記してください。
4. レビューコメントには丁寧に対応し、必要であれば追加コミットや説明を加えてください。

## Issue 提案

- バグ報告や改善案は GitHub Issues を利用してください。再現手順・期待する挙動・実際の挙動・ログを記載すると助かります。
- 規模が大きい提案は、まずディスカッションを立ち上げてコンセンサスを取ることを推奨します。

## コントリビューターのクレジット

- プロジェクトに貢献いただいた方は `docs/external/ref-contributors.md` で紹介しています。PR がマージされ次第、必要に応じて追加します。

ご協力ありがとうございます。楽しく品質の高いプロジェクトに育てていきましょう！
