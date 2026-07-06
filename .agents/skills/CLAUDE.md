# .agents/skills/ — Agent System Rules

- 19 agents defined by the skill files in this folder, run via GitHub Actions cron (`.github/workflows/*-agents.yml`):
  - Marketing: Alex, Maya, Jordan, Sam, Riley, Casey, Taylor
  - Product: Quinn, Morgan, Drew, Charlie, Avery
  - Business: Harper, Finlay, Logan, Robin, Matteo
- `.github/scripts/run-agent.js` extracts output blocks by markdown header:
  - `## SOCIAL POST` → Facebook webhook
  - `## HTML CAROUSEL` → HCTI screenshot → Instagram webhook
  - `## TWITTER POST` → twitter-api-v2
- Most agents are currently paused pending sufficient user scale — confirm which are active (workflow schedules + `.agents/config.json`) before assuming an agent's output will actually post.
- Jordan (weekly digest email, `cron-weekly-digest.yml`) is confirmed active — but is affected by the `getUsersForWeeklyDigest()` Pro-user bug noted in root CLAUDE.md.
