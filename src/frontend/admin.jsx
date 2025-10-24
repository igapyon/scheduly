import React, { useMemo, useState, useId, useRef } from "react";
import ReactDOM from "react-dom/client";

const DEFAULT_TZID = "Asia/Tokyo";
const ICAL_LINE_BREAK = "\r\n";
const ICAL_HEADER_LINES = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Scheduly//Mock//JA",
  "CALSCALE:GREGORIAN",
  "METHOD:PUBLISH"
];

const ensureICAL = () => {
  if (typeof window === "undefined" || !window.ICAL) {
    throw new Error("ical.js が読み込まれていません。public/index.html に CDN スクリプトを追加してください。");
  }
  return window.ICAL;
};

const randomUUID = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
};

const pad = (n) => String(n).padStart(2, "0");

const toInputValue = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const timeFromLocalInput = (value) => {
  if (!value) return null;
  const parts = value.split("T");
  if (parts.length !== 2) return null;
  const datePart = parts[0];
  const timePart = parts[1];
  const dateSegments = datePart.split("-").map(Number);
  const timeSegments = timePart.split(":").map(Number);
  if (dateSegments.length < 3 || timeSegments.length < 2) return null;
  const jsDate = new Date(Date.UTC(
    dateSegments[0],
    dateSegments[1] - 1,
    dateSegments[2],
    timeSegments[0],
    timeSegments[1],
    0,
    0
  ));
  const ICAL = ensureICAL();
  return ICAL.Time.fromJSDate(jsDate, true);
};

const toLocalInputFromICAL = (icalTime) => {
  if (!icalTime) return "";
  return toInputValue(icalTime.toJSDate());
};

const createDtstampIso = () => new Date().toISOString();

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

const buildICalVeventJCal = (candidate) => {
  const ICAL = ensureICAL();
  const component = new ICAL.Component(["VEVENT", [], []]);
  const event = new ICAL.Event(component);
  event.uid = candidate.uid;
  event.summary = candidate.summary || "";
  event.location = candidate.location || "";
  event.description = candidate.description || "";
  event.status = candidate.status || "CONFIRMED";
  const initialSequence = typeof candidate.sequence === "number" ? candidate.sequence : 0;
  event.sequence = initialSequence;
  const dtstartTime = timeFromLocalInput(candidate.dtstart);
  if (dtstartTime) event.startDate = dtstartTime;
  const dtendTime = timeFromLocalInput(candidate.dtend);
  if (dtendTime) event.endDate = dtendTime;
  if (candidate.tzid) {
    const assignedTz = ICAL.TimezoneService.get(candidate.tzid);
    if (assignedTz) {
      if (event.startDate) event.startDate.zone = assignedTz;
      if (event.endDate) event.endDate.zone = assignedTz;
    }
  }
  const dtstampTime = candidate.dtstamp ? ICAL.Time.fromJSDate(new Date(candidate.dtstamp)) : ICAL.Time.fromJSDate(new Date());
  event.component.updatePropertyWithValue("dtstamp", dtstampTime);
  return component.toJSON();
};

const createCandidateFromVevent = (vevent) => {
  const ICAL = ensureICAL();
  const event = new ICAL.Event(vevent);
  const uid = event.uid;
  if (!uid) return null;
  const startDate = event.startDate;
  const zone = startDate && startDate.zone ? startDate.zone.tzid : null;
  const tzid = zone || DEFAULT_TZID;
  const dtstampTime = event.component.getFirstPropertyValue("dtstamp");
  const dtstampIso = dtstampTime ? dtstampTime.toJSDate().toISOString() : createDtstampIso();
  return {
    id: randomUUID(),
    uid,
    summary: event.summary || "",
    dtstart: toLocalInputFromICAL(event.startDate),
    dtend: toLocalInputFromICAL(event.endDate),
    tzid,
    status: event.status || "CONFIRMED",
    sequence: event.sequence || 0,
    dtstamp: dtstampIso,
    location: event.location || "",
    description: event.description || "",
    rawICalVevent: vevent.toJSON()
  };
};

