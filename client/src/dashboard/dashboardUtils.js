export function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota — non-fatal, matches legacy's silent failures */
  }
}

export function todayStr() {
  return new Date().toISOString().split('T')[0];
}

/* Water target per National Academy of Medicine Dietary Reference Intake (via
 * Harvard T.H. Chan School of Public Health, Nutrition Source:
 * nutritionsource.hsph.harvard.edu/water/).
 * Formula: weight_kg × 32.5 ml (midpoint of 30–35 ml/kg range) ÷ 236.588 ml per 8 oz cup.
 * Sex-based floors: ≥9 cups (women) / ≥13 cups (men) per NAM guidance.
 * Fallback (no weight/sex): 11 cups (average of 13 male / 9 female NAM DRI). */
export function calcWaterGoal(profile) {
  const weight = profile?.weight;
  const gender = (profile?.gender || '').toLowerCase();
  let cups;
  if (weight) {
    cups = (weight * 32.5) / 236.588;
    const floor = gender === 'female' ? 9 : gender === 'male' ? 13 : 0;
    if (floor) cups = Math.max(cups, floor);
  } else {
    cups = 11;
  }
  return Math.round(cups);
}

export function getGreeting(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
