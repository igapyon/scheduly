// Copyright (c) Toshiki Iga. All Rights Reserved.

import { useEffect, useState, useId, useRef, Fragment } from "react";
import ReactDOM from "react-dom/client";

import sharedIcalUtils from "./shared/ical-utils";
import projectService from "./services/project-service";
import scheduleService from "./services/schedule-service";
import shareService from "./services/share-service";
import EventMeta from "./shared/EventMeta.jsx";
import InfoBadge from "./shared/InfoBadge.jsx";
import { formatDateTimeRangeLabel } from "./shared/date-utils";
import { ensureDemoProjectData } from "./shared/demo-data";
import { ClipboardIcon, CheckIcon } from "@heroicons/react/24/outline";

const { DEFAULT_TZID, ensureICAL } = sharedIcalUtils;

void Fragment;
void EventMeta;
void InfoBadge;
void ClipboardIcon;
void CheckIcon;

const {
  addCandidate: addScheduleCandidate,
  updateCandidate: updateScheduleCandidate,
  removeCandidate: removeScheduleCandidate,
  exportAllCandidatesToIcs,
  exportCandidateToIcs,
  createCandidateFromVevent: mapVeventToCandidate,
  replaceCandidatesFromImport
} = scheduleService;

const ICAL_LINE_BREAK = "\r\n";
const ICAL_HEADER_LINES = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Scheduly//Mock//JA",
  "CALSCALE:GREGORIAN",
  "METHOD:PUBLISH"
];

const randomUUID = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
};

const generateSchedulyUid = () => `igapyon-scheduly-${randomUUID()}`;
const pad = (n) => String(n).padStart(2, "0");

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

function formatIcalStatusLabel(status) {
  const key = status ? String(status).toUpperCase() : "CONFIRMED";
  const label = ICAL_STATUS_LABELS[key] || key;
  return `${label}（${key}）`;
}

function icalStatusBadgeClass(status) {
  const key = status ? String(status).toUpperCase() : "CONFIRMED";
  return ICAL_STATUS_BADGE_CLASSES[key] || "border-zinc-200 bg-zinc-50 text-zinc-600";
}

const ensureString = (value) => (value === undefined || value === null ? "" : String(value));

const escapeICalText = (value) => {
  return ensureString(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
};

const formatUtcForICal = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hour = pad(date.getUTCHours());
  const minute = pad(date.getUTCMinutes());
  const second = pad(date.getUTCSeconds());
  return `${year}${month}${day}T${hour}${minute}${second}Z`;
};

const buildICalEventLines = (candidate, { dtstampLine, sequence }) => {
  const dtstartLine = formatUtcForICal(candidate.dtstart);
  const dtendLine = formatUtcForICal(candidate.dtend);
  const statusValue = (candidate.status ? String(candidate.status) : "CONFIRMED").toUpperCase();
  const tzidValue = (candidate.tzid && candidate.tzid.trim()) ? candidate.tzid.trim() : DEFAULT_TZID;

  const veventLines = [
    "BEGIN:VEVENT",
    "UID:" + (candidate.uid || generateSchedulyUid()),
    "SEQUENCE:" + sequence
  ];

  if (dtstampLine) veventLines.push("DTSTAMP:" + dtstampLine);
  if (dtstartLine) veventLines.push("DTSTART:" + dtstartLine);
  if (dtendLine) veventLines.push("DTEND:" + dtendLine);
  veventLines.push("STATUS:" + (statusValue || "CONFIRMED"));
  veventLines.push("SUMMARY:" + escapeICalText(candidate.summary || ""));
  veventLines.push("LOCATION:" + escapeICalText(candidate.location || ""));
  veventLines.push("DESCRIPTION:" + escapeICalText(candidate.description || ""));
  if (tzidValue) veventLines.push("X-SCHEDULY-TZID:" + escapeICalText(tzidValue));
  veventLines.push("END:VEVENT");
  return veventLines;
};

const joinICalLines = (lines) => lines.filter(Boolean).join(ICAL_LINE_BREAK) + ICAL_LINE_BREAK;

