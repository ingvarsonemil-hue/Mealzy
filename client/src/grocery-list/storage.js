/* Date/week helpers + localStorage cache for the grocery-list page.
 * Ported 1:1 from public/grocery-list.html's inline <script> — same key
 * names, same shapes, same fallback sample data — so existing localStorage
 * from the legacy page keeps working after the React swap.
 *
 * localStorage keys used here:
 *   mealzy_grocery_plan_ids  -> { [weekStart]: planId }
 *   mealzy_grocery_lists     -> { [weekStart]: { [day]: groceryListObj } }
 *   mealzy_meal_plans        -> { [dateStr]: { meals: [...] } }  (read-only source)
 */

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_ABBR = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };

export function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

export function getWeekDates(monday) {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    dates.push({ date: d.toISOString().split('T')[0], dayName: DAY_NAMES[i] });
  }
  return dates;
}

export function loadPlanId(weekStart) {
  try {
    const map = JSON.parse(localStorage.getItem('mealzy_grocery_plan_ids') || '{}');
    return map[weekStart] || null;
  } catch (e) {
    return null;
  }
}

export function savePlanId(weekStart, id) {
  try {
    const map = JSON.parse(localStorage.getItem('mealzy_grocery_plan_ids') || '{}');
    map[weekStart] = id;
    localStorage.setItem('mealzy_grocery_plan_ids', JSON.stringify(map));
  } catch (e) { /* private mode */ }
}

export function getCachedDayList(weekStart, day) {
  try {
    const lists = JSON.parse(localStorage.getItem('mealzy_grocery_lists') || '{}');
    const weekLists = lists[weekStart];
    if (!weekLists || typeof weekLists !== 'object' || weekLists.categories) return null;
    return weekLists[day] || null;
  } catch (e) {
    return null;
  }
}

export function setCachedDayList(weekStart, day, list) {
  try {
    const lists = JSON.parse(localStorage.getItem('mealzy_grocery_lists') || '{}');
    if (!lists[weekStart] || typeof lists[weekStart] !== 'object' || lists[weekStart].categories) {
      lists[weekStart] = {};
    }
    lists[weekStart][day] = list;
    localStorage.setItem('mealzy_grocery_lists', JSON.stringify(lists));
  } catch (e) { /* private mode */ }
}

export function getMealsForDate(dateStr) {
  try {
    const plans = JSON.parse(localStorage.getItem('mealzy_meal_plans') || '{}');
    return (plans[dateStr] && plans[dateStr].meals) ? plans[dateStr].meals : [];
  } catch (e) {
    return [];
  }
}

/* Fallback list shown when there are no meals to generate from, or when the
 * generate request fails outright — matches legacy getSampleGroceryList().
 * NOTE: budgetAmount is included here (mirroring the legacy shape) but is
 * intentionally never read for rendering — see GroceryListPage.jsx. */
export function getSampleGroceryList(profile, weekStart) {
  return {
    weekStart,
    totalCost: 72.50,
    budgetAmount: profile?.budget || 100,
    currency: profile?.currency || 'USD',
    categories: {
      produce: [
        { name: 'Mixed berries', amount: '400g', cost: 4.80, checked: false },
        { name: 'Cherry tomatoes', amount: '400g', cost: 3.20, checked: false },
        { name: 'Broccoli', amount: '800g', cost: 4.80, checked: false },
        { name: 'Bell peppers', amount: '4', cost: 4.00, checked: false },
        { name: 'Spinach', amount: '200g', cost: 2.50, checked: false },
        { name: 'Avocados', amount: '4', cost: 6.00, checked: false },
        { name: 'Lemons', amount: '4', cost: 1.60, checked: false },
        { name: 'Apples', amount: '6', cost: 4.80, checked: false },
        { name: 'Garlic', amount: '1 head', cost: 0.80, checked: false }
      ],
      protein: [
        { name: 'Chicken breast', amount: '1.2kg', cost: 12.00, checked: false },
        { name: 'Salmon fillets', amount: '800g', cost: 18.00, checked: false },
        { name: 'Eggs', amount: '12', cost: 3.60, checked: false }
      ],
      dairy: [
        { name: 'Greek yogurt', amount: '800g', cost: 5.40, checked: false },
        { name: 'Almond milk', amount: '1L', cost: 2.80, checked: false }
      ],
      grains: [
        { name: 'Brown rice', amount: '500g', cost: 2.50, checked: false },
        { name: 'Granola', amount: '400g', cost: 4.00, checked: false },
        { name: 'Whole grain bread', amount: '1 loaf', cost: 3.50, checked: false }
      ],
      pantry: [
        { name: 'Olive oil', amount: '500ml', cost: 5.50, checked: false },
        { name: 'Almond butter', amount: '300g', cost: 6.00, checked: false },
        { name: 'Honey', amount: '300g', cost: 3.50, checked: false }
      ],
      frozen: [],
      beverages: [],
      other: []
    }
  };
}

export const EMPTY_CATEGORIES = { produce: [], protein: [], dairy: [], grains: [], pantry: [], frozen: [], beverages: [], other: [] };
