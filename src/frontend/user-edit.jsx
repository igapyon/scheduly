import React, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom/client";

const DEFAULT_TZID = "Asia/Tokyo";

const ICAL_CANDIDATES = [
  {
    id: "2025-10-26",
    uid: "scheduly-day1-9ba2",
    summary: "秋の合宿 調整会議 Day1",
    dtstart: "2025-10-26T13:00:00+09:00",
    dtend: "2025-10-26T17:00:00+09:00",
    tzid: DEFAULT_TZID,
    status: "CONFIRMED",
    sequence: 1,
    dtstamp: "2024-04-01T01:00:00Z",
    location: "サントリーホール 大ホール",
    tally: { o: 12, d: 3, x: 2 }
  },
  {
    id: "2025-10-27",
    uid: "scheduly-day2-c1f4",
    summary: "秋の合宿 調整会議 Day2",
    dtstart: "2025-10-27T18:00:00+09:00",
    dtend: "2025-10-27T21:00:00+09:00",
    tzid: DEFAULT_TZID,
    status: "TENTATIVE",
    sequence: 0,
    dtstamp: "2024-04-01T01:05:00Z",
    location: "サントリーホール ブルーローズ",
    tally: { o: 8, d: 4, x: 5 }
  },
  {
    id: "2025-10-28",
    uid: "scheduly-day3-d73e",
    summary: "秋の合宿 調整会議 Day3",
    dtstart: "2025-10-28T18:00:00+09:00",
    dtend: "2025-10-28T21:00:00+09:00",
    tzid: DEFAULT_TZID,
    status: "TENTATIVE",
    sequence: 0,
    dtstamp: "2024-04-01T01:10:00Z",
    location: "サントリーホール ブルーローズ",
    tally: { o: 10, d: 2, x: 3 }
  },
  {
    id: "2025-11-03",
    uid: "scheduly-day4-3a0d",
    summary: "秋の合宿 調整会議 予備日",
    dtstart: "2025-11-03T10:00:00+09:00",
    dtend: "2025-11-03T12:00:00+09:00",
    tzid: DEFAULT_TZID,
    status: "CONFIRMED",
    sequence: 2,
    dtstamp: "2024-04-01T01:20:00Z",
    location: "サントリーホール",
    tally: { o: 14, d: 1, x: 0 }
  }
];

const PARTICIPANT_RESPONSES = {
  "2025-10-26": [
    { name: "佐藤", mark: "o" }, { name: "鈴木", mark: "o" }, { name: "田中", mark: "o" },
    { name: "高橋", mark: "d" }, { name: "伊藤", mark: "x" }
  ],
  "2025-10-27": [
    { name: "佐藤", mark: "o" }, { name: "鈴木", mark: "d" }, { name: "田中", mark: "x" }, { name: "高橋", mark: "x" }
  ],
  "2025-10-28": [
    { name: "佐藤", mark: "d" }, { name: "鈴木", mark: "o" }, { name: "田中", mark: "o" }
  ],
  "2025-11-03": [
    { name: "佐藤", mark: "o" }, { name: "鈴木", mark: "o" }, { name: "田中", mark: "o" }, { name: "高橋", mark: "o" }
  ]
};

const ICAL_STATUS_LABELS = {
  CONFIRMED: "確定",
  TENTATIVE: "仮予定",
  CANCELLED: "取消し"
};

const ICAL_STATUS_BADGE_CLASSES = {
  CONFIRMED: "border-emerald-200 bg-emerald-50 text-emerald-600",
  TENTATIVE: "border-amber-200 bg-amber-50 text-amber-600",
  CANCELLED: "border-rose-200 bg-rose-50 text-rose-600"
};

const formatIcalStatusLabel = (status) => {
  const label = ICAL_STATUS_LABELS[status] || status;
  return `${label}（${status}）`;
};

const icalStatusBadgeClass = (status) => ICAL_STATUS_BADGE_CLASSES[status] || "border-gray-200 bg-gray-50 text-gray-500";

const formatCandidateDateLabel = (candidate) => {
  const date = new Date(candidate.dtstart);
  const parts = new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: candidate.tzid
  }).formatToParts(date);
  const month = parts.find((p) => p.type === "month")?.value || "";
  const dayNum = parts.find((p) => p.type === "day")?.value || "";
  const weekday = parts.find((p) => p.type === "weekday")?.value || "";
  return `${month}/${dayNum}（${weekday}）`;
};

const formatCandidateTimeRange = (candidate) => {
  const start = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: candidate.tzid
  }).format(new Date(candidate.dtstart));
  const end = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: candidate.tzid
  }).format(new Date(candidate.dtend));
  return `${start}〜${end}`;
};

const formatIcalDateTimeWithZone = (iso, tz) => {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: tz,
    hour12: false
  }).format(new Date(iso));
};

