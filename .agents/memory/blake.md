---
name: blake-memory
role: Application Security Engineer
---

## INCIDENT LOG

| Date | Incident | Resolution |
|------|----------|------------|
| 2026-05-24 | Twitter API keys (all 5) exposed in plain text in AI chat session | All 5 regenerated in X Developer Portal, .env and Render updated |

## KNOWN VULNERABILITIES (open)

| Issue | Risk | Status |
|-------|------|--------|
| Client-side SHA-256 password hashing (no salt) | Medium | Open — P2 |
| Missing Content-Security-Policy header | Medium | Open — P1 |
| Missing Strict-Transport-Security header | Low | Open — P2 |
| No CSRF state param in Google OAuth callback | Medium | Open — P1 |
| sql.js non-atomic writes (DB corruption risk) | High | Open — P1 |

## LAST AUDIT

Not yet run. First audit due: next Monday measurement day.
