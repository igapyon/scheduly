import React, { useState, useRef, useEffect, useMemo } from "react";
import ReactDOM from "react-dom/client";

import sharedIcalUtils from "./shared/ical-utils";
import projectStore from "./store/project-store";
import { ensureDemoProjectData } from "./shared/demo-data";
import responseService from "./services/response-service";
import EventMeta from "./shared/EventMeta.jsx";
import { formatDateTimeRangeLabel } from "./shared/date-utils";

const { sanitizeTzid } = sharedIcalUtils;

const PROJECT_DESCRIPTION = "秋の合宿に向けた候補日を参加者と共有し、回答を編集するための画面です。";

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

const normalizeResponseMark = (mark) => {
  const value = typeof mark === "string" ? mark.trim().toLowerCase() : "";
  if (value === "o" || value === "d" || value === "x") return value;
  return "pending";
};

const formatTimestampForDisplay = (isoString) => {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
};

const readParticipantIdFromLocation = () => {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search || "");
    const participantId = params.get("participantId");
    if (participantId) return participantId;
  } catch (error) {
    // ignore malformed query
  }
  return null;
};

const buildCandidateViews = (state) => {
  if (!state) return [];
  const participants = state.participants || [];
  const participantsMap = new Map(participants.map((participant) => [participant.id, participant]));
  const responses = state.responses || [];
  const responsesByCandidate = new Map();
  responses.forEach((response) => {
    if (!response || !response.candidateId) return;
    const list = responsesByCandidate.get(response.candidateId) || [];
    list.push(response);
    responsesByCandidate.set(response.candidateId, list);
  });

  const toTime = (value) => {
    if (!value) return Number.POSITIVE_INFINITY;
    const time = Date.parse(value);
    return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
  };

  return (state.candidates || []).map((candidate) => {
    const detailed = [];
    const tallySeed = [];
    const responded = new Set();
    const candidateResponses = responsesByCandidate.get(candidate.id) || [];

    candidateResponses.forEach((response) => {
      const mark = normalizeResponseMark(response.mark);
      tallySeed.push({ mark });
      const participant = participantsMap.get(response.participantId);
      detailed.push({
        id: response.participantId,
        name: participant?.displayName || "参加者",
        mark,
        comment: response.comment || "コメントなし"
      });
      responded.add(response.participantId);
    });

    participants.forEach((participant) => {
      if (!participant || responded.has(participant.id)) return;
      tallySeed.push({ mark: "pending" });
      detailed.push({
        id: participant.id,
        name: participant.displayName || "参加者",
        mark: "pending",
        comment: "未回答"
      });
    });

    detailed.sort((a, b) => {
      if (a.mark === "pending" && b.mark !== "pending") return 1;
      if (b.mark === "pending" && a.mark !== "pending") return -1;
      return (a.name || "").localeCompare(b.name || "", "ja");
    });

    return {
      ...candidate,
      tally: deriveTally(tallySeed),
      responses: detailed
    };
  }).sort((a, b) => toTime(a.dtstart) - toTime(b.dtstart));
};

