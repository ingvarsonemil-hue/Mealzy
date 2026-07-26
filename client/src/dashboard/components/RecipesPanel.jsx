import * as React from 'react';
import { NavRecipes } from '@/components/icons';
import { btnPrimary, btnOutline, btnGhost, btnSm } from '../buttonStyles';

export default function RecipesPanel({ recipes, loading, error, onImport, onUse, onDelete }) {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold italic text-foreground">My Recipes</h1>
          <p className="mt-1 text-sm text-muted-fg">Saved from photos and cookbooks</p>
        </div>
        <button onClick={onImport} className={btnPrimary}>Import Recipe</button>
      </div>

      {loading && <p className="p-4 text-muted-fg">Loading...</p>}
      {!loading && error && <p className="p-4 text-error">{error}</p>}

      {!loading && !error && recipes.length === 0 && (
        <div className="py-12 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green/10 text-green">
            <NavRecipes width="26" height="26" />
          </div>
          <h3 className="mb-2 font-display text-lg font-bold italic text-foreground">No recipes yet</h3>
          <p className="mx-auto mb-5 max-w-[300px] text-sm text-muted-fg">Import your first one from a photo.</p>
          <button onClick={onImport} className={btnPrimary}>Import Recipe</button>
        </div>
      )}

      {!loading && !error && recipes.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((r, idx) => (
            <div key={r.id || idx} className="flex flex-col rounded-lg border border-hairline bg-cream p-5 shadow-card">
              <div className="mb-1 font-semibold text-foreground">{r.name || 'Untitled Recipe'}</div>
              <div className="text-sm leading-relaxed text-muted-fg">
                {[
                  r.servings ? `${r.servings} servings` : null,
                  r.estimatedCalories ? `${r.estimatedCalories} kcal` : null,
                  r.estimatedProtein ? `${r.estimatedProtein}g protein` : null
                ].filter(Boolean).join(' · ')}
              </div>
              {r.ingredients?.length ? (
                <div className="mt-2 text-xs text-muted-fg">{r.ingredients.length} ingredients</div>
              ) : null}
              <div className="mt-3.5 flex gap-2">
                <button onClick={() => onUse(idx)} className={btnOutline + ' ' + btnSm + ' flex-1'}>Use in plan</button>
                <button
                  onClick={() => { if (window.confirm('Delete this recipe?')) onDelete(r.id); }}
                  className={btnGhost + ' ' + btnSm + ' text-error hover:bg-error/10'}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