const createBlankICalCandidate = () => {
  const now = new Date();
  now.setSeconds(0, 0);
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const candidate = {
    id: randomUUID(),
    uid: `scheduly-${randomUUID()}`,
    summary: "",
    dtstart: toInputValue(start),
    dtend: toInputValue(end),
    tzid: DEFAULT_TZID,
    status: "CONFIRMED",
    sequence: 0,
    dtstamp: createDtstampIso(),
    location: "",
    description: "",
    rawICalVevent: null
  };
  candidate.rawICalVevent = buildICalVeventJCal(candidate);
  return candidate;
};

const seedICalCandidate = (data) => {
  const candidate = {
    id: randomUUID(),
    uid: data.uid || `scheduly-${randomUUID()}`,
    summary: data.summary || "",
    dtstart: data.dtstart || "",
    dtend: data.dtend || "",
    tzid: data.tzid || DEFAULT_TZID,
    status: data.status || "CONFIRMED",
    sequence: data.sequence || 0,
    dtstamp: data.dtstamp || createDtstampIso(),
    location: data.location || "",
    description: data.description || "",
    rawICalVevent: null
  };
  candidate.rawICalVevent = data.rawICalVevent || buildICalVeventJCal(candidate);
  return candidate;
};

const resolveNextSequence = (candidate) => (typeof candidate.sequence === "number" ? candidate.sequence + 1 : 1);

