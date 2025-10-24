import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";

const DASHBOARD_META = {
  projectName: "秋の合宿 調整会議",
  deadline: "2025/05/01 23:59",
  participantCount: 12,
  lastUpdated: "2025/04/12 17:45"
};

const SCHEDULES = [
  {
    id: "day1",
    label: "Day 1",
    datetime: "2025/10/26 13:00 – 17:00",
    location: "サントリーホール 大ホール",
    status: "CONFIRMED",
    counts: { o: 8, d: 3, x: 1 },
    summaryText: "参加者の回答詳細（○ / △ / ×・コメント）を確認できます。上部フィルターに応じて表示が変わります。",
    actions: [
      { label: "コメント要対応", variant: "outline" },
      { label: "この候補を確定候補へ", variant: "solid" }
    ],
    responses: [
      { participantId: "sato", name: "佐藤 太郎", mark: "o", comment: "オフィス参加可" },
      { participantId: "suzuki", name: "鈴木 花子", mark: "d", comment: "子どものお迎えがあるため 16:30 まで" },
      { participantId: "tanaka", name: "田中 一郎", mark: "o", comment: "コメントなし" },
      { participantId: "others", name: "・・・", mark: "pending", comment: "残り9名の回答は実装時に取得" }
    ]
  },
  {
    id: "day2",
    label: "Day 2",
    datetime: "2025/10/27 18:00 – 21:00",
    location: "サントリーホール ブルーローズ",
    status: "TENTATIVE",
    counts: { o: 4, d: 5, x: 3 },
    summaryText: "△ が多いため調整が必要そうです。参加者のコメントを確認し、代替案を検討します。",
    actions: [
      { label: "コメント要対応", variant: "outline" },
      { label: "この候補を確定候補へ", variant: "solid" }
    ],
    responses: [
      { participantId: "sato", name: "佐藤 太郎", mark: "d", comment: "オンラインなら可" },
      { participantId: "suzuki", name: "鈴木 花子", mark: "d", comment: "開始時間を 19:00 にできれば ○" },
      { participantId: "tanaka", name: "田中 一郎", mark: "x", comment: "平日は難しいです。" },
      { participantId: "others", name: "・・・", mark: "pending", comment: "他 8 名の回答を表示（実装時にロード）" }
    ]
  },
  {
    id: "day3",
    label: "Day 3",
    datetime: "2025/10/28 18:00 – 21:00",
    location: "サントリーホール ブルーローズ",
    status: "TENTATIVE",
    counts: { o: 6, d: 2, x: 4 },
    summaryText: "参加者が二分している日程です。オンライン併用や別日の追加も検討できます。",
    actions: [
      { label: "候補をアーカイブ", variant: "outline" },
      { label: "別日案を作成", variant: "dark" }
    ],
    responses: [
      { participantId: "sato", name: "佐藤 太郎", mark: "o", comment: "コメントなし" },
      { participantId: "suzuki", name: "鈴木 花子", mark: "o", comment: "20:00 までなら参加可" },
      { participantId: "tanaka", name: "田中 一郎", mark: "x", comment: "他会議とバッティング" }
    ]
  }
];

