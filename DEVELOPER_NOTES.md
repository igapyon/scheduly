# Developer Notes

Scheduly のモックを改善する際に押さえておきたい最低限のメモです。README には UI の概要だけを書いているので、ここでは開発・デバッグ寄りの話をまとめています。

## ics 周り

- `src/main/resources/downloadtest.html` は最小構成のダウンロード確認用ページです。挙動が怪しいときは、まずこちらでブラウザが正常に Blob ダウンロードできるかを確認してください。
- 管理者コンソール側 (`scheduly-admin-mock.html`) は候補単位で `rawVevent` を保持しつつも、エクスポート時はシンプルな文字列生成で `.ics` を作っています。必要なら `exportCandidateToIcs` と `exportAllCandidatesToIcs` を参照。
- ICS 生成が失敗した場合、コンソールに候補データが `console.error` で出るようにしてあるので、Chrome 開発者ツール（mac: `⌥ ⌘ I`, Windows: `Ctrl` + `Shift` + `I` or `F12`）の Console タブでログを見てください。
- インポート時のプレビューは既定で全候補 OFF（既存と UID が一致している場合だけ ON）です。取り込み方針を変えるときは `handleIcsImport` とプレビュー UI を一緒に見ること。

## 開発フローの覚書

- ブラウザで直接 `src/main/resources/*.html` を開いて動作確認できます。モックは Babel Standalone を使っているため、ビルド工程は不要です。
- 画面の挙動がおかしいと感じたら、まず Console ログを確認し、必要であれば `console.log` を遠慮なく仕込んでください。あとで削除するよりも原因究明が優先です。
- 参加者モック側の `iCal (ICS)` ボタンはトースト表示のみのダミー（未実装）であることに注意してください。いずれこちらも実装を行いたいです。

## TODO アイデア

- `exportAllCandidatesToIcs` を使った「日程一覧をまとめてダウンロード」ボタンを UI に追加して、利用者が全候補を一括でエクスポートできるようにする。
- ICS 生成時に `TZID` 付きの `VTIMEZONE` を自動で追加するか検討（現状はカスタムプロパティ `X-SCHEDULY-TZID` のみ）。

以上。
