# Architecture Overview

Scheduly のフロントエンド構成と今後想定している拡張ポイントを簡潔にまとめます。現時点では「ブラウザで完結するモック」を React / webpack 版へ移植している段階であり、サーバーとの連携は今後の実装タスクです。

## フロントエンド構成

```
public/
├── index.html        # 管理者 UI (React / webpack -> index.bundle.js)
├── user.html         # 参加者 UI (React / webpack -> user.bundle.js)
├── responses.html    # 回答ダッシュボード UI (React / webpack -> responses.bundle.js)
└── legacy/           # 旧 HTML モック一式（参照用・比較用）
src/frontend/
├── admin.jsx         # プロジェクト（候補）管理画面
├── user.jsx          # 参加者向け回答画面
└── admin-responses.jsx # 回答ダッシュボード（管理者向け回答サマリー）
```

- **Webpack エントリ**
- `admin.jsx` → `index.bundle.js`（`public/index.html`で読み込み）
- `user.jsx` → `user.bundle.js`（`public/user.html`で読み込み）
- `admin-responses.jsx` → `responses.bundle.js`（`public/responses.html`で読み込み）
- **Tailwind**
  - 現状は CDN で読み込み、最低限の UI を構築。将来 PostCSS 化する予定。
- **ical.js**
  - ICS のインポート／エクスポートに利用。`admin.jsx` 側で CDN を読み込む。

## データレイヤー（現状の扱い）

- プロジェクト（候補）データ: `admin.jsx` 内でモックとして定義（React state）
- 参加者回答データ: `user.jsx` 内でモックとして定義（React state）
- ICS メタデータ: UID/SEQUENCE/DTSTAMP/TZID などを JavaScript で保持

将来的にはサーバー/API 層で以下のようなエンティティを扱う想定。

| エンティティ | 主なフィールド | 備考 |
|--------------|----------------|------|
| Project      | id, summary, description, timezone, createdAt | いわゆるアンケート（調整プロジェクト）本体 |
| Slot         | id, projectId, uid, dtstart, dtend, status, sequence, dtstamp | ICS 候補と 1:1 対応させる |
| Participant  | id, projectId, name, contact | 回答者の識別情報（公開／非公開などの扱いは未決） |
| Response     | id, participantId, slotId, mark, comment | ○△× とコメント、更新時刻などを保持 |

## 今後の拡張想定

- **回答管理画面（`admin-responses` 系）**  
  参加者ごとの回答を集計・編集できる UI を追加。回答ステータスを反映して確定日時を決めるループを作る。

- **サーバー/API 層**  
  フロントの React state に代わって、Project / Slot / Response を永続化する API を用意。iCal ファイルのアップロード／ダウンロードは REST か WebDAV か別途検討。

- **通知／共有機能**  
  回答締切のリマインダー、確定日時決定後の通知、ICS 添付メールなどを配る機能を検討。

## 開発ポリシー（現状の意識合わせ）

- React / webpack 版を主体に機能拡張する。レガシーモックは挙動比較と仕様確認のために最低限維持。
- iCal（ICS）は UID/DTSTAMP/TZID を正しく扱うことが重要。参加者回答は ICS メタデータと紐付けて管理する。
- 画面単位で役割を明確にし、管理者向け UI を複数画面に分割して育てる（プロジェクト管理・回答管理など）。
