import React, { useState, useRef, useEffect, useMemo } from "react";
import ReactDOM from "react-dom/client";

import sharedIcalUtils from "./shared/ical-utils";

const { DEFAULT_TZID, ensureICAL, waitForIcal, getSampleIcsUrl, createLogger, sanitizeTzid } = sharedIcalUtils;

const logDebug = createLogger("user-edit");

const SAMPLE_CANDIDATE_METADATA = {
  "igapyon-scheduly-5a2a47d2-56eb-4329-b3c2-92d9275480a2": {
    legacyId: "2025-10-26",
    tally: { o: 12, d: 3, x: 2 },
    responses: [
      { name: "佐藤", mark: "o" },
      { name: "鈴木", mark: "o" },
      { name: "田中", mark: "o" },
      { name: "高橋", mark: "d" },
      { name: "伊藤", mark: "x" }
    ]
  },
  "igapyon-scheduly-6b5cd8fe-0f61-43c1-9aa3-7b8f22d6a140": {
    legacyId: "2025-10-27",
    tally: { o: 8, d: 4, x: 5 },
    responses: [
      { name: "佐藤", mark: "o" },
      { name: "鈴木", mark: "d" },
      { name: "田中", mark: "x" },
      { name: "高橋", mark: "x" }
    ]
  },
  "igapyon-scheduly-44f4cf2e-c82e-4d6d-915b-676f2755c51a": {
    legacyId: "2025-10-28",
    tally: { o: 10, d: 2, x: 3 },
    responses: [
      { name: "佐藤", mark: "d" },
      { name: "鈴木", mark: "o" },
      { name: "田中", mark: "o" }
    ]
  },
  "igapyon-scheduly-0c8b19f2-5aba-4e24-9f06-0f1aeb8a2afb": {
    legacyId: "2025-11-03",
    tally: { o: 14, d: 1, x: 0 },
    responses: [
      { name: "佐藤", mark: "o" },
      { name: "鈴木", mark: "o" },
      { name: "田中", mark: "o" },
      { name: "高橋", mark: "o" }
    ]
  }
};

const deriveTally = (responses) => {
  return responses.reduce(
    (acc, item) => {
      if (item.mark === "o") acc.o += 1;
      else if (item.mark === "d") acc.d += 1;
      else if (item.mark === "x") acc.x += 1;
      return acc;
    },
    { o: 0, d: 0, x: 0 }
  );
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
  const zone = sanitizeTzid(candidate.tzid);
  const date = new Date(candidate.dtstart);
  const parts = new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: zone
  }).formatToParts(date);
  const month = parts.find((p) => p.type === "month")?.value || "";
  const dayNum = parts.find((p) => p.type === "day")?.value || "";
  const weekday = parts.find((p) => p.type === "weekday")?.value || "";
  return `${month}/${dayNum}（${weekday}）`;
};

const formatCandidateTimeRange = (candidate) => {
  const zone = sanitizeTzid(candidate.tzid);
  const start = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: zone
  }).format(new Date(candidate.dtstart));
  const end = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: zone
  }).format(new Date(candidate.dtend));
  return `${start}〜${end}`;
};

const formatIcalDateTimeWithZone = (iso, tz) => {
  const zone = sanitizeTzid(tz);
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: zone,
    hour12: false
  }).format(new Date(iso));
};

