# Mealzy — Production Deployment & Data Persistence

## Architecture

| Component | What | Lives where |
|---|---|---|
| Sessions | Stateless JWT in httpOnly cookie | Browser cookie — survives server restarts ✅ |
| Database | SQLite via sql.js | `mealzy.db` — needs Render Disk to survive deploys |
| Auth | JWT signed with `JWT_SECRET` | Cookie / server verifies on every request |
| Pro activation | Stripe webhook (primary) + pro-welcome.html (backup) | Both write `pro = 1` to SQLite |

---

## ⚠️ Critical: Add Render Persistent Disk

Without a persistent disk, **`mealzy.db` is wiped on every Render deploy and idle restart**.
A paying customer's account will disappear.

### Steps (takes 2 minutes, costs $1/month):

1. Go to your Render dashboard → select the **mealzy** service
2. Click **Disks** in the left sidebar
3. Click **Add Disk**
4. Set:
   - **Name**: `mealzy-data`
   - **Mount path**: `/opt/render/project/src`
   - **Size**: 1 GB
5. Click **Save** — Render redeploys automatically

The database file at `/opt/render/project/src/mealzy.db` will now persist across all deploys and restarts.

---

## Required Environment Variables

Set all of these in Render Dashboard → your service → **Environment**:

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Claude API key |
| `JWT_SECRET` | ✅ | Long random string. Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `PRO_TOKEN` | ✅ | Secret for admin endpoints. Any long random string. |
| `STRIPE_SECRET_KEY` | ✅ | From Stripe dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | ✅ | From Stripe Webhooks (see below) |
| `APP_URL` | ✅ | `https://mealzy.org` — used in password reset links |
| `NODE_ENV` | ✅ | `production` |

---

## Stripe Webhook Setup

Without the webhook, Pro is only activated when the user visits `pro-welcome.html` after
payment. If they close the tab early, they paid but don't get Pro.

### Steps:

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. Endpoint URL: `https://mealzy.org/api/stripe/webhook`
4. Select event: `checkout.session.completed`
5. Click **Add endpoint**
6. Copy the **Signing secret** (`whsec_...`)
7. Add it to Render as `STRIPE_WEBHOOK_SECRET`

Now Pro is activated server-side regardless of what the browser does.

---

## Database Backup

### Export via admin API:
```bash
curl -H "x-pro-token: YOUR_PRO_TOKEN" https://mealzy.org/api/admin/export > backup_$(date +%Y%m%d).json
```

### Download the SQLite file directly (from Render shell):
```bash
# In Render Shell (your service → Shell tab)
cp mealzy.db /tmp/mealzy_backup.db
```

### SQLite schema:
- `users` — accounts (id, name, email, hashed_password, pro, created_at)
- `profiles` — onboarding profile JSON per user
- `plans` — meal plan history per user
- `reset_tokens` — password reset tokens (1 hour TTL, single-use)
- `leads` — email lead captures
- `analytics` — event log

---

## Health Check

```
GET https://mealzy.org/api/health
```

Returns:
```json
{ "status": "ok", "db": "connected", "timestamp": "...", "version": "3.0.0" }
```

Returns `"status": "degraded"` if the database is not reachable.
Use this URL in Render's health check settings.

---

## Deployment Checklist

Before going live:

- [ ] Add Render persistent disk (mount: `/opt/render/project/src`, size: 1 GB)
- [ ] Set `JWT_SECRET` in Render env vars (long random string)
- [ ] Set `ANTHROPIC_API_KEY`
- [ ] Set `PRO_TOKEN`
- [ ] Set `STRIPE_SECRET_KEY`
- [ ] Set `STRIPE_WEBHOOK_SECRET` (after adding webhook in Stripe)
- [ ] Set `APP_URL=https://mealzy.org`
- [ ] Set `NODE_ENV=production`
- [ ] Verify `/api/health` returns `"db": "connected"` after deploy
- [ ] Test signup → onboarding → dashboard flow end-to-end
- [ ] Test Stripe payment → Pro activation via webhook
- [ ] Test password reset link flow
