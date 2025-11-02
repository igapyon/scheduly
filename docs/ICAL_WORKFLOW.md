# iCal (ICS) Workflow

Scheduly の候補管理は iCalendar (ICS) を中心に構成され、React / webpack 版では `schedule-service` と `projectStore` が候補・ICS テキストを一元管理しています。ここでは最新のデータフローと運用パターンをまとめます。

> 補足: 通常のWebアプリと異なる方式上の特徴（秘密URLによるアクセス、リアルタイム保存、揮発前提など）は外部仕様にまとめています。`docs/EXTERNAL_SPEC.md` を参照してください。

## 1. ワークフロー概要

- 管理画面は `/index.html` から `/a/{adminToken}` にリダイレクトされ、`admin.jsx` を通じて `scheduleService` を利用します。
- 候補一覧・参加者回答は `projectStore` に保存され、`icsText` も同じストアに永続化されます（sessionStorage ベース）。
- どのルートで候補を作成しても、`tallyService.recalculate()` により派生タリーが更新され、参加者画面や回答編集画面へ即時反映されます。

## 2. 外部カレンダーで作成 → Scheduly にインポート

1. Google Calendar など外部サービスで予定を作成し、ICS としてエクスポート。
2. 管理画面（`admin.jsx` の「ICS から追加」モーダル）でファイルを選択し、プレビューで内容を確認。
3. `scheduleService.replaceCandidatesFromImport()` が `UID` と `DTSTAMP` を見ながら候補をインポート。既存 UID と一致し `DTSTAMP` が新しいものは上書き、その他は新規候補として追加。
4. 取り込んだ候補は Scheduly 内で編集・配布・参加者回答に利用できる。

### このルートの特徴
- 外部サービス側で詳細調整したイベントを Scheduly へ連携させたいケースに適する。
- ICS には `UID` と `DTSTAMP` が必須。外部サービスとの二重管理になるため、どちらを最新ソースとするか運用ルールを明確にする。
- インポート直後に `icsText` が更新されるため、参加者側の「全候補を ICS でダウンロード」にも同内容が提供される。

## 3. Scheduly 内で直接入力 → 必要に応じて ICS をエクスポート

1. 管理画面から候補日時・場所・説明を直接編集（`scheduleService.addCandidate` / `updateCandidate` / `removeCandidate`）。
2. `scheduleService.exportCandidateToIcs()` または `exportAllCandidatesToIcs()` で個別／全体の ICS を生成。ファイル名や `SEQUENCE`／`DTSTAMP` も自動更新される。
3. 参加者画面 (`user.jsx`) でも最新候補が存在すれば一括エクスポートが可能。ストアの `icsText` が空の場合は都度生成する。

### このルートの特徴
- Scheduly をシングルソースとみなし、候補編集から参加者回答までをアプリ内で完結できる。
- エクスポート時に `rawICalVevent` を更新しておくことで、再度 ICS をインポートしても差分判定がしやすい。
- 外部連携が不要なチームではこのルートのみで運用可能。

## 4. ICS を扱う際のメタデータ方針

| 項目 | 役割 | 実装メモ |
|------|------|----------|
| UID | 候補のユニーク識別子 | `generateSchedulyUid()` で生成。外部同期時もこの UID を基準にマージ。 |
| DTSTAMP | 更新時刻 | `scheduleService` が ISO8601 で管理し、出力時に UTC へ変換 (`formatUtcForICal`)。 |
| SEQUENCE | 版数 | 個別エクスポート時は `resolveNextSequence()` でインクリメント。 |
| DTSTART / DTEND | 開始・終了時刻 | 現在は UTC 出力。編集 UI ではローカル時刻を保持し、ICS 化時に `formatUtcForICal` を利用。 |
| TZID | タイムゾーン ID | 候補ごとに設定。入力が無い場合は `DEFAULT_TZID`（`Asia/Tokyo`）を使用。`X-SCHEDULY-TZID` プロパティでも補足。 |
| LOCATION / DESCRIPTION / STATUS | 補足情報 | `escapeICalText()` で ICS エスケープ済み。 |
| rawICalVevent | 元 ICS JSON | 再インポート時の差分判定用に `toJSON()` で保持。 |

## 5. 実装ノート

- ICS テキストは常に最新候補をシリアライズした文字列として `projectStore` に保持し、`projectStore.getIcsText()` で参照できる。
- `scheduleService.persistCandidates()` が候補保存・タリー再計算・ICS 更新を一括で実行するため、管理者 UI はサービス呼び出しだけで済む。
- `shared/ical-utils.js` の `ensureICAL()` により、`ical.js` を lazily ロードしてパース処理を行う。
- デバッグログは `createLogger("schedule-service")` を利用しており、問題解析時に console チェックする。

## 6. 今後の検討事項

- `VTIMEZONE` の自動付与（海外メンバー向けの適切なタイムゾーン情報配布）。
- 外部 ICS との差分通知や、定期的な再インポートのための UI/スケジューラ整備。
- `scheduleService` での検証強化（例: 不正フォーマットのガード、`TZID` のバリデーション）。
- バックエンド導入時に ICS を API で配布する仕組み（署名付き URL など）の設計。