const StatRow = ({ candidate, maxO, onOpenDetail }) => {
  const star = candidate.tally.o === maxO && maxO > 0 ? "★ 参加者最大" : "";
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="inline-flex items-center gap-1"><span className="text-lg text-emerald-500">○</span>{candidate.tally.o}</span>
        <span className="inline-flex items-center gap-1"><span className="text-lg text-amber-500">△</span>{candidate.tally.d}</span>
        <span className="inline-flex items-center gap-1"><span className="text-lg text-rose-500">×</span>{candidate.tally.x}</span>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1 rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 hover:border-zinc-300 hover:text-zinc-800"
          onClick={onOpenDetail}
        >
          <span aria-hidden="true">ℹ</span> 詳細を表示
        </button>
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
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
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

  useEffect(() => {
    let cancelled = false;

    const loadCandidates = async () => {
      setLoading(true);
      setLoadError("");
      try {
        await waitForIcal();
        const icsUrl = getSampleIcsUrl();
        logDebug("fetching ICS", icsUrl);
        const response = await fetch(icsUrl, { cache: "no-cache" });
        if (!response.ok) {
          throw new Error(`Failed to fetch sample ICS: ${response.status}`);
        }
        const text = await response.text();
        const ICAL = ensureICAL();
        const parsed = ICAL.parse(text);
        const component = new ICAL.Component(parsed);
        const vevents = component.getAllSubcomponents("vevent") || [];
        logDebug("parsed VEVENT count", vevents.length);
        const converted = [];
        for (let i = 0; i < vevents.length; i += 1) {
          const vevent = vevents[i];
          const event = new ICAL.Event(vevent);
          if (!event.uid) continue;
          const metadata = SAMPLE_CANDIDATE_METADATA[event.uid] || null;
          const startDate = event.startDate ? event.startDate.toJSDate() : null;
          const endDate = event.endDate ? event.endDate.toJSDate() : null;
          const tzid = sanitizeTzid((event.startDate && event.startDate.zone && event.startDate.zone.tzid) || DEFAULT_TZID);
          const dtstampProp = vevent.getFirstPropertyValue("dtstamp");
          const dtstampIso = dtstampProp ? dtstampProp.toJSDate().toISOString() : new Date().toISOString();
          const sequenceValue = typeof event.sequence === "number" ? event.sequence : Number(event.sequence || 0);
          const responses = metadata?.responses ? metadata.responses.map((item, idx) => ({ ...item, id: idx })) : [];
          const tally = metadata?.tally || deriveTally(responses);
          const legacyId = metadata?.legacyId || event.uid;
          converted.push({
            uid: event.uid,
            id: legacyId,
            summary: event.summary || "(タイトル未設定)",
            dtstart: startDate ? startDate.toISOString() : "",
            dtend: endDate ? endDate.toISOString() : "",
            tzid,
            status: event.status || "TENTATIVE",
            sequence: Number.isFinite(sequenceValue) ? sequenceValue : 0,
            dtstamp: dtstampIso,
            location: event.location || "",
            tally,
            responses,
            rawIcs: vevent.toJSON()
          });
        }
        converted.sort((a, b) => {
          const aTime = a.dtstart ? Date.parse(a.dtstart) : Number.POSITIVE_INFINITY;
          const bTime = b.dtstart ? Date.parse(b.dtstart) : Number.POSITIVE_INFINITY;
          return aTime - bTime;
        });
        logDebug("candidates after conversion", converted);
        if (!converted.length) {
          throw new Error("No VEVENT entries in sample ICS");
        }
        if (!cancelled) {
          setCandidates(converted);
          setIndex(0);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("[Scheduly][user-edit] failed to hydrate candidates from ICS", error);
        if (!cancelled) {
          setCandidates([]);
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadCandidates();

    return () => {
      cancelled = true;
    };
  }, []);

  const safeIndex = candidates.length ? Math.min(index, candidates.length - 1) : 0;
  const currentCandidate = candidates.length ? candidates[safeIndex] : null;
  const mark = currentCandidate ? (answers[currentCandidate.id] && answers[currentCandidate.id].mark) || null : null;
  const detailCandidate = detailCandidateId ? candidates.find((candidate) => candidate.id === detailCandidateId) || null : null;

  const completeCount = useMemo(() => {
    return candidates.reduce((acc, candidate) => (answers[candidate.id] && answers[candidate.id].mark ? acc + 1 : acc), 0);
  }, [answers, candidates]);

  const maxTallyO = useMemo(() => {
    return candidates.reduce((max, candidate) => Math.max(max, candidate.tally ? candidate.tally.o : 0), 0);
  }, [candidates]);

  useEffect(() => {
    if (!currentCandidate) return undefined;
    const id = setTimeout(() => {
      const t = new Date();
      setSavedAt(`${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`);
    }, 250);
    return () => clearTimeout(id);
  }, [answers, currentCandidate, safeIndex]);

  useEffect(() => {
    if (!detailCandidate) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [detailCandidate]);

  useEffect(() => {
    if (!currentCandidate) return;
    const el = itemRefs.current[currentCandidate.id];
    if (el) {
      el.focus({ preventScroll: true });
      if (shouldScrollToCurrent) {
        el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
        setShouldScrollToCurrent(false);
      }
    }
  }, [safeIndex, currentCandidate, shouldScrollToCurrent]);

  const setMark = (m) => {
    if (!currentCandidate) return;
    setAnswers((prev) => ({
      ...prev,
      [currentCandidate.id]: {
        mark: (prev[currentCandidate.id] && prev[currentCandidate.id].mark) === m ? null : m,
        comment: (prev[currentCandidate.id] && prev[currentCandidate.id].comment) || ""
      }
    }));
  };

  const setComment = (value) => {
    if (!currentCandidate) return;
    setAnswers((prev) => ({
      ...prev,
      [currentCandidate.id]: {
        mark: (prev[currentCandidate.id] && prev[currentCandidate.id].mark) || null,
        comment: value
      }
    }));
  };

  const go = (dir) => {
    if (!candidates.length) return;
    setShouldScrollToCurrent(false);
    setIndex((prev) => {
      const next = Math.max(0, Math.min(candidates.length - 1, prev + dir));
      return next;
    });
  };

  const onTouchStart = (e) => {
    if (!candidates.length) return;
    startX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e) => {
    if (startX.current == null || !candidates.length) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    startX.current = null;
  };

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

  const participantsFor = (candidate, markType) => (candidate?.responses || []).filter((participant) => participant.mark === markType);

  if (!currentCandidate) {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 bg-zinc-50 px-4 py-6 text-gray-900 sm:px-6">
        <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-bold">Scheduly 回答編集</h1>
          <p className="mt-2 text-sm text-zinc-600">
            {loading ? "候補を読み込んでいます…" : loadError ? `候補を読み込めませんでした: ${loadError}` : "候補が存在しません。"}
          </p>
        </header>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 bg-zinc-50 px-4 py-6 text-gray-900 sm:px-6">
      <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">Participant Response</p>
            <h1 className="mt-1 text-2xl font-bold">Scheduly 回答編集</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
              <span aria-hidden="true">✓</span> {completeCount}/{candidates.length} 日完了
            </span>
            <span>👤 匿名参加者</span>
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
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-500 opacity-70"
                title="この候補の ICS ダウンロードはモックでは未実装です"
                onClick={() => showToast("参加者向け ICS ダウンロードは未実装です（モック）")}
              >
                <span aria-hidden="true">📅</span> ICS
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

          <StatRow
            candidate={currentCandidate}
            maxO={maxTallyO}
            onOpenDetail={() => openDetail(currentCandidate.id)}
          />

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
            <button className="h-12 rounded-xl border bg-white text-sm font-semibold disabled:opacity-40" onClick={() => go(-1)} disabled={safeIndex === 0}>← 前の日</button>
            <button className="h-12 rounded-xl border bg-white text-sm font-semibold disabled:opacity-40" onClick={() => go(1)} disabled={safeIndex === candidates.length - 1}>次の日 →</button>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-zinc-600">📊 出欠サマリー</h2>
            <ul className="space-y-2">
              {candidates.map((candidate) => {
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
                          const targetIndex = candidates.findIndex((entry) => entry.id === candidate.id);
                          if (targetIndex !== -1) {
                            setIndex(targetIndex);
                          }
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
            <ParticipantList label="○ 出席" color="text-emerald-600" list={participantsFor(detailCandidate, "o")} />
            <ParticipantList label="△ 未定" color="text-amber-600" list={participantsFor(detailCandidate, "d")} />
            <ParticipantList label="× 欠席" color="text-rose-600" list={participantsFor(detailCandidate, "x")} />
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
