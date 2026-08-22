'use strict';

/* Pure ISO-8601 week-key calculation, split out of server.js so it can be
 * unit-tested directly (server.js has no module.exports — it's the app
 * entry point, not a requirable module). Used by the week_return retention
 * signal in server.js to compare a user's previous and current plan weeks. */

/** ISO-8601 week key ("2026-W34") for a Date — Monday-start, correct across year boundaries. */
function getISOWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Sunday -> 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // shift to this week's Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

module.exports = { getISOWeekKey };
