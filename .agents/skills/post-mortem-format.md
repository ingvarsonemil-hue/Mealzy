## POST-MORTEM ANALYSIS FORMAT — Shared Template
### Used by Alex and Taylor when content underperforms

This is not optional — it is how the team gets smarter. When any tracked content (video, carousel, script, community post) misses its threshold, the owning agent runs a structured post-mortem before producing the next piece of that type.

---

### Performance thresholds by agent (triggers a post-mortem)

| Agent  | Format               | Platform      | Threshold                          |
|--------|----------------------|---------------|-------------------------------------|
| alex   | Carousel             | Instagram     | < 6 saves in 48h                    |
| alex   | Video                | TikTok/Reels  | < 1,000 views in 48h                |
| alex   | Script               | Any           | < 1% CTR to mealzy.org              |
| taylor | Any community post   | Reddit        | < 10 upvotes in 24h OR removed by mods |
| taylor | Any community post   | Twitter/X     | < 5 reposts in 48h                  |
| taylor | Any community post   | Any           | 0 comments in 24h                   |

---

### Post-mortem format — Alex (script/video/carousel)

```
POST-MORTEM: [post title / date]
Platform: [Instagram / TikTok / Reels]
Format: [Carousel / Video]
Metric: [what was measured] → [actual result] (threshold: [X])

HOOK ANALYSIS:
- Slide 1 / opening line: [what it was]
- Did it create a "wait, what?" moment? [yes/no — why]
- Competing posts on the feed that day: [context]

ROOT CAUSE (pick the most likely):
[ ] Hook too generic — didn't stop the scroll
[ ] Topic wrong — audience doesn't care about this angle
[ ] Format mismatch — this topic needed video, not carousel (or vice versa)
[ ] Posting time — wrong hour/day for this platform
[ ] Slide 2 dropped off — rehook didn't build on slide 1
[ ] CTA was weak — slide 10 didn't drive action
[ ] Visual quality — design wasn't thumb-stopping

WHAT I WILL DO DIFFERENTLY:
[Specific, actionable change for next post of this type]

TEAM LESSON:
[One sentence that Taylor, Maya, or Riley should know about this]
```

### Post-mortem format — Taylor (community posts)

```
POST-MORTEM: [post title / date / community]
Metric: [actual result] (threshold: [X])

WHAT THE POST WAS:
[1 sentence describing the post]

ROOT CAUSE (pick most likely):
[ ] Value wasn't clear — it read as promotional
[ ] Wrong community — this audience doesn't have this problem
[ ] Posted at the wrong time (Reddit peaks: 6–9am EST weekdays)
[ ] Title/hook failed — didn't create curiosity or recognition
[ ] No personal story — too abstract to engage with
[ ] Topic already covered recently in this community

WHAT I WILL DO DIFFERENTLY:
[Specific change for next post in this community]
```

Taylor's format doesn't carry separate Platform/Format lines (the community/platform is folded into the post-mortem title) or a HOOK ANALYSIS / TEAM LESSON field — those are Alex-specific, kept here verbatim rather than forced onto Taylor's format, since Taylor's actual skill file doesn't use them.

---

### Cross-team escalation rule

**Alex's rule:**
- Root cause is **topic wrong** → leave a handoff in TEAM.md for Riley (A/B test the topic angle).
- Root cause is **hook too generic** → leave a handoff for Maya (copy improvement).
- Fails 3 posts in a row → escalate to Emil with all 3 post-mortems.

**Taylor's rule:**
- Cross-post every lesson to TEAM.md — Alex's carousels and the community posts should share the same topic angles that work.
