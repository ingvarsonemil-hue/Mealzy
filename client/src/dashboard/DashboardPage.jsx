import * as React from 'react';
import AppShell from '@/components/AppShell';
import { track } from '@/lib/api';
import useDashboard from './useDashboard';
import useRecipes from './useRecipes';
import useNps from './useNps';
import useUpgradeFlow from './useUpgradeFlow';
import { downloadShareCard } from './shareCard';
import { btnPrimary, btnOutline, btnSm } from './buttonStyles';
import TodaysMeals from './components/TodaysMeals';
import MacroOverviewCard from './components/MacroOverviewCard';
import StatCards from './components/StatCards';
import RecentPlans from './components/RecentPlans';
import QuickActions from './components/QuickActions';
import CalorieHistoryChart from './components/CalorieHistoryChart';
import RecipesPanel from './components/RecipesPanel';
import RecipeModal from './components/RecipeModal';
import ImportRecipeModal from './components/ImportRecipeModal';
import NpsModal from './components/NpsModal';
import UpgradeModal from './components/UpgradeModal';
import PwaBanner from './components/PwaBanner';
import ToastContainer from './components/ToastContainer';
import LoadingOverlay from './components/LoadingOverlay';
import { RetentionBanner, SundayNudgeBanner, ZeroPlansBanner, ReferralBanner } from './components/Banners';

export default function DashboardPage() {
  const dash = useDashboard();
  const recipes = useRecipes({ isPro: dash.isPro, showToast: dash.showToast });
  const nps = useNps();
  const upgradeFlow = useUpgradeFlow({ lsUserEmail: dash.lsUserEmail });

  // Keep useDashboard's ref to this instance current so a 402 on
  // generate can open the upgrade prompt without prop-drilling.
  React.useEffect(() => {
    dash.upgradeFlowRef.current = upgradeFlow;
  });

  const bootRan = React.useRef(false);
  React.useEffect(() => {
    if (bootRan.current) return;
    bootRan.current = true;
    nps.check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (dash.view === 'recipes') recipes.loadRecipes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dash.view]);

  const handleRecipesClick = (e) => {
    e.preventDefault();
    dash.setView('recipes');
  };

  const printMealPlan = () => {
    if (!dash.isPro) {
      upgradeFlow.openPdfPrompt();
      return;
    }
    track('pdf_export', { source: 'print_btn' });
    window.print();
  };

  const shareCard = () => {
    track('share_click', { type: 'share_card' });
    downloadShareCard(dash.todayMeals);
    dash.showToast('Share card downloaded! Share it anywhere', 'success');
  };

  if (dash.status !== 'ready') return null;

  const generateLabel = dash.abVariant === 'B' ? 'Build My Meal Plan' : "Generate Today's Plan";
  const mealsDone = `${dash.todayMeals.filter((m) => m.completed).length}/${dash.todayMeals.length}`;

  return (
    <AppShell active="dashboard" user={dash.serverUser} onRecipesClick={handleRecipesClick}>
      <div className="-mx-4 -mt-6 mb-6 h-1 bg-gradient-to-r from-green to-green-deep sm:-mx-6 md:-mx-8 md:-mt-8" />

      {dash.gKeyTooltip && (
        <div className="fixed bottom-6 right-6 z-[100] rounded-md bg-black/75 px-3.5 py-2 text-sm text-white">
          Press <kbd className="rounded bg-white/20 px-1">G</kbd> to generate
        </div>
      )}

      <ZeroPlansBanner show={upgradeFlow.zeroPlansBanner} onDismiss={upgradeFlow.dismissZeroPlansBanner} />
      <SundayNudgeBanner show={dash.sundayNudgeBanner} onGenerate={dash.generateMealPlan} onDismiss={dash.dismissSundayNudgeBanner} />
      <RetentionBanner banner={dash.retentionBanner} onDismiss={dash.dismissRetentionBanner} />

      {dash.view === 'recipes' ? (
        <RecipesPanel
          recipes={recipes.recipes}
          loading={recipes.recipesLoading}
          error={recipes.recipesError}
          onImport={recipes.openImportModal}
          onUse={recipes.useRecipeInPlan}
          onDelete={recipes.deleteRecipeById}
        />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="font-display text-[2.2rem] font-bold italic leading-[1.1] tracking-[-0.03em] text-foreground">
                {dash.greeting}, {dash.profile?.name || 'there'}!
              </div>
              <div className="mt-1 text-sm font-medium text-muted-fg">{dash.dateStr}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {dash.streakVisible && (
                <span className="rounded-full bg-brick/10 px-3 py-1 text-xs font-bold text-brick">{dash.streakBadgeText}</span>
              )}
              {dash.isPro && (
                <span className="rounded-full bg-green px-2.5 py-1 text-xs font-bold tracking-[0.04em] text-white">PRO</span>
              )}
              <button onClick={printMealPlan} title="Print your meal plan" className={btnOutline + ' ' + btnSm}>Print Plan</button>
              <button onClick={shareCard} title="Download shareable image card" className={btnOutline + ' ' + btnSm}>Share Card</button>
              <button onClick={dash.generateMealPlan} disabled={dash.generating} title="Press G to generate" className={btnPrimary}>
                {dash.generating ? 'Generating…' : generateLabel}
              </button>
            </div>
          </div>

          <TodaysMeals
            meals={dash.todayMeals}
            ratings={dash.ratings}
            dayComplete={dash.dayComplete}
            swappingIndex={dash.swappingIndex}
            onToggleDone={dash.toggleMealDone}
            onOpenRecipe={dash.setRecipeModalIndex}
            onSwap={dash.swapMeal}
            onRate={dash.rateMeal}
            onMarkDayComplete={dash.markDayComplete}
            onGenerate={dash.generateMealPlan}
          />

          <MacroOverviewCard hasMeals={dash.todayMeals.length > 0} stats={dash.stats} dateStr={dash.dateStr} />

          <StatCards
            stats={dash.stats}
            mealsDone={mealsDone}
            waterCount={dash.waterCount}
            waterGoal={dash.waterGoal}
            onAddWater={dash.addWater}
            onRemoveWater={dash.removeWater}
            hasWeight={!!dash.profile?.weight}
          />

          <ReferralBanner show={dash.referralBanner} link={dash.referralLink} onDismiss={dash.dismissReferralBanner} showToast={dash.showToast} />

          <RecentPlans plans={dash.recentPlans} onLoad={dash.loadRecentPlan} />

          <QuickActions onImportRecipe={recipes.openImportModal} />

          <CalorieHistoryChart goalCals={dash.stats.goalCals} />
        </>
      )}

      <RecipeModal meal={dash.todayMeals[dash.recipeModalIndex]} currency={dash.profile?.currency} onClose={() => dash.setRecipeModalIndex(null)} />
      <ImportRecipeModal recipes={recipes} onClose={recipes.closeImportModal} />
      <NpsModal nps={nps} />
      <UpgradeModal upgradeFlow={upgradeFlow} lsUserEmail={dash.lsUserEmail} />
      <LoadingOverlay open={dash.generating} />
      <PwaBanner visible={dash.pwaBanner.visible} onInstall={dash.installPwa} onDismiss={dash.dismissPwaBanner} />
      <ToastContainer toasts={dash.toasts} />
    </AppShell>
  );
}