const PARTICIPANTS = [
  {
    id: "sato",
    name: "佐藤 太郎",
    lastUpdated: "2025/04/12 17:42",
    commentHighlights: ["コメント記入: Day2"],
    summary: "各候補に対する回答とコメントを日程順にまとめています。コメントを含む候補は上部のハイライトと連動します。",
    actions: [
      { label: "フォロー済みにする", variant: "outline" },
      { label: "コメントに返信", variant: "outline" }
    ],
    responses: [
      { scheduleId: "day1", datetime: "Day1 2025/10/26 13:00 – 17:00", mark: "o", comment: "コメント: オフィス参加可" },
      { scheduleId: "day2", datetime: "Day2 2025/10/27 18:00 – 21:00", mark: "d", comment: "コメント: オンラインなら参加可能" },
      { scheduleId: "day3", datetime: "Day3 2025/10/28 18:00 – 21:00", mark: "o", comment: "コメント: 特になし" },
      { scheduleId: "day4", datetime: "Day4 2025/11/03 10:00 – 12:00", mark: "o", comment: "コメント: 終日参加可能" }
    ]
  },
  {
    id: "suzuki",
    name: "鈴木 花子",
    lastUpdated: "2025/04/10 09:15",
    commentHighlights: ["コメント記入: Day1 / Day3"],
    summary: "平日夜は調整が必要との回答が多めです。Day2 の要望を反映すると参加しやすくなる可能性があります。",
    actions: [
      { label: "Day2 の代替案を検討", variant: "outline" },
      { label: "フォローを記録", variant: "outline" }
    ],
    responses: [
      { scheduleId: "day1", datetime: "Day1 2025/10/26 13:00 – 17:00", mark: "d", comment: "コメント: 子どものお迎えがあるため 16:30 まで" },
      { scheduleId: "day2", datetime: "Day2 2025/10/27 18:00 – 21:00", mark: "x", comment: "コメント: 開始時間を 19:00 にできれば参加可" },
      { scheduleId: "day3", datetime: "Day3 2025/10/28 18:00 – 21:00", mark: "o", comment: "コメント: 20:00 までなら参加可" },
      { scheduleId: "day4", datetime: "Day4 2025/11/03 10:00 – 12:00", mark: "o", comment: "コメント: 午前は在宅参加になります" }
    ]
  },
  {
    id: "tanaka",
    name: "田中 一郎",
    lastUpdated: "2025/04/05 21:03",
    commentHighlights: ["コメント記入: Day2 / Day3"],
    summary: "平日日程の参加が難しいとのコメントが複数あり。予備日の回答が未入力のため、フォローが必要です。",
    actions: [
      { label: "未回答フォローを送信", variant: "outline" },
      { label: "代替日程を提案", variant: "outline" }
    ],
    responses: [
      { scheduleId: "day1", datetime: "Day1 2025/10/26 13:00 – 17:00", mark: "o", comment: "コメント: 自家用車で参加予定" },
      { scheduleId: "day2", datetime: "Day2 2025/10/27 18:00 – 21:00", mark: "x", comment: "コメント: 平日は別件の会議があり難しい" },
      { scheduleId: "day3", datetime: "Day3 2025/10/28 18:00 – 21:00", mark: "x", comment: "コメント: 他プロジェクトとバッティング" },
      { scheduleId: "day4", datetime: "Day4 2025/11/03 10:00 – 12:00", mark: "pending", comment: "コメント: 未回答（フォロー待ち）" }
    ]
  }
];

const STATUS_LABELS = {
  CONFIRMED: { label: "確定", badgeClass: "bg-emerald-100 text-emerald-700" },
  TENTATIVE: { label: "仮予定", badgeClass: "bg-amber-100 text-amber-700" },
  CANCELLED: { label: "取消し", badgeClass: "bg-rose-100 text-rose-700" }
};

const MARK_BADGE = {
  o: "inline-flex items-center justify-center rounded-full bg-emerald-100 text-emerald-700",
  d: "inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700",
  x: "inline-flex items-center justify-center rounded-full bg-rose-100 text-rose-700",
  pending: "inline-flex items-center justify-center rounded-full bg-zinc-200 text-zinc-600"
};

const MARK_SYMBOL = {
  o: "○",
  d: "△",
  x: "×",
  pending: "？"
};

function markBadgeClass(mark) {
  return MARK_BADGE[mark] ?? "inline-flex items-center justify-center rounded-full bg-zinc-200 text-zinc-600";
}

function formatStatusBadge(status) {
  const info = STATUS_LABELS[status] || { label: status, badgeClass: "bg-zinc-100 text-zinc-600" };
  return {
    text: `${info.label}（${status}）`,
    className: `inline-flex items-center rounded-full border border-transparent px-2 py-0.5 text-xs font-semibold ${info.badgeClass}`
  };
}

function participantTotals(participant) {
  return participant.responses.reduce(
    (totals, response) => {
      if (response.mark === "o" || response.mark === "d" || response.mark === "x") {
        totals[response.mark] += 1;
      } else {
        totals.pending += 1;
      }
      return totals;
    },
    { o: 0, d: 0, x: 0, pending: 0 }
  );
}

