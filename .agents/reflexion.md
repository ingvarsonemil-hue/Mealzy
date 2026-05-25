# REFLEXION PROTOCOL
## Mealzy Agent Self-Improvement Framework

Based on: Shinn et al., "Reflexion: Language Agents with Verbal Reinforcement Learning" (NeurIPS 2023)

---

## What This Is

Every Mealzy employee follows this protocol. Instead of being static instruction-followers, each employee improves over time through verbal self-reflection. After every output, they evaluate themselves, reflect on failures, store that reflection, and read it before the next attempt.

This replaces expensive retraining with something more powerful: an agent that gets smarter from its own experience.

---

## The 4-Component Loop

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   MEMORY (past reflections)                             │
│        │                                                │
│        ▼                                                │
│   ACTOR  ──── attempts task ──► output                  │
│        │                           │                    │
│        │                           ▼                    │
│        │                      EVALUATOR                 │
│        │                    (score vs criteria)         │
│        │                           │                    │
│        │                      pass/fail                 │
│        │                           │                    │
│        │                    if fail ──► REFLECTOR       │
│        │                                    │           │
│        └──────────── reflection ────────────┘           │
│                   stored in memory                      │
└─────────────────────────────────────────────────────────┘
```

**Actor**: The employee doing the work — writing copy, running a test, generating a report.

**Evaluator**: The employee scores their own output against their specific success criteria (defined in their skill file). Score 1–10. If score < 7: reflect. If score ≥ 7: store as a positive example.

**Reflector**: The employee writes a verbal self-critique. Not vague ("could be better") — specific. What exactly failed? Why? What will change next time?

**Memory**: Reflections are stored in `.agents/memory/[name].md`. Every invocation begins by reading this file. This is how the agent carries learning forward across sessions.

---

## The Reflection Strategies (4 modes)

| Strategy | When to use |
|----------|------------|
| `NONE` | First attempt — no prior context |
| `LAST_ATTEMPT` | Read your previous output before trying again |
| `REFLEXION` | Read your stored reflections before attempting |
| `LAST_ATTEMPT + REFLEXION` | Read both — best for complex recurring tasks |

**Default for all Mealzy employees**: `REFLEXION` — always read your memory file before starting work each session.

---

## The Reflection Format (standard)

Every reflection stored in memory follows this template:

```
---
DATE: [YYYY-MM-DD]
TASK: [what was attempted — e.g. "Weekly email subject line", "A/B test design", "Plan quality test"]
SCORE: [X/10]
STRATEGY_USED: [NONE / LAST_ATTEMPT / REFLEXION / LAST_ATTEMPT+REFLEXION]

WHAT I DID:
[1-2 sentences describing the attempt]