const buildICalEventLines = (candidate, { dtstampLine, sequence }) => {
  const dtstartLine = formatUtcForICal(candidate.dtstart);
  const dtendLine = formatUtcForICal(candidate.dtend);
  const statusValue = (candidate.status ? String(candidate.status) : "CONFIRMED").toUpperCase();
  const tzidValue = (candidate.tzid && candidate.tzid.trim()) ? candidate.tzid.trim() : DEFAULT_TZID;

  const veventLines = [
    "BEGIN:VEVENT",
    "UID:" + (candidate.uid || `scheduly-${randomUUID()}`),
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

function Section({ title, children, action }) {
  return (
    <section className="w-full rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function CandidateRow({ index, value, onChange, onRemove, onExport, disableRemove }) {
  const [metaOpen, setMetaOpen] = useState(false);
  const dialogTitleId = useId();
  const startLabel = formatLocalDisplay(value.dtstart);
  const endLabel = formatLocalDisplay(value.dtend);

  return (
    <div className="w-full rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex w-fit items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              日程 {index + 1}
            </span>
            <button
              type="button"
              className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 hover:border-emerald-300 hover:text-emerald-600"
              onClick={() => setMetaOpen(true)}
            >
              ICS詳細
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-600 hover:border-emerald-300 hover:text-emerald-700"
              onClick={onExport}
            >
              <span aria-hidden="true">📅</span> iCal (ICS)
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
            <span>開始: {startLabel}</span>
            <span className="hidden sm:inline">／</span>
            <span>終了: {endLabel}</span>
            {value.location && (
              <>
                <span className="hidden sm:inline">／</span>
                <span className="max-w-xs truncate">場所: {value.location}</span>
              </>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>

        <label className="block">
          <span className="text-xs font-semibold text-zinc-500">場所（LOCATION）</span>
          <input
            type="text"
            value={value.location}
            onChange={(e) => onChange({ ...value, location: e.target.value })}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            placeholder="例: サントリーホール 大ホール（2000席）"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-zinc-500">説明（DESCRIPTION）</span>
          <textarea
            value={value.description}
            onChange={(e) => onChange({ ...value, description: e.target.value })}
            rows={3}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              placeholder="プロジェクトの概要や連携メモ"
          />
        </label>

        <div className="flex justify-end">
          <button
            type="button"
            className="h-10 w-full shrink-0 rounded-lg border border-zinc-300 px-3 text-xs text-zinc-500 hover:border-rose-400 hover:text-rose-600 disabled:opacity-40 sm:w-32"
            onClick={onRemove}
            disabled={disableRemove}
          >
            削除
          </button>
        </div>
      </div>

      {metaOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
          onClick={() => setMetaOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 id={dialogTitleId} className="text-sm font-semibold text-zinc-700">
                日程 {index + 1} の ICS 詳細
              </h3>
              <button
                type="button"
                className="rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
                onClick={() => setMetaOpen(false)}
              >
                閉じる
              </button>
            </div>
            <dl className="space-y-3 text-sm text-zinc-700">
              <div className="flex items-start justify-between gap-4">
                <dt className="w-24 shrink-0 text-xs font-semibold text-zinc-500">UID</dt>
                <dd className="flex-1 break-all font-mono text-xs text-zinc-700">{value.uid}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="w-24 shrink-0 text-xs font-semibold text-zinc-500">SEQUENCE</dt>
                <dd className="flex-1 text-xs">{value.sequence}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="w-24 shrink-0 text-xs font-semibold text-zinc-500">DTSTAMP</dt>
                <dd className="flex-1 break-all font-mono text-xs text-zinc-700">{value.dtstamp}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

function ResponseSelector({ responses }) {
  return (
    <div>
      <div className="text-xs font-semibold text-zinc-500">回答形式</div>
      <div className="mt-2 flex flex-wrap gap-2 text-sm text-zinc-500">
        <span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1 font-semibold text-zinc-600">
          {responses.join(" / ")}
        </span>
        <span className="text-xs">※ 現在は固定設定です（編集不可）。</span>
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

function OrganizerApp() {
  const [summary, setSummary] = useState("秋の合宿 調整会議");
  const [description, setDescription] = useState("秋の合宿に向けた日程調整を行います。候補から都合の良いものを選択してください。");
  const [password, setPassword] = useState("mitaka2025");
  const responseOptions = ["○", "△", "×"];
  const [candidates, setCandidates] = useState(() => [
    seedICalCandidate({
      uid: `scheduly-${randomUUID()}`,
      summary: "秋の合宿 調整会議 Day1",
      dtstart: toInputValue(new Date("2024-10-26T13:00:00+09:00")),
      dtend: toInputValue(new Date("2024-10-26T17:00:00+09:00")),
      tzid: DEFAULT_TZID,
      status: "CONFIRMED",
      sequence: 1,
      dtstamp: "2024-04-01T01:00:00Z",
      location: "サントリーホール 大ホール（2046席）",
      description: "初日: キックオフと全体ミーティング"
    }),
    seedICalCandidate({
      uid: `scheduly-${randomUUID()}`,
      summary: "秋の合宿 調整会議 Day2",
      dtstart: toInputValue(new Date("2024-10-27T18:00:00+09:00")),
      dtend: toInputValue(new Date("2024-10-27T21:00:00+09:00")),
      tzid: DEFAULT_TZID,
      status: "TENTATIVE",
      sequence: 0,
      dtstamp: "2024-04-01T01:05:00Z",
      location: "サントリーホール ブルーローズ（小ホール）",
      description: "2日目: 平日夕方のフォローアップ"
    })
  ]);
  const [urls, setUrls] = useState({ admin: "", guest: "" });
  const [toast, setToast] = useState("");
  const importInputRef = useRef(null);
  const [importPreview, setImportPreview] = useState(null);

  const downloadTextFile = (filename, text) => {
    const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
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
    setCandidates((prev) => prev.map((item) => (item.id === id ? next : item)));
  };

  const removeCandidate = (id) => {
    setCandidates((prev) => prev.filter((item) => item.id !== id));
  };

  const addCandidate = () => {
    setCandidates((prev) => {
      const next = createBlankICalCandidate();
      next.sequence = prev.length;
      return prev.concat(next);
    });
    popToast("日程を追加しました");
  };

  const handleExportAllCandidates = () => {
    if (!candidates.length) {
      popToast("ダウンロード対象の日程がありません");
      return;
    }
    try {
      const icsText = exportAllCandidatesToICal(candidates);
      const filename = `scheduly-all-${new Date().toISOString().split("T")[0]}.ics`;
      downloadTextFile(filename, icsText);
      popToast("全候補を iCal (ICS) でダウンロードしました（モック）");
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
    let exportResult;
    try {
      exportResult = exportCandidateToICal(target);
    } catch (error) {
      console.error("ICS export error", error);
      popToast("ICSの生成に失敗しました: " + (error && error.message ? error.message : "不明なエラー"));
      return;
    }
    downloadTextFile(exportResult.filename, exportResult.icsText);
    popToast(`${exportResult.filename} をダウンロードしました（モック）`);
    setCandidates((prev) => prev.map((item) => (item.id === candidateId ? exportResult.updatedCandidate : item)));
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
      const candidate = createCandidateFromVevent(vevent);
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
    setCandidates((prev) => {
      const next = prev.slice();
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
      return next;
    });
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

  const popToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  };

  const generateUrls = () => {
    const randomToken = () => Math.random().toString(36).slice(2, 10);
    setUrls({
      admin: `https://scheduly.app/event/${randomToken()}?admin=${randomToken()}`,
      guest: `https://scheduly.app/event/${randomToken()}`
    });
    popToast("編集URL／閲覧URLを発行しました（モック）");
  };

  const mockDownloadJson = () => {
    popToast("出欠表を JSON でダウンロードしました（モック）");
  };

  const eventPayload = useMemo(() => {
    return {
      summary,
      description,
      responseOptions: responseOptions,
      accessControl: password ? { passwordEnabled: true, hint: "保存時にハッシュ化されます" } : { passwordEnabled: false },
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
  }, [summary, description, password, responseOptions, candidates]);

  return (
    <div className="min-h-screen bg-zinc-100 px-4 py-6 text-gray-900 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-zinc-900">Scheduly 管理</h1>
              <p className="mt-2 text-sm text-zinc-600">
                iCal (ICS) を活用した日程管理アプリです。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="./user.html"
                className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-600 hover:border-zinc-300 hover:text-zinc-800"
              >
                参加者
              </a>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[2fr,1.2fr]">
          <main className="space-y-6">
            <Section
              title="プロジェクト情報"
              action={
                <button
                  type="button"
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:border-emerald-300"
                  onClick={generateUrls}
                >
                  共有URLを生成
                </button>
              }
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
                <span className="text-xs font-semibold text-zinc-500">説明文</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  placeholder="プロジェクトの概要を入力"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-zinc-500">プロジェクトパスワード</span>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    placeholder="空欄でパスワードなし"
                  />
                </div>
                <p className="mt-1 text-xs text-zinc-500">閲覧制限のための任意設定です。保存時にサーバー側でハッシュ化される想定です。</p>
              </label>
              <ResponseSelector responses={responseOptions} />
            </Section>

            <Section title="共有URL" action={null}>
              <KeyValueList
                items={[
                  { key: "編集用URL（管理者）", value: urls.admin },
                  { key: "閲覧用URL（参加者）", value: urls.guest },
                  { key: "最終更新", value: "2024/05/01 10:00 更新済み（モック）" }
                ]}
              />
              <p className="text-xs text-zinc-500">
                管理者URLを知っている人だけがプロジェクト内容を更新できます。閲覧URLは参加者に共有します。
              </p>
            </Section>

            <Section
              title="日程一覧"
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
                    ICSから追加
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:border-emerald-300 disabled:opacity-60"
                    onClick={handleExportAllCandidates}
                    disabled={!candidates.length}
                  >
                    ICSを一括ダウンロード
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
              {candidates.map((candidate, index) => (
                <CandidateRow
                  index={index}
                  key={candidate.id}
                  value={candidate}
                  onChange={(next) => updateCandidate(candidate.id, next)}
                  onRemove={() => removeCandidate(candidate.id)}
                  onExport={() => handleExportCandidate(candidate.id)}
                  disableRemove={candidates.length === 1}
                />
              ))}
            </Section>

            <Section
              title="管理アクション"
              action={
                <button
                  type="button"
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-rose-500 hover:border-rose-400"
                  onClick={() => popToast("プロジェクトを削除しました（モック）")}
                >
                  プロジェクト削除（モック）
                </button>
              }
            >
            </Section>
          </main>
        </div>

        {importPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
            <div className="w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-zinc-800">
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
    </div>
  );
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}
const root = ReactDOM.createRoot(container);
root.render(<OrganizerApp />);
