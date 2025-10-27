import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";

import sharedIcalUtils from "./shared/ical-utils";
import EventMeta from "./shared/EventMeta.jsx";
import { formatDateTimeRangeLabel } from "./shared/date-utils";

const { DEFAULT_TZID, ensureICAL, waitForIcal, getSampleIcsUrl, createLogger, sanitizeTzid } = sharedIcalUtils;

const ICS_LINE_BREAK = "\r\n";
const PARTICIPANT_ICS_HEADER_LINES = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Scheduly//Participant//JA",
  "CALSCALE:GREGORIAN",
  "METHOD:PUBLISH"
];

const DASHBOARD_META = {
  projectName: "秋の合宿 調整会議",
  description: "秋の合宿に向けた候補日を集約し、参加者と共有するためのプロジェクトです。",
  deadline: "2025/05/01 23:59",
  participantCount: 12,
  lastUpdated: "2025/04/12 17:45"
};

const logDebug = createLogger("user");

const padNumber = (value) => String(value).padStart(2, "0");

const formatDateTimeAsUtc = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = padNumber(date.getUTCMonth() + 1);
  const day = padNumber(date.getUTCDate());
  const hour = padNumber(date.getUTCHours());
  const minute = padNumber(date.getUTCMinutes());
  const second = padNumber(date.getUTCSeconds());
  return `${year}${month}${day}T${hour}${minute}${second}Z`;
};

const escapeIcsText = (value) => {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
};

