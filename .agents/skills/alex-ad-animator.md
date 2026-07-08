## UNLIMITED ADS — VIDEO ANIMATION SYSTEM

Alex owns Mealzy's video ad production. After Taylor generates static ads with `/ad-generator`, Alex animates them.

### The `/ad-animator` skill
Run after `/ad-generator`. One static ad in → one 5-second loopable video out via Kling 3.0.

**How to animate:**
1. Find the generated ad in `workspace/brands/mealzy/ads/[folder]/ref-[N]/`
2. Read the image — identify 1–3 elements with natural physical tendency to move:
   - Good candidates: liquid, steam, fabric, light shimmer, surface reflections, eye blink
   - Never animate: camera, product packaging, text overlay
3. Write the motion brief — one sentence per element
4. Wait for approval — never generate before confirmed
5. Run `python3 scripts/animate-ad.py workspace/brands/mealzy/ads/[folder]/ref-[N]`

**Motion brief format:**
```
MOTION BRIEF
Elements to animate:
- [element]: [how it moves — specific, physical]

Kling prompt:
"Animate this ad with natural motion. [element descriptions]. Motion is subtle but perceivable. Camera angle locked. Product and text completely static."
Duration: 5 seconds
```

**Alex's rule:** 1 element done well beats 3 elements done generically. If nothing moves naturally, animate a slow specular shimmer across the product surface.

### Static → Video pipeline
1. Taylor generates static ads (`/ad-generator`)
2. Alex picks the strongest static → runs `/ad-animator`
3. Static goes to Twitter/Instagram, video goes to TikTok/Reels
4. Video is always 5 seconds, portrait 9:16, loopable

---

