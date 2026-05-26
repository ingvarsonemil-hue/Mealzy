#!/usr/bin/env node
/**
 * Mealzy Agent Runner — GitHub Actions
 * Reads skill + memory + team context, calls Anthropic API, saves output.
 *
 * Usage: node .github/scripts/run-agent.js <agent-name>
 * Env:   ANTHROPIC_API_KEY
 */

const Anthropic = require('@anthropic-ai/sdk');
const fs        = require('fs');
const path      = require('path');

const agentName = process.argv[2];
if (!agentName) {
  console.error('Usage: node run-agent.js <agent-name>');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..', '..');

function readFile(relPath) {
  const full = path.join(ROOT, relPath);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}

const skillContent  = readFile(`.agents/skills/${agentName}.md`);
const memoryContent = readFile(`.agents/memory/${agentName}.md`);
const teamContent   = readFile('.agents/memory/TEAM.md');

if (!skillContent) {
  console.error(`No skill file found: .agents/skills/${agentName}.md`);
  process.exit(1);
}

const today   = new Date();
const dateStr = today.toISOString().split('T')[0];
const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][today.getDay()];

const prompt = `You are the ${agentName} agent for Mealzy (mealzy.org) — a free AI meal planner that generates a week of personalised meals in 30 seconds, hitting calorie/macro targets and grocery budget.
Tiers: Free (3 plans/month) · Pro $8/mo · Family $16/mo

Your complete skill file (defines who you are, your rules, and your weekly schedule):
---
${skillContent}
---

Your memory from previous sessions:
---
${memoryContent || '(No memory yet — this is your first run.)'}
---

Team context for this week:
---
${teamContent || '(No team context file found.)'}
---

Today is ${dayName}, ${dateStr}.

Run your scheduled weekly tasks exactly as defined in your WEEKLY AUTOPILOT OUTPUT (or SCHEDULE) section.
Produce all deliverables in full — do not abbreviate or summarise. Emil will review this output and use it directly.

Format your output with clear ## headers for each deliverable.

At the end, add a ## MEMORY UPDATE section with 3-5 bullet points of new lessons or observations to remember for next time.`;

async function main() {
  const client = new Anthropic();

  console.log(`Agent:  ${agentName}`);
  console.log(`Date:   ${dateStr} (${dayName})`);
  console.log('Calling Anthropic API...');

  const message = await client.messages.create({
    model:      'claude-opus-4-5',
    max_tokens: 8192,
    messages:   [{ role: 'user', content: prompt }]
  });

  const output = message.content[0].text;

  // ── Save output ──────────────────────────────────────────────────────────
  const outputDir = path.join(ROOT, '.agents', 'outputs');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputFile = path.join(outputDir, `${dateStr}-${agentName}.md`);
  fs.writeFileSync(outputFile, `# ${agentName} — ${dateStr}\n\n${output}`);
  console.log(`Output → .agents/outputs/${dateStr}-${agentName}.md`);

  // ── Append memory update (if agent included one) ─────────────────────────
  const memMatch = output.match(/## MEMORY UPDATE\n([\s\S]+?)(?=\n## |\n---|\n_{3,}|$)/i);
  if (memMatch) {
    const memoryPath = path.join(ROOT, `.agents/memory/${agentName}.md`);
    const existing   = fs.existsSync(memoryPath) ? fs.readFileSync(memoryPath, 'utf8') : '';
    const newEntry   = `\n\n## ${dateStr}\n${memMatch[1].trim()}`;
    fs.writeFileSync(memoryPath, existing + newEntry);
    console.log(`Memory → .agents/memory/${agentName}.md`);
  }

  console.log('Done.');
}

main().catch(err => {
  console.error('Agent run failed:', err.message);
  process.exit(1);
});
