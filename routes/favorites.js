'use strict';

const { randomUUID } = require('crypto');

function sanitise(val, maxLen = 500) {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function mealKeyFor(name) {
  return sanitise(name, 200).toLowerCase();
}

module.exports = function registerFavoriteRoutes(app, { requireSession, db }) {

  // POST /api/favorites — authenticated, adds (or updates) a meal in the user's favorites
  app.post('/api/favorites', requireSession, async (req, res) => {
    const { meal } = req.body;
    if (!meal || typeof meal !== 'object' || Array.isArray(meal)) {
      return res.status(400).json({ error: 'meal object required' });
    }

    const mealKey = mealKeyFor(meal.name);
    if (!mealKey) {
      return res.status(400).json({ error: 'meal.name required' });
    }

    const safeMeal = {
      type:              sanitise(meal.type, 20) || 'meal',
      name:              sanitise(meal.name, 120),
      description:       sanitise(meal.description, 500),
      calories:          Number(meal.calories) || 0,
      protein:           Number(meal.protein) || 0,
      carbs:             Number(meal.carbs) || 0,
      fat:               Number(meal.fat) || 0,
      cookTime:          Number(meal.cookTime) || 0,
      estimatedCost:     Number(meal.estimatedCost) || 0,
      ingredients: (Array.isArray(meal.ingredients) ? meal.ingredients : []).slice(0, 30).map(ing => ({
        name:   sanitise(ing?.name, 100),
        amount: sanitise(ing?.amount, 50),
        cost:   Number(ing?.cost) || 0,
      })),
      instructions: (Array.isArray(meal.instructions) ? meal.instructions : []).slice(0, 20).map(step => sanitise(step, 300)),
    };

    try {
      const id = randomUUID();
      await db.saveFavorite(id, req.session.userId, mealKey, safeMeal);
      res.json({ success: true, mealKey });
    } catch (err) {
      console.error('[favorites/save]', err.message);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // GET /api/favorites — authenticated, returns all favorited meals for the user
  app.get('/api/favorites', requireSession, async (req, res) => {
    try {
      const favorites = await db.getFavorites(req.session.userId);
      res.json({ success: true, favorites });
    } catch (err) {
      console.error('[favorites]', err.message);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // DELETE /api/favorites/:mealKey — authenticated, removes a favorite owned by the current user
  app.delete('/api/favorites/:mealKey', requireSession, async (req, res) => {
    const mealKey = mealKeyFor(decodeURIComponent(req.params.mealKey || ''));
    if (!mealKey) return res.status(400).json({ error: 'mealKey required' });

    try {
      await db.deleteFavorite(req.session.userId, mealKey);
      res.json({ success: true });
    } catch (err) {
      console.error('[favorites/delete]', err.message);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });
};
