import * as React from 'react';
import { fetchRecipes, deleteRecipe as apiDeleteRecipe, saveRecipe, importRecipePhoto } from '@/lib/dashboard';

/* Recipes panel + 5-step "import from photo" wizard, ported from legacy
 * loadRecipes()/deleteRecipe()/useRecipeInPlan() and the irXxx() functions. */
export default function useRecipes({ isPro, showToast }) {
  const [recipes, setRecipes] = React.useState([]);
  const [recipesLoading, setRecipesLoading] = React.useState(false);
  const [recipesError, setRecipesError] = React.useState(null);

  const loadRecipes = React.useCallback(async () => {
    setRecipesLoading(true);
    setRecipesError(null);
    try {
      const list = await fetchRecipes();
      setRecipes(list);
    } catch (err) {
      setRecipesError(err.message || 'Failed to load recipes');
    } finally {
      setRecipesLoading(false);
    }
  }, []);

  const deleteRecipeById = async (id) => {
    try {
      await apiDeleteRecipe(id);
      setRecipes((r) => r.filter((x) => x.id !== id));
    } catch (err) {
      showToast(err.message || 'Failed to delete recipe. Please try again.', 'error');
    }
  };

  const useRecipeInPlan = (idx) => {
    const recipe = recipes[idx];
    if (!recipe) return;
    localStorage.setItem('mealzy_pending_recipe', JSON.stringify(recipe));
    window.location.href = '/meal-planner.html';
  };

  /* ── Import-from-photo wizard ─────────────────────────────────────────── */
  const [importOpen, setImportOpen] = React.useState(false);
  const [step, setStep] = React.useState('upload'); // gate | upload | extracting | review | success
  const [preview, setPreview] = React.useState(null);
  const [uploadError, setUploadError] = React.useState('');
  const [saveError, setSaveError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [savedName, setSavedName] = React.useState('');
  const [form, setForm] = React.useState({
    name: '', servings: 2, calories: '', protein: '', ingredients: '', instructions: ''
  });
  const base64Ref = React.useRef(null);
  const mimeRef = React.useRef('image/jpeg');

  const openImportModal = () => {
    base64Ref.current = null;
    setImportOpen(true);
    setStep(isPro ? 'upload' : 'gate');
  };

  const closeImportModal = () => {
    setImportOpen(false);
    resetImport();
  };

  const resetImport = () => {
    base64Ref.current = null;
    setPreview(null);
    setUploadError('');
    setSaveError('');
    if (isPro) setStep('upload');
  };

  const handleFile = (file) => {
    if (!file) return;
    mimeRef.current = file.type || 'image/jpeg';
    const reader = new FileReader();
    reader.onload = (e) => {
      base64Ref.current = e.target.result.split(',')[1];
      setPreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const extract = async () => {
    if (!base64Ref.current) return;
    setStep('extracting');
    try {
      const recipe = await importRecipePhoto({ imageData: base64Ref.current, mimeType: mimeRef.current });
      setForm({
        name: recipe.name || '',
        servings: recipe.servings || 2,
        calories: recipe.estimatedCalories || '',
        protein: recipe.estimatedProtein || '',
        ingredients: (recipe.ingredients || []).map((i) => (i.amount ? `${i.amount} ${i.name}` : i.name)).join('\n'),
        instructions: (recipe.instructions || []).join('\n')
      });
      setStep('review');
    } catch (err) {
      setStep('upload');
      setUploadError(err.message || 'Extraction failed');
    }
  };

  const saveImportedRecipe = async () => {
    setSaveError('');
    const ingredientsRaw = form.ingredients.trim().split('\n').filter(Boolean);
    const instructionsRaw = form.instructions.trim().split('\n').filter(Boolean);
    const recipe = {
      name: form.name.trim(),
      servings: Number(form.servings) || 2,
      estimatedCalories: Number(form.calories) || 0,
      estimatedProtein: Number(form.protein) || 0,
      ingredients: ingredientsRaw.map((line) => ({ name: line, amount: '' })),
      instructions: instructionsRaw
    };
    if (!recipe.name) {
      setSaveError('Recipe name is required.');
      return;
    }
    setSaving(true);
    try {
      await saveRecipe(recipe);
      setSavedName(recipe.name);
      setStep('success');
    } catch (err) {
      setSaveError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return {
    recipes, recipesLoading, recipesError, loadRecipes, deleteRecipeById, useRecipeInPlan,
    importOpen, step, preview, uploadError, saveError, saving, savedName, form, setForm,
    openImportModal, closeImportModal, resetImport, handleFile, extract, saveImportedRecipe
  };
}
