/**
 * Plan domain — pure logic only (no network, no Expo/native imports) so it can
 * be unit-tested under plain `node --test`.
 *
 * The backend response types here are intentionally narrow: only the fields
 * M4B actually consumes. `weeklyTotals.certification`, `weeklyTotals.purchasePlan`
 * and everything else on the wire are deliberately left out and never
 * interpreted on the client.
 *
 * Phase B audit (Meal Detail): server.js's meal generation schema
 * (mealSchema, ~server.js:2687) already includes `cookTime` and
 * `instructions` on every generated meal, and they flow through the plan
 * object unmodified into the `/api/generate-meal` and `/api/plans`
 * responses. They were previously dropped here as out of scope for M4B;
 * Meal Detail needs them, so they're now parsed like everything else.
 * `servings` and `image_url` also exist server-side but are not added here:
 * this screen has no use for `servings`, and `image_url` is a keyword-matched
 * Unsplash stock photo (server.js's attachMealImages), not a photo of the
 * actual cooked meal - using it would risk presenting a generic image as
 * "the meal", which the locked design explicitly rules out.
 *
 * Phase C audit (Groceries): server.js unconditionally computes
 * `weeklyTotals.purchasePlan` for every generated week (weeklyPurchasePlan.js
 * buildWeeklyPurchasePlan, ~server.js:3455) and saves it verbatim in the plan
 * blob, so it comes back on both /api/generate-meal and /api/plans - it was
 * simply never parsed here. This is a DIFFERENT number from
 * `weeklyTotals.totalCost`: totalCost is the legacy recipe-CONSUMPTION
 * estimate (sum of what the recipes use); purchasePlan is the real
 * PURCHASE/package economics (ingredients aggregated for the whole week,
 * rounded up to actual store package sizes, priced in integer cents). Only
 * purchasePlan is appropriate for a "how much groceries will cost" figure -
 * see the Phase C report for why Groceries and the Plan handoff use it
 * instead of totalCost.
 *
 * Phase C backend follow-up: purchasePlan.rows now DOES carry a real
 * `category` (server.js's groceryCategories.js, the same authoritative
 * bucket mapping the separate per-day /api/generate-grocery-list system
 * uses) and `canonicalIngredientId` (the stable identity checked-state
 * persistence keys on - see @/lib/plan-api's grocery-checks calls). Both
 * are parsed below.
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
  /** undefined when the backend didn't send a valid number - never coerced to 0. */
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  /** authoritative server-priced meal cost; undefined when absent/invalid, never coerced to 0. */
  cost?: number;
  ingredients: PlanIngredient[];
  /** Minutes, 0 when the backend didn't provide one. */
  cookTime: number;
  instructions: string[];
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

/**
 * One ingredient's real weekly PURCHASE row (weeklyPurchasePlan.js
 * computeRowPurchase). `packageCount`/`purchaseQuantity`/`purchaseCostCents`
 * are real supermarket purchase amounts (whole packages, rounded up), never
 * the raw recipe-consumption quantity - null on any row the backend
 * couldn't price (unresolved ingredient, no purchase profile, unit
 * mismatch, invalid quantity). `pricingStatus` is the opaque
 * PURCHASE_PRICING_STATUS value; only 'covered' and 'uncertified_pricing'
 * rows carry a purchaseCostCents.
 */
export type GroceryPurchaseRow = {
  name: string;
  /**
   * Stable identity for checked-state persistence (@/lib/plan-api's
   * grocery-checks calls) - the same canonical id weeklyPurchasePlan.js
   * itself keys on. Null for an unresolved ingredient, which has no stable
   * identity and so cannot support persisted checked state.
   */
  canonicalIngredientId: string | null;
  /** Authoritative bucket from the backend (groceryCategories.js) - never a client-side guess. One of produce/protein/dairy/grains/pantry/frozen/beverages/other. */
  category: string;
  packageType: string | null;
  packageQuantity: number | null;
  packageUnit: string | null;
  packageCount: number | null;
  purchaseQuantity: number | null;
  purchaseUnit: string | null;
  /** Integer cents. Null when this row has no trustworthy purchase price. */
  purchaseCostCents: number | null;
  pricingStatus: string;
};

export type WeeklyPurchasePlan = {
  rows: GroceryPurchaseRow[];
  /** Sum of only the fully-trustworthy ('covered') rows' purchaseCostCents. */
  coveredPurchaseCostCents: number;
  /** Best-effort total across every priceable row; server.js's own comment calls this "observability only, never certified". */
  weeklyPurchaseCostCents: number;
  /** The authoritative total - null unless every required ingredient has certification-grade purchase pricing. */
  certifiedEstimatedPurchaseCostCents: number | null;
  allCovered: boolean;
};

