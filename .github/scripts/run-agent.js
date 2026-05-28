#!/usr/bin/env node
/**
 * Mealzy Agent Runner — GitHub Actions
 *
 * Fixes applied vs previous version:
 * 1. Fetches real data from mealzy.org before building prompt
 *    (analytics, funnel stats, health check, test meal plan)
 * 2. Each agent only gets the data relevant to their job
 * 3. Daily workflow conflict removed — day-specific files handle everything
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY  — always required
 *   APP_URL            — https://mealzy.org (add as GitHub secret)
 *   PRO_TOKEN          — same value as in your .env (add as GitHub secret)
 *
 * Optional env vars (for social posting):
 *   FACEBOOK_WEBHOOK, INSTAGRAM_WEBHOOK, HCTI_USER_ID, HCTI_API_KEY
 *   TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET
 */

'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const fs        = require('fs');
const path      = require('path');

const agentName = process.argv[2];
if (!agentName) {
  console.error('Usage: node run-agent.js <agent-name>');
  process.exit(1);
}

const ROOT    = path.join(__dirname, '..', '..');
const APP_URL = (process.env.APP_URL || 'https://mealzy.org').replace(/\/$/, '');
const TOKEN   = process.env.PRO_TOKEN || '';

function readFile(relPath) {
  const full = path.join(ROOT, relPath);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}

// ── Which agents need which data ──────────────────────────────────────────
// analytics  → signups, plans generated, pro users, page views
// funnel     → conversion rates at each step
// health     → server status, db status
// test_plan  → generate a real meal plan to inspect quality
const DATA_NEEDS = {
  casey:            ['analytics', 'funnel'],
  riley:            ['analytics', 'funnel'],
  finlay:           ['analytics', 'funnel'],
  morgan:           ['health'],
  avery:            ['health'],
  quinn:            ['health', 'test_plan'],
  'budget-guard':   ['test_plan'],
  'macro-specialist': ['test_plan'],
  'culinary-critic':  ['test_plan'],
  'grocery-optimizer':['test_plan'],
  charlie:          ['analytics'],
  drew:             ['analytics', 'funnel'],
  robin:            ['analytics'],
  logan:            ['analytics'],
  harper:           ['analytics'],
};

