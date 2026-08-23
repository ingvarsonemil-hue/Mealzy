'use strict';

// Narrow, pure helper used by POST /api/track. A client can send any `data`
// object it wants, so a `userId` field inside it is untrusted input — it must
// never reach the analytics table as-is. When the request carries a
// server-verified session (see optionalSession in server.js, which already
// re-checks the DB for token_version revocation), that trusted userId is
// attached instead. Anonymous requests pass through with no userId, exactly
// as /api/track behaved before this existed.
function resolveTrackedEventData(rawData, sessionUserId) {
  const safe = (rawData && typeof rawData === 'object' && !Array.isArray(rawData))
    ? { ...rawData }
    : {};
  delete safe.userId;
  if (sessionUserId) safe.userId = sessionUserId;
  return safe;
}

module.exports = { resolveTrackedEventData };