export type WeekWeeklyTotals = {
  totalCost: number;
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  /** opaque server string, shown verbatim if shown at all */
  budgetStatus?: string;
  /** Real weekly purchase/package economics. Absent only if the backend response is malformed - server.js always computes it. */
  purchasePlan?: WeeklyPurchasePlan;
};

export type WeekPlan = {
  weekStart: string;
  /**
   * Present on a fresh generation response AND (Phase C backend follow-up)
   * on a plan read back from GET /api/plans - db.getRecentPlans now merges
   * the row's own id in as planId, since grocery-checks persistence needs a
   * real planId and previously had no way to get one outside a fresh
   * generation. Still optional: stays undefined if the backend response is
   * malformed, never fabricated.
   */
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

/** Like num(), but a missing/invalid value stays undefined instead of becoming 0. */
function optNum(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string' && v.trim() === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
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
    calories: optNum(r.calories),
    protein: optNum(r.protein),
    carbs: optNum(r.carbs),
    fat: optNum(r.fat),
    cost: optNum(r.cost),
    ingredients: Array.isArray(r.ingredients) ? r.ingredients.map(toIngredient) : [],
    cookTime: num(r.cookTime),
    instructions: strArray(r.instructions),
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

function optInt(v: unknown): number | null {
  const n = optNum(v);
  return n !== undefined && Number.isInteger(n) ? n : null;
}

function toGroceryPurchaseRow(v: unknown): GroceryPurchaseRow | null {
  const r = isRecord(v) ? v : null;
  if (!r || typeof r.pricingStatus !== 'string') return null;
  return {
    name: str(r.name),
    canonicalIngredientId: typeof r.canonicalIngredientId === 'string' ? r.canonicalIngredientId : null,
    category: typeof r.category === 'string' ? r.category : 'other',
    packageType: typeof r.packageType === 'string' ? r.packageType : null,
    packageQuantity: optNum(r.packageQuantity) ?? null,
    packageUnit: typeof r.packageUnit === 'string' ? r.packageUnit : null,
    packageCount: optInt(r.packageCount),
    purchaseQuantity: optNum(r.purchaseQuantity) ?? null,
    purchaseUnit: typeof r.purchaseUnit === 'string' ? r.purchaseUnit : null,
    purchaseCostCents: optInt(r.purchaseCostCents),
    pricingStatus: r.pricingStatus,
  };
}

function toWeeklyPurchasePlan(v: unknown): WeeklyPurchasePlan | undefined {
  const r = isRecord(v) ? v : null;
  if (!r || !Array.isArray(r.rows)) return undefined;
  return {
    rows: r.rows.map(toGroceryPurchaseRow).filter((row): row is GroceryPurchaseRow => row !== null),
    coveredPurchaseCostCents: num(r.coveredPurchaseCostCents),
    weeklyPurchaseCostCents: num(r.weeklyPurchaseCostCents),
    certifiedEstimatedPurchaseCostCents: optInt(r.certifiedEstimatedPurchaseCostCents),
    allCovered: r.allCovered === true,
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
  const purchasePlan = toWeeklyPurchasePlan(r.purchasePlan);
  if (purchasePlan) out.purchasePlan = purchasePlan;
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

// ── Grocery checked-state (weekly purchase-plan rows) ───────────────────────
//
// GET /api/plans/:planId/grocery-checks and
// PATCH /api/plans/:planId/grocery-checks/:canonicalIngredientId - see
// server.js. Keyed by canonicalIngredientId, never array position.

export type GroceryChecksResult =
  | { kind: 'found'; checkedIds: Set<string> }
  | { kind: 'error' };

/** Pure classifier for the GET response. Only checked===true rows end up in the set - GET may also return checked:false rows once an item has been unchecked at least once. */
export function classifyGroceryChecksResponse(res: { status: number; data: unknown }): GroceryChecksResult {
  if (res.status !== 200 || !isRecord(res.data)) return { kind: 'error' };
  if (res.data.success !== true || !Array.isArray(res.data.checks)) return { kind: 'error' };

  const checkedIds = new Set<string>();
  for (const item of res.data.checks) {
    if (isRecord(item) && typeof item.canonicalIngredientId === 'string' && item.checked === true) {
      checkedIds.add(item.canonicalIngredientId);
    }
  }
  return { kind: 'found', checkedIds };
}

/** Pure classifier for the PATCH response - true only on a genuine 200 success. */
export function classifyGroceryCheckPatchResponse(res: { status: number; data: unknown }): boolean {
  return res.status === 200 && isRecord(res.data) && res.data.success === true;
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
