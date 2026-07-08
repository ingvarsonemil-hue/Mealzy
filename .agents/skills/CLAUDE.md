# Mealzy Agent Team — Status, Roster & Routing

## ⛔ STATUS: ALL AGENTS PAUSED — as of 2026-07-06

No agent is supposed to run on a schedule. Do not invoke `run-agent.js`, re-enable a workflow job, or trigger a `workflow_dispatch` unless Emil explicitly asks. **Every agent run calls the Anthropic API (claude-sonnet-4-6, up to 8192 output tokens) and spends real money.**

### Pause enforced in the workflows as of 2026-07-06

An audit on 2026-07-06 found 9 jobs still firing on cron despite the pause policy — blake, avery, riley, jordan, cs, budget-guard, macro-specialist, culinary-critic, and the Monday digest (last evidence of runs: commits `f42bcf3` avery 2026-07-03, `7b0586e` cs 2026-07-02). All 9 were gated with `if: false` in the same commit that added this doc. The cron schedules remain in the files, but every job is gated, so nothing executes and nothing spends tokens.

Caveat: GitHub runs scheduled workflows from the **default branch**. The gates take effect only once this branch is merged to main — until then, main's ungated workflows keep firing on schedule.

Status here can drift from the workflows — it has before. Re-verify with the script below rather than trusting this section.

Not agents (do not pause as part of this): `keep-alive.yml` (pings mealzy.org every 9 min to reduce cold starts), `cron-day3-nudge.yml` and `cron-weekly-digest.yml` (product email crons hitting mealzy.org API endpoints — no Anthropic spend).

### How to verify pause status (exact check, no judgment needed)

Run from repo root:

```bash
python3 - <<'EOF'
import re, glob
for f in sorted(glob.glob('.github/workflows/*agents*.yml') + ['.github/workflows/agents.yml']):
    lines, jobs, cur = open(f).read().splitlines(), {}, None
    started = False
    for ln in lines:
        if ln == 'jobs:': started = True; continue
        if not started: continue
        m = re.match(r'^  ([A-Za-z0-9_-]+):\s*$', ln)
        if m: cur = m.group(1); jobs[cur] = None
        elif cur and jobs[cur] is None:
            m2 = re.match(r'^    if:\s*(.+)$', ln)
            if m2: jobs[cur] = m2.group(1).strip()
    live = [j for j, c in jobs.items() if c != 'false']
    print(f, '→ LIVE:', live if live else 'none')
EOF
```

Every workflow must print `LIVE: none`. Any name in a LIVE list = that agent runs (and burns tokens) on its next cron after reaching main.

## Roster (32 agent files — 20 named employees + 12 utility agents — PAUSED, do not delete; CLAUDE.md itself and the orphaned mealzy-design.md bring the directory to 34 files total)

Full profiles in `.agents/TEAM-OVERVIEW.md`; per-agent skill files in this directory (`<name>.md`); schedules in `.agents/schedule.md`.

**Marketing:** Alex (video scripts), Maya (copy/CRO), Jordan (email/retention), Sam (SEO), Riley (growth/A-B tests), Casey (pricing/monetisation), Taylor (launch/brand), Skylar (virality)

**Product & Engineering:** Quinn (AI/prompts), Morgan (full-stack), Drew (PM), Charlie (support), Avery (DevOps), Blake (security), Nova (design)

**Business Ops:** Harper (legal), Finlay (finance), Logan (partnerships), Robin (user research), Matteo (i18n)

**Utility agents (also paused):** budget-guard, macro-specialist, culinary-critic, grocery-optimizer, growth, contentops, cs, director, ab-writer, retention, product-marketing, stripe-guard

## Runner & routing — .github/scripts/run-agent.js (keep documented)

Invocation: `node .github/scripts/run-agent.js <agent-name>` (requires `ANTHROPIC_API_KEY`; optional `APP_URL`, `PRO_TOKEN`, social webhooks).

Prompt assembly: `.agents/skills/<agent>.md` (required — exits if missing) + `.agents/memory/<agent>.md` + `.agents/memory/TEAM.md` + live data per `DATA_NEEDS` (analytics/funnel/health/test_plan fetched from mealzy.org; `test_plan` triggers a real `/api/generate-meal` call — extra Anthropic spend on the server side).

Header-to-destination mapping — the runner scans the model output for these `##` headers and routes each match:

| Output header | Destination |
|---|---|
| (entire output) | `.agents/outputs/<date>-<agent>.md`, committed to the repo |
| `## MEMORY UPDATE` | appended to `.agents/memory/<agent>.md` |
| `## SOCIAL POST` | POSTed to `FACEBOOK_WEBHOOK` |
| `## HTML CAROUSEL` (```html block) | rendered to images via HCTI (`HCTI_USER_ID`/`HCTI_API_KEY`), then POSTed to `INSTAGRAM_WEBHOOK` (≥2 slides) |
| `## TWITTER POST` | tweeted via twitter-api-v2 (`TWITTER_*` env vars) |

Social posting only fires when the matching webhook/API env vars are set on the workflow. While paused, none of this should execute — but the mapping stays documented so re-enabling doesn't require reverse-engineering the runner.

## Re-enabling an agent (only on Emil's explicit request)

1. In the day's workflow file, change that job's `if: false` to the intended condition (or remove it).
2. Check the header comment on the workflow — each paused agent has a written re-enable condition (e.g. "alex: re-enable when Instagram or TikTok reaches 500 followers"). Confirm the condition is actually met before flipping the gate.
3. Re-run the verification script above; only the intended agent may appear as LIVE.
4. A one-off manual run without un-pausing: `node .github/scripts/run-agent.js <agent>` locally, or the workflow's `workflow_dispatch` button — both spend API tokens; confirm with Emil first.
