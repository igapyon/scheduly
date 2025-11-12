# Development Process (WIP)

この文書は、Scheduly の開発プロセス定義を示す内部向けガイドです。現在の開発を通じて継続的に更新する WIP 文書です。歴史的経緯の要素も含みますが、原則として「今の進め方」を第一に記載します。

## フェーズ一覧

1. **ローカル HTML モックによる UI プロトタイピング**  
   - 目的: 「見栄えと仕様を画面で語れる状態」にする。  
   - 施策: Tailwind CSS を初期から導入し、レイアウトと配色をユーティリティクラスで素早く調整。素の JavaScript でアコーディオン開閉などの軽い挙動を実装し、インタラクションのイメージも掴んだ。  
   - 背景: サーバーやデータモデルをあえて導入せず、ブラウザで開くだけの静的 HTML を基盤にすることで、依存を最小化しつつ UI 改善に集中できた。画面ラベルや補足テキストに仕様メモを書き込み、モック自体を仕様書の原石にした。ローカル完結で作業しているからこそ、Chrome DevTools の Console を基本開きっぱなしにし、警告やエラーを見落とさない習慣を初期から徹底した。

2. **MVP スコーピングと機能スリム化**  
   - 目的: 初期バージョンで確実に届けたい価値にフォーカスし、作りやすく運用しやすい範囲まで落とし込む。  
   - 施策: モック上で広がった夢の機能を一度棚卸しし、「最低限の初期バージョン」という基準で大胆に削除。画面コンポーネント候補も厳選し、後から追加しても軸がぶれない構成を意識した。  
   - 背景: このフェーズで手を抜くと後で仕様変更の手戻りが大きくなるため、強い意志で削り切ることを徹底した。

3. **仕様ドキュメンテーション（Markdown ナレッジベース整備）**  
   - 目的: モックで固めた仕様を文字情報として共有し、誰が見ても同じ前提に立てるようにする。  
   - 施策: `docs/` フォルダに以下のドキュメントを整備。  
     - `ARCHITECTURE.md`: 画面構成とバンドルの関係  
     - `DATA_MODEL.md`: オンメモリ前提のプロジェクト/候補/回答データ  
     - `FLOW_AND_API.md`: ProjectState と各サービスの役割  
     - `index-screens.md`: 3 画面の目的・入力/出力  
     - `guide-ical-workflow.md`: ICS を中心とした運用方針  
     - `RESPONSE_MANAGEMENT.md`: 回答管理 UI の構想  
     - `ref-verify-checklist.md`: モック確認の習慣化  
     - `DEVELOPER_NOTES.md`: 作業メモと TODO  
   - 背景: 仕様が Markdown に落ちたことで、実装以降も迷わず参照できる知識ベースが出来上がった。

4. **クライアントサイド完結の実装フェーズ**  
   - 目的: 仕様に沿った実装を進めつつ、依然としてブラウザだけで成立する形を維持する。  
   - 施策: `npm run dev` で webpack dev server を起動し、静的資産を配信。ブラウザの `sessionStorage` と in-memory ストアのみでデータを扱うことで、サーバー導入の誘惑を抑えつつ少しずつ複雑な挙動に近づけた。
   - 品質管理: このタイミングで ESLint を導入し、コードベースの整理と静的解析を開始。作業途中で中断しても再開しやすいよう、`docs/internal/DEVELOPER_NOTES.md` に TODO を書き出しテクニカルメモを集約。ブラウザ側では `projectStore` が `sessionStorage` を利用して状態を保持しており、Console ログを節目でチェックする習慣も維持した。
   - 継続性の確保: ローカル HTML モックから Node.js ベースの開発へ移る際も、「すべて JavaScript で完結する」流れを崩さなかったため、当初候補に上がっていた Python サーバー案よりスムーズに段階移行できると判断した。

5. **クライアントサーバー型への転換**  
   - 目的: 共有URLの真正性や回答反映の整合性を高め、ブラウザのみの揮発的ストアから、API サーバーを正面に据えた構成へ移行する。  
   - 施策: Express 製 in-memory API (`npm run api:dev`) を常時起動し、`SCHEDULY_API_BASE_URL` でフロントと接続。`projectService` から local driver を撤去し、作成/共有/参加者/回答をすべて API ルート経由に統一した。フォールバック用のデモ state や Web Storage ヘルパーも削ぎ落とし、`sessionStorage` には直近セッションのメタ情報のみを持たせるシンプルな構造に整理。  
   - 品質管理: API 連携後も ESLint と Console ログ監視を続けつつ、`projectStore` の同期イベントと `tallyService.recalculate` をホットループ化。共有 URL の再発行、回答更新、ICS インポート後のサマリー反映を API 主導で確認できるようにし、`docs/internal/DEVELOPER_NOTES.md` に検証手順を追加。  
   - 継続性の確保: すべて JavaScript（React + webpack + Express）で揃えているため、Sakura VPS へのデプロイや `npm run api:dev` / `npm run dev` の二重起動も統一的な手順で扱えるようになった。

### 今後に向けたメモ

- **品質保証**: React/webpack フェーズ用のテスト方針（ユニット/E2E）と CI 上で回す自動検証を具体化する。  
- **永続化ロードマップ**: `sessionStorage` に依存している `projectStore` を、API 経由での永続ストア（例: SQLite/PostgreSQL）へ段階的に移行するプランを策定。  
- **自動化ツール**: ESLint・typecheck に続き、型安全性向上（TypeScript 化）やビルド/テストの自動化を進める。  
- **運用監視**: `/api/metrics` や `journalctl` ログを活かした軽量なアラート設計、Certbot 更新監視など、VPS 運用で必要になるタスクを TODO に落とし込む。
