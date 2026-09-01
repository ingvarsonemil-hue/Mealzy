/**
 * Plan domain — pure logic only (no network, no Expo/native imports) so it can
 * be unit-tested under plain `node --test`.
 *
 * The backend response types here are intentionally narrow: only the fields
 * M4B actually consumes. `weeklyTotals.certification`, `weeklyTotals.purchasePlan`
 * and everything else on the wire are deliberately left out and never
 * interpreted on the client.
 */

// ── Narrow domain types ─────────────────────────────────────────────────────

export type PlanIngredient = {
  name: string;
  amount: string;
};

export type PlanMeal = {
  type: string;
  name: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** authoritative server-priced meal cost */
  cost: number;
  ingredients: PlanIngredient[];
};

export type PlanDay = {
  date: string;
  dayName: string;
  meals: PlanMeal[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalCost: number;
};

export type WeekWeeklyTotals = {
  totalCost: number;
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  /** opaque server string, shown verbatim if shown at all */
  budgetStatus?: string;
};

export type WeekPlan = {
  weekStart: string;
  /** present on a fresh generation response; absent on a plan read back from GET /api/plans */
  planId?: string;
  days: PlanDay[];
  weeklyTotals: WeekWeeklyTotals;
};

// ── Coercion helpers ────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function toIngredient(v: unknown): PlanIngredient {
  const r = isRecord(v) ? v : {};
  return { name: str(r.name), amount: str(r.amount) };
}

function toMeal(v: unknown): PlanMeal {
  const r = isRecord(v) ? v : {};
  return {
    type: str(r.type),
    name: str(r.name),
    description: str(r.description),
    calories: num(r.calories),
    protein: num(r.protein),
    carbs: num(r.carbs),
    fat: num(r.fat),
    cost: num(r.cost),
    ingredients: Array.isArray(r.ingredients) ? r.ingredients.map(toIngredient) : [],
  };
}

function toDay(v: unknown): PlanDay {
  const r = isRecord(v) ? v : {};
  return {
    date: str(r.date),
    dayName: str(r.dayName),
    meals: Array.isArray(r.meals) ? r.meals.map(toMeal) : [],
    totalCalories: num(r.totalCalories),
    totalProtein: num(r.totalProtein),
    totalCarbs: num(r.totalCarbs),
    totalFat: num(r.totalFat),
    totalCost: num(r.totalCost),
  };
}

function toWeeklyTotals(v: unknown): WeekWeeklyTotals {
  const r = isRecord(v) ? v : {};
  const out: WeekWeeklyTotals = {
    totalCost: num(r.totalCost),
    avgCalories: num(r.avgCalories),
    avgProtein: num(r.avgProtein),
    avgCarbs: num(r.avgCarbs),
    avgFat: num(r.avgFat),
  };
  if (typeof r.budgetStatus === 'string') out.budgetStatus = r.budgetStatus;
  return out;
}

/**
 * Normalise a raw blob into a WeekPlan, or null if it is not a weekly plan
 * shape (needs a string weekStart and a days array). Single-day blobs
 * ({ date, plan }) and malformed blobs return null.
 */
export function toWeekPlan(raw: unknown): WeekPlan | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.weekStart !== 'string' || raw.weekStart.length === 0) return null;
  if (!Array.isArray(raw.days)) return null;

  const week: WeekPlan = {
    weekStart: raw.weekStart,
    days: raw.days.map(toDay),
    weeklyTotals: toWeeklyTotals(raw.weeklyTotals),
  };
  if (typeof raw.planId === 'string' && raw.planId.length > 0) week.planId = raw.planId;
  return week;
}

// ── Saved-plan lookup result ────────────────────────────────────────────────

/**
 * The result of a GET /api/plans lookup for the current week.
 *
 *  - 'found'  : the GET succeeded and a matching weekly plan exists
 *  - 'none'   : the GET succeeded and there is definitively NO current-week plan
 *  - 'error'  : the GET did not succeed (network failure, non-200, unusable
 *               body). This does NOT establish that no plan exists, so the
 *               caller must never offer generation off the back of it.
 */
export type SavedWeekResult =
  | { kind: 'found'; week: WeekPlan }
  | { kind: 'none' }
  | { kind: 'error' };

/**
 * Pure classifier for a GET /api/plans response. Only a 200 carrying
 * { success: true, plans: [...] } can produce 'found' / 'none'; anything else
 * is 'error'. 401 lands here as 'error' too — apiFetch + the auth context
 * already handle the actual invalidation.
 */
