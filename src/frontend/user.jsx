// Copyright (c) Toshiki Iga. All Rights Reserved.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import ReactDOM from "react-dom/client";

import sharedIcalUtils from "./shared/ical-utils";
import projectService from "./services/project-service";
import scheduleService from "./services/schedule-service";
import participantService from "./services/participant-service";
import shareService from "./services/share-service";
import summaryService from "./services/summary-service";
import responseService from "./services/response-service";
import runtimeConfig from "./shared/runtime-config";
import { describeMutationToast } from "./shared/mutation-message";
import { formatDateTimeRangeLabel } from "./shared/date-utils";
import EventMeta from "./shared/EventMeta.jsx";
import ErrorScreen from "./shared/ErrorScreen.jsx";
import InfoBadge from "./shared/InfoBadge.jsx";
import { ensureDemoProjectData } from "./shared/demo-data";
import TypeConfirmationDialog from "./shared/TypeConfirmationDialog.jsx";

const { DEFAULT_TZID, createLogger } = sharedIcalUtils;

void EventMeta;
void ErrorScreen;
void InfoBadge;
void TypeConfirmationDialog;

const DASHBOARD_META = {
  projectName: "秋の合宿 調整会議",
  description: "秋の合宿に向けた候補日を集約し、参加者と共有するためのプロジェクトです。",
  deadline: "2025/05/01 23:59",
  lastUpdated: "2025/04/12 17:45"
};

const logDebug = createLogger("user");
const MANAGEMENT_CONFIRM_WORD = "CREATE";

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