WHAT FAILED:
[Specific, honest description of what didn't work and why. Not vague.]

ROOT CAUSE:
[Why did it fail? Was it the wrong approach? Missing information? Wrong assumption?]

WHAT I WILL DO DIFFERENTLY:
[Concrete, actionable change. "Next time I will X instead of Y because Z."]

POSITIVE PATTERN (if score ≥ 7):
[What worked that should be repeated]
---
```

---

## The Agent Loop (how to run it)

**At the start of every session:**
```
1. Read .agents/memory/[your-name].md
2. Note the last 3 reflections — what patterns appear?
3. Read .agents/memory/TEAM.md
4. Check Active Handoffs for any messages TO you or TO ALL
5. Act on any P0 handoffs before starting scheduled work
6. Carry all insights into this session's work
```

**After completing each output:**
```
1. Score your output against your success criteria (1–10)
2. If score ≥ 7: store a POSITIVE PATTERN entry
3. If score < 7: write a full REFLEXION entry
4. Append to .agents/memory/[your-name].md
5. Ask: does this lesson affect any other agent? If yes → write to TEAM.md
6. Ask: does this output create work for another agent? If yes → write a handoff in TEAM.md
7. If score < 5: attempt the task again immediately, using LAST_ATTEMPT + REFLEXION strategy
```

**Retry rule**: If your score is below 5, do not output to the user yet. Reflect and attempt again. You get 3 attempts before escalating to Emil.

---

## Memory File Format

Each employee has: `.agents/memory/[name].md`

```markdown
# [NAME] — Reflection Memory
Last updated: [date]
Total reflections: [N]
Running accuracy: [X% of outputs scored ≥7]

## Active Lessons (most impactful — read these first)
- [lesson 1]: [what to always do / never do]
- [lesson 2]: [pattern that keeps failing]
- [lesson 3]: [approach that consistently works]

## Reflection Log (newest first)
[individual reflection entries]
```

The **Active Lessons** section is maintained manually — extract the most important patterns from the log and keep them at the top so they're read first on every invocation.

---

## What Makes a Good Reflection

**Bad reflection** (too vague to be useful):
> "The email didn't perform well. I should write better subject lines next time."

**Good reflection** (specific, actionable, honest):
> "Subject line 'Free meal plan inside' triggered spam filters on Gmail — open rate dropped to 11%. Root cause: the word 'free' combined with 'inside' is a known spam trigger pattern. Next time: remove 'free' from subject lines, use 'Unlimited' or 'No limit' instead. Test in Mail Tester before sending."

The test: could another agent read this reflection and immediately know what to do differently? If yes, it's good. If no, it's too vague.

---

## Escalation Rule

If an employee scores themselves below 5 three times in a row on the same task type, they must:
1. Stop attempting the task
2. Flag to Emil with: the task, the 3 reflections, and a request for guidance
3. Wait for human input before attempting again

Some failures need human judgment — not more iterations.

---

## Cross-Agent Communication

Individual memory files are for your own lessons. **TEAM.md is for lessons that affect someone else.**

### Rule: when to write to TEAM.md vs your own memory

Write to `.agents/memory/TEAM.md` when:
- Your mistake could be made by another agent (e.g. Jordan discovers "free" in subject lines triggers spam → Alex and Maya should know)
- Your win could be applied by another agent (e.g. Alex discovers curiosity-gap carousels get 3× more saves → Taylor uses the same angle in Reddit posts)
- Your work creates a dependency for another agent (e.g. Quinn changes a prompt → Morgan must deploy it → Riley must track the change)
- You notice something that is another agent's problem to fix (e.g. Riley sees mobile drop-off on the upgrade modal → Nova needs to fix the layout)

Write to your own `.agents/memory/[name].md` when the lesson only affects your own future work.

### How to leave a handoff for another agent

Add this block to the **Active Handoffs → Pending** section of TEAM.md:

```
---
FROM: [your name]
TO: [agent name, or ALL]
DATE: [YYYY-MM-DD]
SUBJECT: [one line — what this is about]
MESSAGE: [the specific information, data, or observation]
ACTION NEEDED: [exactly what the receiving agent should do with this]
PRIORITY: [P0 = urgent / P1 = this week / P2 = when you get to it]
---
```

### How to receive a handoff

At the start of every session, after reading your personal memory file:
1. Read `.agents/memory/TEAM.md`
2. Check **Active Handoffs → Pending** for any messages TO you or TO ALL
3. Act on any P0 messages before starting your scheduled work
4. After acting, move the handoff block to **Completed handoffs log** and add: `RESOLVED: [date] — [what you did]`

### What good cross-agent communication looks like

**Too vague (useless):**
> From Alex to ALL: "carousel performance was mixed this week"

**Specific and actionable (useful):**
> From Alex to Taylor: Subject line "30 seconds to a full week of meals" generated 847 saves — highest this month. The specific time number ("30 seconds") was the key variable. Recommend using exact time claims in all Reddit posts and outreach copy this week. P1.

### The team knowledge chain (who depends on whom)

```
Quinn (prompts) → Morgan (deploy) → Riley (track)
Riley (A/B winner) → Maya (copy) → Nova (design variant)
Charlie (user complaints) → Drew (spec) → Morgan (build)
Blake (security finding) → Morgan (patch) → Avery (confirm)
Jordan (email data) → Riley (funnel) → Casey (MRR impact)
Alex (content performance) → Taylor (community angle) → Maya (landing page)
Logan (partnership leads) → Taylor (outreach) → Casey (revenue)
Robin (user research) → Drew (roadmap) → Quinn (prompt tuning)
```

When your work produces an output that affects the next agent in the chain, write them a handoff in TEAM.md.

---

## Why This Works

Standard AI agents repeat the same mistakes. Reflexion agents don't.

From the paper: Reflexion achieved 91% pass@1 on HumanEval coding (vs GPT-4's 80%) — not by being a better model, but by reflecting on failures and trying again with that knowledge.

For Mealzy: an employee who writes one bad email and reflects on why gets measurably better. An employee without Reflexion writes the same bad email every week and never knows why it underperformed.
