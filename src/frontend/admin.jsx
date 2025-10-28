// Copyright (c) Toshiki Iga. All Rights Reserved.

import React, { useEffect, useMemo, useState, useId, useRef } from "react";
import ReactDOM from "react-dom/client";

import sharedIcalUtils from "./shared/ical-utils";
import projectStore from "./store/project-store";
import scheduleService from "./services/schedule-service";
import shareService from "./services/share-service";
import EventMeta from "./shared/EventMeta.jsx";
import { formatDateTimeRangeLabel } from "./shared/date-utils";
import { ensureDemoProjectData } from "./shared/demo-data";
import { ClipboardIcon } from "@heroicons/react/24/outline";

const { DEFAULT_TZID, ensureICAL, createLogger } = sharedIcalUtils;

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

const logDebug = createLogger("admin");
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

const resolveNextSequence = (candidate) => (typeof candidate.sequence === "number" ? candidate.sequence + 1 : 1);

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

const exportAllCandidatesToICal = (candidates) => {
  const now = new Date();
  const dtstampIso = now.toISOString();
  const dtstampLine = formatUtcForICal(dtstampIso);

  const lines = ICAL_HEADER_LINES.slice();

  candidates.forEach((candidate) => {
    const sequence = resolveNextSequence(candidate);
    const veventLines = buildICalEventLines(candidate, { dtstampLine, sequence });
    lines.push(...veventLines);
  });

  lines.push("END:VCALENDAR");
  return joinICalLines(lines);
};

