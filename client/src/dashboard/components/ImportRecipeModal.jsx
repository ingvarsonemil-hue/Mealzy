import * as React from 'react';
import Modal from './Modal';
import { FileImport, Check } from '@/components/icons';
import { Label, Input } from '@/components/ui/field';
import { btnPrimary, btnOutline, btnGhost } from '../buttonStyles';

const fieldClass =
  'w-full rounded-md border border-clr-border bg-clr-surface px-3 py-2.5 text-sm text-foreground focus:border-green focus:outline-none focus:ring-[3px] focus:ring-green/10';

export default function ImportRecipeModal({ recipes, onClose }) {
  const { importOpen, step, preview, uploadError, saveError, saving, savedName, form, setForm,
    closeImportModal, resetImport, handleFile, extract, saveImportedRecipe } = recipes;

  if (!importOpen) return null;

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Modal open={importOpen} onClose={closeImportModal} maxWidth="560px" showClose labelledBy="import-recipe-title">
      <h2 id="import-recipe-title" className="pr-8 font-display text-xl font-bold italic text-foreground">
        Import Recipe from Photo
      </h2>

      {step === 'gate' && (
        <div className="py-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green/10 text-green">
            <FileImport width="26" height="26" />
          </div>
          <h3 className="mb-2 font-semibold text-foreground">Pro feature</h3>
          <p className="mx-auto mb-5 max-w-[340px] text-sm text-muted-fg">
            Photograph any recipe — cookbook, handwritten card, or printed page — and Claude extracts it instantly.
          </p>
          <a href="/upgrade.html" className={btnPrimary}>Upgrade to Pro →</a>
        </div>
      )}

      {step === 'upload' && (
        <div className="mt-4">
          <p className="mb-5 text-sm text-muted-fg">
            Take a photo or upload an image of any recipe. Claude will extract the ingredients and instructions automatically.
          </p>
          <label
            htmlFor="irFileInput"
            className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-clr-border p-10 text-center transition-colors duration-200 hover:border-green"
          >
            <div>
              <div className="font-semibold text-foreground">Tap to take a photo or upload</div>
              <div className="text-sm text-muted-fg">JPG, PNG, or WebP</div>
            </div>
          </label>
          <input
            type="file"
            id="irFileInput"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />
          {preview && (
            <div className="mt-4 text-center">
              <img src={preview} width="300" height="300" loading="lazy" alt="Recipe preview" className="mx-auto max-h-[180px] w-auto rounded-md border border-clr-border" />
              <div className="mt-3 flex justify-center gap-2">
                <button onClick={extract} className={btnPrimary}>Extract Recipe →</button>
                <button onClick={resetImport} className={btnGhost}>Use different photo</button>
              </div>
            </div>
          )}
          {uploadError && <div className="mt-3 text-center text-sm text-error">{uploadError}</div>}
        </div>
      )}

      {step === 'extracting' && (
        <div className="py-8 text-center">
          <span aria-hidden="true" className="mx-auto mb-5 inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-clr-border border-t-green motion-reduce:animate-none" />
          <p className="text-muted-fg">Extracting recipe from image...</p>
        </div>
      )}

      {step === 'review' && (
        <div className="mt-4">
          <p className="mb-4 text-sm text-muted-fg">Review and edit before saving to your library.</p>
          <div className="flex flex-col gap-3.5">
            <div>
              <Label htmlFor="irName">Recipe name</Label>
              <Input id="irName" value={form.name} onChange={setField('name')} className="h-auto py-2.5 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="irServings">Servings</Label>
                <Input id="irServings" type="number" min="1" value={form.servings} onChange={setField('servings')} className="h-auto py-2.5 text-sm" />
              </div>
              <div>
                <Label htmlFor="irCalories">Calories</Label>
                <Input id="irCalories" type="number" min="0" value={form.calories} onChange={setField('calories')} className="h-auto py-2.5 text-sm" />
              </div>
              <div>
                <Label htmlFor="irProtein">Protein (g)</Label>
                <Input id="irProtein" type="number" min="0" value={form.protein} onChange={setField('protein')} className="h-auto py-2.5 text-sm" />
              </div>
            </div>
            <div>
              <Label htmlFor="irIngredients">Ingredients <span className="normal-case font-normal text-muted-fg">(one per line)</span></Label>
              <textarea id="irIngredients" rows="4" value={form.ingredients} onChange={setField('ingredients')} className={fieldClass + ' resize-y'} />
            </div>
            <div>
              <Label htmlFor="irInstructions">Instructions <span className="normal-case font-normal text-muted-fg">(one step per line)</span></Label>
              <textarea id="irInstructions" rows="5" value={form.instructions} onChange={setField('instructions')} className={fieldClass + ' resize-y'} />
            </div>
          </div>
          <div className="mt-5 flex items-center justify-end gap-3">
            {saveError && <span className="flex-1 text-sm text-error">{saveError}</span>}
            <button onClick={resetImport} className={btnGhost}>Start over</button>
            <button onClick={saveImportedRecipe} disabled={saving} className={btnPrimary}>
              {saving ? 'Saving...' : 'Save to Library →'}
            </button>
          </div>
        </div>
      )}

      {step === 'success' && (
        <div className="py-6 text-center">
          <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-green text-white">
            <Check width="22" height="22" />
          </div>
          <h3 className="mb-2 font-semibold text-foreground">"{savedName}" saved!</h3>
          <p className="mb-5 text-sm text-muted-fg">It's now in your recipe library.</p>
          <button onClick={onClose} className={btnPrimary}>Done</button>
        </div>
      )}
    </Modal>
  );
}
