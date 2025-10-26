import React from "react";

function EventMeta({
  summary,
  summaryClassName = "text-sm font-semibold text-zinc-800",
  dateTime,
  dateTimeClassName = "flex flex-wrap items-center gap-2 text-sm text-zinc-600",
  timezone,
  timezoneClassName = "text-xs text-zinc-400",
  location,
  locationClassName = "flex flex-wrap items-center gap-2 text-xs text-zinc-500",
  showLocationIcon = false,
  statusText,
  statusPrefix = "状態:",
  statusClassName = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold text-zinc-600",
  separator = null
}) {
  return (
    <div className="space-y-1">
      {summary ? <div className={summaryClassName}>{summary}</div> : null}
      {dateTime ? (
        <div className={dateTimeClassName}>
          <span>{dateTime}</span>
          {timezone ? <span className={timezoneClassName}>{timezone}</span> : null}
        </div>
      ) : null}
      {(location || statusText) ? (
        <div className={locationClassName}>
          {location ? (
            <span className={showLocationIcon ? "inline-flex items-center gap-1" : undefined}>
              {showLocationIcon ? <span aria-hidden="true">📍</span> : null}
              {location}
            </span>
          ) : null}
          {separator && location && statusText ? <span className="text-zinc-400">{separator}</span> : null}
          {statusText ? (
            <span className="flex items-center gap-1">
              {statusPrefix ? <span>{statusPrefix}</span> : null}
              <span className={statusClassName}>{statusText}</span>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default EventMeta;
