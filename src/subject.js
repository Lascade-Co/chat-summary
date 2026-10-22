/** Format either an edition-local calendar date or an instant in that edition. */
export function subject(name, date, tz, tail) {
  let instant;
  let timeZone = tz;
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    // A report date is already a calendar day in the edition timezone.
    instant = new Date(`${date}T12:00:00Z`);
    if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== date) {
      throw new RangeError("Invalid report date");
    }
    timeZone = "UTC";
  } else {
    instant = date instanceof Date ? date : new Date(date);
    if (!Number.isFinite(instant.getTime())) throw new RangeError("Invalid report date");
  }
  const displayDate = new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone,
  }).format(instant);
  return `${name} · ${displayDate} — ${tail}`;
}
