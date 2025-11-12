# Glossary

Scheduly のドキュメントで登場する主要な用語をまとめています。詳細は各ドキュメントを併せて参照してください。

| 用語 | 意味 / 位置付け | 参照 |
| ---- | ---------------- | ---- |
| 管理者URL | プロジェクトを作成・編集する際に利用する秘密URL。`/a/{token}` 形式。 | docs/external/index-screens.md |
| 参加者URL | 参加者が回答・コメントを入力する秘密URL。`/p/{token}` 形式。 | docs/external/index-screens.md |
| トークン | 管理者/参加者URL に含まれるランダム文字列。URLを共有することでアクセス権を渡す。 | docs/external/concept-assumptions.md |
| ICS (iCalendar) | スケジュール情報を交換する標準フォーマット。拡張子 `.ics`。インポート/エクスポートで利用。 | docs/external/guide-ical-workflow.md |
| プロジェクト JSON | 管理者画面からエクスポートできる設定ファイル。回答や候補のバックアップに利用。 | docs/external/index-screens.md |
| InfoBadge | 画面内で補足説明を表示する UI 要素。クリックで注意点や補足が開く。 | docs/external/index-screens.md |
| 秘密URLモデル | 認証を行わず、URL を知っている人のみがアクセスできる運用方式。 | docs/external/concept-assumptions.md |
| Excel エクスポート | 参加者や日程の回答一覧をスプレッドシートで出力する機能。 | docs/external/index-screens.md |
| テスト公開パネル | 管理者/参加者画面のヘッダ直下に表示される注意書き。テスト公開中でデータが揮発する前提を利用者へ通知する。 | docs/external/index-screens.md |
| リロードボタン | 管理者・参加者 UI の右上にある更新アイコン。API スナップショットを手動で再取得したいときに使用する。 | docs/external/index-screens.md |
| 日程サマリー / 参加者サマリー | ○△× 集計と回答一覧を示すカード群。タブ切り替えで日程ごと / 参加者ごとの状況を確認できる。 | docs/external/index-screens.md |
| 共有URL再発行 | 管理者画面の操作で新しい管理者/参加者トークンを生成する機能。確認ワード（REISSUE）入力で誤操作を防止する。 | docs/external/index-screens.md |

※ 用語追加が必要な場合はこの表に追記してください。内部向け詳細は `docs/internal/DEVELOPER_NOTES.md` や各 spec 文書を参照します。