const buildAnswersForParticipant = (state, participantId) => {
  const answers = {};
  if (!state || !participantId) return answers;
  const responses = state.responses || [];
  const responsesByParticipant = new Map();
  responses.forEach((response) => {
    if (!response || !response.participantId || !response.candidateId) return;
    if (!responsesByParticipant.has(response.participantId)) {
      responsesByParticipant.set(response.participantId, new Map());
    }
    responsesByParticipant.get(response.participantId).set(response.candidateId, response);
  });
  const participantResponses = responsesByParticipant.get(participantId) || new Map();
  (state.candidates || []).forEach((candidate) => {
    const entry = participantResponses.get(candidate.id);
    if (entry) {
      const mark = normalizeResponseMark(entry.mark);
      answers[candidate.id] = {
        mark: mark === "pending" ? null : mark,
        comment: entry.comment || ""
      };
    } else {
      answers[candidate.id] = { mark: null, comment: "" };
    }
  });
  return answers;
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
  const projectId = useMemo(() => projectStore.resolveProjectIdFromLocation(), []);
  const initialParticipantId = useMemo(() => readParticipantIdFromLocation(), []);
  const requestedParticipantIdRef = useRef(initialParticipantId);
  console.log("[user-edit] projectId", projectId, "initialParticipantId", initialParticipantId);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const answersRef = useRef(answers);
  const [savedAt, setSavedAt] = useState("");
  const [toast, setToast] = useState("");
  const [detailCandidateId, setDetailCandidateId] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [selectedParticipantId, setSelectedParticipantId] = useState(initialParticipantId);

  const itemRefs = useRef({});
  const lastFocusedCandidateIdRef = useRef(null);
  const commentTextareaRef = useRef(null);
  const [shouldScrollToCurrent, setShouldScrollToCurrent] = useState(false);
  const startX = useRef(null);
  const pressTimer = useRef(null);
  const pressStart = useRef({ x: 0, y: 0, moved: false });

  useEffect(() => {
    let cancelled = false;

    const syncFromState = (nextState, { resetAnswers = false } = {}) => {
      if (!nextState) return;
      const participantList = nextState.participants || [];
      console.log("[user-edit] participants snapshot", participantList.map((p) => p?.id));
      setParticipants(participantList);

      const preferredId = requestedParticipantIdRef.current;
      const hasPreferredParticipant =
        preferredId && participantList.some((participant) => participant && participant.id === preferredId);

      let editingId = selectedParticipantId;
      const hasEditingParticipant =
        editingId && participantList.some((participant) => participant && participant.id === editingId);

      if (hasPreferredParticipant && editingId !== preferredId) {
        editingId = preferredId;
        if (editingId !== selectedParticipantId) {
          console.log("[user-edit] switch to preferred participant", editingId);
          setSelectedParticipantId(editingId);
        }
        resetAnswers = true;
        requestedParticipantIdRef.current = null;
      } else if (hasPreferredParticipant) {
        requestedParticipantIdRef.current = null;
      }

      if (!hasEditingParticipant) {
        if (participantList.length) {
          editingId = participantList[0]?.id || null;
          if (editingId !== selectedParticipantId) {
            setSelectedParticipantId(editingId);
            console.log("[user-edit] fallback editingId", editingId);
          }
          resetAnswers = true;
        } else {
          editingId = selectedParticipantId;
        }
      }

      console.log("[user-edit] editingId after check", editingId, "resetAnswers", resetAnswers);
      const candidateViews = buildCandidateViews(nextState);
      setCandidates(candidateViews);

      if (resetAnswers) {
        if (editingId) {
          setAnswers(buildAnswersForParticipant(nextState, editingId));
          const participant = participantList.find((item) => item && item.id === editingId);
          console.log("[user-edit] answers loaded for", editingId, participant);
          setSavedAt(formatTimestampForDisplay(participant?.updatedAt));
        } else {
          setAnswers({});
          setSavedAt("");
        }
        setIndex(0);
      }
    };

    const initialSnapshot = projectStore.getProjectStateSnapshot(projectId);
    syncFromState(initialSnapshot, { resetAnswers: true });

    setLoading(true);
    ensureDemoProjectData(projectId)
      .then(() => {
        if (cancelled) return;
        setLoadError("");
        const snapshot = projectStore.getProjectStateSnapshot(projectId);
        syncFromState(snapshot, { resetAnswers: true });
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.warn("[Scheduly][user-edit] failed to seed demo data", error);
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const unsubscribe = projectStore.subscribeProjectState(projectId, (nextState) => {
      if (!cancelled) syncFromState(nextState);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [projectId, selectedParticipantId]);

  const safeIndex = candidates.length ? Math.min(index, candidates.length - 1) : 0;
  const currentCandidate = candidates.length ? candidates[safeIndex] : null;
  const mark = currentCandidate ? answers[currentCandidate.id]?.mark || null : null;
  const currentComment = currentCandidate ? answers[currentCandidate.id]?.comment || "" : "";
  const currentDateRange = currentCandidate
    ? formatDateTimeRangeLabel(currentCandidate.dtstart, currentCandidate.dtend, currentCandidate.tzid)
    : "";
  const detailCandidate = detailCandidateId ? candidates.find((candidate) => candidate.id === detailCandidateId) || null : null;

  const completeCount = useMemo(() => {
    return candidates.reduce((acc, candidate) => (answers[candidate.id]?.mark ? acc + 1 : acc), 0);
  }, [answers, candidates]);

  const maxTallyO = useMemo(() => {
    return candidates.reduce((max, candidate) => Math.max(max, candidate.tally ? candidate.tally.o : 0), 0);
  }, [candidates]);

  const editingParticipant = participants.find((participant) => participant.id === selectedParticipantId) || null;
  const participantName = editingParticipant?.displayName || "匿名参加者";

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const touchSavedAt = () => {
    setSavedAt(formatTimestampForDisplay(new Date().toISOString()));
  };

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
    if (!shouldScrollToCurrent && lastFocusedCandidateIdRef.current === currentCandidate.id) return;
    const el = itemRefs.current[currentCandidate.id];
    if (el) {
      el.focus({ preventScroll: true });
      if (shouldScrollToCurrent) {
        el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
        setShouldScrollToCurrent(false);
      }
      lastFocusedCandidateIdRef.current = currentCandidate.id;
    }
  }, [currentCandidate, shouldScrollToCurrent]);

  const setMark = (markKey) => {
    if (!currentCandidate || !selectedParticipantId) return;
    setAnswers((prev) => {
      const prevEntry = prev[currentCandidate.id] || { mark: null, comment: "" };
      const nextMark = prevEntry.mark === markKey ? null : markKey;
      const nextAnswers = {
        ...prev,
        [currentCandidate.id]: {
          mark: nextMark,
          comment: prevEntry.comment || ""
        }
      };
      responseService.upsertResponse(projectId, {
        participantId: selectedParticipantId,
        candidateId: currentCandidate.id,
        mark: nextMark || "pending",
        comment: prevEntry.comment || ""
      });
      return nextAnswers;
    });
    touchSavedAt();
  };

  const handleCommentChange = (value) => {
    if (!currentCandidate || !selectedParticipantId) return;
    setAnswers((prev) => {
      const prevEntry = prev[currentCandidate.id] || { mark: null, comment: "" };
      return {
        ...prev,
        [currentCandidate.id]: {
          mark: prevEntry.mark || null,
          comment: value
        }
      };
    });
  };

  const commitComment = (value) => {
    if (!currentCandidate || !selectedParticipantId) return;
    const currentMark = answersRef.current[currentCandidate.id]?.mark || null;
    responseService.upsertResponse(projectId, {
      participantId: selectedParticipantId,
      candidateId: currentCandidate.id,
      mark: currentMark || "pending",
      comment: value
    });
    touchSavedAt();
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

  useEffect(() => {
    if (!commentTextareaRef.current) return;
    const el = commentTextareaRef.current;
    const computed = el.scrollHeight || parseInt(window.getComputedStyle(el).lineHeight || "0", 10) || 0;
    const baseHeight = el.dataset.baseHeight ? Number(el.dataset.baseHeight) : computed;
    if (!el.dataset.baseHeight) {
      el.dataset.baseHeight = String(baseHeight);
    }
    el.style.height = "auto";
    const minHeight = el.dataset.baseHeight ? Number(el.dataset.baseHeight) : 0;
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [currentCandidate ? currentCandidate.id : null, currentComment]);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 1800);
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
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <span aria-hidden="true">✏️</span>
            <span>Scheduly 回答編集</span>
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            {loading ? "候補を読み込んでいます…" : loadError ? `候補を読み込めませんでした: ${loadError}` : "候補が存在しません。"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">{PROJECT_DESCRIPTION}</p>
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
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
              <span aria-hidden="true">✏️</span>
              <span>Scheduly 回答編集</span>
            </h1>
            <p className="mt-1 text-xs text-zinc-500">参加者「{participantName}」さんの回答を編集します。</p>
            <p className="mt-1 text-xs text-zinc-500">{PROJECT_DESCRIPTION}</p>
          </div>
          <div className="flex flex-col items-end gap-2 text-xs text-zinc-500">
            <div className="flex flex-wrap items-center justify-end gap-3">
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                <span aria-hidden="true">✓</span> {completeCount}/{candidates.length} 日完了
              </span>
              <span>👤 {participantName}</span>
              <a
                href="./user.html"
                className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:border-zinc-300 hover:text-zinc-800"
              >
                参加者一覧へ
              </a>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-600 shadow-sm transition hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-300"
                onClick={() => showToast("参加者名の変更モーダル（モック）")}
              >
                名前を変更
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-xl border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 shadow-sm transition hover:border-rose-400 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300"
                onClick={() => showToast("参加者を削除しました（モック）")}
              >
                参加者を削除
              </button>
            </div>
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
            </div>
            <EventMeta
              summary={currentCandidate.summary}
              summaryClassName="text-2xl font-bold tracking-wide text-gray-900"
              dateTime={currentDateRange}
              dateTimeClassName="flex flex-wrap items-center gap-1 text-sm text-gray-600"
              description={currentCandidate.description}
              descriptionClassName="text-xs text-gray-500"
              location={currentCandidate.location}
              locationClassName="flex items-center gap-2 text-xs text-gray-500"
              showLocationIcon
              statusText={null}
              statusPrefix=""
            />
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
              ref={commentTextareaRef}
              className="mt-1 w-full resize-none rounded-xl border px-2 py-2 text-sm leading-relaxed"
              rows={1}
              placeholder="この日程に何かコメントがありましたらこちらに入力してください…"
              value={currentComment}
              onChange={(e) => handleCommentChange(e.target.value)}
              onBlur={(e) => commitComment(e.target.value)}
              style={{ overflow: "hidden" }}
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

                const status = formatIcalStatusLabel(candidate.status);
                const rangeLabel = formatDateTimeRangeLabel(candidate.dtstart, candidate.dtend, candidate.tzid);

                return (
                  <li
                    key={candidate.id}
                    className={`rounded-xl border px-3 py-2 transition ${isCurrent ? "border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/40" : "hover:bg-zinc-50"}`}
                    aria-current={isCurrent ? "true" : undefined}
                    ref={(el) => (itemRefs.current[candidate.id] = el)}
                    tabIndex={-1}
                  >
                    <button
                      className="w-full space-y-2 text-left"
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
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${icalStatusBadgeClass(candidate.status)}`}>
                          {status}
                        </span>
                        {isCurrent && <span className="text-emerald-600">（選択中）</span>}
                      </div>
                      <EventMeta
                        summary={candidate.summary || formatCandidateDateLabel(candidate)}
                        summaryClassName="text-sm font-semibold text-gray-800"
                        dateTime={rangeLabel}
                        dateTimeClassName="flex flex-wrap items-center gap-1 text-xs text-gray-600"
                        description={candidate.description}
                        descriptionClassName="text-xs text-gray-500"
                        location={candidate.location}
                        locationClassName="flex items-center gap-1 text-xs text-gray-500"
                        showLocationIcon
                        timezone={candidate.tzid}
                        timezoneClassName="text-[11px] text-gray-400"
                      />
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-1">
                        <span className="inline-flex items-center gap-1 text-emerald-500"><span>○</span>{candidate.tally.o}</span>
                        <span className="inline-flex items-center gap-1 text-amber-500"><span>△</span>{candidate.tally.d}</span>
                        <span className="inline-flex items-center gap-1 text-rose-500"><span>×</span>{candidate.tally.x}</span>
                        <span
                          className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${myClass}`}
                          aria-label="あなたの選択"
                          title="あなたの選択"
                        >
                          <span className="font-medium">あなた:</span> {myLabel}
                        </span>
                      </div>
                      <div className="text-[10px] text-gray-400">（長押しで参加者を見る）</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </main>

      <Modal
        open={!!detailCandidate}
        title={detailCandidate ? `${detailCandidate.summary || "回答詳細"} の詳細` : "回答詳細"}
        onClose={closeDetail}
      >
        {detailCandidate && (
          <>
            <div className="flex items-center gap-2 text-xs">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${icalStatusBadgeClass(detailCandidate.status)}`}>
                {formatIcalStatusLabel(detailCandidate.status)}
              </span>
            </div>
            <EventMeta
              summary={detailCandidate.summary}
              summaryClassName="text-sm font-semibold text-gray-800"
              dateTime={formatDateTimeRangeLabel(detailCandidate.dtstart, detailCandidate.dtend, detailCandidate.tzid)}
              dateTimeClassName="flex flex-wrap items-center gap-1 text-xs text-gray-600"
              description={detailCandidate.description}
              descriptionClassName="text-xs text-gray-500"
              location={detailCandidate.location}
              locationClassName="flex items-center gap-1 text-xs text-gray-500"
              showLocationIcon
            />
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