export function classifySavedWeekResponse(
  res: { status: number; data: unknown },
  weekStart: string,
): SavedWeekResult {
  if (res.status !== 200 || !isRecord(res.data)) return { kind: 'error' };
  if (res.data.success !== true || !Array.isArray(res.data.plans)) return { kind: 'error' };
  const week = selectWeeklyPlan(res.data.plans, weekStart);
  return week ? { kind: 'found', week } : { kind: 'none' };
}

// ── Saved-plan selection ────────────────────────────────────────────────────

/**
 * Scan the mixed GET /api/plans array for the weekly plan matching weekStart.
 * Ignores single-day blobs and any blob that is not a well-formed weekly plan.
 * Never throws on unrelated / malformed entries.
 */
export function selectWeeklyPlan(list: unknown, weekStart: string): WeekPlan | null {
  if (!Array.isArray(list)) return null;
  for (const entry of list) {
    if (!isRecord(entry) || entry.weekStart !== weekStart) continue;
    const week = toWeekPlan(entry);
    if (week) return week;
  }
  return null;
}

// ── Week-date helpers (device-local, Monday start, no UTC conversion) ────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmdLocal(s: string): Date {
  const [y, m, d] = s.split('-').map((n) => Number(n));
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

/**
 * The Monday of the current week, in the device's local calendar, as YYYY-MM-DD.
 * All arithmetic is done with local getFullYear/getMonth/getDate + setDate, so
 * there is no UTC offset bug and month/year rollover is handled by Date itself.
 */
export function currentWeekStart(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = d.getDay(); // 0 = Sunday .. 6 = Saturday (local)
  const toMonday = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + toMonday);
  return ymd(d);
}

/** Human label for the Monday..Sunday span of a given weekStart. */
export function weekDateRange(weekStart: string): { startLabel: string; endLabel: string } {
  const start = parseYmdLocal(weekStart);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const label = (x: Date) => `${MONTHS[x.getMonth()]} ${x.getDate()}`;
  return { startLabel: label(start), endLabel: label(end) };
}

// ── Generation outcome mapping ──────────────────────────────────────────────

export type GenerateOutcome =
  | { kind: 'ok'; week: WeekPlan }
  | { kind: 'pro_required' }
  | { kind: 'generation_in_progress' }
  | { kind: 'profile_required' }
  | { kind: 'email_unverified' }
  | { kind: 'retryable'; message: string }
  | { kind: 'terminal'; message: string };

function errorCode(data: unknown): string | null {
  if (isRecord(data) && typeof data.error === 'string') return data.error;
  return null;
}

const RETRY_MESSAGE = 'That did not work this time. Try again.';
const BUSY_MESSAGE = 'Mealzy is busy right now. Try again in a moment.';

/**
 * Map an apiFetch result (status + parsed body) to a machine-readable outcome.
 * Decisions are made from HTTP status and the server `error` / `retry` fields
 * only, never from human-readable message text.
 *
 * 401 is intentionally not handled here: apiFetch + the auth context own
 * session invalidation. It falls through to a terminal outcome for safety.
 */
export function classifyGenerateOutcome(res: { status: number; data: unknown }): GenerateOutcome {
  const { status, data } = res;
  const code = errorCode(data);
  const retry = isRecord(data) && data.retry === true;

  if (status === 200) {
    const week = toWeekPlan(data);
    if (week) return { kind: 'ok', week };
    return { kind: 'terminal', message: 'Mealzy returned a plan we could not read.' };
  }

  if (status === 402 && code === 'pro_required') return { kind: 'pro_required' };
  if (status === 409 && code === 'free_week_generation_in_progress') return { kind: 'generation_in_progress' };
  if (status === 400 && code === 'profile_required') return { kind: 'profile_required' };
  if (status === 403 && code === 'email_not_verified') return { kind: 'email_unverified' };

  if (status === 400 && code === 'allergy_violation' && retry) return { kind: 'retryable', message: RETRY_MESSAGE };
  if (status === 429) return { kind: 'retryable', message: BUSY_MESSAGE };
  if (status === 503) return { kind: 'retryable', message: BUSY_MESSAGE };
  if (status === 500) return { kind: 'retryable', message: RETRY_MESSAGE };

  if (status === 422 && code === 'budget_unreachable') {
    return { kind: 'terminal', message: 'Mealzy could not build a plan within this budget. Adjust your budget or preferences in Settings.' };
  }
  if (status === 422 && code === 'certification_failed') {
    return retry
      ? { kind: 'retryable', message: RETRY_MESSAGE }
      : { kind: 'terminal', message: 'Mealzy could not build a verified plan for these settings.' };
  }

  return { kind: 'terminal', message: 'Something went wrong. Please try again later.' };
}
