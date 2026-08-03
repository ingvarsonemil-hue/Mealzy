'use strict';

const express = require('express');
const { randomUUID } = require('crypto');

const EXTRACT_PROMPT =
  'Extract the recipe from this image as JSON only — no markdown, no explanation.\n' +
  'Schema: { "name": string, "servings": number, "ingredients": [{ "name": string, "amount": string }], "instructions": [string], "estimatedCalories": number, "estimatedProtein": number }\n' +
  'If any field is unclear from the image, make a reasonable estimate. Always return valid JSON.';

const VALID_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

module.exports = function registerRecipeRoutes(app, { anthropic, requireSession, requireVerifiedEmail, generateLimiter, db, callAnthropicWithSpendCap }) {

  // POST /api/recipes/import-photo — Pro only, vision extraction, image never stored
  app.post(
    '/api/recipes/import-photo',
    generateLimiter,
    requireSession,
    requireVerifiedEmail,
    express.json({ limit: '8mb' }),
    async (req, res) => {
    // Fresh DB lookup — never trust JWT payload for Pro gate
    const user = await db.getUserById(req.session.userId);
    if (!user)     return res.status(401).json({ error: 'user_not_found' });
    if (!user.pro) return res.status(403).json({ error: 'pro_required', message: 'Photo import requires a Pro plan.' });

    const { imageData, mimeType } = req.body;
    if (!imageData || typeof imageData !== 'string') {
      return res.status(400).json({ error: 'imageData (base64 string) required' });
    }
    if (imageData.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'image_too_large', message: 'Image must be under 5MB.' });
    }
    if (!BASE64_RE.test(imageData)) {
      return res.status(400).json({ error: 'invalid_base64' });
    }
    const mime = VALID_MIME_TYPES.includes(mimeType) ? mimeType : 'image/jpeg';

    try {
      const message = await callAnthropicWithSpendCap({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: imageData } },
            { type: 'text',  text: EXTRACT_PROMPT }
          ]
        }]
      });

      const raw = message.content[0].text.trim();
      let recipe;
      try {
        recipe = JSON.parse(raw);
      } catch {
        const match = raw.match(/\{[\s\S]+\}/);
        if (!match) return res.status(422).json({ error: 'extraction_failed', message: 'Could not parse recipe from image.' });
        recipe = JSON.parse(match[0]);
      }

      // Image is not stored — only the extracted JSON is returned
      res.json({ success: true, recipe });

    } catch (err) {
      if (err.spendCapReached) {
        return res.status(503).json({
          error: 'service_temporarily_unavailable',
          message: 'AI features are temporarily paused due to high demand. Please try again later.'
        });
      }
      console.error('[recipes/import-photo]', err.message);
      res.status(500).json({ error: 'extraction_failed', message: 'Failed to extract recipe from image.' });
    }
  });

  // POST /api/recipes/save — authenticated, saves reviewed/edited recipe to library
  app.post('/api/recipes/save', requireSession, async (req, res) => {
    const { recipe } = req.body;
    if (!recipe || typeof recipe !== 'object') {
      return res.status(400).json({ error: 'recipe object required' });
    }

    try {
      const id = randomUUID();
      await db.saveRecipe(id, req.session.userId, recipe);
      await db.logEvent('recipe_imported', { userId: req.session.userId }, '');
      res.json({ success: true, id });
    } catch (err) {
      console.error('[recipes/save]', err.message);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // GET /api/recipes — authenticated, returns all saved recipes for the user
  app.get('/api/recipes', requireSession, async (req, res) => {
    try {
      const recipes = await db.getRecipes(req.session.userId);
      res.json({ success: true, recipes });
    } catch (err) {
      console.error('[recipes]', err.message);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // DELETE /api/recipes/:id — authenticated, only deletes recipes owned by current user
  app.delete('/api/recipes/:id', requireSession, async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'id required' });

    try {
      await db.run(
        'DELETE FROM recipes WHERE id = ? AND user_id = ?',
        [id, req.session.userId]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('[recipes/delete]', err.message);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });
};
