import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";

import sharedIcalUtils from "./shared/ical-utils";
import projectStore from "./store/project-store";
import scheduleService from "./services/schedule-service";
import EventMeta from "./shared/EventMeta.jsx";
import { formatDateTimeRangeLabel } from "./shared/date-utils";
import { ensureDemoProjectData } from "./shared/demo-data";

const { DEFAULT_TZID, createLogger } = sharedIcalUtils;

const DASHBOARD_META = {
  projectName: "秋の合宿 調整会議",
  description: "秋の合宿に向けた候補日を集約し、参加者と共有するためのプロジェクトです。",
  deadline: "2025/05/01 23:59",
  lastUpdated: "2025/04/12 17:45"
};

const logDebug = createLogger("user");

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

const normalizeMark = (mark) => {
  const value = typeof mark === "string" ? mark.trim().toLowerCase() : "";
  if (value === "o" || value === "d" || value === "x") return value;
  return "pending";
};

const createScheduleSummaries = (candidates, participants, responses) => {
  const participantMap = new Map((participants || []).map((participant) => [participant.id, participant]));
  const responseMap = new Map();
  (responses || []).forEach((response) => {
    if (!response || !response.candidateId) return;
    const list = responseMap.get(response.candidateId) || [];
    list.push(response);
    responseMap.set(response.candidateId, list);
  });

  const summaries = (candidates || []).map((candidate) => {
    const rangeLabel = formatDateTimeRangeLabel(candidate.dtstart, candidate.dtend, candidate.tzid || DEFAULT_TZID);
    const counts = { o: 0, d: 0, x: 0, pending: 0 };
    const detailed = [];
    const respondedIds = new Set();

    const candidateResponses = responseMap.get(candidate.id) || [];
    candidateResponses.forEach((response) => {
      const mark = normalizeMark(response.mark);
      if (counts[mark] !== undefined) counts[mark] += 1;
      else counts.pending += 1;
      const participant = participantMap.get(response.participantId);
      detailed.push({
        participantId: response.participantId,
        name: participant?.displayName || "参加者",
        mark,
        comment: response.comment || "コメントなし"
      });
      respondedIds.add(response.participantId);
    });

    (participants || []).forEach((participant) => {
      if (!participant || respondedIds.has(participant.id)) return;
      counts.pending += 1;
      detailed.push({
        participantId: participant.id,
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
      id: candidate.id,
      uid: candidate.uid,
      label: candidate.summary || "タイトル未設定",
      summary: candidate.summary || "タイトル未設定",
      rangeLabel,
      dtstart: candidate.dtstart,
      dtend: candidate.dtend,
      location: candidate.location || "",
      description: candidate.description || "",
      status: candidate.status || "TENTATIVE",
      tzid: candidate.tzid || DEFAULT_TZID,
      counts,
      responses: detailed
    };
  });

  summaries.sort((a, b) => {
    const aTime = a.dtstart ? new Date(a.dtstart).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.dtstart ? new Date(b.dtstart).getTime() : Number.POSITIVE_INFINITY;
    if (aTime === bTime) {
      return (a.label || "").localeCompare(b.label || "", "ja");
    }
    return aTime - bTime;
  });

  return summaries;
};

const formatTimestampForDisplay = (isoString) => {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
};

const createParticipantSummaries = (participants, candidates, responses) => {
  const candidateLookup = new Map((candidates || []).map((candidate) => [candidate.id, candidate]));
  const responseLookup = new Map();
  (responses || []).forEach((response) => {
    if (!response || !response.participantId || !response.candidateId) return;
    let map = responseLookup.get(response.participantId);
    if (!map) {
      map = new Map();
      responseLookup.set(response.participantId, map);
    }
    map.set(response.candidateId, response);
  });

  return (participants || []).map((participant) => {
    const candidateMap = responseLookup.get(participant.id) || new Map();
    const responsesForParticipant = (candidates || []).map((candidate) => {
      const found = candidateMap.get(candidate.id);
      const mark = normalizeMark(found?.mark);
      const comment = found?.comment ? `コメント: ${found.comment}` : "コメント: 未入力";
      return {
        scheduleId: candidate.id,
        datetime: formatDateTimeRangeLabel(candidate.dtstart, candidate.dtend, candidate.tzid || DEFAULT_TZID),
        mark,
        comment
      };
    });

    const commentHighlights = [];
    responsesForParticipant.forEach((item) => {
      if (item.comment && item.comment !== "コメント: 未入力") {
        commentHighlights.push(`コメント記入: ${candidateLookup.get(item.scheduleId)?.summary || "候補"}`);
      }
    });

    return {
      id: participant.id,
      name: participant.displayName || "参加者",
      lastUpdated: formatTimestampForDisplay(participant.updatedAt),
      commentHighlights: Array.from(new Set(commentHighlights)),
      responses: responsesForParticipant
    };
  });
};

function ScheduleSummary({ schedule, defaultOpen = false }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));

  useEffect(() => {
    setOpen(Boolean(defaultOpen));
  }, [defaultOpen]);

  const status = formatStatusBadge(schedule.status);

  return (
    <details
      className="rounded-2xl border border-zinc-200 bg-white shadow-sm"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span className={status.className}>{status.text}</span>
          </div>
          <EventMeta
            summary={schedule.label}
            summaryClassName="text-base font-semibold text-zinc-800"
            dateTime={schedule.rangeLabel}
            dateTimeClassName="flex flex-wrap items-center gap-1 text-sm text-zinc-600"
            description={schedule.description}
            descriptionClassName="text-xs text-zinc-500"
            location={schedule.location}
            locationClassName="flex items-center gap-2 text-xs text-zinc-500"
            showLocationIcon
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs sm:gap-3">
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
      <ul className="space-y-1 border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
        {schedule.responses.map((response, index) => (
          <li
            key={response.participantId || `${schedule.id}-resp-${index}`}
            className="flex items-start justify-between rounded-lg bg-white px-3 py-2 shadow-sm"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-semibold text-zinc-800">{response.name}</div>
                <a
                  href={response.participantId ? `./user-edit.html?participantId=${encodeURIComponent(response.participantId)}` : "./user-edit.html"}
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 hover:border-zinc-300 hover:text-zinc-800"
                >
                  回答
                </a>
              </div>
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
    </details>
  );
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

function ParticipantSummary({ participant, defaultOpen, scheduleLookup }) {
  const totals = useMemo(() => participantTotals(participant), [participant]);
  const [open, setOpen] = useState(Boolean(defaultOpen));

  useEffect(() => {
    setOpen(Boolean(defaultOpen));
  }, [defaultOpen]);

  return (
    <details
      className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Participant</div>
          <div className="flex flex-wrap items-center gap-2 text-base font-semibold text-zinc-800">
            <span>{participant.name}</span>
            <a
              href={`./user-edit.html?participantId=${encodeURIComponent(participant.id)}`}
              onClick={(event) => event.stopPropagation()}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 hover:border-zinc-300 hover:text-zinc-800"
            >
              回答
            </a>
          </div>
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
      <ul className="space-y-2 border-t border-zinc-200 bg-white px-4 py-3 text-sm">
        {participant.responses.map((response) => {
          const schedule = scheduleLookup ? scheduleLookup.get(response.scheduleId) : null;
          const rangeLabel = schedule
            ? formatDateTimeRangeLabel(schedule.dtstart, schedule.dtend, schedule.tzid || DEFAULT_TZID)
            : response.datetime;
          const summaryLabel = schedule ? schedule.summary || schedule.label : response.datetime;
          const location = schedule?.location;
          const description = schedule?.description;
          const timezone = schedule?.tzid;

          return (
            <li
              key={`${participant.id}-${response.scheduleId}`}
              className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 ${
                response.mark === "pending" ? "border-dashed border-zinc-300" : "border-transparent"
              }`}
            >
              <div className="flex-1 space-y-1">
                <EventMeta
                  summary={summaryLabel}
                  summaryClassName="text-sm font-semibold text-zinc-800"
                  dateTime={rangeLabel}
                  dateTimeClassName="flex flex-wrap items-center gap-1 text-xs text-zinc-600"
                  timezone={schedule ? timezone : null}
                  description={description}
                  descriptionClassName="text-xs text-zinc-500"
                  location={location}
                  locationClassName="flex items-center gap-1 text-xs text-zinc-500"
                  showLocationIcon
                  statusText={null}
                  statusPrefix=""
                />
                <div className={`text-xs ${response.mark === "pending" ? "text-zinc-600" : "text-zinc-500"}`}>{response.comment}</div>
              </div>
              <span
                className={`${markBadgeClass(response.mark)} h-6 min-w-[1.5rem] items-center justify-center text-xs font-semibold`}
              >
                {response.mark === "pending" ? "—" : MARK_SYMBOL[response.mark] ?? "？"}
              </span>
            </li>
          );
        })}
      </ul>
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
          <span className="inline-flex items-center justify-center gap-2">
            <span aria-hidden="true">📅</span>
            <span>日程ごと</span>
          </span>
        </button>
        <button
          type="button"
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${
            activeTab === "participant" ? "bg-emerald-600 text-white" : "text-zinc-700 hover:bg-emerald-50"
          }`}
          onClick={() => onChange("participant")}
        >
          <span className="inline-flex items-center justify-center gap-2">
            <span aria-hidden="true">👤</span>
            <span>参加者ごと</span>
          </span>
        </button>
      </div>
    </nav>
  );
}

const downloadIcsFile = (filename, contents) => {
  if (!contents) return;
  const blob = new Blob([contents], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 0);
};

function AdminResponsesApp() {
  const projectId = useMemo(() => projectStore.resolveProjectIdFromLocation(), []);
  const [activeTab, setActiveTab] = useState("schedule");
  const [projectState, setProjectState] = useState(() => projectStore.getProjectStateSnapshot(projectId));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = projectStore.subscribeProjectState(projectId, (nextState) => {
      if (!cancelled && nextState) {
        setProjectState(nextState);
      }
    });

    ensureDemoProjectData(projectId)
      .then(() => {
        if (!cancelled) setLoadError("");
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.warn("[Scheduly] failed to seed demo data", error);
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    setProjectState(projectStore.getProjectStateSnapshot(projectId));

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [projectId]);

  const candidates = projectState.candidates || [];
  const participants = projectState.participants || [];
  const responses = projectState.responses || [];

  const schedules = useMemo(
    () => createScheduleSummaries(candidates, participants, responses),
    [candidates, participants, responses]
  );

  const scheduleLookup = useMemo(() => {
    const map = new Map();
    schedules.forEach((schedule) => map.set(schedule.id, schedule));
    return map;
  }, [schedules]);

  const participantSummaries = useMemo(
    () => createParticipantSummaries(participants, candidates, responses),
    [participants, candidates, responses]
  );

  const handleDownloadAllIcs = () => {
    let icsText = projectState.icsText || "";
    if (!icsText) {
      try {
        icsText = scheduleService.exportAllCandidatesToIcs(projectId);
      } catch (error) {
        logDebug("ICS export failed", error);
        icsText = "";
      }
    }
    if (!icsText) {
      logDebug("skip ICS download: no data");
      return;
    }
    const filename = `scheduly-all-${new Date().toISOString().split("T")[0]}.ics`;
    downloadIcsFile(filename, icsText);
  };

  const hasIcsData = Boolean((projectState.icsText && projectState.icsText.trim()) || schedules.length);
  const participantCount = participants.length;

  const projectName = projectState.project?.name || DASHBOARD_META.projectName;
  const projectDescription = projectState.project?.description || DASHBOARD_META.description;

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">Participant Responses</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
              <span aria-hidden="true">📋</span>
              <span>Scheduly 参加者</span>
            </h1>
            <p className="mt-2 text-sm text-zinc-600">プロジェクト「{projectName}」の日程と回答状況です。</p>
            {projectDescription && <p className="mt-1 text-xs text-zinc-500">{projectDescription}</p>}
            <p className="mt-1 text-xs text-zinc-500">締切目安: {DASHBOARD_META.deadline}</p>
            <p className="mt-1 text-xs text-zinc-500">参加者数: {participantCount}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
              onClick={() => logDebug("add participant button clicked")}
            >
              <span aria-hidden="true">＋</span>
              <span>参加者を新規登録</span>
            </button>
          </div>
        </div>
      </header>

      <TabNavigation activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "schedule" && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-600">日程ごとの回答サマリー</h2>
          {loading && !schedules.length ? (
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 px-4 py-6 text-center text-xs text-emerald-600">
              日程データを読み込んでいます…
            </div>
          ) : schedules.length ? (
            schedules.map((schedule, index) => (
              <ScheduleSummary key={schedule.id} schedule={schedule} defaultOpen={index === 0} />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-6 text-center text-xs text-zinc-500">
              表示できる日程がありません。
              {loadError && (
                <span className="mt-2 block text-[11px] text-rose-500">読み込みエラー: {loadError}</span>
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === "participant" && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-600">参加者ごとの回答サマリー</h2>
          <div className="space-y-3">
            {participantSummaries.length ? (
              participantSummaries.map((participant, index) => (
                <ParticipantSummary
                  key={participant.id}
                  participant={participant}
                  defaultOpen={index === 0}
                  scheduleLookup={scheduleLookup}
                />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-6 text-center text-xs text-zinc-500">
                表示できる参加者がありません。
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/70 p-4 text-xs text-zinc-500">
            <p className="font-semibold text-zinc-600">参加者サマリー活用メモ</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>未回答者を抽出して個別フォローしましょう。</li>
            </ul>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-zinc-700">回答全体のアクション</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-zinc-200 px-3 py-2 text-xs text-emerald-600 hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleDownloadAllIcs}
              disabled={!hasIcsData}
            >
              日程をICSに一括エクスポート
            </button>
            <button className="rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-500 hover:border-zinc-300">
              全回答を CSV でダウンロード
            </button>
            <button className="rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-500 hover:border-zinc-300">
              サマリーをコピー（仮）
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Root element not found");
const root = ReactDOM.createRoot(container);
root.render(<AdminResponsesApp />);