function SectionCard({ title, description, action, children, infoTitle, infoMessage, bodyClassName = "", containerClassName, titleClassName, iconClassName, headerBadge }) {
  const outerClass = containerClassName || "space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm";
  return (
    <section className={outerClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 min-w-0 basis-0 grow">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className={`flex min-w-0 items-center gap-2 text-sm font-semibold ${titleClassName || "text-zinc-700"}`}>
              <span aria-hidden="true" className={iconClassName}>{title.includes("日程") ? "🗓️" : "📝"}</span>
              <span className="break-words">{title}</span>
              {headerBadge ? <span className="shrink-0">{headerBadge}</span> : null}
            </h2>
            {infoMessage && (
              <InfoBadge ariaLabel={`${title} の説明`} title={infoTitle || title} message={infoMessage} />
            )}
          </div>
          {description && <p className="mt-1 break-words text-xs text-zinc-500">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
      </div>
      <div className={`space-y-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

function CandidateCard({ index, value, onChange, onRemove, onExport, disableRemove, isOpen = false, onToggleOpen, errors = {} }) {
  const open = Boolean(isOpen);
  const dialogTitleId = useId();
  const displayMeta = candidateToDisplayMeta(value);
  const ignoreNextClickRef = useRef(false);
  const SUMMARY_MAX = 120;
  const LOCATION_MAX = 120;
  const DESCRIPTION_MAX = 2000;

  const handleToggle = () => {};
  const handleSummaryClick = () => {
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      return;
    }
    if (typeof onToggleOpen === 'function') onToggleOpen();
  };

  return (
    <details className="rounded-2xl border border-zinc-200 bg-white shadow-sm" open={open} onToggle={handleToggle}>
      <summary
        className={`flex list-none cursor-pointer flex-col gap-3 rounded-2xl px-5 py-4 transition sm:flex-row sm:items-center sm:justify-between ${open ? "bg-emerald-50/60" : "bg-white"}`}
        onClick={(event) => {
          event.preventDefault();
          handleSummaryClick();
        }}
      >
        <div
          className="flex min-w-0 flex-col gap-2"
          {...(!open
            ? createLongPressHandlers(() => {
                ignoreNextClickRef.current = true;
                if (typeof onToggleOpen === 'function') onToggleOpen();
              }, 500)
            : {})}
        >
          <div className="flex items-center gap-2 text-xs">
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${icalStatusBadgeClass(value.status)}`}>
              {formatIcalStatusLabel(value.status || "CONFIRMED")}
            </span>
          </div>
          <EventMeta
            summary={value.summary || "タイトル未設定"}
            summaryClassName="min-w-0 break-words text-sm font-semibold text-zinc-800"
            dateTime={displayMeta}
            dateTimeClassName="flex flex-wrap items-center gap-1 text-xs text-zinc-500"
            timezone={value.tzid || DEFAULT_TZID}
            timezoneClassName="text-xs text-zinc-400"
            description={value.description}
            descriptionClassName={`text-xs text-zinc-500 ${open ? "break-words" : "whitespace-nowrap truncate max-w-[48ch]"}`}
            descriptionTitle={open ? undefined : (value.description || "")}
            location={value.location}
            locationClassName={`flex items-center gap-1 text-xs text-zinc-500 ${open ? "break-words" : "whitespace-nowrap truncate max-w-[40ch]"}`}
            locationTitle={open ? undefined : (value.location || "")}
            showLocationIcon
            statusText={null}
            statusPrefix=""
          />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-600 hover:border-emerald-300 hover:text-emerald-700"
            onClick={(event) => {
              event.preventDefault();
              onExport();
            }}
          >
            <span aria-hidden="true">📅</span> ICS
          </button>
        </div>
      </summary>

      <div className={`space-y-4 px-5 py-5 ${open ? "rounded-b-2xl border border-emerald-200 bg-emerald-50/60" : "border-t border-zinc-200"}`}>
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-zinc-500">タイトル（SUMMARY）</span>
            <input
              type="text"
              value={value.summary}
              onChange={(e) => onChange({ ...value, summary: e.target.value })}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${errors.summary ? "border-rose-300 focus:border-rose-400" : "border-zinc-200"}`}
              aria-invalid={errors.summary ? "true" : undefined}
              placeholder="例: 秋の合宿 調整会議 Day1"
            />
            <div className="mt-1 text-right text-[11px]">
              <span className={`${(value.summary || "").length > SUMMARY_MAX || errors.summary ? "text-rose-600" : "text-zinc-400"}`}>
                {(value.summary || "").length}/{SUMMARY_MAX}
              </span>
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-zinc-500">ステータス（STATUS）</span>
            <select
              value={value.status}
              onChange={(e) => onChange({ ...value, status: e.target.value })}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${errors.status ? "border-rose-300 focus:border-rose-400" : "border-zinc-200"}`}
              aria-invalid={errors.status ? "true" : undefined}
            >
              <option value="CONFIRMED">確定（CONFIRMED）</option>
              <option value="TENTATIVE">仮予定（TENTATIVE）</option>
              <option value="CANCELLED">取消し（CANCELLED）</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-zinc-500">開始日時（DTSTART）</span>
            <input
              type="datetime-local"
              value={value.dtstart}
              onChange={(e) => onChange({ ...value, dtstart: e.target.value })}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${errors.dtstart ? "border-rose-300 focus:border-rose-400" : "border-zinc-200"}`}
              aria-invalid={errors.dtstart ? "true" : undefined}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-zinc-500">終了日時（DTEND）</span>
            <input
              type="datetime-local"
              value={value.dtend}
              onChange={(e) => onChange({ ...value, dtend: e.target.value })}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${errors.dtend ? "border-rose-300 focus:border-rose-400" : "border-zinc-200"}`}
              aria-invalid={errors.dtend ? "true" : undefined}
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-zinc-500">タイムゾーン（TZID）</span>
            <select
              value={value.tzid}
              onChange={(e) => onChange({ ...value, tzid: e.target.value })}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${errors.tzid ? "border-rose-300 focus:border-rose-400" : "border-zinc-200"}`}
              aria-invalid={errors.tzid ? "true" : undefined}
            >
              {["Asia/Tokyo", "UTC", "Asia/Seoul", "Europe/London", "America/Los_Angeles"].map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-zinc-500">場所（LOCATION）</span>
            <input
              type="text"
              value={value.location}
              onChange={(e) => onChange({ ...value, location: e.target.value })}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${errors.location ? "border-rose-300 focus:border-rose-400" : "border-zinc-200"}`}
              aria-invalid={errors.location ? "true" : undefined}
              placeholder="例: サントリーホール 大ホール"
            />
            <div className="mt-1 text-right text-[11px]">
              <span className={`${(value.location || "").length > LOCATION_MAX || errors.location ? "text-rose-600" : "text-zinc-400"}`}>
                {(value.location || "").length}/{LOCATION_MAX}
              </span>
            </div>
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-semibold text-zinc-500">説明（DESCRIPTION）</span>
          <textarea
            value={value.description}
            onChange={(e) => onChange({ ...value, description: e.target.value })}
            rows={3}
            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${errors.description ? "border-rose-300 focus:border-rose-400" : "border-zinc-200"}`}
            aria-invalid={errors.description ? "true" : undefined}
            placeholder="補足情報を入力"
          />
          <div className="mt-1 text-right text-[11px]">
            <span className={`${(value.description || "").length > DESCRIPTION_MAX || errors.description ? "text-rose-600" : "text-zinc-400"}`}>
              {(value.description || "").length}/{DESCRIPTION_MAX}
            </span>
          </div>
        </label>

        <div className="flex justify-end">
          <button
            type="button"
            className="h-10 rounded-lg border border-zinc-200 px-4 text-xs font-semibold text-rose-500 hover:border-rose-400 disabled:opacity-40"
            onClick={onRemove}
            disabled={disableRemove}
          >
            日程を削除
          </button>
        </div>

      </div>

      {/* Hidden UID for diagnostics/export: not visible, remains in DOM */}
      <div className="hidden" aria-hidden="true" data-uid={value?.uid || ""}>{value?.uid || ""}</div>
    </details>
  );
}


function CandidateMetaTable({ candidate }) {
  if (!candidate) return null;

  const dtstampDisplay = candidate.dtstamp || "";
  const sequenceDisplay = typeof candidate.sequence === "number" ? String(candidate.sequence) : "";
  const tzidDisplay = candidate.tzid || DEFAULT_TZID;
  const statusDisplay = candidate.status || "CONFIRMED";
  const uidDisplay = candidate.uid || "";
  const dtstampLine = candidate.dtstamp ? formatUtcForICal(candidate.dtstamp) : "";
  const sequenceForPreview = typeof candidate.sequence === "number" ? candidate.sequence : 0;
  const previewLines = [
    ...ICAL_HEADER_LINES,
    ...buildICalEventLines(candidate, { dtstampLine, sequence: sequenceForPreview }),
    "END:VCALENDAR"
  ];
  const previewText = joinICalLines(previewLines);

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
      <div className="font-semibold text-zinc-700">ICS メタ情報</div>
      <KeyValueList
        items={[
          { key: "UID", value: uidDisplay },
          { key: "DTSTAMP", value: dtstampDisplay },
          { key: "TZID", value: tzidDisplay },
          { key: "SEQUENCE", value: sequenceDisplay },
          { key: "STATUS", value: statusDisplay }
        ]}
      />
      <div>
        <div className="mb-2 font-semibold text-zinc-700">生成されるICSプレビュー</div>
        <pre className="max-h-60 overflow-auto rounded-lg border border-zinc-200 bg-white p-3 text-[11px] leading-relaxed text-zinc-700 whitespace-pre">
          {previewText}
        </pre>
      </div>
    </div>
  );
}

function KeyValueList({ items }) {
  return (
    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[auto,1fr]">
      {items.map(({ key, value }, idx) => (
        <Fragment key={idx}>
          <dt className="text-xs font-semibold text-zinc-500">{key}</dt>
          <dd className="break-words text-sm text-zinc-800">{value || <span className="text-zinc-400">—</span>}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function formatLocalDisplay(value) {
  if (!value) return "未設定";
  if (value.indexOf("T") === -1) return value;
  return value.replace("T", " ");
}

function candidateToDisplayMeta(candidate) {
  return formatDateTimeRangeLabel(candidate.dtstart, candidate.dtend, candidate.tzid || DEFAULT_TZID);
}

const SHARE_LINK_PLACEHOLDER = "–– 未発行 ––";

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const resolveDefaultBaseUrl = () => {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "https://scheduly.app";
};

const deriveBaseUrlFromAdminEntry = (entry) => {
  if (!entry || !isNonEmptyString(entry.url)) return null;
  const match = entry.url.match(/^(.*)\/a\/[^/]+$/);
  if (match && match[1]) {
    return match[1];
  }
  try {
    const parsed = new URL(entry.url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.origin;
  } catch (error) {
    console.warn("[Scheduly][admin] Failed to derive base URL from admin entry", error);
    return null;
  }
};

const formatShareUrlDisplay = (entry) => {
  if (!entry || !isNonEmptyString(entry.url) || shareService.isPlaceholderToken(entry.token)) {
    return SHARE_LINK_PLACEHOLDER;
  }
  return entry.url;
};

const formatShareIssuedAtDisplay = (entry) => {
  if (!entry || !isNonEmptyString(entry.issuedAt) || shareService.isPlaceholderToken(entry.token)) {
    return SHARE_LINK_PLACEHOLDER;
  }
  const date = new Date(entry.issuedAt);
  if (Number.isNaN(date.getTime())) {
    return entry.issuedAt;
  }
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(date);
};

function OrganizerApp() {
  const [projectId, setProjectId] = useState(null);
  const [routeContext, setRouteContext] = useState(null);
  const [initialRouteContext, setInitialRouteContext] = useState(null);
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [shareTokens, setShareTokens] = useState({});
  const [baseUrl, setBaseUrl] = useState(() => resolveDefaultBaseUrl());
  const baseUrlTouchedRef = useRef(false);
  const [navigateAfterGenerate, setNavigateAfterGenerate] = useState(false);
  const [toast, setToast] = useState("");
  const importInputRef = useRef(null);
  const projectImportInputRef = useRef(null);
  const [importPreview, setImportPreview] = useState(null);
  const autoIssueHandledRef = useRef(false);
  const [projectDeleteDialogOpen, setProjectDeleteDialogOpen] = useState(false);
  const [projectDeleteConfirm, setProjectDeleteConfirm] = useState("");
  const [projectDeleteInProgress, setProjectDeleteInProgress] = useState(false);
  const [candidateDeleteDialog, setCandidateDeleteDialog] = useState(null);
  const [candidateDeleteConfirm, setCandidateDeleteConfirm] = useState("");
  const [candidateDeleteInProgress, setCandidateDeleteInProgress] = useState(false);
  const [openCandidateId, setOpenCandidateId] = useState(null);
  const [candidateErrors, setCandidateErrors] = useState(() => ({}));
  const [metaErrors, setMetaErrors] = useState(() => ({ name: false, description: false }));
  const metaWarnedRef = useRef({ name: false, description: false });

  // 横スクロール抑止のグローバル適用は不要になったため削除

  const isAdminShareMiss = routeContext?.kind === "share-miss" && routeContext?.shareType === "admin";

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = null;

    const bootstrap = async () => {
      const resolved = projectService.resolveProjectFromLocation();
      if (cancelled) {
        return;
      }

      setProjectId(resolved.projectId);
      setRouteContext(resolved.routeContext);
      setInitialRouteContext(resolved.routeContext);
      const state = resolved.state || {};
      setSummary(state.project?.name || "");
      setDescription(state.project?.description || "");
      setCandidates(state.candidates || []);

      const tokens = shareService.get(resolved.projectId);
      setShareTokens(tokens);
      const derivedBaseUrl = deriveBaseUrlFromAdminEntry(tokens.admin) ?? resolveDefaultBaseUrl();
      baseUrlTouchedRef.current = false;
      setBaseUrl(derivedBaseUrl);

      try {
        await ensureDemoProjectData(resolved.projectId);
      } catch (error) {
        console.warn("[Scheduly] demo data load failed; proceeding with empty state", error);
      } finally {
        if (!cancelled) {
          setInitialDataLoaded(true);
        }
      }

      unsubscribe = projectService.subscribe(resolved.projectId, (nextState) => {
        if (cancelled || !nextState) return;
        setSummary(nextState.project?.name || "");
        setDescription(nextState.project?.description || "");
        setCandidates(nextState.candidates || []);
        // 開いているIDは維持。自動で開かない（すべて閉じた状態を許可）。
        setShareTokens(shareService.get(resolved.projectId));
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
  }, []);

  useEffect(() => {
    if (!projectId) return;
    projectService.updateMeta(projectId, { name: summary, description });
  }, [projectId, summary, description]);

  // Project meta live validation (length) with visual cues and one-shot toast
  useEffect(() => {
    const NAME_MAX = 120;
    const DESC_MAX = 2000;
    const overName = (summary || "").length > NAME_MAX;
    const overDesc = (description || "").length > DESC_MAX;
    setMetaErrors((prev) =>
      prev.name !== overName || prev.description !== overDesc
        ? { name: overName, description: overDesc }
        : prev
    );
    if (overName && !metaWarnedRef.current.name) {
      metaWarnedRef.current.name = true;
      popToast(`プロジェクト名は ${NAME_MAX} 文字以内で入力してください`);
    }
    if (!overName && metaWarnedRef.current.name) {
      metaWarnedRef.current.name = false;
    }
    if (overDesc && !metaWarnedRef.current.description) {
      metaWarnedRef.current.description = true;
      popToast(`説明は ${DESC_MAX} 文字以内で入力してください`);
    }
    if (!overDesc && metaWarnedRef.current.description) {
      metaWarnedRef.current.description = false;
    }
  }, [summary, description]);

  useEffect(() => {
    if (baseUrlTouchedRef.current) return;
    const derived = deriveBaseUrlFromAdminEntry(shareTokens?.admin);
    if (derived) {
      baseUrlTouchedRef.current = false;
      setBaseUrl(derived);
    }
  }, [shareTokens]);

  const downloadTextFile = (filename, text, mimeType = "text/plain;charset=utf-8") => {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 0);
  };

  const updateCandidate = (id, next) => {
    if (!projectId) return;
    try {
      updateScheduleCandidate(projectId, id, next);
      // clear errors for this candidate on success
      setCandidateErrors((prev) => ({ ...prev, [id]: {} }));
    } catch (error) {
      const msg = error && error.message ? String(error.message) : "日程の更新に失敗しました";
      const isValidation = error && (error.code === 422 || /validation/i.test(String(error.message || "")));
      if (isValidation) {
        // Validation errors are expected during editing; avoid noisy error logs
        // but keep a lightweight trace for debugging when needed.
        console.debug("updateCandidate validation", msg);
      } else {
        console.error("updateCandidate error", error);
      }
      popToast(msg);
      // parse fields from message to highlight
      let fields = [];
      if (msg.includes(":")) {
        const after = msg.split(":").slice(1).join(":").trim();
        if (after.includes("must be after")) {
          fields = ["dtstart", "dtend"];
        } else {
          fields = after.split(/[,\s]+/).filter(Boolean);
        }
      }
      if (fields.length) {
        setCandidateErrors((prev) => {
          const current = prev[id] || {};
          const nextFlags = { ...current };
          fields.forEach((f) => {
            const key = String(f).toLowerCase();
            nextFlags[key] = true;
          });
          return { ...prev, [id]: nextFlags };
        });
      }
    }
  };

  const removeCandidate = (id) => {
    if (!projectId) return;
    removeScheduleCandidate(projectId, id);
  };

  const addCandidate = () => {
    if (!projectId) return;
    addScheduleCandidate(projectId);
    popToast("日程を追加しました");
  };

  const handleExportAllCandidates = () => {
    if (!projectId) {
      popToast("プロジェクトの読み込み中です。少し待ってください。");
      return;
    }
    if (!candidates.length) {
      popToast("ダウンロード対象の日程がありません");
      return;
    }
    try {
      const icsText = exportAllCandidatesToIcs(projectId);
      const filename = `scheduly-all-${new Date().toISOString().split("T")[0]}.ics`;
      downloadTextFile(filename, icsText, "text/calendar;charset=utf-8");
      popToast("全候補を ICS でダウンロードしました（モック）");
    } catch (error) {
      console.error("ICS bulk export error", error);
      popToast("全候補のICS生成に失敗しました: " + (error && error.message ? error.message : "不明なエラー"));
    }
  };

  const handleExportCandidate = (candidateId) => {
    if (!projectId) {
      popToast("プロジェクトの読み込み中です。少し待ってください。");
      return;
    }
    const target = candidates.find((item) => item.id === candidateId);
    if (!target) {
      popToast("候補が見つかりませんでした");
      return;
    }
    try {
      const exportResult = exportCandidateToIcs(projectId, candidateId);
      downloadTextFile(exportResult.filename, exportResult.icsText, "text/calendar;charset=utf-8");
      popToast(`${exportResult.filename} をダウンロードしました（モック）`);
    } catch (error) {
      console.error("ICS export error", error);
      popToast("ICSの生成に失敗しました: " + (error && error.message ? error.message : "不明なエラー"));
      return;
    }
  };

  const openCandidateDeleteDialog = (candidate) => {
    if (!candidate || !candidate.id) return;
    setCandidateDeleteDialog(candidate);
    setCandidateDeleteConfirm("");
    setCandidateDeleteInProgress(false);
  };

  const closeCandidateDeleteDialog = () => {
    if (candidateDeleteInProgress) return;
    setCandidateDeleteDialog(null);
    setCandidateDeleteConfirm("");
    setCandidateDeleteInProgress(false);
  };

  const confirmCandidateDelete = () => {
    if (!candidateDeleteDialog) return;
    if (candidateDeleteConfirm.trim() !== "DELETE") return;
    setCandidateDeleteInProgress(true);
    try {
      removeCandidate(candidateDeleteDialog.id);
      popToast(`日程「${candidateDeleteDialog.summary || candidateDeleteDialog.id}」を削除しました`);
      closeCandidateDeleteDialog();
    } catch (error) {
      console.error("Candidate removal failed", error);
      popToast("日程の削除に失敗しました。時間を置いて再度お試しください。");
    } finally {
      setCandidateDeleteInProgress(false);
    }
  };

  const openProjectDeleteDialog = () => {
    setProjectDeleteDialogOpen(true);
    setProjectDeleteConfirm("");
    setProjectDeleteInProgress(false);
  };

  const closeProjectDeleteDialog = () => {
    if (projectDeleteInProgress) return;
    setProjectDeleteDialogOpen(false);
    setProjectDeleteConfirm("");
    setProjectDeleteInProgress(false);
  };

  const handleDeleteProject = () => {
    if (!projectId) return;
    const fresh = projectService.reset(projectId);
    setSummary(fresh.project?.name || "");
    setDescription(fresh.project?.description || "");
    setCandidates(fresh.candidates || []);
    baseUrlTouchedRef.current = false;
    refreshShareTokensState({ resetWhenMissing: true });
    setRouteContext(projectService.getRouteContext());
    setImportPreview(null);
    setInitialDataLoaded(true);
    popToast("プロジェクトを削除し初期状態に戻しました");
  };

  const confirmProjectDelete = () => {
    if (projectDeleteConfirm.trim() !== "DELETE") return;
    setProjectDeleteInProgress(true);
    try {
      handleDeleteProject();
      closeProjectDeleteDialog();
    } finally {
      setProjectDeleteInProgress(false);
    }
  };

  const handleIcsImport = async (file) => {
    if (!projectId) {
      popToast("プロジェクトの読み込み中です。少し待ってから再度お試しください。");
      return;
    }
    const text = await file.text();
    let parsed;
    try {
      const ICAL = ensureICAL();
      parsed = ICAL.parse(text);
    } catch (error) {
      void error;
      popToast("ICSの解析に失敗しました");
      return;
    }
    const ICAL = ensureICAL();
    const component = new ICAL.Component(parsed);
    const vevents = component.getAllSubcomponents("vevent");
    if (!vevents.length) {
      popToast("VEVENTが見つかりませんでした");
      return;
    }

    const existingMap = new Map();
    for (let i = 0; i < candidates.length; i += 1) {
      existingMap.set(candidates[i].uid, { candidate: candidates[i], index: i });
    }

    const items = [];
    let skippedNoUid = 0;
    let skippedNoDtstamp = 0;

    for (let i = 0; i < vevents.length; i += 1) {
      const vevent = vevents[i];
      const event = new ICAL.Event(vevent);
      if (!event.uid) {
        skippedNoUid += 1;
        continue;
      }
      const dtstampProp = vevent.getFirstPropertyValue("dtstamp");
      if (!dtstampProp) {
        skippedNoDtstamp += 1;
        continue;
      }
      const candidate = mapVeventToCandidate(vevent);
      if (!candidate) {
        continue;
      }
      const existingInfo = existingMap.get(candidate.uid);
      let status = "new";
      let message = "新規追加";
      let existingDtstamp = null;
      let existingIndex = -1;
      if (existingInfo) {
        existingIndex = existingInfo.index;
        existingDtstamp = existingInfo.candidate.dtstamp || "";
        if (existingInfo.candidate.dtstamp && candidate.dtstamp <= existingInfo.candidate.dtstamp) {
          status = "older";
          message = "既存より古いバージョン";
        } else {
          status = "update";
          message = "既存候補を更新";
        }
      }
      items.push({
        uid: candidate.uid,
        summary: candidate.summary || "(タイトル未設定)",
        start: formatLocalDisplay(candidate.dtstart),
        end: formatLocalDisplay(candidate.dtend),
        candidate: candidate,
        status: status,
        message: message,
        selected: false,
        existingIndex: existingIndex,
        existingDtstamp: existingDtstamp,
        importedDtstamp: candidate.dtstamp
      });
    }

    if (!items.length) {
      const skippedTotal = skippedNoUid + skippedNoDtstamp;
      const detail = skippedTotal ? `（スキップ ${skippedTotal}件）` : "";
      popToast(`取り込める候補がありませんでした${detail}`);
      return;
    }

    setImportPreview({
      fileName: file.name || "ics",
      items: items,
      skippedNoUid: skippedNoUid,
      skippedNoDtstamp: skippedNoDtstamp
    });
    popToast(`ICSを読み込みました。${items.length}件の候補を確認してください。`);
  };

  const toggleImportPreviewItem = (uid) => {
    setImportPreview((prev) => {
      if (!prev) return prev;
      const nextItems = prev.items.map((item) => {
        if (item.uid !== uid) return item;
        return { ...item, selected: !item.selected };
      });
      return { ...prev, items: nextItems };
    });
  };

  const closeImportPreview = () => {
    setImportPreview(null);
  };

  const confirmImportPreview = () => {
    if (!importPreview) return;
    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = (importPreview.skippedNoUid || 0) + (importPreview.skippedNoDtstamp || 0);
    const selectedItems = importPreview.items.slice();
    const next = candidates.slice();
    selectedItems.forEach((item) => {
      if (!item.selected) {
        skippedCount += 1;
        return;
      }
      const imported = item.candidate;
      if (item.existingIndex >= 0 && item.existingIndex < next.length) {
        const existing = next[item.existingIndex];
        imported.id = existing.id;
        next[item.existingIndex] = imported;
        updatedCount += 1;
      } else {
        next.push(imported);
        addedCount += 1;
      }
    });
    replaceCandidatesFromImport(projectId, next);
    const parts = [];
    if (addedCount) parts.push("追加 " + addedCount + "件");
    if (updatedCount) parts.push("更新 " + updatedCount + "件");
    if (skippedCount) parts.push("スキップ " + skippedCount + "件");
    popToast("ICSの取り込みを反映しました（" + (parts.join(" / ") || "変更なし") + "）");
    setImportPreview(null);
  };

  const onIcsInputChange = async (event) => {
    const files = event.target.files;
    const file = files && files[0];
    if (file) {
      await handleIcsImport(file);
    }
    event.target.value = "";
  };

  const refreshShareTokensState = (options = {}) => {
    if (!projectId) return shareTokens;
    const tokens = shareService.get(projectId);
    setShareTokens(tokens);
    const derived = deriveBaseUrlFromAdminEntry(tokens.admin);
    if (derived && !baseUrlTouchedRef.current) {
      baseUrlTouchedRef.current = false;
      setBaseUrl(derived);
    } else if (options.resetWhenMissing && !baseUrlTouchedRef.current) {
      baseUrlTouchedRef.current = false;
      setBaseUrl(resolveDefaultBaseUrl());
    }
    return tokens;
  };

  const handleBaseUrlBlur = () => {
    setBaseUrl((prev) => {
      const value = typeof prev === "string" ? prev.trim() : "";
      return value.replace(/\/+$/, "");
    });
  };

  const popToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  };

  const copyTextToClipboard = async (value) => {
    if (!isNonEmptyString(value)) throw new Error("empty");
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(value);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const updateLocationToAdminUrl = (entry) => {
    if (!entry || !isNonEmptyString(entry.url)) return;
    if (typeof window === "undefined") return;
    try {
      const target = new URL(entry.url);
      const current = new URL(window.location.href);
      if (target.origin === current.origin) {
        window.history.replaceState(null, "", target.pathname + target.search + target.hash);
        const resolved = projectService.resolveProjectFromLocation();
        setProjectId(resolved.projectId);
        setRouteContext(resolved.routeContext);
      } else {
        window.location.assign(entry.url);
      }
    } catch (error) {
      console.warn("[Scheduly][admin] Failed to update location to admin URL", error);
      window.location.assign(entry.url);
    }
  };

  const handleShareLinkAction = () => {
    if (!projectId) {
      popToast("プロジェクトの読み込み中です。少し待ってください。");
      return;
    }
    const hasIssued = hasIssuedShareTokens;
    if (hasIssued) {
      const confirmed = window.confirm("共有URLを再発行します。以前のリンクは無効になります。続行しますか？");
      if (!confirmed) return;
    }
    try {
      const action = hasIssued ? shareService.rotate : shareService.generate;
      const result = action(projectId, { baseUrl, navigateToAdminUrl: navigateAfterGenerate });
      refreshShareTokensState({ resetWhenMissing: true });
      setRouteContext(projectService.getRouteContext());
      const notices = [];
      if (hasIssued) {
        notices.push("以前のリンクは無効です");
      }
      if (result.navigation?.attempted && result.navigation.blocked) {
        notices.push("管理者URLへの自動遷移はブロックされました");
      }
      const baseMessage = hasIssued ? "共有URLを再発行しました" : "共有URLを発行しました";
      const message = notices.length ? `${baseMessage}（${notices.join("／")}）` : baseMessage;
      popToast(message);
    } catch (error) {
      console.error("Share link generation error", error);
      popToast("共有URLの生成に失敗しました");
    }
  };

  const handleCopyShareUrl = async (type) => {
    const targetEntry = type === "admin" ? adminShareEntry : participantShareEntry;
    const canCopy = type === "admin" ? canCopyAdminUrl : canCopyParticipantUrl;
    if (!targetEntry || !canCopy) {
      popToast("コピーできるURLがありません");
      return;
    }
    try {
      await copyTextToClipboard(targetEntry.url);
      popToast("URLをコピーしました");
      setCopied((prev) => ({ ...prev, [type]: true }));
      try {
        if (copiedTimersRef.current[type]) clearTimeout(copiedTimersRef.current[type]);
      } catch (_) {}
      copiedTimersRef.current[type] = setTimeout(() => {
        setCopied((prev) => ({ ...prev, [type]: false }));
        copiedTimersRef.current[type] = null;
      }, 1800);
    } catch (error) {
      console.error("Copy share URL error", error);
      popToast("URLのコピーに失敗しました");
    }
  };

  useEffect(() => {
    if (!projectId) return;
    if (autoIssueHandledRef.current) return;
    const adminEntry = shareTokens?.admin || null;
    const hasValidAdminToken =
      adminEntry && !shareService.isPlaceholderToken(adminEntry.token) && isNonEmptyString(adminEntry.token);

    if (initialRouteContext && initialRouteContext.kind === "share" && initialRouteContext.shareType === "admin") {
      autoIssueHandledRef.current = true;
      return;
    }

    if (hasValidAdminToken) {
      updateLocationToAdminUrl(adminEntry);
      autoIssueHandledRef.current = true;
      return;
    }

    try {
      const result = shareService.generate(projectId, { baseUrl, navigateToAdminUrl: false });
      const tokens = refreshShareTokensState({ resetWhenMissing: true });
      const nextAdmin = tokens.admin || result.admin;
      updateLocationToAdminUrl(nextAdmin);
      popToast("共有URLを発行しました。コピーしてください");
    } catch (error) {
      console.error("Auto issue share URLs failed", error);
    } finally {
      autoIssueHandledRef.current = true;
    }
  }, [projectId, baseUrl, shareTokens, initialRouteContext]);

  const handleExportProjectInfo = () => {
    if (!projectId) {
      popToast("プロジェクトの読み込み中です。少し待ってください。");
      return;
    }
    try {
      const exportData = projectService.exportState(projectId);
      const serialized = JSON.stringify(exportData, null, 2);
      const filename = `scheduly-project-${projectId}-${new Date().toISOString().split("T")[0]}.json`;
      downloadTextFile(filename, serialized, "application/json;charset=utf-8");
      popToast("プロジェクト情報をエクスポートしました");
    } catch (error) {
      console.error("Project export error", error);
      popToast("プロジェクト情報のエクスポートに失敗しました");
    }
  };

  const handleProjectImportFromFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!projectId) {
      popToast("プロジェクトの読み込み中です。少し待ってから再度お試しください。");
      event.target.value = "";
      return;
    }
    try {
      const confirmed = window.confirm("現在のプロジェクトを置き換えます。よろしいですか？");
      if (!confirmed) {
        event.target.value = "";
        return;
      }
      const text = await file.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (parseError) {
        throw new Error(
          "JSON の解析に失敗しました: " +
            (parseError instanceof Error ? parseError.message : String(parseError))
        );
      }
      projectService.importState(projectId, parsed);
      const snapshot = projectService.getState(projectId);
      setSummary(snapshot.project?.name || "");
      setDescription(snapshot.project?.description || "");
      setCandidates(snapshot.candidates || []);
      baseUrlTouchedRef.current = false;
      refreshShareTokensState({ resetWhenMissing: true });
      setRouteContext(projectService.getRouteContext());
      setImportPreview(null);
      setInitialDataLoaded(true);
      popToast("プロジェクト情報をインポートしました");
    } catch (error) {
      console.error("Project import error", error);
      popToast("プロジェクト情報のインポートに失敗しました: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      event.target.value = "";
    }
  };

  const handleProjectImportFromDemo = async () => {
    if (!projectId) {
      popToast("プロジェクトの読み込み中です。少し待ってから再度お試しください。");
      return;
    }
    try {
      const confirmed = window.confirm("現在のプロジェクトをデモ用データで置き換えます。よろしいですか？");
      if (!confirmed) return;
      const res = await fetch("/proj/scheduly-project-sampledata-001.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = await res.json();
      projectService.importState(projectId, parsed);
      const snapshot = projectService.getState(projectId);
      setSummary(snapshot.project?.name || "");
      setDescription(snapshot.project?.description || "");
      setCandidates(snapshot.candidates || []);
      baseUrlTouchedRef.current = false;
      refreshShareTokensState({ resetWhenMissing: true });
      setRouteContext(projectService.getRouteContext());
      setImportPreview(null);
      setInitialDataLoaded(true);
      popToast("デモ用プロジェクトをインポートしました");
    } catch (error) {
      console.error("Demo project import error", error);
      popToast("デモ用プロジェクトのインポートに失敗しました: " + (error instanceof Error ? error.message : String(error)));
    }
  };


  const adminShareEntry = shareTokens?.admin || null;
  const participantShareEntry = shareTokens?.participant || null;
  const hasIssuedShareTokens =
    (adminShareEntry && !shareService.isPlaceholderToken(adminShareEntry.token)) ||
    (participantShareEntry && !shareService.isPlaceholderToken(participantShareEntry.token));
  const shareActionLabel = hasIssuedShareTokens ? "共有URLを再発行" : "共有URLを生成";
  const adminUrlDisplay = formatShareUrlDisplay(adminShareEntry);
  const participantUrlDisplay = formatShareUrlDisplay(participantShareEntry);
  const issuedAtDisplay = formatShareIssuedAtDisplay(adminShareEntry || participantShareEntry);
  const [copied, setCopied] = useState({ admin: false, participant: false });
  const copiedTimersRef = useRef({ admin: null, participant: null });
  const canCopyAdminUrl =
    adminShareEntry && !shareService.isPlaceholderToken(adminShareEntry.token) && isNonEmptyString(adminShareEntry.url);
  const canCopyParticipantUrl =
    participantShareEntry &&
    !shareService.isPlaceholderToken(participantShareEntry.token) &&
    isNonEmptyString(participantShareEntry.url);

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 px-4 py-6 text-zinc-900 sm:px-6">
      <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">Organizer Console</p>
            <h1 className="mt-1 flex min-w-0 items-center gap-2 text-2xl font-bold text-zinc-900">
              <span aria-hidden="true">🗂️</span>
              <span className="break-words">Scheduly 管理</span>
            </h1>
            <p className="mt-2 break-words text-sm text-zinc-600">
              日程を調整し参加者へ共有するための管理画面です。必要に応じて日程を編集し、ICS として取り込み・書き出しができます。
            </p>
            {isAdminShareMiss && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                指定された管理者用URLは無効になっています。新しい共有URLを再発行すると、正しいリンクを参加者と共有できます。
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
              type="button"
              onClick={() => {
                const entry = shareTokens?.participant;
                if (entry && entry.url && !shareService.isPlaceholderToken(entry.token)) {
                  try {
                    const u = new URL(entry.url, window.location.origin);
                    if (u.origin === window.location.origin) {
                      window.location.assign(u.pathname + u.search + u.hash);
                    } else {
                      window.open(entry.url, "_blank");
                    }
                  } catch (error) {
                    void error;
                    window.open(entry.url, "_blank");
                  }
                } else {
                  const result = shareService.generate(projectId, { baseUrl, navigateToAdminUrl: false });
                  const tokens = refreshShareTokensState({ resetWhenMissing: true });
                  const next = tokens.participant || result.participant;
                  if (next && next.url) {
                    window.location.assign(new URL(next.url, window.location.origin).pathname);
                    popToast("参加者URLを発行して開きました");
                  } else {
                    popToast("参加者URLを開けませんでした");
                  }
                }
              }}
              className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-600 hover:border-emerald-300 hover:text-emerald-700"
            >
              参加者画面を開く
            </button>
          </div>
        </div>
      </header>

      <div className="grid flex-1 gap-5">

        <main className="space-y-5" style={{ contain: "inline-size" }}>
          <SectionCard
            title="共有URL"
            description="管理者リンクと参加者へ共有するリンクを設定および確認します。Schedulyでは管理者リンクは大切なものですので、管理者の方は管理者リンクを確実に保管してください。"
            infoMessage="Scheduly の重要な情報である管理者URL・参加者URLを操作します。特に管理者URLは紛失しないように注意して保管するようにしてください。参加者URLはコピーして必要な人にのみ共有してください。"
            containerClassName="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm"
            titleClassName="text-amber-700"
            iconClassName="text-amber-600"
            headerBadge={<span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">重要</span>}
            action={
              <button
                type="button"
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:border-emerald-300"
                onClick={handleShareLinkAction}
              >
                {shareActionLabel}
              </button>
            }
          >
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-zinc-500">基準URL</span>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(event) => {
                    baseUrlTouchedRef.current = true;
                    setBaseUrl(event.target.value);
                  }}
                  onBlur={handleBaseUrlBlur}
                  placeholder="https://scheduly.app"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                  checked={navigateAfterGenerate}
                  onChange={(event) => setNavigateAfterGenerate(event.target.checked)}
                />
                発行後に管理者URLを開く
              </label>
            </div>
            <div className="space-y-3">
              <div>
                <span className="text-xs font-semibold text-zinc-500">管理者URL</span>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className="flex-1 truncate text-sm text-zinc-800"
                    title={adminShareEntry?.url || ""}
                  >
                    {adminUrlDisplay}
                  </span>
                  <button
                    type="button"
                    className={`inline-flex shrink-0 items-center justify-center rounded-lg border p-1 disabled:cursor-not-allowed disabled:opacity-40 ${
                      copied.admin
                        ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                        : "border-zinc-200 bg-white text-zinc-500 hover:border-emerald-300 hover:text-emerald-600"
                    }`}
                    onClick={() => handleCopyShareUrl("admin")}
                    disabled={!canCopyAdminUrl}
                    title={copied.admin ? "コピーしました" : "コピー"}
                  >
                    {copied.admin ? (
                      <CheckIcon className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <ClipboardIcon className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
              <div>
                <span className="text-xs font-semibold text-zinc-500">参加者URL</span>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className="flex-1 truncate text-sm text-zinc-800"
                    title={participantShareEntry?.url || ""}
                  >
                    {participantUrlDisplay}
                  </span>
                  <button
                    type="button"
                    className={`inline-flex shrink-0 items-center justify-center rounded-lg border p-1 disabled:cursor-not-allowed disabled:opacity-40 ${
                      copied.participant
                        ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                        : "border-zinc-200 bg-white text-zinc-500 hover:border-emerald-300 hover:text-emerald-600"
                    }`}
                    onClick={() => handleCopyShareUrl("participant")}
                    disabled={!canCopyParticipantUrl}
                    title={copied.participant ? "コピーしました" : "コピー"}
                  >
                    {copied.participant ? (
                      <CheckIcon className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <ClipboardIcon className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
              <div>
                <span className="text-xs font-semibold text-zinc-500">最終更新</span>
                <div className="mt-1 break-words text-sm text-zinc-800">{issuedAtDisplay}</div>
              </div>
            </div>
            <p className="text-xs text-zinc-500">
              管理者URLを知っている人だけがプロジェクト内容を更新できます。参加者URLは参加者に共有します。必要に応じて基準URLを変更し、再発行してください。
            </p>
          </SectionCard>
          <SectionCard
            title="プロジェクト情報"
            description="プロジェクトの基本情報を編集します。"
            infoMessage="日程調整プロジェクトの情報を設定します。プロジェクトの目的を設定します。"
            bodyClassName="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 sm:p-4"
          >
            <label className="block">
              <span className="text-xs font-semibold text-zinc-500">プロジェクト名</span>
              <input
                type="text"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${metaErrors.name ? "border-rose-300 focus:border-rose-400" : "border-zinc-200"}`}
                placeholder="プロジェクト名を入力"
              />
              <div className="mt-1 text-right text-[11px]">
                <span className={`${metaErrors.name ? "text-rose-600" : "text-zinc-400"}`}>{(summary || "").length}/120</span>
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-zinc-500">説明</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${metaErrors.description ? "border-rose-300 focus:border-rose-400" : "border-zinc-200"}`}
                placeholder="プロジェクトの概要を入力"
              />
              <div className="mt-1 text-right text-[11px]">
                <span className={`${metaErrors.description ? "text-rose-600" : "text-zinc-400"}`}>{(description || "").length}/2000</span>
              </div>
            </label>
          </SectionCard>

          <SectionCard
            title="日程"
            description="候補日や確定日を管理できます。カードを開いて詳細を編集してください。"
            infoMessage="日程を設定します。ICS を利用することにより日程を他サービスと同期することができます。ICSからのインポートではプレビューで必要な日程だけ選ぶことができます。"
            action={
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:border-emerald-300"
                  onClick={addCandidate}
                >
                  日程を追加
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:border-emerald-300"
                  onClick={() => importInputRef.current?.click()}
                >
                  日程をICSからインポート
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:border-emerald-300 disabled:opacity-60"
                  onClick={handleExportAllCandidates}
                  disabled={!candidates.length}
                >
                  日程をICSに一括エクスポート
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".ics,text/calendar"
                  className="hidden"
                  onChange={onIcsInputChange}
                />
              </div>
            }
          >
            {!initialDataLoaded && !candidates.length ? (
              <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 px-4 py-6 text-center text-xs text-emerald-600">
                サンプルの ICS を読み込んでいます…
              </div>
            ) : !candidates.length ? (
              <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-6 text-center text-xs text-zinc-500">
                日程がまだありません。右上のボタンから追加してください。
              </div>
            ) : (
              candidates.map((candidate, index) => (
                <CandidateCard
                  index={index}
                  key={candidate.id}
                  value={candidate}
                  onChange={(next) => updateCandidate(candidate.id, next)}
                  onRemove={() => openCandidateDeleteDialog(candidate)}
                  onExport={() => handleExportCandidate(candidate.id)}
                  disableRemove={candidates.length === 1}
                  isOpen={openCandidateId === candidate.id}
                  onToggleOpen={() => setOpenCandidateId((prev) => (prev === candidate.id ? null : candidate.id))}
                  errors={candidateErrors[candidate.id] || {}}
                />
              ))
            )}
          </SectionCard>
        </main>

        <aside className="space-y-5" style={{ contain: "inline-size" }}>

          <SectionCard
            title="管理アクション"
            infoMessage="プロジェクト全体のバックアップや初期化をおこなうことができます。こまめにプロジェクトをエクスポートしてバックアップしておくと安心です。インポートや削除を行う前に、現在のデータを事前にエクスポートしておくと安心です。"
          >
            <div className="grid gap-2">
              <button
                type="button"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:border-emerald-300"
                onClick={handleExportProjectInfo}
              >
                プロジェクトをエクスポート
              </button>
              <button
                type="button"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:border-emerald-300"
                onClick={() => projectImportInputRef.current?.click()}
              >
                プロジェクトをインポート
              </button>
              <button
                type="button"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-rose-500 hover:border-rose-400"
                onClick={openProjectDeleteDialog}
              >
                プロジェクトを削除
              </button>
              <button
                type="button"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-blue-600 hover:border-blue-300"
                onClick={handleProjectImportFromDemo}
              >
                デモ用プロジェクトをインポート
              </button>
            </div>
            <input
              ref={projectImportInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleProjectImportFromFile}
            />
          </SectionCard>
        </aside>
      </div>

      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
          <div className="w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-800">
                  ICS 取り込みプレビュー（{importPreview.fileName}）
                </h3>
                <button
                  type="button"
                  className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
                  onClick={closeImportPreview}
                >
                  閉じる
                </button>
              </div>

              <div className="mb-4 rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-xs text-zinc-600">
                <p className="font-semibold">既存候補との比較ルール（UID / DTSTAMP）</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  <li>既存に同じ UID があり、読み込んだ DTSTAMP が新しければ「更新」として扱います。</li>
                  <li>DTSTAMP が古い場合は自動で「スキップ扱い」となります（手動で ON にすることは可能）。</li>
                  <li>UID が存在しない VEVENT や DTSTAMP が無いものは取り込み対象から除外します。</li>
                </ul>
              </div>

              <div className="max-h-[360px] overflow-auto overflow-x-auto">
                <table className="min-w-full table-auto border-collapse text-sm">
                  <thead className="bg-zinc-100 text-xs font-semibold text-zinc-600">
                    <tr>
                      <th className="w-10 border border-zinc-200 px-2 py-2 text-center">取込</th>
                      <th className="border border-zinc-200 px-3 py-2 text-left">候補概要</th>
                      <th className="border border-zinc-200 px-3 py-2 text-left">状態</th>
                      <th className="border border-zinc-200 px-3 py-2 text-left">既存DTSTAMP</th>
                      <th className="border border-zinc-200 px-3 py-2 text-left">読み込みDTSTAMP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.items.map((item) => (
                      <tr key={item.uid} className="hover:bg-emerald-50/40">
                        <td className="border border-zinc-200 px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={() => toggleImportPreviewItem(item.uid)}
                            className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="border border-zinc-200 px-3 py-2 align-top">
                          <div className="font-semibold text-zinc-800">{item.summary}</div>
                          <div className="text-xs text-zinc-500">{item.start} 〜 {item.end}</div>
                          <div className="mt-1 font-mono text-[11px] text-zinc-400 break-all">{item.uid}</div>
                        </td>
                        <td className="border border-zinc-200 px-3 py-2 text-xs text-zinc-700">
                          <span
                            className={
                              "inline-flex items-center rounded-full px-2 py-0.5 font-semibold " +
                              (item.status === "new"
                                ? "bg-emerald-50 text-emerald-600"
                                : item.status === "update"
                                  ? "bg-amber-50 text-amber-600"
                                  : "bg-zinc-100 text-zinc-500")
                            }
                          >
                            {item.message}
                          </span>
                        </td>
                        <td className="border border-zinc-200 px-3 py-2 text-xs font-mono text-zinc-500 break-all">
                          {item.existingDtstamp || "—"}
                        </td>
                        <td className="border border-zinc-200 px-3 py-2 text-xs font-mono text-zinc-500 break-all">
                          {item.importedDtstamp}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
                <span>
                  スキップ理由: UIDなし {importPreview.skippedNoUid} 件 / DTSTAMPなし {importPreview.skippedNoDtstamp} 件
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-500 hover:border-zinc-300"
                    onClick={closeImportPreview}
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    onClick={confirmImportPreview}
                  >
                    選択した候補を取り込む
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {candidateDeleteDialog && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
            onClick={closeCandidateDeleteDialog}
          >
            <div
              className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
              role="dialog"
              aria-modal="true"
              aria-label="日程を削除"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-800">日程を削除</h2>
                <button
                  type="button"
                  className="text-xs text-zinc-500"
                  onClick={closeCandidateDeleteDialog}
                  disabled={candidateDeleteInProgress}
                >
                  閉じる
                </button>
              </div>
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  confirmCandidateDelete();
                }}
              >
                <p className="text-xs text-zinc-500">
                  <span className="font-semibold text-zinc-700">
                    {candidateDeleteDialog.summary || candidateDeleteDialog.id}
                  </span>
                  を削除するには、確認のため <span className="font-mono text-zinc-700">DELETE</span> と入力してください。
                </p>
                <label className="block text-xs text-zinc-500">
                  確認ワード
                  <input
                    type="text"
                    value={candidateDeleteConfirm}
                    onChange={(event) => setCandidateDeleteConfirm(event.target.value.toUpperCase())}
                    placeholder="DELETE"
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    autoFocus
                    autoComplete="off"
                    disabled={candidateDeleteInProgress}
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:border-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={closeCandidateDeleteDialog}
                    disabled={candidateDeleteInProgress}
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={candidateDeleteInProgress || candidateDeleteConfirm.trim() !== "DELETE"}
                  >
                    {candidateDeleteInProgress ? "削除中…" : "削除"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {projectDeleteDialogOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
            onClick={closeProjectDeleteDialog}
          >
            <div
              className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
              role="dialog"
              aria-modal="true"
              aria-label="プロジェクトを削除"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-800">プロジェクトを削除</h2>
                <button
                  type="button"
                  className="text-xs text-zinc-500"
                  onClick={closeProjectDeleteDialog}
                  disabled={projectDeleteInProgress}
                >
                  閉じる
                </button>
              </div>
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  confirmProjectDelete();
                }}
              >
                <p className="text-xs text-zinc-500">
                  プロジェクトの候補・参加者・回答データをすべて削除します。確認のため{" "}
                  <span className="font-mono text-zinc-700">DELETE</span> と入力してください。
                </p>
                <label className="block text-xs text-zinc-500">
                  確認ワード
                  <input
                    type="text"
                    value={projectDeleteConfirm}
                    onChange={(event) => setProjectDeleteConfirm(event.target.value.toUpperCase())}
                    placeholder="DELETE"
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    autoFocus
                    autoComplete="off"
                    disabled={projectDeleteInProgress}
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:border-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={closeProjectDeleteDialog}
                    disabled={projectDeleteInProgress}
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={projectDeleteInProgress || projectDeleteConfirm.trim() !== "DELETE"}
                  >
                    {projectDeleteInProgress ? "削除中…" : "削除"}
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

SectionCard.displayName = "SectionCard";
CandidateCard.displayName = "CandidateCard";
CandidateMetaTable.displayName = "CandidateMetaTable";
KeyValueList.displayName = "KeyValueList";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}
const root = ReactDOM.createRoot(container);
root.render(<OrganizerApp />);
export default OrganizerApp;

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