const buildIcsFromSchedules = (schedules) => {
  if (!Array.isArray(schedules) || !schedules.length) return "";
  const lines = PARTICIPANT_ICS_HEADER_LINES.slice();
  const sharedDtstamp = formatDateTimeAsUtc(new Date());

  schedules.forEach((schedule, index) => {
    if (!schedule || !schedule.uid) return;
    const dtstartLine = formatDateTimeAsUtc(schedule.startsAt);
    const dtendLine = formatDateTimeAsUtc(schedule.endsAt);
    const statusText = schedule.status ? String(schedule.status).toUpperCase() : "";

    lines.push("BEGIN:VEVENT");
    lines.push("UID:" + escapeIcsText(schedule.uid));
    if (sharedDtstamp) lines.push("DTSTAMP:" + sharedDtstamp);
    if (dtstartLine) lines.push("DTSTART:" + dtstartLine);
    if (dtendLine) lines.push("DTEND:" + dtendLine);
    if (statusText) lines.push("STATUS:" + escapeIcsText(statusText));
    lines.push("SUMMARY:" + escapeIcsText(schedule.label || schedule.uid));
    lines.push("LOCATION:" + escapeIcsText(schedule.location || ""));
    if (schedule.tzid) lines.push("X-SCHEDULY-TZID:" + escapeIcsText(schedule.tzid));
    lines.push("SEQUENCE:" + String(index));
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return lines.join(ICS_LINE_BREAK) + ICS_LINE_BREAK;
};

const SAMPLE_SCHEDULE_DETAILS = {
  "igapyon-scheduly-5a2a47d2-56eb-4329-b3c2-92d9275480a2": {
    id: "day1",
    counts: { o: 8, d: 3, x: 1 },
    responses: [
      { participantId: "sato", name: "佐藤 太郎", mark: "o", comment: "オフィス参加可" },
      { participantId: "suzuki", name: "鈴木 花子", mark: "d", comment: "子どものお迎えがあるため 16:30 まで" },
      { participantId: "tanaka", name: "田中 一郎", mark: "o", comment: "コメントなし" },
      { participantId: "others", name: "・・・", mark: "pending", comment: "残り9名の回答は実装時に取得" }
    ]
  },
  "igapyon-scheduly-6b5cd8fe-0f61-43c1-9aa3-7b8f22d6a140": {
    id: "day2",
    counts: { o: 4, d: 5, x: 3 },
    responses: [
      { participantId: "sato", name: "佐藤 太郎", mark: "d", comment: "オンラインなら可" },
      { participantId: "suzuki", name: "鈴木 花子", mark: "d", comment: "開始時間を 19:00 にできれば ○" },
      { participantId: "tanaka", name: "田中 一郎", mark: "x", comment: "平日は難しいです。" },
      { participantId: "others", name: "・・・", mark: "pending", comment: "他 8 名の回答を表示（実装時にロード）" }
    ]
  },
  "igapyon-scheduly-44f4cf2e-c82e-4d6d-915b-676f2755c51a": {
    id: "day3",
    counts: { o: 6, d: 2, x: 4 },
    responses: [
      { participantId: "sato", name: "佐藤 太郎", mark: "o", comment: "コメントなし" },
      { participantId: "suzuki", name: "鈴木 花子", mark: "o", comment: "20:00 までなら参加可" },
      { participantId: "tanaka", name: "田中 一郎", mark: "x", comment: "他会議とバッティング" }
    ]
  },
  "igapyon-scheduly-0c8b19f2-5aba-4e24-9f06-0f1aeb8a2afb": {
    id: "day4",
    counts: { o: 14, d: 1, x: 0 },
    responses: [
      { participantId: "sato", name: "佐藤 太郎", mark: "o", comment: "終日参加可能" },
      { participantId: "suzuki", name: "鈴木 花子", mark: "o", comment: "午前は在宅参加になります" },
      { participantId: "tanaka", name: "田中 一郎", mark: "o", comment: "午前に別予定があったが調整済み" },
      { participantId: "others", name: "・・・", mark: "pending", comment: "詳細は未回答" }
    ]
  }
};

const PARTICIPANTS = [
  {
    id: "sato",
    name: "佐藤 太郎",
    lastUpdated: "2025/04/12 17:42",
    commentHighlights: ["コメント記入: Day2"],
    responses: [
      { scheduleId: "day1", datetime: "2025/10/26(日) 13:00 – 17:00", mark: "o", comment: "コメント: オフィス参加可" },
      { scheduleId: "day2", datetime: "2025/10/27(月) 18:00 – 21:00", mark: "d", comment: "コメント: オンラインなら参加可能" },
      { scheduleId: "day3", datetime: "2025/10/28(火) 18:00 – 21:00", mark: "o", comment: "コメント: 特になし" },
      { scheduleId: "day4", datetime: "2025/11/03(月) 10:00 – 12:00", mark: "o", comment: "コメント: 終日参加可能" }
    ]
  },
  {
    id: "suzuki",
    name: "鈴木 花子",
    lastUpdated: "2025/04/10 09:15",
    commentHighlights: ["コメント記入: Day1 / Day3"],
    responses: [
      { scheduleId: "day1", datetime: "2025/10/26(日) 13:00 – 17:00", mark: "d", comment: "コメント: 子どものお迎えがあるため 16:30 まで" },
      { scheduleId: "day2", datetime: "2025/10/27(月) 18:00 – 21:00", mark: "x", comment: "コメント: 開始時間を 19:00 にできれば参加可" },
      { scheduleId: "day3", datetime: "2025/10/28(火) 18:00 – 21:00", mark: "o", comment: "コメント: 20:00 までなら参加可" },
      { scheduleId: "day4", datetime: "2025/11/03(月) 10:00 – 12:00", mark: "o", comment: "コメント: 午前は在宅参加になります" }
    ]
  },
  {
    id: "tanaka",
    name: "田中 一郎",
    lastUpdated: "2025/04/05 21:03",
    commentHighlights: ["コメント記入: Day2 / Day3"],
    responses: [
      { scheduleId: "day1", datetime: "2025/10/26(日) 13:00 – 17:00", mark: "o", comment: "コメント: 自家用車で参加予定" },
      { scheduleId: "day2", datetime: "2025/10/27(月) 18:00 – 21:00", mark: "x", comment: "コメント: 平日は別件の会議があり難しい" },
      { scheduleId: "day3", datetime: "2025/10/28(火) 18:00 – 21:00", mark: "x", comment: "コメント: 他プロジェクトとバッティング" },
      { scheduleId: "day4", datetime: "2025/11/03(月) 10:00 – 12:00", mark: "pending", comment: "コメント: 未回答（フォロー待ち）" }
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
  const [open, setOpen] = useState(schedule.id === "day1");

  useEffect(() => {
    setOpen((prev) => (schedule.id === "day1" ? true : prev));
  }, [schedule.id]);

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
            dateTime={schedule.rangeLabel || schedule.datetime}
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
        {schedule.responses.map((response) => (
          <li key={response.name} className="flex items-start justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-semibold text-zinc-800">{response.name}</div>
                <a
                  href="./user-edit.html"
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
              href="./user-edit.html"
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
            ? formatDateTimeRangeLabel(schedule.startsAt, schedule.endsAt, schedule.tzid)
            : response.datetime;
          const summaryLabel = schedule ? schedule.label : response.datetime;
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

function AdminResponsesApp() {
  const [activeTab, setActiveTab] = useState("schedule");
  const [schedules, setSchedules] = useState([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [schedulesError, setSchedulesError] = useState("");
  const [icsSource, setIcsSource] = useState("");

  const scheduleLookup = useMemo(() => {
    const map = new Map();
    schedules.forEach((schedule) => {
      map.set(schedule.id, schedule);
    });
    return map;
  }, [schedules]);

  useEffect(() => {
    let cancelled = false;

    const loadSchedulesFromIcs = async () => {
      setSchedulesLoading(true);
      setSchedulesError("");
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
        if (!vevents.length) {
          throw new Error("No VEVENT entries in sample ICS");
        }
        const converted = [];
        for (let i = 0; i < vevents.length; i += 1) {
          const vevent = vevents[i];
          const event = new ICAL.Event(vevent);
          if (!event.uid) continue;
          const details = SAMPLE_SCHEDULE_DETAILS[event.uid];
          const startDate = event.startDate ? event.startDate.toJSDate() : null;
          const endDate = event.endDate ? event.endDate.toJSDate() : null;
          const tzid = sanitizeTzid((event.startDate && event.startDate.zone && event.startDate.zone.tzid) || DEFAULT_TZID);
          const rangeLabel = formatDateTimeRangeLabel(startDate, endDate, tzid);

          converted.push({
            uid: event.uid,
            id: details?.id || event.uid,
            label: event.summary || event.uid,
            datetime: rangeLabel,
            rangeLabel,
            location: event.location || "",
            status: event.status || "TENTATIVE",
            tzid,
            startsAt: startDate ? startDate.toISOString() : null,
            endsAt: endDate ? endDate.toISOString() : null,
            counts: details?.counts ? { ...details.counts } : { o: 0, d: 0, x: 0 },
            description: event.description || "",
            responses: details?.responses ? details.responses.map((item) => ({ ...item })) : []
          });
        }
        converted.sort((a, b) => {
          if (a.startsAt && b.startsAt) {
            return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
          }
          return (a.label || "").localeCompare(b.label || "", "ja");
        });
        logDebug("schedules after conversion", converted);
        if (!cancelled) {
          setSchedules(converted);
          setIcsSource(text);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("[Scheduly] failed to hydrate participant schedules from ICS, leaving schedules empty", error);
        if (!cancelled) {
          setSchedules([]);
          setSchedulesError(error instanceof Error ? error.message : String(error));
          logDebug("load schedules error", error);
          setIcsSource("");
        }
      } finally {
        if (!cancelled) {
          setSchedulesLoading(false);
        }
      }
    };

    loadSchedulesFromIcs();

    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleDownloadAllIcs = () => {
    const source = icsSource || buildIcsFromSchedules(schedules);
    if (!source) {
      logDebug("skip ICS download: no data");
      return;
    }
    const filename = `scheduly-schedules-${new Date().toISOString().split("T")[0]}.ics`;
    downloadIcsFile(filename, source);
  };

  const hasIcsData = Boolean((icsSource && icsSource.trim()) || schedules.length);

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
            <p className="mt-2 text-sm text-zinc-600">
              プロジェクト「{DASHBOARD_META.projectName}」の日程と回答状況です。
            </p>
            {DASHBOARD_META.description ? (
              <p className="mt-1 text-xs text-zinc-500">{DASHBOARD_META.description}</p>
            ) : null}
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
          {schedulesLoading && !schedules.length ? (
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 px-4 py-6 text-center text-xs text-emerald-600">
              日程データを読み込んでいます…
            </div>
          ) : schedules.length ? (
            schedules.map((schedule) => <ScheduleSummary key={schedule.id} schedule={schedule} />)
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-6 text-center text-xs text-zinc-500">
              表示できる日程がありません。
              {schedulesError && (
                <span className="mt-2 block text-[11px] text-rose-500">
                  読み込みエラー: {schedulesError}
                </span>
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === "participant" && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-600">参加者ごとの回答サマリー</h2>
          <div className="space-y-3">
              {PARTICIPANTS.map((participant, index) => (
                <ParticipantSummary
                  key={participant.id}
                  participant={participant}
                  defaultOpen={index === 0}
                  scheduleLookup={scheduleLookup}
                />
              ))}
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
