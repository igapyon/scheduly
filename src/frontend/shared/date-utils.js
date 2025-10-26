const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const stringValue = String(value);
  if (!stringValue) return null;
  const parsed = new Date(stringValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateParts = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    timeZone
  });
  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}/${get("month")}/${get("day")}(${get("weekday")})`;
};

const formatTime = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone
  });
  return formatter.format(date);
};

const formatDateTimeRangeLabel = (startValue, endValue, tzid) => {
  const startDate = toDate(startValue);
  if (!startDate) return "未設定";
  const endDate = toDate(endValue);
  const timeZone = tzid || undefined;
  const startDateLabel = formatDateParts(startDate, timeZone);
  const startTime = formatTime(startDate, timeZone);
  let range = `${startDateLabel} ${startTime}`;
  if (endDate) {
    const sameDay =
      startDate.getFullYear() === endDate.getFullYear() &&
      startDate.getMonth() === endDate.getMonth() &&
      startDate.getDate() === endDate.getDate();
    const endTime = formatTime(endDate, timeZone);
    if (sameDay) {
      range += ` – ${endTime}`;
    } else {
      const endDateLabel = formatDateParts(endDate, timeZone);
      range += ` – ${endDateLabel} ${endTime}`;
    }
  }
  return tzid ? `${range} (${tzid})` : range;
};

module.exports = {
  formatDateTimeRangeLabel
};
