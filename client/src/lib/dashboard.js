/* Dashboard-only API calls (recipes CRUD + photo import, NPS survey).
 * Endpoint contracts must match server.js / routes/recipes.js exactly.
 * GET    /api/recipes               -> { success, recipes }
 * POST   /api/recipes/save          { recipe } -> { success, id }
 * DELETE /api/recipes/:id           -> { success:true } (id must be URI-encoded)
 * POST   /api/recipes/import-photo  { imageData (base64), mimeType } -> auth + Pro required
 *   -> { success, recipe:{ name, servings, ingredients:[{name,amount}], instructions:[], estimatedCalories, estimatedProtein } }
 *   -> 403 { error:'pro_required', message } if not Pro
 *   -> 422 { error:'extraction_failed', message } if unparseable
 *   NOTE: image is base64 JSON, capped by the server's 1MB express.json()
 *   limit (no dedicated multipart/larger-limit route) — large photos can
 *   already fail today; this is pre-existing, not something to "fix" here.
 * GET  /api/nps/check   -> { show: boolean }
 * POST /api/nps/submit  { score (0-10), comment? } -> { success:true }
 */

const json = (body) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

export async function fetchRecipes() {
  const res = await fetch('/api/recipes');
  if (!res.ok) throw new Error('Failed to load recipes');
  const data = await res.json();
  return data.recipes || [];
}

export async function saveRecipe(recipe) {
  const res = await fetch('/api/recipes/save', json({ recipe }));
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save recipe');
  return data;
}

export async function deleteRecipe(id) {
  const res = await fetch(`/api/recipes/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to delete recipe');
  return data;
}

export async function importRecipePhoto({ imageData, mimeType }) {
  const res = await fetch('/api/recipes/import-photo', json({ imageData, mimeType }));
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.message || data.error || 'Import failed');
    err.status = res.status;
    err.code = data.error;
    throw err;
  }
  return data.recipe;
}

export async function checkNps() {
  try {
    const res = await fetch('/api/nps/check');
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.show;
  } catch {
    return false;
  }
}

export function submitNps({ score, comment }) {
  return fetch('/api/nps/submit', json({ score, comment })).catch(() => {});
}