function ScheduleSummary({ schedule }) {
  const status = formatStatusBadge(schedule.status);

  return (
    <details className="rounded-2xl border border-zinc-200 bg-white shadow-sm" defaultOpen={schedule.id === "day1"}>
      <summary className="flex cursor-pointer list-none flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">{schedule.label}</div>
          <div className="text-base font-semibold text-zinc-800">{schedule.datetime}</div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>{schedule.location}</span>
            <span className="text-zinc-400">/</span>
            <span className="text-zinc-500">
              状態: <span className={status.className}>{status.text}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex h-7 min-w-[50px] items-center justify-center rounded-full bg-emerald-100 px-3 font-semibold text-emerald-700">
            ○ {schedule.counts.o}
          </span>
          <span className="inline-flex h-7 min-w-[50px] items-center justify-center rounded-full bg-amber-100 px-3 font-semibold text-amber-700">
            △ {schedule.counts.d}
          </span>
          <span className="inline-flex h-7 min-w-[50px] items-center justify-center rounded-full bg-rose-100 px-3 font-semibold text-rose-700">
            × {schedule.counts.x}
          </span>
        </div>
      </summary>
      <div className="border-t border-zinc-200 px-4 py-3 text-xs text-zinc-500">{schedule.summaryText}</div>
      <ul className="space-y-1 border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
        {schedule.responses.map((response) => (
          <li key={response.name} className="flex items-start justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
            <div>
              <div className="font-semibold text-zinc-800">{response.name}</div>
              <div className={`text-xs ${response.mark === "pending" ? "text-zinc-400" : "text-zinc-500"}`}>
                {response.comment}
              </div>
            </div>
            <span className={`${markBadgeClass(response.mark)} h-6 w-6 text-xs font-semibold`}>
              {MARK_SYMBOL[response.mark] ?? "？"}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 border-t border-zinc-200 px-4 py-3 text-xs text-zinc-500">
        {schedule.actions.map((action) => (
          <button
            key={action.label}
            className={
              action.variant === "solid"
                ? "rounded-lg bg-emerald-600 px-3 py-2 font-semibold text-white hover:bg-emerald-700"
                : action.variant === "dark"
                  ? "rounded-lg bg-zinc-900 px-3 py-2 font-semibold text-white hover:bg-zinc-800"
                  : "rounded-lg border border-zinc-200 px-3 py-2 font-semibold hover:border-zinc-300"
            }
          >
            {action.label}
          </button>
        ))}
      </div>
    </details>
  );
}

function ParticipantSummary({ participant, defaultOpen }) {
  const totals = useMemo(() => participantTotals(participant), [participant]);

  return (
    <details className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm" defaultOpen={defaultOpen}>
      <summary className="flex cursor-pointer list-none flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Participant</div>
          <div className="text-base font-semibold text-zinc-800">{participant.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>最終更新: {participant.lastUpdated}</span>
            {participant.commentHighlights.map((text) => (
              <span key={text}>{text}</span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">○ {totals.o}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-amber-700">△ {totals.d}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-1 text-rose-700">× {totals.x}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-zinc-600">未回答 {totals.pending}</span>
        </div>
      </summary>
      <div className="border-t border-zinc-200 bg-white/90 px-4 py-3 text-xs text-zinc-600">{participant.summary}</div>
      <ul className="space-y-1 border-t border-zinc-200 bg-white px-4 py-3 text-sm">
        {participant.responses.map((response) => (
          <li
            key={`${participant.id}-${response.scheduleId}`}
            className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 ${
              response.mark === "pending" ? "border-dashed border-zinc-300" : "border-transparent"
            }`}
          >
            <div>
              <div className="text-sm font-semibold text-zinc-800">{response.datetime}</div>
              <div className={`text-xs ${response.mark === "pending" ? "text-zinc-600" : "text-zinc-500"}`}>{response.comment}</div>
            </div>
            <span
              className={`${markBadgeClass(response.mark)} h-6 min-w-[1.5rem] items-center justify-center text-xs font-semibold`}
            >
              {response.mark === "pending" ? "—" : MARK_SYMBOL[response.mark] ?? "？"}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 border-t border-zinc-200 bg-white px-4 py-3 text-xs text-zinc-600">
        {participant.actions.map((action) => (
          <button
            key={action.label}
            className={
              action.variant === "outline"
                ? "rounded-lg border border-zinc-200 px-3 py-2 font-semibold hover:border-zinc-300"
                : "rounded-lg bg-zinc-900 px-3 py-2 font-semibold text-white hover:bg-zinc-800"
            }
          >
            {action.label}
          </button>
        ))}
      </div>
    </details>
  );
}

function TabNavigation({ activeTab, onChange }) {
  return (
    <nav className="rounded-2xl border border-zinc-200 bg-white/90 p-1 shadow-sm">
      <div className="flex gap-1">
        <button
          type="button"
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${
            activeTab === "schedule" ? "bg-emerald-600 text-white" : "text-zinc-700 hover:bg-emerald-50"
          }`}
          onClick={() => onChange("schedule")}
        >
          日程ごと
        </button>
        <button
          type="button"
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${
            activeTab === "participant" ? "bg-emerald-600 text-white" : "text-zinc-700 hover:bg-emerald-50"
          }`}
          onClick={() => onChange("participant")}
        >
          参加者ごと
        </button>
      </div>
    </nav>
  );
}

function AdminResponsesApp() {
  const [activeTab, setActiveTab] = useState("schedule");

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">Admin Responses</p>
          <h1 className="mt-1 text-2xl font-bold">Scheduly 回答管理</h1>
          <p className="mt-2 text-sm text-zinc-600">
            プロジェクト「{DASHBOARD_META.projectName}」の参加者回答を一覧・集計するモックです。実データはまだ連携していません。
          </p>
        </div>
        <a
          href="./index.html"
          className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-600 hover:border-emerald-300 hover:text-emerald-700"
        >
          プロジェクト管理へ戻る
        </a>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
          <label className="text-xs font-semibold text-zinc-500">
            参加者フィルター
            <select className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm">
              <option>全参加者（{DASHBOARD_META.participantCount} 名）</option>
              <option>未回答のみ</option>
              <option>コメントあり</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-zinc-500">
            回答ステータス
            <select className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm">
              <option>○ / △ / ×</option>
              <option>○ のみ表示</option>
              <option>△ をハイライト</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-zinc-500">
            キーワード検索
            <input type="search" className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" placeholder="参加者名・コメントを検索" />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          <span>回答締切: {DASHBOARD_META.deadline}</span>
          <span>参加者: {DASHBOARD_META.participantCount} 名</span>
          <span>最新更新: {DASHBOARD_META.lastUpdated}</span>
        </div>
      </section>

      <TabNavigation activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "schedule" && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-600">日程ごとの回答サマリー</h2>
          {SCHEDULES.map((schedule) => (
            <ScheduleSummary key={schedule.id} schedule={schedule} />
          ))}
        </section>
      )}

      {activeTab === "participant" && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-600">参加者ごとの回答サマリー</h2>
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-200 px-4 py-3">
              <div className="text-sm font-semibold text-zinc-800">参加者状況のスナップショット</div>
              <p className="mt-1 text-xs text-zinc-500">
                直近の回答や未回答者のフォロー状況を把握できます。フィルターと連動し、必要な参加者だけを抽出します。
              </p>
            </div>
            <div className="space-y-3 px-4 py-4">
              {PARTICIPANTS.map((participant, index) => (
                <ParticipantSummary key={participant.id} participant={participant} defaultOpen={index === 0} />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/70 p-4 text-xs text-zinc-500">
            <p className="font-semibold text-zinc-600">参加者サマリー活用メモ</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>未回答者を抽出して個別フォローのメモを残すなど、管理タスク整理に活用します。</li>
              <li>将来的には参加者カードから回答修正や再送リマインダーを起動できるようにします。</li>
              <li>参加者 × 候補のマトリクス表示と連動し、詳細ドリルダウンへ誘導します。</li>
            </ul>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-zinc-700">回答全体のアクション</div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-500 hover:border-zinc-300">
              全回答を CSV でダウンロード
            </button>
            <button className="rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-500 hover:border-zinc-300">
              サマリーをコピー（仮）
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-zinc-300 bg-white/80 p-4 text-sm text-zinc-500">
        <h2 className="font-semibold text-zinc-600">実装メモ</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>本画面はレイアウト確認用のモックです。データは固定のダミーです。</li>
          <li>サーバー連携時は Project / Slot / Participant / Response の API と接続する想定です。</li>
          <li>モバイルでは日別カード + ドリルダウンを基本にし、PC ではマトリクス表示へ切り替える予定です。</li>
          <li>CSV 出力は日別ではなく、上記の全体アクションから提供する想定です。</li>
        </ul>
      </section>
    </div>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Root element not found");
const root = ReactDOM.createRoot(container);
root.render(<AdminResponsesApp />);