const StatRow = ({ candidate }) => {
  const maxO = Math.max(...ICAL_CANDIDATES.map((entry) => entry.tally.o));
  const star = candidate.tally.o === maxO && maxO > 0 ? "★ 参加者最大" : "";
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <div className="flex gap-3">
        <span className="inline-flex items-center gap-1"><span className="text-lg text-emerald-500">○</span>{candidate.tally.o}</span>
        <span className="inline-flex items-center gap-1"><span className="text-lg text-amber-500">△</span>{candidate.tally.d}</span>
        <span className="inline-flex items-center gap-1"><span className="text-lg text-rose-500">×</span>{candidate.tally.x}</span>
      </div>
      <span className="text-xs font-semibold text-emerald-600">{star}</span>
    </div>
  );
};

function Modal({ open, title, onClose, children }) {
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 cursor-pointer bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-end justify-center sm:items-center">
        <div
          className="mx-4 mb-4 w-full max-w-sm overflow-hidden rounded-t-2xl border bg-white shadow-xl sm:mx-0 sm:mb-0 sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">{title}</h3>
            <button className="text-sm text-gray-500" onClick={onClose}>閉じる</button>
          </div>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

const ParticipantList = ({ list, label, color }) => (
  <div>
    <div className={`mb-1 text-xs font-semibold ${color}`}>{label}</div>
    {list && list.length ? (
      <ul className="flex flex-wrap gap-2 text-sm">
        {list.map((p, index) => (
          <li key={`${p.name}-${index}`} className="rounded-full border px-2 py-0.5">{p.name}</li>
        ))}
      </ul>
    ) : (
      <div className="text-xs text-gray-400">—</div>
    )}
  </div>
);

function SchedulyMock() {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [savedAt, setSavedAt] = useState("");
  const [toast, setToast] = useState("");
  const [detailCandidateId, setDetailCandidateId] = useState(null);

  const itemRefs = useRef({});
  const [shouldScrollToCurrent, setShouldScrollToCurrent] = useState(false);
  const startX = useRef(null);
  const pressTimer = useRef(null);
  const pressStart = useRef({ x: 0, y: 0, moved: false });

  const currentCandidate = ICAL_CANDIDATES[index];
  const mark = (answers[currentCandidate.id] && answers[currentCandidate.id].mark) || null;

  useEffect(() => {
    const id = setTimeout(() => {
      const t = new Date();
      setSavedAt(`${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`);
    }, 250);
    return () => clearTimeout(id);
  }, [answers, index]);

  useEffect(() => {
    if (detailCandidateId) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [detailCandidateId]);

  useEffect(() => {
    const el = itemRefs.current[currentCandidate.id];
    if (el) {
      el.focus({ preventScroll: true });
      if (shouldScrollToCurrent) {
        el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
        setShouldScrollToCurrent(false);
      }
    }
  }, [index, currentCandidate.id, shouldScrollToCurrent]);

  const setMark = (m) => {
    setAnswers((prev) => ({
      ...prev,
      [currentCandidate.id]: {
        mark: (prev[currentCandidate.id] && prev[currentCandidate.id].mark) === m ? null : m,
        comment: (prev[currentCandidate.id] && prev[currentCandidate.id].comment) || ""
      }
    }));
  };

  const setComment = (value) => {
    setAnswers((prev) => ({
      ...prev,
      [currentCandidate.id]: {
        mark: (prev[currentCandidate.id] && prev[currentCandidate.id].mark) || null,
        comment: value
      }
    }));
  };

  const go = (dir) => {
    setShouldScrollToCurrent(false);
    setIndex((prev) => Math.max(0, Math.min(ICAL_CANDIDATES.length - 1, prev + dir)));
  };

  const onTouchStart = (e) => {
    startX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e) => {
    if (startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    startX.current = null;
  };

  const completeCount = Object.values(answers).filter((a) => a && a.mark).length;

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 1800);
  };

  const submit = () => {
    showToast("送信しました。ありがとうございました！");
  };

  const openDetail = (candidateId) => setDetailCandidateId(candidateId);
  const closeDetail = () => setDetailCandidateId(null);

  const onPressStart = (candidateId, e) => {
    pressStart.current = { x: e.clientX, y: e.clientY, moved: false };
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      if (!pressStart.current.moved) {
        if (navigator && typeof navigator.vibrate === "function") navigator.vibrate(10);
        openDetail(candidateId);
      }
    }, 500);
  };

  const onPressMove = (e) => {
    const dx = Math.abs(e.clientX - pressStart.current.x);
    const dy = Math.abs(e.clientY - pressStart.current.y);
    if (dx > 8 || dy > 8) pressStart.current.moved = true;
  };

  const onPressEnd = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const participantsFor = (candidateId, markType) => (PARTICIPANT_RESPONSES[candidateId] || []).filter((participant) => participant.mark === markType);
  const detailCandidate = detailCandidateId ? (ICAL_CANDIDATES.find((candidate) => candidate.id === detailCandidateId) || null) : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 bg-zinc-50 px-4 py-6 text-gray-900 sm:px-6">
      <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">Participant Response</p>
            <h1 className="mt-1 text-2xl font-bold">Scheduly 回答編集</h1>
            <p className="mt-2 text-sm text-zinc-600">現在編集中: {currentCandidate.summary}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
              <span>{formatCandidateDateLabel(currentCandidate)}・{formatCandidateTimeRange(currentCandidate)}</span>
              <span className="flex items-center gap-1">
                <span role="img" aria-hidden="true">📍</span>
                {currentCandidate.location}
              </span>
              <span className="flex items-center gap-1 font-semibold text-emerald-600">
                <span aria-hidden="true">✓</span> {completeCount}/{ICAL_CANDIDATES.length} 日完了
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs text-zinc-500">👤 匿名参加者</span>
            <a
              href="./user.html"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:border-zinc-300 hover:text-zinc-800"
            >
              参加者一覧へ
            </a>
          </div>
        </div>
      </header>

      <main className="grid flex-1 gap-5 lg:grid-cols-[2fr,1fr]" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <section className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${icalStatusBadgeClass(currentCandidate.status)}`}>
                {formatIcalStatusLabel(currentCandidate.status)}
              </span>
              <span className="text-[11px] text-gray-400">{currentCandidate.tzid}</span>
            </div>
            <div className="text-2xl font-bold tracking-wide">{currentCandidate.summary}</div>
            <div className="text-sm text-gray-600">
              {formatCandidateDateLabel(currentCandidate)}・{formatCandidateTimeRange(currentCandidate)}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span role="img" aria-hidden="true">📍</span>
              <span>{currentCandidate.location}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-600 hover:border-emerald-300 hover:text-emerald-700"
                onClick={() => openDetail(currentCandidate.id)}
              >
                <span aria-hidden="true">ℹ</span> 詳細を表示
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-500 opacity-70"
                title="この候補の iCal ダウンロードはモックでは未実装です"
                onClick={() => showToast("参加者向け iCal ダウンロードは未実装です（モック）")}
              >
                <span aria-hidden="true">📅</span> iCal (ICS)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {["o", "d", "x"].map((k) => {
              const pressed = mark === k;
              const color =
                k === "o"
                  ? (pressed ? "bg-emerald-500 text-white border-emerald-500" : "bg-emerald-50 text-emerald-700 border-emerald-300")
                  : k === "d"
                    ? (pressed ? "bg-amber-500 text-white border-amber-500" : "bg-amber-50 text-amber-700 border-amber-300")
                    : (pressed ? "bg-rose-500 text-white border-rose-500" : "bg-rose-50 text-rose-700 border-rose-300");
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setMark(k)}
                  className={`h-14 rounded-xl border text-2xl font-bold transition-colors ${color}`}
                >
                  {k === "o" ? "○" : k === "d" ? "△" : "×"}
                </button>
              );
            })}
          </div>

          <StatRow candidate={currentCandidate} />

          <label className="block">
            <span className="text-xs text-gray-500">コメント（任意）</span>
            <textarea
              className="mt-1 w-full rounded-xl border p-2 text-sm"
              rows={3}
              placeholder="この日はテストの可能性が…"
              value={(answers[currentCandidate.id] && answers[currentCandidate.id].comment) || ""}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button className="h-12 rounded-xl border bg-white text-sm font-semibold disabled:opacity-40" onClick={() => go(-1)} disabled={index === 0}>← 前の日</button>
            <button className="h-12 rounded-xl border bg-white text-sm font-semibold disabled:opacity-40" onClick={() => go(1)} disabled={index === ICAL_CANDIDATES.length - 1}>次の日 →</button>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-zinc-600">📊 出欠サマリー</h2>
            <ul className="space-y-2">
              {ICAL_CANDIDATES.map((candidate) => {
                const isCurrent = candidate.id === currentCandidate.id;
                const my = (answers[candidate.id] && answers[candidate.id].mark) || null;
                const myLabel = my === "o" ? "○" : my === "d" ? "△" : my === "x" ? "×" : "—";
                const myClass =
                  my === "o" ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                  : my === "d" ? "border-amber-300 text-amber-700 bg-amber-50"
                  : my === "x" ? "border-rose-300 text-rose-700 bg-rose-50"
                  : "border-gray-200 text-gray-500 bg-gray-50";

                return (
                  <li
                    key={candidate.id}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 transition ${isCurrent ? "border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/50" : "hover:bg-zinc-50"}`}
                    aria-current={isCurrent ? "true" : undefined}
                    ref={(el) => (itemRefs.current[candidate.id] = el)}
                    tabIndex={-1}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-6 w-1.5 rounded-full transition ${isCurrent ? "bg-emerald-500" : "bg-transparent"}`}
                        aria-hidden="true"
                      />
                      <button
                        className="py-3 text-left"
                        onClick={() => {
                          setShouldScrollToCurrent(true);
                          setIndex(ICAL_CANDIDATES.findIndex((entry) => entry.id === candidate.id));
                        }}
                        onPointerDown={(e) => onPressStart(candidate.id, e)}
                        onPointerMove={onPressMove}
                        onPointerUp={onPressEnd}
                        onPointerLeave={onPressEnd}
                        onPointerCancel={onPressEnd}
                        onContextMenu={(e) => e.preventDefault()}
                      >
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {formatCandidateDateLabel(candidate)}
                          {isCurrent && <span className="ml-2 text-xs font-semibold text-emerald-600">（選択中）</span>}
                        </div>
                        <div className="text-xs text-gray-500">{formatCandidateTimeRange(candidate)}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 ${icalStatusBadgeClass(candidate.status)}`}>
                            {formatIcalStatusLabel(candidate.status)}
                          </span>
                          <span className="max-w-[12rem] truncate">{candidate.location}</span>
                        </div>
                        <div className="mt-1 text-[10px] text-gray-400">（長押しで参加者を見る）</div>
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <span className="inline-flex items-center gap-1 text-emerald-500"><span>○</span>{candidate.tally.o}</span>
                      <span className="inline-flex items-center gap-1 text-amber-500"><span>△</span>{candidate.tally.d}</span>
                      <span className="inline-flex items-center gap-1 text-rose-500"><span>×</span>{candidate.tally.x}</span>
                      <span
                        className={`ml-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${myClass}`}
                        aria-label="あなたの選択"
                        title="あなたの選択"
                      >
                        <span className="font-medium">あなた:</span> {myLabel}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </main>

      <footer className="sticky bottom-0 border-t bg-white/95 p-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-10 rounded-xl border border-gray-200 bg-white px-4 font-semibold text-gray-600 hover:border-gray-300"
              onClick={() => {
                window.location.href = "./user.html";
              }}
            >
              キャンセル
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-600 px-5 font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
              onClick={submit}
            >
              保存
            </button>
          </div>
        </div>
      </footer>

      <Modal
        open={!!detailCandidate}
        title={detailCandidate ? `${formatCandidateDateLabel(detailCandidate)} の詳細` : ""}
        onClose={closeDetail}
      >
        {detailCandidate && (
          <>
            <ParticipantList label="○ 出席" color="text-emerald-600" list={participantsFor(detailCandidate.id, "o")} />
            <ParticipantList label="△ 未定" color="text-amber-600" list={participantsFor(detailCandidate.id, "d")} />
            <ParticipantList label="× 欠席" color="text-rose-600" list={participantsFor(detailCandidate.id, "x")} />
            <hr className="my-3 border-gray-200" />
            <section className="space-y-2 text-xs text-gray-600">
              <p className="text-sm font-semibold text-gray-800">{detailCandidate.summary}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${icalStatusBadgeClass(detailCandidate.status)}`}>
                  {formatIcalStatusLabel(detailCandidate.status)}
                </span>
                <span className="text-[11px] text-gray-400">{detailCandidate.tzid}</span>
              </div>
              <p>{formatCandidateDateLabel(detailCandidate)}・{formatCandidateTimeRange(detailCandidate)}</p>
              <p>📍 {detailCandidate.location}</p>
              <dl className="space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-3 text-[11px] text-gray-600">
                <div className="flex items-start gap-3">
                  <dt className="w-20 font-semibold text-gray-500">UID</dt>
                  <dd className="flex-1 break-all font-mono text-[11px] text-gray-700">{detailCandidate.uid}</dd>
                </div>
                <div className="flex items-start gap-3">
                  <dt className="w-20 font-semibold text-gray-500">SEQUENCE</dt>
                  <dd className="flex-1 text-gray-700">{detailCandidate.sequence}</dd>
                </div>
                <div className="flex items-start gap-3">
                  <dt className="w-20 font-semibold text-gray-500">DTSTAMP</dt>
                  <dd className="flex-1">
                    <div className="break-all font-mono text-gray-700">{detailCandidate.dtstamp}</div>
                    <div className="text-[10px] text-gray-400">
                      {formatIcalDateTimeWithZone(detailCandidate.dtstamp, detailCandidate.tzid)} （{detailCandidate.tzid}）
                    </div>
                  </dd>
                </div>
              </dl>
            </section>
          </>
        )}
      </Modal>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-16 flex justify-center px-4">
          <div className="pointer-events-auto rounded-xl border bg-white px-4 py-2 text-sm shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Root element not found");
const root = ReactDOM.createRoot(container);
root.render(<SchedulyMock />);
