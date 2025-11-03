# Architecture Overview
<!-- file moved to concept-architecture.md by docs prefix policy -->

Scheduly のフロントエンド構成と今後想定している拡張ポイントを簡潔にまとめます。現在は React / webpack 版アプリを主軸に開発しており、初期モックだった HTML 版は最新アプリのスナップショットを確認する静的コンテンツとして最小限維持しています。サーバーとの連携は今後の実装タスクであり、フロントとサーバーを同じ JavaScript スタック（Node.js）で統一する方針を採ります。

## フロントエンド構成

```
public/
├── index.html         # 管理者 UI (React / webpack -> index.bundle.js)
├── user.html          # 参加者 UI (React / webpack -> user.bundle.js)
└── legacy/            # HTML モックのスナップショット（参照・比較用）
src/frontend/
├── admin.jsx          # プロジェクト（候補）管理画面
└── user.jsx           # 参加者回答一覧＋インライン編集 (共有ビュー)
```

- **Webpack エントリ**
- `admin.jsx` → `index.bundle.js`（`public/index.html`を初期表示し、共有トークン発行後は `/a/{token}` へリダイレクト）
- `user.jsx` → `user.bundle.js`（`public/user.html`を初期表示し、共有トークン利用時は `/p/{token}` へリダイレクト。旧 `/r/{token}` も後方互換で `/p/{token}` へ転送）
- **Tailwind**
  - 現状は CDN で読み込み、最低限の UI を構築。将来 PostCSS 化する予定。
- **ical.js**
  - ICS のインポート／エクスポートに利用。`admin.jsx` 側で CDN を読み込む。

## データレイヤー（現状の扱い）

- プロジェクト状態は `project-store` を中心とする in-memory サービス群で管理し、`project-service` / `schedule-service` / `participant-service` / `response-service` / `tally-service` / `summary-service` が各画面から参照・更新する。
- ICS メタデータ（UID/SEQUENCE/DTSTAMP/TZID など）は JavaScript で保持し、エクスポート時に `schedule-service` が増分管理する。
- 既存の HTML モックに残っていたダミーデータは撤廃し、React 版アプリから JSON／ICS をエクスポート・インポートして状態を復元する運用とした。

将来的にはサーバー/API 層で以下のようなエンティティを扱う想定。

| エンティティ | 主なフィールド | 備考 |
|--------------|----------------|------|
| Project      | id, summary, description, timezone, createdAt | いわゆるアンケート（調整プロジェクト）本体 |
| Slot         | id, projectId, uid, dtstart, dtend, status, sequence, dtstamp | ICS 候補と 1:1 対応させる |
| Participant  | id, projectId, name, contact | 回答者の識別情報（公開／非公開などの扱いは未決） |
| Response     | id, participantId, slotId, mark, comment | ○△× とコメント、更新時刻などを保持 |

## 今後の拡張想定

- **回答管理画面（`user` 系）**  
  参加者ごとの回答を集計・編集できる UI を追加。回答ステータスを反映して確定日時を決めるループを作る。

- **サーバー/API 層**  
  フロントの React state に代わって、Project / Slot / Response を永続化する API を用意。iCal ファイルのアップロード／ダウンロードは REST か WebDAV か別途検討。

- **通知／共有機能**  
  回答締切のリマインダー、確定日時決定後の通知、ICS 添付メールなどを配る機能を検討。

## 開発ポリシー（現状の意識合わせ）

- React / webpack 版を主体に機能拡張する。レガシーモックは挙動比較と仕様確認のために最低限維持。
- iCal（ICS）は UID/DTSTAMP/TZID を正しく扱うことが重要。参加者回答は ICS メタデータと紐付けて管理する。
- 画面単位で役割を明確にし、管理者向け UI を複数画面に分割して育てる（プロジェクト管理・回答管理など）。
