/**
 * Shared local-date formatting helpers (device-local, no UTC conversion).
 * Used by both the Plan and Meal Detail adapters so date-label formatting
 * isn't duplicated per feature.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function parseYmdLocal(s: string): Date | null {
  const [y, m, d] = s.split('-').map((n) => Number(n));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** "Sep 7" */
export function formatShortDate(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** "Sep 7–13" when both dates share a month, "Sep 28 – Oct 4" otherwise. */
export function formatDateRangeLabel(startIso: string, endIso: string): string {
  const start = parseYmdLocal(startIso);
  const end = parseYmdLocal(endIso);
  if (!start || !end) return '';

  const startLabel = formatShortDate(start);
  if (start.getMonth() === end.getMonth()) return `${startLabel}–${end.getDate()}`;
  return `${startLabel} – ${formatShortDate(end)}`;
}

/** "Monday, Sep 7" */
export function formatDayLabel(dayName: string, iso: string): string {
  const date = parseYmdLocal(iso);
  return date ? `${dayName}, ${formatShortDate(date)}` : dayName;
}