const exportCandidateToICal = (candidate) => {
  const now = new Date();
  const sequence = resolveNextSequence(candidate);
  const dtstampIso = now.toISOString();
  const dtstampLine = formatUtcForICal(dtstampIso);
  const documentLines = ICAL_HEADER_LINES.slice();
  documentLines.push(...buildICalEventLines(candidate, { dtstampLine, sequence }));
  documentLines.push("END:VCALENDAR");

  const icsText = joinICalLines(documentLines);

  let updatedRaw = candidate.rawICalVevent;
  try {
    const ICAL = ensureICAL();
    const parsed = ICAL.parse(icsText);
    const comp = new ICAL.Component(parsed);
    const vevent = comp.getFirstSubcomponent("vevent");
    if (vevent) {
      updatedRaw = vevent.toJSON();
    }
  } catch (parseError) {
    console.warn("Failed to parse generated ICS back to component", parseError);
  }

  const safeName = (candidate.summary || candidate.uid || "event").replace(/[\/:*?"<>|]+/g, "_");

  return {
    icsText,
    filename: `${safeName || "event"}.ics`,
    updatedCandidate: {
      ...candidate,
      sequence,
      dtstamp: dtstampIso,
      rawICalVevent: updatedRaw
    }
  };
};

function SectionCard({ title, description, action, children }) {
  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <span aria-hidden="true">{title.includes("日程") ? "🗓️" : "📝"}</span>
            <span>{title}</span>
          </h2>
          {description && <p className="mt-1 text-xs text-zinc-500">{description}</p>}
        </div>
        {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function CandidateCard({ index, value, onChange, onRemove, onExport, disableRemove }) {
 
  const [open, setOpen] = useState(index === 0);
  const [metaOpen, setMetaOpen] = useState(false);
  const dialogTitleId = useId();
  const displayMeta = candidateToDisplayMeta(value);

  const handleToggle = (event) => {
    setOpen(event.currentTarget.open);
  };

  const handleSummaryClick = () => {
    setOpen((prev) => !prev);
  };

  return (
    <details className="rounded-2xl border border-zinc-200 bg-white shadow-sm" open={open} onToggle={handleToggle}>
      <summary
        className="flex cursor-pointer flex-col gap-3 rounded-2xl px-5 py-4 transition hover:bg-emerald-50/50 sm:flex-row sm:items-center sm:justify-between"
        onClick={(event) => {
          event.preventDefault();
          handleSummaryClick();
        }}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${icalStatusBadgeClass(value.status)}`}>
              {formatIcalStatusLabel(value.status || "CONFIRMED")}
            </span>
          </div>
          <EventMeta
            summary={value.summary || "タイトル未設定"}
            summaryClassName="text-sm font-semibold text-zinc-800"
            dateTime={displayMeta}
            dateTimeClassName="flex flex-wrap items-center gap-1 text-xs text-zinc-500"
            timezone={value.tzid || DEFAULT_TZID}
            timezoneClassName="text-xs text-zinc-400"
            description={value.description}
            descriptionClassName="text-xs text-zinc-500"
            location={value.location}
            locationClassName="flex items-center gap-1 text-xs text-zinc-500"
            showLocationIcon
            statusText={null}
            statusPrefix=""
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 hover:border-zinc-300 hover:text-zinc-800"
            onClick={(event) => {
              event.preventDefault();
              setMetaOpen(true);
            }}
          >
            ICS 詳細
          </button>
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

      <div className="space-y-4 border-t border-zinc-200 px-5 py-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-zinc-500">タイトル（SUMMARY）</span>
            <input
              type="text"
              value={value.summary}
              onChange={(e) => onChange({ ...value, summary: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              placeholder="例: 秋の合宿 調整会議 Day1"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-zinc-500">ステータス（STATUS）</span>
            <select
              value={value.status}
              onChange={(e) => onChange({ ...value, status: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
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
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-zinc-500">終了日時（DTEND）</span>
            <input
              type="datetime-local"
              value={value.dtend}
              onChange={(e) => onChange({ ...value, dtend: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-zinc-500">タイムゾーン（TZID）</span>
            <select
              value={value.tzid}
              onChange={(e) => onChange({ ...value, tzid: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
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
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              placeholder="例: サントリーホール 大ホール"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-semibold text-zinc-500">説明（DESCRIPTION）</span>
          <textarea
            value={value.description}
            onChange={(e) => onChange({ ...value, description: e.target.value })}
            rows={3}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            placeholder="補足情報を入力"
          />
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

      {metaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6" onClick={() => setMetaOpen(false)}>
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
            role="dialog"
            aria-labelledby={dialogTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
        <h3 id={dialogTitleId} className="text-sm font-semibold text-zinc-800">ICS詳細</h3>
              <button className="text-xs text-zinc-500" onClick={() => setMetaOpen(false)}>閉じる</button>
            </div>
            <CandidateMetaTable candidate={value} />
          </div>
        </div>
      )}
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
        <React.Fragment key={idx}>
          <dt className="text-xs font-semibold text-zinc-500">{key}</dt>
          <dd className="break-words text-sm text-zinc-800">{value || <span className="text-zinc-400">—</span>}</dd>
        </React.Fragment>
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
  const projectId = useMemo(() => projectStore.resolveProjectIdFromLocation(), []);
  const initialProjectState = useMemo(() => projectStore.getProjectStateSnapshot(projectId), [projectId]);
  const initialShareTokens = useMemo(() => shareService.get(projectId), [projectId]);
  const [summary, setSummary] = useState(initialProjectState.project?.name || "");
  const [description, setDescription] = useState(initialProjectState.project?.description || "");
  const responseOptions = ["○", "△", "×"];
  const [candidates, setCandidates] = useState(initialProjectState.candidates || []);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [shareTokens, setShareTokens] = useState(initialShareTokens);
  const [baseUrl, setBaseUrl] = useState(
    () => deriveBaseUrlFromAdminEntry(initialShareTokens.admin) ?? resolveDefaultBaseUrl()
  );
  const [navigateAfterGenerate, setNavigateAfterGenerate] = useState(false);
  const [toast, setToast] = useState("");
  const importInputRef = useRef(null);
  const projectImportInputRef = useRef(null);
  const [importPreview, setImportPreview] = useState(null);

  useEffect(() => {
    setCandidates(initialProjectState.candidates || []);
    const unsubscribe = projectStore.subscribeProjectState(projectId, (nextState) => {
      if (!nextState) return;
      const nextProject = nextState.project || {};
      setSummary((prev) => (nextProject.name !== undefined && nextProject.name !== prev ? nextProject.name : prev));
      setDescription((prev) =>
        nextProject.description !== undefined && nextProject.description !== prev ? nextProject.description : prev
      );
      setCandidates(nextState.candidates || []);
      setShareTokens(shareService.get(projectId));
    });
    return unsubscribe;
  }, [projectId, initialProjectState]);

  useEffect(() => {
    projectStore.updateProjectMeta(projectId, { name: summary, description });
  }, [projectId, summary, description]);

  useEffect(() => {
    let cancelled = false;
    setInitialDataLoaded(false);

    ensureDemoProjectData(projectId)
      .catch((error) => {
        console.warn("[Scheduly] demo data load failed; proceeding with empty state", error);
      })
      .finally(() => {
        if (!cancelled) {
          setInitialDataLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

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
    updateScheduleCandidate(projectId, id, next);
  };

  const removeCandidate = (id) => {
    removeScheduleCandidate(projectId, id);
  };

  const addCandidate = () => {
    addScheduleCandidate(projectId);
    popToast("日程を追加しました");
  };

  const handleExportAllCandidates = () => {
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

  const handleIcsImport = async (file) => {
    const text = await file.text();
    let parsed;
    try {
      const ICAL = ensureICAL();
      parsed = ICAL.parse(text);
    } catch (error) {
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
    const tokens = shareService.get(projectId);
    setShareTokens(tokens);
    const derived = deriveBaseUrlFromAdminEntry(tokens.admin);
    if (derived) {
      setBaseUrl(derived);
    } else if (options.resetWhenMissing) {
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

  const handleShareLinkAction = () => {
    const hasIssued = hasIssuedShareTokens;
    if (hasIssued) {
      const confirmed = window.confirm("共有URLを再発行します。以前のリンクは無効になります。続行しますか？");
      if (!confirmed) return;
    }
    try {
      const action = hasIssued ? shareService.rotate : shareService.generate;
      const result = action(projectId, { baseUrl, navigateToAdminUrl: navigateAfterGenerate });
      refreshShareTokensState({ resetWhenMissing: true });
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
    } catch (error) {
      console.error("Copy share URL error", error);
      popToast("URLのコピーに失敗しました");
    }
  };

  const handleExportProjectInfo = () => {
    try {
      const exportData = projectStore.exportProjectState(projectId);
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
      projectStore.importProjectState(projectId, parsed);
      const snapshot = projectStore.getProjectStateSnapshot(projectId);
      setSummary(snapshot.project?.name || "");
      setDescription(snapshot.project?.description || "");
      setCandidates(snapshot.candidates || []);
      refreshShareTokensState({ resetWhenMissing: true });
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

  const handleDeleteProject = () => {
    const confirmed = window.confirm("このプロジェクトの候補・参加者・回答データをすべて削除します。よろしいですか？");
    if (!confirmed) return;
    const fresh = projectStore.resetProject(projectId);
    setSummary(fresh.project?.name || "");
    setDescription(fresh.project?.description || "");
    setCandidates(fresh.candidates || []);
    refreshShareTokensState({ resetWhenMissing: true });
    setImportPreview(null);
    setInitialDataLoaded(true);
    popToast("プロジェクトを削除し初期状態に戻しました");
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
  const canCopyAdminUrl =
    adminShareEntry && !shareService.isPlaceholderToken(adminShareEntry.token) && isNonEmptyString(adminShareEntry.url);
  const canCopyParticipantUrl =
    participantShareEntry &&
    !shareService.isPlaceholderToken(participantShareEntry.token) &&
    isNonEmptyString(participantShareEntry.url);

  const eventPayload = useMemo(() => {
    return {
      summary,
      description,
      responseOptions: responseOptions,
      candidates: candidates.map((c, index) => ({
        id: c.id,
        order: index + 1,
        ics: {
          UID: c.uid,
          SUMMARY: c.summary,
          DTSTART: c.dtstart,
          DTEND: c.dtend,
          TZID: c.tzid,
          STATUS: c.status,
          SEQUENCE: c.sequence,
          DTSTAMP: c.dtstamp,
          LOCATION: c.location,
          DESCRIPTION: c.description
        }
      })),
      metadata: {
        createdAt: "2024-05-01T10:00:00+09:00",
        organizer: "匿名",
        hint: "ダッシュボードから参照できます"
      }
    };
  }, [summary, description, responseOptions, candidates]);

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 px-4 py-6 text-zinc-900 sm:px-6">
      <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">Organizer Console</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-zinc-900">
              <span aria-hidden="true">🗂️</span>
              <span>Scheduly 管理</span>
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              日程を調整し参加者へ共有するための管理画面です。必要に応じて日程を編集し、ICS として取り込み・書き出しができます。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="./user.html"
              className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-white px-4 py-2 text-xs font-semibold text-emerald-600 hover:border-emerald-300 hover:text-emerald-700"
            >
              参加者画面を開く
            </a>
          </div>
        </div>
      </header>

      <div className="grid flex-1 gap-5 xl:grid-cols-[2fr,1fr]">

        <main className="space-y-5">
          <SectionCard
            title="プロジェクト情報"
            description="プロジェクトの基本情報を編集します。"
          >
            <label className="block">
              <span className="text-xs font-semibold text-zinc-500">プロジェクト名</span>
              <input
                type="text"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="プロジェクト名を入力"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-zinc-500">説明</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="プロジェクトの概要を入力"
              />
            </label>
          </SectionCard>

          <SectionCard
            title="日程"
            description="候補日や確定日を管理できます。カードを開いて詳細を編集してください。"
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
                  onRemove={() => removeCandidate(candidate.id)}
                  onExport={() => handleExportCandidate(candidate.id)}
                  disableRemove={candidates.length === 1}
                />
              ))
            )}
          </SectionCard>
        </main>

        <aside className="space-y-5">
          <SectionCard
            title="共有URL"
            description="参加者へ共有するリンクと管理者リンクを確認できます。"
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
                  onChange={(event) => setBaseUrl(event.target.value)}
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
                <div className="mt-1 flex items-start gap-2">
                  <span className="flex-1 break-words text-sm text-zinc-800">{adminUrlDisplay}</span>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white p-1 text-zinc-500 hover:border-emerald-300 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => handleCopyShareUrl("admin")}
                    disabled={!canCopyAdminUrl}
                    title="コピー"
                  >
                    <ClipboardIcon className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div>
                <span className="text-xs font-semibold text-zinc-500">参加者URL</span>
                <div className="mt-1 flex items-start gap-2">
                  <span className="flex-1 break-words text-sm text-zinc-800">{participantUrlDisplay}</span>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white p-1 text-zinc-500 hover:border-emerald-300 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => handleCopyShareUrl("participant")}
                    disabled={!canCopyParticipantUrl}
                    title="コピー"
                  >
                    <ClipboardIcon className="h-4 w-4" aria-hidden="true" />
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

          <SectionCard title="管理アクション">
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
                onClick={handleDeleteProject}
              >
                プロジェクトを削除
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

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}
const root = ReactDOM.createRoot(container);
root.render(<OrganizerApp />);
