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

  // ── Post to Facebook via Make webhook (if MAKE_FACEBOOK_WEBHOOK is set) ──
  const socialMatch = output.match(/## SOCIAL POST\n([\s\S]+?)(?=\n## |\n---|\n_{3,}|$)/i);
  const webhookUrl  = process.env.MAKE_FACEBOOK_WEBHOOK;
  if (socialMatch && webhookUrl) {
    const postText = socialMatch[1].trim();
    try {
      const res = await fetch(webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: postText, agent: agentName, date: dateStr })
      });
      console.log(`Facebook → posted (status ${res.status})`);
    } catch (err) {
      console.warn(`Facebook → failed: ${err.message}`);
    }
  }

  // ── Save HTML carousel + screenshot slides via HTMLCSStoImage ───────────
  const htmlMatch = output.match(/## HTML CAROUSEL\n```html\n([\s\S]+?)```/i);
  if (htmlMatch) {
    const htmlContent = htmlMatch[1].trim();
    const htmlPath    = path.join(outputDir, `${dateStr}-${agentName}-carousel.html`);
    fs.writeFileSync(htmlPath, htmlContent);
    console.log(`HTML Carousel → .agents/outputs/${dateStr}-${agentName}-carousel.html`);

    const hctiUser    = process.env.HCTI_USER_ID;
    const hctiKey     = process.env.HCTI_API_KEY;
    const igWebhook   = process.env.MAKE_INSTAGRAM_WEBHOOK;

    if (hctiUser && hctiKey && igWebhook) {
      const auth      = Buffer.from(`${hctiUser}:${hctiKey}`).toString('base64');
      const imageUrls = [];

      for (let i = 1; i <= 10; i++) {
        try {
          const res  = await fetch('https://hcti.io/v1/image', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
            body:    JSON.stringify({ html: htmlContent, selector: `.slide:nth-child(${i})` })
          });
          const data = await res.json();
          if (data.url) { imageUrls.push(data.url); console.log(`  Slide ${i}/10 → ${data.url}`); }
          else console.warn(`  Slide ${i} — HCTI error: ${JSON.stringify(data)}`);
        } catch (err) {
          console.warn(`  Slide ${i} screenshot failed: ${err.message}`);
        }
      }

      if (imageUrls.length >= 2) {
        const caption = socialMatch ? socialMatch[1].trim() : 'Free at mealzy.org';
        try {
          const res = await fetch(igWebhook, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ imageUrls, caption, agent: agentName, date: dateStr })
          });
          console.log(`Instagram → sent ${imageUrls.length} slides (status ${res.status})`);
        } catch (err) {
          console.warn(`Instagram → webhook failed: ${err.message}`);
        }
      } else {
        console.warn(`Instagram → skipped (only ${imageUrls.length} slides screenshotted)`);
      }
    } else if (!hctiUser || !hctiKey) {
      console.log('Instagram → skipped (HCTI_USER_ID / HCTI_API_KEY not set)');
    }
  }

  console.log('Done.');
}

main().catch(err => {
  console.error('Agent run failed:', err.message);
  process.exit(1);
});