// ── Fetch real data from mealzy.org ───────────────────────────────────────
async function fetchLiveData(needs) {
  const data = {};

  if (needs.includes('health')) {
    try {
      const r = await fetch(`${APP_URL}/api/health`, { signal: AbortSignal.timeout(10000) });
      data.health = await r.json();
      console.log(`[data] health: ${data.health.status}`);
    } catch (e) {
      data.health = { status: 'unreachable', error: e.message };
      console.warn(`[data] health fetch failed: ${e.message}`);
    }
  }

  if (needs.includes('analytics') && TOKEN) {
    try {
      const r = await fetch(`${APP_URL}/api/analytics?token=${TOKEN}`, { signal: AbortSignal.timeout(15000) });
      data.analytics = await r.json();
      console.log(`[data] analytics: ${data.analytics.total_users} users, ${data.analytics.pro_users} pro`);
    } catch (e) {
      data.analytics = { error: e.message };
      console.warn(`[data] analytics fetch failed: ${e.message}`);
    }
  }

  if (needs.includes('funnel') && TOKEN) {
    try {
      const r = await fetch(`${APP_URL}/api/analytics/funnel?token=${TOKEN}`, { signal: AbortSignal.timeout(15000) });
      data.funnel = await r.json();
      console.log(`[data] funnel: fetched`);
    } catch (e) {
      data.funnel = { error: e.message };
      console.warn(`[data] funnel fetch failed: ${e.message}`);
    }
  }

  if (needs.includes('test_plan')) {
    // Generate one real test meal plan so quality agents have actual output to review
    try {
      const r = await fetch(`${APP_URL}/api/generate-meal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          plan_token: TOKEN, // admin bypass — skips freemium gate
          profile: {
            name: 'Test User',
            fitness_goal: 'lose weight',
            dietary_preferences: [],
            allergies: [],
            cooking_skill: 'intermediate',
            daily_calories: 2000,
            daily_protein: 150,
            daily_carbs: 200,
            daily_fat: 67,
            budget_weekly: 80,
            currency: 'USD',
            cooking_time_minutes: 30,
            language: 'en',
          },
          date: new Date().toISOString().split('T')[0],
        }),
      });
      data.test_plan = await r.json();
      console.log(`[data] test_plan: generated (${data.test_plan.mealPlan?.meals?.length || 0} meals)`);
    } catch (e) {
      data.test_plan = { error: e.message };
      console.warn(`[data] test_plan fetch failed: ${e.message}`);
    }
  }

  return data;
}

// ── Format live data for the prompt ──────────────────────────────────────
function formatLiveData(data) {
  if (!data || Object.keys(data).length === 0) return '';

  const lines = ['## LIVE DATA FROM MEALZY.ORG (fetched just now — these are real numbers)'];

  if (data.health) {
    lines.push(`\n### Server health\n- Status: ${data.health.status}\n- DB: ${data.health.db || 'unknown'}\n- Checked at: ${data.health.timestamp || 'now'}`);
  }

  if (data.analytics && !data.analytics.error) {
    const a = data.analytics;
    lines.push(`\n### Analytics\n- Total users: ${a.total_users}\n- Pro users: ${a.pro_users}\n- This month: ${a.this_month?.signups || 0} signups, ${a.this_month?.plans_generated || 0} plans generated, ${a.this_month?.pro_activations || 0} pro activations\n- Free limit hits this month: ${a.this_month?.free_limit_hits || 0}\n- Upgrade clicks this month: ${a.this_month?.upgrade_clicks || 0}\n- All-time plans generated: ${a.all_time?.plans_generated || 0}`);
  } else if (data.analytics?.error) {
    lines.push(`\n### Analytics\n- Fetch failed: ${data.analytics.error} — use estimates and flag data unavailability`);
  }

  if (data.funnel && !data.funnel.error) {
    lines.push(`\n### Funnel stats\n${JSON.stringify(data.funnel, null, 2)}`);
  } else if (data.funnel?.error) {
    lines.push(`\n### Funnel\n- Fetch failed: ${data.funnel.error}`);
  }

  if (data.test_plan && !data.test_plan.error) {
    const meals = data.test_plan.mealPlan?.meals || [];
    const summary = meals.map(m =>
      `- ${m.type}: ${m.name} | ${m.calories}kcal | P:${m.protein}g C:${m.carbs}g F:${m.fat}g | $${m.estimatedCost}`
    ).join('\n');
    const total = data.test_plan.mealPlan?.totalCalories;
    const cost  = data.test_plan.mealPlan?.totalCost;
    lines.push(`\n### Real test meal plan (standard profile, $80/week, 2000kcal)\nTotal: ${total}kcal | $${cost}\n${summary}`);
  } else if (data.test_plan?.error) {
    lines.push(`\n### Test plan\n- Fetch failed: ${data.test_plan.error}`);
  }

  return lines.join('\n');
}

// ── Build the prompt ──────────────────────────────────────────────────────
const skillContent  = readFile(`.agents/skills/${agentName}.md`);
const memoryContent = readFile(`.agents/memory/${agentName}.md`);
const teamContent   = readFile('.agents/memory/TEAM.md');

if (!skillContent) {
  console.error(`No skill file found: .agents/skills/${agentName}.md`);
  process.exit(1);
}

const today    = new Date();
const dateStr  = today.toISOString().split('T')[0];
const dayName  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][today.getDay()];
const isMonday = today.getDay() === 1;

const DAY_KICKOFF = `
TODAY IS ${dayName.toUpperCase()}, ${dateStr}.
Run ONLY the tasks listed under ${dayName} in your SCHEDULE section (and WEEKLY AUTOPILOT OUTPUT if today is Monday).
Produce all deliverables in full — not summaries, not plans, the actual output.
Use ## headers for every deliverable. End with ## MEMORY UPDATE (3-5 bullet points).
${isMonday ? 'Include ## TWITTER POST and/or ## SOCIAL POST if your Monday output includes one.' : ''}
`;

async function main() {
  const client = new Anthropic();

  console.log(`Agent:  ${agentName}`);
  console.log(`Date:   ${dateStr} (${dayName})`);

  // Fetch live data for agents that need it
  const needs   = DATA_NEEDS[agentName] || [];
  const liveData = needs.length > 0 ? await fetchLiveData(needs) : {};
  const liveDataBlock = formatLiveData(liveData);

  if (liveDataBlock) {
    console.log(`[data] Injecting live data into prompt (${liveDataBlock.length} chars)`);
  }

  const prompt = `You are the ${agentName} agent for Mealzy (mealzy.org) — a free AI meal planner.
Tiers: Free (3 plans/month) · Pro $8/mo · Family $16/mo

Your skill file:
---
${skillContent}
---

Your memory from previous sessions:
---
${memoryContent || '(No memory yet — first run.)'}
---

Team context:
---
${teamContent || '(No TEAM.md found.)'}
---
${liveDataBlock ? `\n${liveDataBlock}\n` : ''}
${DAY_KICKOFF}`;

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
  fs.writeFileSync(outputFile, `# ${agentName} — ${dateStr} (${dayName})\n\n${output}`);
  console.log(`Output → .agents/outputs/${dateStr}-${agentName}.md`);

  // ── Save memory update ───────────────────────────────────────────────────
  const memMatch = output.match(/## MEMORY UPDATE\n([\s\S]+?)(?=\n## |\n---|\n_{3,}|$)/i);
  if (memMatch) {
    const memoryPath = path.join(ROOT, `.agents/memory/${agentName}.md`);
    const existing   = fs.existsSync(memoryPath) ? fs.readFileSync(memoryPath, 'utf8') : '';
    fs.writeFileSync(memoryPath, existing + `\n\n## ${dateStr}\n${memMatch[1].trim()}`);
    console.log(`Memory → .agents/memory/${agentName}.md`);
  } else {
    console.warn(`[warn] No ## MEMORY UPDATE block in ${agentName} output`);
  }

  // ── Facebook ──────────────────────────────────────────────────────────────
  const socialMatch = output.match(/## SOCIAL POST\n([\s\S]+?)(?=\n## |\n---|\n_{3,}|$)/i);
  if (socialMatch && process.env.FACEBOOK_WEBHOOK) {
    try {
      const res = await fetch(process.env.FACEBOOK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: socialMatch[1].trim(), agent: agentName, date: dateStr })
      });
      console.log(`Facebook → posted (${res.status})`);
    } catch (e) { console.warn(`Facebook → failed: ${e.message}`); }
  }

  // ── HTML Carousel → HCTI → Instagram ────────────────────────────────────
  const htmlMatch = output.match(/## HTML CAROUSEL\n```html\n([\s\S]+?)```/i);
  if (htmlMatch) {
    const htmlContent = htmlMatch[1].trim();
    fs.writeFileSync(path.join(outputDir, `${dateStr}-${agentName}-carousel.html`), htmlContent);
    const { HCTI_USER_ID, HCTI_API_KEY, INSTAGRAM_WEBHOOK } = process.env;
    if (HCTI_USER_ID && HCTI_API_KEY && INSTAGRAM_WEBHOOK) {
      const auth = Buffer.from(`${HCTI_USER_ID}:${HCTI_API_KEY}`).toString('base64');
      const imageUrls = [];
      for (let i = 1; i <= 10; i++) {
        try {
          const res  = await fetch('https://hcti.io/v1/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
            body: JSON.stringify({ html: htmlContent, selector: `.slide:nth-child(${i})` })
          });
          const d = await res.json();
          if (d.url) { imageUrls.push(d.url); console.log(`  Slide ${i} → ${d.url}`); }
        } catch (e) { console.warn(`  Slide ${i} failed: ${e.message}`); }
      }
      if (imageUrls.length >= 2) {
        const caption = socialMatch ? socialMatch[1].trim() : 'Free at mealzy.org';
        await fetch(INSTAGRAM_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrls, caption, agent: agentName, date: dateStr })
        }).catch(e => console.warn(`Instagram → failed: ${e.message}`));
        console.log(`Instagram → sent ${imageUrls.length} slides`);
      }
    }
  }

  // ── Twitter ───────────────────────────────────────────────────────────────
  const tweetMatch = output.match(/## TWITTER POST\n([\s\S]+?)(?=\n## |\n---|\n_{3,}|$)/i);
  const { TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET } = process.env;
  if (tweetMatch && TWITTER_API_KEY && TWITTER_API_SECRET && TWITTER_ACCESS_TOKEN && TWITTER_ACCESS_TOKEN_SECRET) {
    try {
      const { TwitterApi } = require('twitter-api-v2');
      const tw = new TwitterApi({
        appKey: TWITTER_API_KEY, appSecret: TWITTER_API_SECRET,
        accessToken: TWITTER_ACCESS_TOKEN, accessSecret: TWITTER_ACCESS_TOKEN_SECRET
      });
      const tweet = await tw.v2.tweet(tweetMatch[1].trim());
      console.log(`Twitter → posted (id ${tweet.data.id})`);
    } catch (e) { console.warn(`Twitter → failed: ${e.message}`); }
  }

  console.log('Done.');
}

main().catch(err => {
  console.error('Agent run failed:', err.message);
  process.exit(1);
});