function ScheduleSummary({ schedule, projectId, inlineEditorTarget, onToggleInlineEdit }) {
  const [open, setOpen] = useState(false);
  const activeInlineParticipantId =
    inlineEditorTarget && inlineEditorTarget.scheduleId === schedule.id ? inlineEditorTarget.participantId : null;

  useEffect(() => {
    if (!open && activeInlineParticipantId) {
      setOpen(true);
    }
  }, [activeInlineParticipantId, open]);

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
            descriptionClassName={`text-xs text-zinc-500${open ? "" : " whitespace-nowrap truncate max-w-[48ch]"}`}
            descriptionTitle={open ? undefined : schedule.description}
            location={schedule.location}
            locationClassName={`flex items-center gap-2 text-xs text-zinc-500${open ? "" : " whitespace-nowrap truncate max-w-[48ch]"}`}
            locationTitle={open ? undefined : schedule.location}
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
          <span className="inline-flex h-7 min-w-[50px] items-center justify-center rounded-full bg-zinc-200 px-3 font-semibold text-zinc-600">
            未回答 {schedule.counts.pending}
          </span>
        </div>
      </summary>
      <ul className="space-y-1 border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
        {schedule.responses.map((response, index) => {
          const isEditing = Boolean(
            activeInlineParticipantId && response.participantId && activeInlineParticipantId === response.participantId
          );
          const canInlineEdit = Boolean(projectId && response.participantId);
          // Debug log: keep permanently to help trace participant handoff issues.
          return (
            <li
              key={response.participantId || `${schedule.id}-resp-${index}`}
              className={`rounded-lg bg-white px-3 py-2 shadow-sm overflow-hidden ${
                isEditing ? "border border-emerald-300 bg-emerald-50/50" : "border border-transparent"
              }`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div
                  className="flex-1 min-w-0 space-y-2"
                  {...(!isEditing && canInlineEdit
                    ? createLongPressHandlers(() => onToggleInlineEdit?.(response.participantId, schedule.id), 500)
                    : {})}
                >
                  <div className="font-semibold text-zinc-800">{response.name}</div>
                  {isEditing ? (
                    <InlineResponseEditor
                      projectId={projectId}
                      participantId={response.participantId}
                      schedule={{ id: schedule.id }}
                      initialMark={response.mark}
                      initialComment={response.commentRaw || ""}
                      onClose={() => onToggleInlineEdit?.(response.participantId, schedule.id)}
                    />
                  ) : (
                    <div className={`text-xs ${response.mark === "pending" ? "text-zinc-400" : "text-zinc-500"}`}>
                      {response.comment}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2">
                  {!isEditing && (
                    <span className={`${markBadgeClass(response.mark)} flex h-6 min-w-[1.5rem] items-center justify-center text-xs font-semibold`}>
                      {MARK_SYMBOL[response.mark] ?? "？"}
                    </span>
                  )}
                  {!isEditing && (
                    <button
                      type="button"
                      disabled={!canInlineEdit}
                      onClick={() => {
                        if (!canInlineEdit) return;
                        console.log("[user] inline answer toggle", {
                          source: "schedule-summary",
                          participantId: response.participantId,
                          scheduleId: schedule.id,
                          editing: true
                        });
                        onToggleInlineEdit?.(response.participantId, schedule.id);
                      }}
                      className="rounded-lg border px-2 py-1 text-[11px] font-semibold transition border-zinc-200 text-zinc-600 hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      回答
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
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

function InlineResponseEditor({
  projectId,
  participantId,
  schedule,
  initialMark,
  initialComment,
  fallbackHref = "",
  onClose
}) {
  const [currentMark, setCurrentMark] = useState(initialMark && initialMark !== "pending" ? initialMark : null);
  const [currentComment, setCurrentComment] = useState(initialComment || "");
  const [statusMessage, setStatusMessage] = useState("");
  const [commentError, setCommentError] = useState(false);
  const statusTimerRef = useRef(null);
  const lastAttemptRef = useRef(null);
  const [conflictInfo, setConflictInfo] = useState(null);

  useEffect(() => {
    setCurrentMark(initialMark && initialMark !== "pending" ? initialMark : null);
  }, [initialMark]);

  useEffect(() => {
    setCurrentComment(initialComment || "");
  }, [initialComment]);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) {
        window.clearTimeout(statusTimerRef.current);
        statusTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!projectId || !participantId || !schedule?.id) return () => {};
    const unsubscribe = projectService.addSyncListener((event) => {
      if (
        !event ||
        event.projectId !== projectId ||
        event.scope !== "mutation" ||
        event.entity !== "response" ||
        event.phase !== "conflict"
      ) {
        return;
      }
      const meta = event.meta || {};
      if (meta.participantId !== participantId || meta.candidateId !== schedule.id) {
        return;
      }
      const attempt = lastAttemptRef.current;
      setConflictInfo({
        attempt,
        timestamp: Date.now()
      });
      setStatusMessage("最新の回答と競合しました。内容を確認して再度保存してください。");
    });
    return unsubscribe;
  }, [participantId, projectId, schedule?.id]);

  const commitUpdate = useCallback(
    async (nextMark, nextComment) => {
      if (!projectId || !participantId || !schedule?.id) return;
      try {
        lastAttemptRef.current = {
          mark: nextMark || "pending",
          comment: nextComment || ""
        };
        setConflictInfo(null);
        await responseService.upsertResponse(projectId, {
          participantId,
          candidateId: schedule.id,
          mark: nextMark || "pending",
          comment: nextComment || ""
        });
        if (statusTimerRef.current) {
          window.clearTimeout(statusTimerRef.current);
        }
        setStatusMessage("保存しました");
        statusTimerRef.current = window.setTimeout(() => {
          setStatusMessage("");
          statusTimerRef.current = null;
        }, 1800);
        lastAttemptRef.current = null;
        setConflictInfo(null);
      } catch (error) {
        const msg = error && error.message ? String(error.message) : "保存に失敗しました";
        const isValidation = error && (error.code === 422 || /validation/i.test(msg));
        if (isValidation) {
          if (/comment/i.test(msg)) {
            setCommentError(true);
            setStatusMessage("コメントは500文字以内で入力してください");
          } else {
            setStatusMessage("入力内容を確認してください");
          }
          console.debug("[user] validation", msg);
        } else {
          console.error("[user] inline response update failed", error);
          setStatusMessage("保存に失敗しました");
        }
        if (statusTimerRef.current) {
          window.clearTimeout(statusTimerRef.current);
          statusTimerRef.current = null;
        }
      }
    },
    [participantId, projectId, schedule?.id]
  );

  const handleSelectMark = (markKey) => {
    setCurrentMark((prev) => {
      const next = prev === markKey ? null : markKey;
      commitUpdate(next, currentComment);
      return next;
    });
  };

  // commit-on-blur for comment; mark commits immediately

  const handleCommentChange = (value) => {
    setCurrentComment(value);
  };

  const handleCommentBlur = (value) => {
    commitUpdate(currentMark, value);
  };

  const markButtonClass = (markKey, pressed) => {
    if (markKey === "o") {
      return pressed ? "bg-emerald-500 text-white border-emerald-500" : "bg-emerald-50 text-emerald-700 border-emerald-300";
    }
    if (markKey === "d") {
      return pressed ? "bg-amber-500 text-white border-amber-500" : "bg-amber-50 text-amber-700 border-amber-300";
    }
    return pressed ? "bg-rose-500 text-white border-rose-500" : "bg-rose-50 text-rose-700 border-rose-300";
  };

  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-zinc-700">
      <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-700">
        <span>この日程の回答を編集</span>
        {onClose && (
          <button
            type="button"
            className="rounded-lg border border-emerald-200 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100/60"
            onClick={onClose}
          >
            閉じる
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {["o", "d", "x"].map((markKey) => {
          const pressed = currentMark === markKey;
          return (
            <button
              key={markKey}
              type="button"
              aria-pressed={pressed}
              onClick={() => handleSelectMark(markKey)}
              className={`h-12 rounded-xl border text-xl font-bold transition-colors ${markButtonClass(markKey, pressed)}`}
            >
              {markKey === "o" ? "○" : markKey === "d" ? "△" : "×"}
            </button>
          );
        })}
      </div>

      <label className="mt-3 block text-[11px] text-zinc-600">
        コメント（任意）
        <textarea
          className={`mt-1 w-full resize-y rounded-xl border px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring focus:ring-emerald-100 ${commentError ? "border-rose-300 focus:border-rose-400" : "border-zinc-200 focus:border-emerald-400"}`}
          rows={3}
          placeholder="この日程について共有したいことがあれば入力してください…"
          value={currentComment}
          onChange={(event) => handleCommentChange(event.target.value)}
          onBlur={(event) => handleCommentBlur(event.target.value)}
        />
      </label>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-emerald-700">
        <span>{statusMessage || "入力内容は自動保存されます"}</span>
        <span className={`ml-auto ${commentError ? "text-rose-600" : "text-zinc-500"}`}>{currentComment.length}/500</span>
        {fallbackHref ? (
          <a
            className="rounded-lg border border-transparent px-2 py-1 text-[10px] font-semibold text-emerald-700 underline decoration-emerald-400"
            href={fallbackHref}
            target="_blank"
            rel="noreferrer"
          >
            別画面で回答
          </a>
        ) : null}
      </div>
      {conflictInfo && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
          <p className="font-semibold text-amber-700">最新の回答と競合しました</p>
          <p className="mt-1">
            他の参加者が同じ日程の回答を先に更新したため、あなたの入力は保存されていません。内容を確認して再度保存してください。
          </p>
          {conflictInfo.attempt && (
            <div className="mt-2 rounded-lg border border-amber-100 bg-white/80 px-3 py-2 text-[11px] text-zinc-600">
              <div className="text-[10px] font-semibold text-zinc-400">あなたの入力</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={`${markBadgeClass(conflictInfo.attempt.mark || "pending")} px-2 py-0.5 text-xs font-semibold`}>
                  {MARK_SYMBOL[conflictInfo.attempt.mark || "pending"] ?? "？"}
                </span>
                <span className="text-zinc-600">{conflictInfo.attempt.comment || "コメントなし"}</span>
              </div>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-semibold text-emerald-700 hover:border-emerald-400"
              onClick={() => {
                const attempt = conflictInfo.attempt;
                if (attempt) {
                  setCurrentMark(attempt.mark && attempt.mark !== "pending" ? attempt.mark : null);
                  setCurrentComment(attempt.comment || "");
                  commitUpdate(attempt.mark, attempt.comment);
                } else {
                  commitUpdate(currentMark, currentComment);
                }
              }}
            >
              もう一度保存
            </button>
            <button
              type="button"
              className="rounded-lg border border-zinc-200 px-3 py-1.5 font-semibold text-zinc-600 hover:border-zinc-300"
              onClick={() => {
                setConflictInfo(null);
                lastAttemptRef.current = null;
                setStatusMessage("最新の回答を表示しています");
              }}
            >
              最新の回答を使う
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

void InlineResponseEditor;

function ParticipantSummary({
  participant,
  scheduleLookup,
  onRemove,
  onRename,
  canRemove = true,
  projectId,
  inlineEditorTarget,
  onToggleInlineEdit
}) {
  const totals = useMemo(() => participantTotals(participant), [participant]);
  const [open, setOpen] = useState(false);
  const activeInlineScheduleId =
    inlineEditorTarget && inlineEditorTarget.participantId === participant.id ? inlineEditorTarget.scheduleId : null;

  useEffect(() => {
    if (!open && activeInlineScheduleId) {
      setOpen(true);
    }
  }, [activeInlineScheduleId, open]);

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
            {onRename && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRename();
                }}
                className="inline-flex items-center justify-center rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 hover:border-zinc-300 hover:text-zinc-800"
              >
                名前変更
              </button>
            )}
            {onRemove && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (!canRemove) return;
                  onRemove();
                }}
                disabled={!canRemove}
                className="inline-flex items-center justify-center rounded-lg border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:border-rose-300 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                削除
              </button>
            )}
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
          const isEditing = activeInlineScheduleId === response.scheduleId;

          return (
            <li
              key={`${participant.id}-${response.scheduleId}`}
              className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 overflow-hidden ${
                isEditing ? "border-emerald-300 bg-emerald-50/40" : response.mark === "pending" ? "border-dashed border-zinc-300" : "border-transparent"
              }`}
            >
              <div
                className="flex-1 min-w-0 space-y-1"
                {...(!isEditing
                  ? createLongPressHandlers(() => onToggleInlineEdit?.(participant.id, response.scheduleId), 500)
                  : {})}
              >
                <EventMeta
                  summary={summaryLabel}
                  summaryClassName="text-sm font-semibold text-zinc-800"
                  dateTime={rangeLabel}
                  dateTimeClassName="flex flex-wrap items-center gap-1 text-xs text-zinc-600"
                  timezone={schedule ? timezone : null}
                  description={description}
                  descriptionClassName={`text-xs text-zinc-500${
                    isEditing ? "" : " whitespace-nowrap truncate max-w-[48ch]"
                  }`}
                  descriptionTitle={isEditing ? undefined : description}
                  location={location}
                  locationClassName={`flex items-center gap-1 text-xs text-zinc-500${
                    isEditing ? "" : " whitespace-nowrap truncate max-w-[48ch]"
                  }`}
                  locationTitle={isEditing ? undefined : location}
                  showLocationIcon
                  statusText={null}
                  statusPrefix=""
                />
                {isEditing ? (
                  <InlineResponseEditor
                    projectId={projectId}
                    participantId={participant.id}
                    schedule={schedule ? { id: schedule.id } : { id: response.scheduleId }}
                    initialMark={response.mark}
                    initialComment={response.commentRaw || ""}
                    onClose={() => onToggleInlineEdit?.(participant.id, response.scheduleId)}
                  />
                ) : (
                  <div
                    className={`text-xs ${
                      response.mark === "pending" ? "text-zinc-600" : "text-zinc-500"
                    } whitespace-nowrap truncate max-w-[40ch]`}
                    title={response.comment || undefined}
                  >
                    {response.comment}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {!isEditing && (
                  <span
                    className={`${markBadgeClass(response.mark)} flex h-6 min-w-[1.5rem] items-center justify-center text-xs font-semibold`}
                  >
                    {response.mark === "pending" ? "—" : MARK_SYMBOL[response.mark] ?? "？"}
                  </span>
                )}
                {!isEditing && (
                  <button
                    type="button"
                    className="rounded-lg border px-2 py-1 text-[11px] font-semibold transition border-zinc-200 text-zinc-600 hover:border-emerald-300 hover:text-emerald-700"
                    onClick={() => {
                      console.log("[user] inline answer toggle", {
                        participantId: participant.id,
                        scheduleId: response.scheduleId,
                        editing: true
                      });
                      onToggleInlineEdit?.(participant.id, response.scheduleId);
                    }}
                  >
                    回答
                  </button>
                )}
              </div>
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
  const [projectId, setProjectId] = useState(null);
  const [initialRouteContext, setInitialRouteContext] = useState(null);
  const [routeContext, setRouteContext] = useState(null);
  const routeError = useMemo(() => {
    if (initialRouteContext?.kind === "share-miss" && initialRouteContext.shareType === "participant") {
      return {
        title: "参加者用の共有URLが無効です",
        description: "このリンクは無効になっています。管理者に連絡し、最新の参加者用URLを教えてもらってください。"
      };
    }
    if (initialRouteContext?.kind === "participant-token-miss") {
      return {
        title: "回答用リンクが無効です",
        description: "このリンクは無効になっています。管理者に連絡し、最新の参加者用URLを教えてもらってください。"
      };
    }
    return null;
  }, [initialRouteContext]);
  const [activeTab, setActiveTab] = useState("schedule");
  const [projectState, setProjectState] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [participantSummaries, setParticipantSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [participantDialogOpen, setParticipantDialogOpen] = useState(false);
  const [managementDialogOpen, setManagementDialogOpen] = useState(false);
  const [newParticipantName, setNewParticipantName] = useState("");
  const [participantActionMessage, setParticipantActionMessage] = useState("");
  const [participantActionError, setParticipantActionError] = useState("");
  const [removeDialogParticipant, setRemoveDialogParticipant] = useState(null);
  const [removeInProgress, setRemoveInProgress] = useState(false);
  const [renameDialogParticipant, setRenameDialogParticipant] = useState(null);
  const [renameName, setRenameName] = useState("");
  const [renameInProgress, setRenameInProgress] = useState(false);
  const [renameError, setRenameError] = useState("");
  const [inlineEditorTarget, setInlineEditorTarget] = useState(null);
  const isApiDriver = runtimeConfig.isProjectDriverApi();
  const [snapshotStatus, setSnapshotStatus] = useState(() => ({
    phase: isApiDriver ? "loading" : "ready",
    message: isApiDriver ? "サーバーの初期データを取得しています…" : ""
  }));
  const [toast, setToast] = useState("");
  const popToast = useCallback((message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2000);
  }, []);

  const participantShareToken = useMemo(() => {
    if (routeError) return "";
    const tokenFromState = projectState?.project?.shareTokens?.participant?.token;
    if (tokenFromState && !shareService.isPlaceholderToken(tokenFromState)) {
      return String(tokenFromState);
    }
    const context = routeContext || initialRouteContext;
    if (
      context &&
      context.shareType === "participant" &&
      context.token &&
      (context.kind === "share" || context.kind === "share-miss")
    ) {
      return String(context.token);
    }
    return "";
  }, [initialRouteContext, projectState, routeContext, routeError]);

  const snapshotBannerVisible = isApiDriver && snapshotStatus.phase !== "ready" && snapshotStatus.message;
  const snapshotBannerClasses =
    snapshotStatus.phase === "error"
      ? "mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600"
      : "mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600";

  useEffect(() => {
    if (routeError) return;
    if (typeof window === "undefined") return;
    if (!initialRouteContext || initialRouteContext.shareType !== "participant") return;
    if (initialRouteContext.kind !== "participant-token") return;
    if (!participantShareToken) return;
    const currentUrl = new URL(window.location.href);
    const desiredPath = `/p/${participantShareToken}`;
    if (currentUrl.pathname === desiredPath) return;
    currentUrl.pathname = desiredPath;
    window.history.replaceState(null, "", currentUrl.pathname + currentUrl.search);
    const resolved = projectService.resolveProjectFromLocation();
    setRouteContext(resolved.routeContext);
  }, [initialRouteContext, participantShareToken, routeError]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = null;

    const bootstrap = async () => {
      const resolved = projectService.resolveProjectFromLocation();
      if (cancelled) return;
      setProjectId(resolved.projectId);
      setInitialRouteContext(resolved.routeContext);
      setRouteContext(resolved.routeContext);
      setProjectState(resolved.state);
      setSchedules(summaryService.buildScheduleView(resolved.projectId, { state: resolved.state }));
      setParticipantSummaries(summaryService.buildParticipantView(resolved.projectId, { state: resolved.state }));
      try {
        await ensureDemoProjectData(resolved.projectId);
        if (!cancelled) {
          setLoadError("");
        }
      } catch (error) {
        console.warn("[Scheduly] failed to seed demo data", error);
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }

      unsubscribe = projectService.subscribe(resolved.projectId, (nextState) => {
        if (cancelled || !nextState) return;
        setProjectState(nextState);
        setSchedules(summaryService.buildScheduleView(resolved.projectId, { state: nextState }));
        setParticipantSummaries(summaryService.buildParticipantView(resolved.projectId, { state: nextState }));
        setRouteContext(projectService.getRouteContext());
      });
    };

    bootstrap();

    return () => {
      cancelled = true;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [routeError]);

  useEffect(() => {
    if (!isApiDriver || !projectId) return;
    if (projectService.isProjectReady(projectId)) {
      setSnapshotStatus({ phase: "ready", message: "" });
    }
  }, [isApiDriver, projectId]);

  const participants = projectState?.participants || [];

  const scheduleLookup = useMemo(() => {
    const map = new Map();
    schedules.forEach((schedule) => map.set(schedule.id, schedule));
    return map;
  }, [schedules]);

  const toggleInlineEditor = (participantId, scheduleId) => {
    if (!participantId || !scheduleId) {
      setInlineEditorTarget(null);
      return;
    }
    setInlineEditorTarget((prev) => {
      if (prev && prev.participantId === participantId && prev.scheduleId === scheduleId) {
        return null;
      }
      return { participantId, scheduleId };
    });
  };

  useEffect(() => {
    if (!projectId) return undefined;
    const unsubscribe = projectService.addSyncListener((event) => {
      if (!event || event.projectId !== projectId) return;
      const { scope, phase, meta } = event;
      if (scope === "snapshot") {
        if (phase === "start" && isApiDriver) {
          setSnapshotStatus((prev) => {
            if (prev.phase === "ready") return prev;
            return {
              phase: "loading",
              message: "サーバーの最新情報を取得しています…"
            };
          });
        } else if (phase === "success") {
          if (isApiDriver) {
            setSnapshotStatus({ phase: "ready", message: "" });
          }
          if (meta?.reason === "conflict") {
            popToast("サーバーの最新回答を読み込み直しました。");
          }
        } else if (phase === "error") {
          const message = "サーバーの最新状態を取得できませんでした。時間を置いて再度お試しください。";
          if (isApiDriver) {
            setSnapshotStatus({ phase: "error", message });
          }
          popToast(message);
        }
      } else if (scope === "mutation") {
        if (phase === "conflict" || phase === "error") {
          const message = describeMutationToast(event);
          if (message) {
            popToast(message);
          }
        }
      }
    });
    return unsubscribe;
  }, [isApiDriver, popToast, projectId]);

  const closeManagementDialog = () => {
    setManagementDialogOpen(false);
  };

  const handleManagementConfirm = () => {
    closeManagementDialog();
    try {
      window.open("/index.html", "_blank", "noopener,noreferrer");
    } catch (error) {
      console.warn("[user] failed to open management console", error);
    }
  };

  useEffect(() => {
    if (!inlineEditorTarget) return;
    const participantExists = participantSummaries.some(
      (participant) => participant.id === inlineEditorTarget.participantId
    );
    const scheduleExists = schedules.some(
      (schedule) =>
        schedule.id === inlineEditorTarget.scheduleId &&
        schedule.responses.some((response) => response.participantId === inlineEditorTarget.participantId)
    );
    if (!participantExists && !scheduleExists) {
      setInlineEditorTarget(null);
    }
  }, [inlineEditorTarget, participantSummaries, schedules]);

  useEffect(() => {
    setInlineEditorTarget(null);
  }, [activeTab]);

  const handleDownloadAllIcs = () => {
    if (!projectId) {
      return;
    }
    let icsText = projectState?.icsText || "";
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

  const handleDownloadAllExcel = async () => {
    try {
      const ExcelJS = (await import('exceljs')).default || (await import('exceljs'));
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Responses');

      const participants = projectState?.participants || [];
      const candidates = projectState?.candidates || [];
      const responses = projectState?.responses || [];

      // ヘッダー行: 日付 / 開始 / 終了 / タイトル（SUMMARY） / ステータス（STATUS） / 場所（LOCATION） / 説明（DESCRIPTION）
      //           + 参加者ごとに「回答・コメント」の2列 + 右端集計列
      const participantNames = participants.map((p) => p.displayName || p.name || p.id);
      const participantHeaderPairs = participantNames.flatMap((name) => [name, `${name} コメント`]);
      const rightSummaryHeaders = ['○', '△', '×', 'ー'];
      ws.addRow(['日付', '開始', '終了', 'タイトル（SUMMARY）', 'ステータス（STATUS）', '場所（LOCATION）', '説明（DESCRIPTION）', ...participantHeaderPairs, ...rightSummaryHeaders]);
      const respMap = new Map();
      responses.forEach((r) => {
        const key = `${r.candidateId}::${r.participantId}`;
        respMap.set(key, r);
      });

      const markToSymbol = (mark) => (mark === 'o' ? '○' : mark === 'd' ? '△' : mark === 'x' ? '×' : 'ー');

      const formatDate = (value) => {
        if (!value) return '';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}/${mm}/${dd}`;
      };
      const formatTime = (value) => {
        if (!value) return '';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${hh}:${mi}`;
      };

      const pairCols = participants.length * 2; // 参加者の列数（回答+コメント）
      const firstParticipantCol = 8; // H列(=8)から参加者ペアが始まる（E:5=STATUS, F:6=場所, G:7=説明）
      let grandO = 0, grandD = 0, grandX = 0, grandP = 0;
      candidates.forEach((c) => {
        const display = c.summary || c.label || c.id;
        const row = [formatDate(c.dtstart), formatTime(c.dtstart), formatTime(c.dtend), display, (c.status || 'TENTATIVE'), c.location || '', c.description || ''];
        let co = 0, cd = 0, cx = 0, cp = 0;
        participants.forEach((p) => {
          const r = respMap.get(`${c.id}::${p.id}`);
          row.push(markToSymbol(r?.mark));
          row.push(typeof r?.comment === 'string' ? r.comment : '');
          const m = r?.mark;
          if (m === 'o') co += 1; else if (m === 'd') cd += 1; else if (m === 'x') cx += 1; else cp += 1;
        });
        grandO += co; grandD += cd; grandX += cx; grandP += cp;
        row.push(co, cd, cx, cp); // 行末に集計
        ws.addRow(row);

        // 記号セル（回答列）のフォント色をマークに応じて着色
        const last = ws.lastRow;
        const colorFor = (mark) => {
          // emerald-600, amber-600, rose-600, zinc-500
          if (mark === 'o') return { argb: 'FF059669' };
          if (mark === 'd') return { argb: 'FFF59E0B' };
          if (mark === 'x') return { argb: 'FFEF4444' };
          return { argb: 'FF6B7280' }; // 未回答
        };
        participants.forEach((p, idx) => {
          const r = respMap.get(`${c.id}::${p.id}`);
          const mark = r?.mark;
          const col = firstParticipantCol + idx * 2; // G=7, 次の回答列は +2 ずつ
          const cell = last.getCell(col);
          cell.font = { ...(cell.font || {}), color: colorFor(mark) };
        });
      });

      // 集計行（○/△/×/ー の件数）を日程データの直下に追加
      const countFor = (key) => {
        // A:日付, B:開始, C:終了, D:タイトル, E:STATUS, F:場所, G:説明
        // 参加者ペアは H 列以降のため、EFG 分の空白を挿入
        const row = ['', '', '', key, '', '', ''];
        participants.forEach((p) => {
          let cnt = 0;
          candidates.forEach((c) => {
            const r = respMap.get(`${c.id}::${p.id}`);
            const m = r?.mark;
            if (key === 'ー') {
              if (!m || (m !== 'o' && m !== 'd' && m !== 'x')) cnt += 1;
            } else if (key === '○') {
              if (m === 'o') cnt += 1;
            } else if (key === '△') {
              if (m === 'd') cnt += 1;
            } else if (key === '×') {
              if (m === 'x') cnt += 1;
            }
          });
          // 参加者は2列ペア（回答, コメント）。回答列に件数、コメント列は空。
          row.push(cnt);
          row.push('');
        });
        ws.addRow(row);
      };

      countFor('○');
      countFor('△');
      countFor('×');
      countFor('ー');

      ws.getRow(1).font = { bold: true };
      // タイトル行: 薄い青色背景
      const headerRow = ws.getRow(1);
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0F2FE' } // sky-100相当
        };
      });
      // 列幅: BとCは同じ、Dは広め、E=ステータス、F=場所・G=説明を広め、H以降は回答/コメントのペア、右端4列は集計
      const dateColWidth = 12;
      const timeColWidth = 10; // B, C 共通
      const titleColWidth = 44; // D
      const statusColWidth = 14; // E: ステータス
      const locColWidth = 40; // F: 場所
      const descColWidth = 64; // G: 説明
      const markColWidth = 6; // 参加者の回答列（○△×）
      const commentColWidth = 24; // 参加者のコメント列
      // 注意: forEach の idx は 0 始まり。ExcelJS の列番号は 1 始まり。
      ws.columns.forEach((col, idx) => {
        const n = idx + 1; // 列番号 (A=1, B=2 ...)
        // 参加者は2列ペア（回答, コメント）がE以降に並ぶ
        // G=7 が最初の回答列、隣がそのコメント列
        let w = markColWidth; // default (回答列)
        if (n === 1) w = dateColWidth; // A: 日付
        else if (n === 2) w = timeColWidth; // B: 開始（Cと同幅）
        else if (n === 3) w = timeColWidth; // C: 終了（Bと同幅）
        else if (n === 4) w = titleColWidth; // D: 日程ラベル（広め）
        else if (n === 5) w = statusColWidth; // E: ステータス
        else if (n === 6) w = locColWidth; // F: 場所
        else if (n === 7) w = descColWidth; // G: 説明
        else if (n >= firstParticipantCol && n < firstParticipantCol + pairCols) {
          // H以降が参加者の (回答, コメント)、以降も2列毎
          const offset = n - firstParticipantCol; // 0-based
          const isCommentCol = offset % 2 === 1;
          w = isCommentCol ? commentColWidth : markColWidth;
        } else if (n >= firstParticipantCol + pairCols) {
          // 右端の4集計列（○, △, ×, ー）: いずれも同幅（×に合わせる）
          w = 8;
        }
        col.width = w;
      });

      // 右端集計列の合計行を追加（全候補に対する総数）
      const totalRow = ['', '', '', '合計'];
      // E, F, G はステータス・場所・説明の列。合計行は空で埋める
      totalRow.push('', '', '');
      for (let i = 0; i < pairCols; i += 1) totalRow.push('');
      totalRow.push(grandO, grandD, grandX, grandP);
      ws.addRow(totalRow);
      // 合計行: 薄いオレンジ色背景
      const lastRow = ws.lastRow;
      lastRow.font = { ...(lastRow.font || {}), bold: true };
      lastRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEF3C7' } // amber-100相当
        };
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `scheduly-participant-responses_${dateStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
    } catch (error) {
      console.error('Excel export failed (exceljs not installed?)', error);
      alert('Excelエクスポートに失敗しました。exceljs 依存を追加後に再試行してください。\nnpm i exceljs');
    }
  };

  const hasIcsData = Boolean((projectState?.icsText && projectState.icsText.trim()) || schedules.length);
  const participantCount = participants.length;

  const projectName = projectState?.project?.name || DASHBOARD_META.projectName;
  const projectDescription = projectState?.project?.description || DASHBOARD_META.description;

  const handleAddParticipant = async () => {
    const trimmed = newParticipantName.trim();
    if (!trimmed) {
      setParticipantActionError("参加者名を入力してください");
      setParticipantActionMessage("");
      return;
    }
    if (!projectId) {
      setParticipantActionError("プロジェクトの読み込み中です。少し待ってから再度お試しください。");
      setParticipantActionMessage("");
      return;
    }
    try {
      const created = await participantService.addParticipant(projectId, { displayName: trimmed });
      setParticipantActionMessage(`${created.displayName || "参加者"}を追加しました`);
      setParticipantActionError("");
      setNewParticipantName("");
      setParticipantDialogOpen(false);
    } catch (error) {
      setParticipantActionError(error instanceof Error ? error.message : String(error));
      setParticipantActionMessage("");
    }
  };

  const openRemoveParticipantDialog = (participant) => {
    if (!participant || !participant.id) return;
    setRemoveDialogParticipant(participant);
    setRemoveInProgress(false);
    setParticipantActionError("");
  };

  const closeRemoveParticipantDialog = () => {
    setRemoveDialogParticipant(null);
    setRemoveInProgress(false);
  };

  const confirmRemoveParticipant = async () => {
    if (!removeDialogParticipant) return;
    const targetParticipant = removeDialogParticipant;
    setRemoveInProgress(true);
    try {
      await handleRemoveParticipant(targetParticipant.id, targetParticipant.name);
      closeRemoveParticipantDialog();
    } catch (error) {
      console.error("[Scheduly] failed to remove participant", error);
      setParticipantActionError(
        error instanceof Error ? error.message : "参加者の削除に失敗しました。しばらく待ってから再度お試しください。"
      );
      setParticipantActionMessage("");
    } finally {
      setRemoveInProgress(false);
    }
  };

  const openRenameParticipantDialog = (participantSummary) => {
    if (!participantSummary || !participantSummary.id) return;
    setRenameDialogParticipant(participantSummary);
    setRenameName(participantSummary.name || "");
    setRenameError("");
    setRenameInProgress(false);
  };

  const closeRenameParticipantDialog = () => {
    if (renameInProgress) return;
    setRenameDialogParticipant(null);
    setRenameName("");
    setRenameError("");
    setRenameInProgress(false);
  };

  const confirmRenameParticipant = async () => {
    if (!renameDialogParticipant || !renameDialogParticipant.id) return;
    const trimmed = renameName.trim();
    if (!trimmed) {
      setRenameError("参加者名を入力してください");
      return;
    }
    if (!projectId) {
      setRenameError("プロジェクトの読み込み中です。少し待ってから再度お試しください。");
      return;
    }
    setRenameInProgress(true);
    try {
      await participantService.updateParticipant(projectId, renameDialogParticipant.id, { displayName: trimmed });
      setParticipantActionMessage(`参加者\u300c${trimmed}\u300dの名前を変更しました`);
      setParticipantActionError("");
      closeRenameParticipantDialog();
    } catch (error) {
      console.error("[Scheduly] failed to rename participant", error);
      setRenameError(error instanceof Error ? error.message : "参加者名の変更に失敗しました。しばらく待ってから再度お試しください。");
    } finally {
      setRenameInProgress(false);
    }
  };

  const handleRemoveParticipant = async (participantId, displayName) => {
    const summaryName = displayName || "参加者";
    if (!projectId) {
      setParticipantActionError("プロジェクトの読み込み中です。少し待ってから再度お試しください。");
      setParticipantActionMessage("");
      return;
    }
    await participantService.removeParticipant(projectId, participantId);
    setParticipantActionMessage(`${summaryName}を削除しました`);
    setParticipantActionError("");
  };

  useEffect(() => {
    if (!participantActionMessage && !participantActionError) return undefined;
    const timer = window.setTimeout(() => {
      setParticipantActionMessage("");
      setParticipantActionError("");
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [participantActionMessage, participantActionError]);

  if (routeError) {
    return (
      <ErrorScreen
        title={routeError.title}
        description={routeError.description}
      />
    );
  }

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
            {snapshotBannerVisible && <div className={snapshotBannerClasses}>{snapshotStatus.message}</div>}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
              onClick={() => {
                setParticipantDialogOpen(true);
                setParticipantActionError("");
              }}
            >
              <span aria-hidden="true">＋</span>
              <span>参加者を新規登録</span>
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:border-zinc-300 hover:text-zinc-800"
              onClick={() => {
                setManagementDialogOpen(true);
              }}
            >
              <span aria-hidden="true">🛠</span>
              <span>新規プロジェクト</span>
            </button>
          </div>
        </div>
      </header>

      <TabNavigation activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "schedule" && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-600">
            <span>日程ごとの回答サマリー</span>
            <InfoBadge
              ariaLabel="日程サマリーの説明"
              title="日程サマリー"
              message="各日程ごとの〇△×集計を確認できます。日程をタップすると回答状況の詳細を確認でき、必要があれば回答を変更する画面に進むことができます。"
            />
          </div>
          {loading && !schedules.length ? (
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 px-4 py-6 text-center text-xs text-emerald-600">
              日程データを読み込んでいます…
            </div>
          ) : schedules.length ? (
            schedules.map((schedule) => (
              <ScheduleSummary
                key={schedule.id}
                schedule={schedule}
                projectId={projectId}
                inlineEditorTarget={inlineEditorTarget}
                onToggleInlineEdit={toggleInlineEditor}
              />
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
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-600">
            <span>参加者ごとの回答サマリー</span>
            <InfoBadge
              ariaLabel="参加者サマリーの説明"
              title="参加者サマリー"
              message="参加者ごとの回答状況を一覧できます。カードを開いて個別の参加者の回答やコメントを確認し、必要に応じて回答の変更画面に移動できます。"
            />
          </div>
          {(participantActionMessage || participantActionError) && (
            <div
              className={`rounded-xl border px-3 py-2 text-xs ${
                participantActionError
                  ? "border-rose-200 bg-rose-50 text-rose-600"
                  : "border-emerald-200 bg-emerald-50 text-emerald-600"
              }`}
            >
              {participantActionError || participantActionMessage}
            </div>
          )}
          <div className="space-y-3">
            {participantSummaries.length ? (
              participantSummaries.map((participant) => (
                <ParticipantSummary
                  key={participant.id}
                  participant={participant}
                  scheduleLookup={scheduleLookup}
                  onRemove={() => openRemoveParticipantDialog(participant)}
                  onRename={() => openRenameParticipantDialog(participant)}
                  canRemove={participantSummaries.length > 1}
                  projectId={projectId}
                inlineEditorTarget={inlineEditorTarget}
                onToggleInlineEdit={toggleInlineEditor}
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
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <span>回答全体のアクション</span>
            <InfoBadge
              ariaLabel="回答アクションの説明"
              title="回答全体の操作"
              message="全日程の ICS 出力や回答一覧のエクスポートができます。"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-zinc-200 px-3 py-2 text-xs text-emerald-600 hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleDownloadAllIcs}
              disabled={!hasIcsData}
            >
              日程をICSに一括エクスポート
            </button>
            <button
              type="button"
              className="rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-500 hover:border-zinc-300"
              onClick={handleDownloadAllExcel}
            >
              全回答を Excelブックでダウンロード
            </button>
            {/* TODO: サマリーをコピー機能は仕様検討中のため一時的に非表示 */}
          </div>
        </div>
      </section>

      {participantDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
          onClick={() => setParticipantDialogOpen(false)}
        >
          <div
            className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="参加者を追加"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-800">参加者を追加</h2>
              <button className="text-xs text-zinc-500" onClick={() => setParticipantDialogOpen(false)}>
                閉じる
              </button>
            </div>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                handleAddParticipant();
              }}
            >
              <label className="block text-xs text-zinc-500">
                参加者名
                <input
                  type="text"
                  value={newParticipantName}
                  onChange={(event) => {
                    setNewParticipantName(event.target.value);
                    if (participantActionError) setParticipantActionError("");
                  }}
                  placeholder="例: 新規参加者"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  autoFocus
                />
              </label>
              {participantActionError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
                  {participantActionError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:border-zinc-300"
                  onClick={() => {
                    setParticipantDialogOpen(false);
                    setParticipantActionError("");
                  }}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  追加
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <TypeConfirmationDialog
        open={managementDialogOpen}
        title="新規プロジェクトを作成"
        description={
          <p className="text-xs text-zinc-500">
            新しい管理画面（空のプロジェクト）を開きます。参加者用URLは引き継がれません。続行するには{" "}
            <span className="font-mono text-zinc-700">{MANAGEMENT_CONFIRM_WORD}</span> と入力してください。
          </p>
        }
        confirmWord={MANAGEMENT_CONFIRM_WORD}
        confirmLabel="開く"
        confirmKind="primary"
        pending={false}
        onClose={closeManagementDialog}
        onConfirm={handleManagementConfirm}
      />

      <TypeConfirmationDialog
        open={Boolean(removeDialogParticipant)}
        title="参加者を削除"
        description={
          <p className="text-xs text-zinc-500">
            参加者{" "}
            <span className="font-semibold text-zinc-700">{removeDialogParticipant?.name || "参加者"}</span>
            を削除します。確認のため <span className="font-mono text-zinc-700">DELETE</span> と入力してください。
          </p>
        }
        confirmWord="DELETE"
        confirmLabel={removeInProgress ? "削除中…" : "削除"}
        confirmKind="danger"
        pending={removeInProgress}
        onClose={closeRemoveParticipantDialog}
        onConfirm={confirmRemoveParticipant}
      />
      {renameDialogParticipant && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
          onClick={closeRenameParticipantDialog}
        >
          <div
            className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-label="参加者名を変更"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-800">参加者名を変更</h2>
              <button className="text-xs text-zinc-500" onClick={closeRenameParticipantDialog} disabled={renameInProgress}>
                閉じる
              </button>
            </div>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                confirmRenameParticipant();
              }}
            >
              <p className="text-xs text-zinc-500">
                <span className="font-semibold text-zinc-700">{renameDialogParticipant.name || "参加者"}</span>
                の表示名を変更します。
              </p>
              <label className="block text-xs text-zinc-500">
                新しい参加者名
                {(() => {
                  const NAME_MAX = 80;
                  const over = (renameName || "").length > NAME_MAX;
                  const className = `mt-1 w-full rounded-lg border px-3 py-2 text-sm ${
                    over || renameError ? "border-rose-300 focus:border-rose-400" : "border-zinc-200"
                  }`;
                  return (
                    <>
                      <input
                        type="text"
                        value={renameName}
                        onChange={(event) => {
                          setRenameName(event.target.value);
                          if (renameError) setRenameError("");
                        }}
                        placeholder="参加者名"
                        className={className}
                        autoFocus
                        autoComplete="off"
                        disabled={renameInProgress}
                      />
                      <div className="mt-1 text-right text-[11px]">
                        <span className={`${over || renameError ? "text-rose-600" : "text-zinc-400"}`}>
                          {(renameName || "").length}/{NAME_MAX}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </label>
              {renameError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">{renameError}</div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:border-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={closeRenameParticipantDialog}
                  disabled={renameInProgress}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={renameInProgress || !renameName.trim()}
                >
                  {renameInProgress ? "保存中…" : "更新"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-8 flex justify-center px-4">
          <div className="pointer-events-auto rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm text-emerald-700 shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

ScheduleSummary.displayName = "ScheduleSummary";
ParticipantSummary.displayName = "ParticipantSummary";
TabNavigation.displayName = "TabNavigation";
AdminResponsesApp.displayName = "AdminResponsesApp";

const container = document.getElementById("root");
if (!container) throw new Error("Root element not found");
const root = ReactDOM.createRoot(container);
root.render(<AdminResponsesApp />);
export default AdminResponsesApp;
// Long-press handlers factory (no React hooks; safe to call anywhere)
function createLongPressHandlers(onTrigger, delayMs = 500) {
  let timerId = null;
  const start = (event) => {
    if (event && event.button === 2) return; // ignore right-click
    if (timerId) window.clearTimeout(timerId);
    timerId = window.setTimeout(() => {
      timerId = null;
      try {
        onTrigger?.();
      } catch (e) {
        console.warn("long-press handler failed", e);
      }
    }, delayMs);
  };
  const cancel = () => {
    if (timerId) {
      window.clearTimeout(timerId);
      timerId = null;
    }
  };
  return {
    onPointerDown: start,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel
  };
}
