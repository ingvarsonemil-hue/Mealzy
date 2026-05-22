# Mealzy — Data Persistence Notes

## Where data lives

| Path | Contents | Gitignored |
|---|---|---|
| `data/users.json` | All user accounts (email, hashed password, pro flag) | ✅ Yes |
| `data/profiles/{userId}.json` | Onboarding profile per user | ✅ Yes |
| `data/plans/{userId}/{date}_{ts}.json` | Saved meal plan history per user | ✅ Yes |
| `data/reset-tokens.json` | Pending password-reset tokens (1-hour TTL) | ✅ Yes |
| `data/backup.jsonl` | Append-only event log (signups, logins, saves) | ✅ Yes |

All files under `data/` are gitignored — **user PII never touches GitHub**.

---

## ⚠️ Render free tier — ephemeral filesystem

Render's free-tier instances have an **ephemeral filesystem**: the disk is wiped on every deploy and on routine restarts (roughly every 15 minutes of inactivity).

**What this means in practice:**
- `data/users.json` and all profile/plan files are deleted on every Render deploy.
- Users will be logged out (in-memory sessions are also cleared).
- Returning users whose accounts lived only on the server will see "No account found" and need to re-register.

**Mitigations:**

### Option 1 — Render Disk (paid, $1/month)
Add a persistent disk in the Render dashboard:
1. Service → Disks → Add Disk
2. Mount path: `/opt/render/project/src/data`
3. Size: 1 GB (more than enough for years of JSON files)

This is the **recommended production fix** once you have paying users.

### Option 2 — External database (free tier available)
Migrate `data/users.json` → PostgreSQL (Supabase free tier, Neon, Railway, etc.)  
Supabase credentials can be added to the `.env` file; the existing `cloudSave` / `cloudLoad` stubs in each HTML file are already wired for this.

### Option 3 — Export backup before deploy
Before each `git push` / Render deploy:
```bash
curl -H "Authorization: Bearer $PRO_TOKEN" https://mealzy.org/api/admin/export > backup_$(date +%Y%m%d).json
```
Then restore from the backup after the deploy by re-running the signup flow for affected users.  
The `data/backup.jsonl` append-only log can also be used to reconstruct account state.

---

## Recovery from `backup.jsonl`

Each line is a JSON object with a `type` field:

```json
{"type":"signup","email":"user@example.com","id":"uuid","name":"Alice","ts":"2026-05-22T..."}
{"type":"profile_save","userId":"uuid","profile":{...},"ts":"..."}
{"type":"plan_save","userId":"uuid","plan":{...},"ts":"..."}
{"type":"pro_activate","email":"user@example.com","userId":"uuid","ts":"..."}
```

To rebuild `users.json` from the log:
```bash
node -e "
const fs = require('fs');
const lines = fs.readFileSync('data/backup.jsonl','utf8').trim().split('\n');
const users = {};
for (const line of lines) {
  const ev = JSON.parse(line);
  if (ev.type === 'signup') users[ev.email] = { id: ev.id, name: ev.name, email: ev.email, hashedPassword: ev.hashedPassword || '', pro: false, created: ev.ts };
  if (ev.type === 'pro_activate') { if (users[ev.email]) users[ev.email].pro = true; }
}
fs.writeFileSync('data/users.json', JSON.stringify(users, null, 2));
console.log('Restored', Object.keys(users).length, 'users');
"
```

---

## Admin export endpoint

```
GET /api/admin/export
Authorization: Bearer <PRO_TOKEN>
```

Returns JSON with:
- `users` — all accounts (passwords stripped)
- `backupLines` — count of backup log entries
- `exportedAt` — ISO timestamp

Set `PRO_TOKEN` in your `.env` file.
