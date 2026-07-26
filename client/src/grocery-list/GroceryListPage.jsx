import * as React from 'react';
import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Cart, Star, FileDown } from '@/components/icons';
import { fetchMe } from '@/lib/auth';
import { generateGroceryList, fetchGroceryDays, fetchGroceryDay } from '@/lib/groceryList';
import { track } from '@/lib/api';
import { getCurrencySymbol } from '@/lib/currency';
import {
  getMondayOfWeek, getWeekDates, loadPlanId, savePlanId,
  getCachedDayList, setCachedDayList, getMealsForDate, getSampleGroceryList, EMPTY_CATEGORIES
} from './storage';
import DaySwitcher from './DaySwitcher';
import ProgressCard from './ProgressCard';
import GroceryCategories from './GroceryCategories';
import ProNudgeBanner from './ProNudgeBanner';
import InstacartBanner, { isUsCaTimezone } from './InstacartBanner';
import LoadingOverlay from './LoadingOverlay';
import PdfGateModal from './PdfGateModal';
import ToastStack from './ToastStack';
import { useToasts } from './useToasts';

const outlineBtn = 'border border-clr-border bg-transparent text-foreground hover:bg-transparent hover:border-green hover:text-green';
const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function GroceryListPage() {
  const [user, setUser] = React.useState(null);
  const [profile, setProfile] = React.useState(null);
  const [ready, setReady] = React.useState(false);

  const [weekStart, setWeekStart] = React.useState('');
  const [weekDates, setWeekDates] = React.useState([]);
  const [selectedDay, setSelectedDay] = React.useState('');
  const [planId, setPlanIdState] = React.useState(null);
  const [availableDays, setAvailableDays] = React.useState(() => new Set());
  const [groceryList, setGroceryList] = React.useState(null);

  const [generating, setGenerating] = React.useState(false);
  const [showPdfGate, setShowPdfGate] = React.useState(false);
  const [manualInput, setManualInput] = React.useState('');
  const [toasts, addToast] = useToasts();
  const [showBanner] = React.useState(isUsCaTimezone);

  const todayStr = React.useMemo(() => new Date().toISOString().split('T')[0], []);

  // -- Initial load: auth -> profile -> week/plan/day resolution -----------
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      let me;
      try {
        me = await fetchMe();
      } catch (err) {
        window.location.href = '/login.html';
        return;
      }
      if (cancelled) return;

      try {
        localStorage.setItem('mealzy_user', JSON.stringify({ name: me.name, email: me.email }));
        if (me.pro) localStorage.setItem('mealzy_pro', 'true'); else localStorage.removeItem('mealzy_pro');
        if (me.profile) {
          const lp = JSON.parse(localStorage.getItem('mealzy_profile') || '{}');
          localStorage.setItem('mealzy_profile', JSON.stringify({ ...me.profile, ...lp }));
        }
      } catch (e) { /* private mode */ }

      const profileData = localStorage.getItem('mealzy_profile');
      if (!profileData) { window.location.href = '/onboarding.html'; return; }
      const parsedProfile = JSON.parse(profileData);

      const ws = getMondayOfWeek(new Date());
      const wd = getWeekDates(ws);
      const pid = loadPlanId(ws);
      let days = new Set();
      if (pid) {
        try {
          days = new Set(await fetchGroceryDays(pid));
        } catch (e) { /* offline — fall back to whatever is cached locally */ }
      }
      if (cancelled) return;

      const todayEntry = wd.find((d) => d.date === todayStr);
      const initialDay = todayEntry ? todayEntry.dayName : wd[0].dayName;

      setUser(me);
      setProfile(parsedProfile);
      setWeekStart(ws);
      setWeekDates(wd);
      setPlanIdState(pid);
      setAvailableDays(days);
      setSelectedDay(initialDay);

      const cached = getCachedDayList(ws, initialDay);
      if (cached) {
        setGroceryList(cached);
      } else if (days.has(initialDay) && pid) {
        try {
          const dayList = await fetchGroceryDay(pid, initialDay);
          if (dayList) {
            setCachedDayList(ws, initialDay, dayList);
            if (!cancelled) setGroceryList(dayList);
          }
        } catch (e) { /* fall through to empty state */ }
      }

      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSelectDay(day) {
    setSelectedDay(day);
    const cached = getCachedDayList(weekStart, day);
    if (cached) { setGroceryList(cached); return; }
    if (!availableDays.has(day) || !planId) { setGroceryList(null); return; }
    try {
      const list = await fetchGroceryDay(planId, day);
      if (list) {
        setCachedDayList(weekStart, day, list);
        setGroceryList(list);
      } else {
        setGroceryList(null);
      }
    } catch (e) {
      setGroceryList(null);
    }
  }

  function applyGeneratedList(list) {
    setGroceryList(list);
    setCachedDayList(weekStart, selectedDay, list);
    setAvailableDays((prev) => {
      const next = new Set(prev);
      next.add(selectedDay);
      return next;
    });
  }

  async function handleGenerate() {
    const dayEntry = weekDates.find((d) => d.dayName === selectedDay);
    const dateStr = dayEntry ? dayEntry.date : new Date().toISOString().split('T')[0];
    const dayMeals = getMealsForDate(dateStr);

    if (dayMeals.length === 0) {
      applyGeneratedList(getSampleGroceryList(profile, weekStart));
      addToast('Sample grocery list generated!', 'success');
      return;
    }

    setGenerating(true);
    try {
      const data = await generateGroceryList({ profile, meals: dayMeals, weekStart, day: selectedDay, planId });
      if (data.success && data.groceryList) {
        if (data.planId) {
          savePlanId(weekStart, data.planId);
          setPlanIdState(data.planId);
        }
        applyGeneratedList(data.groceryList);
        addToast('Grocery list generated!', 'success');
      }
    } catch (err) {
      applyGeneratedList(getSampleGroceryList(profile, weekStart));
      addToast('Using sample list — check server connection', 'error');
    } finally {
      setGenerating(false);
    }
  }

  function handleAddManualItem() {
    const name = manualInput.trim();
    if (!name) return;
    const base = groceryList
      ? { ...groceryList, categories: { ...groceryList.categories } }
      : { weekStart, categories: { ...EMPTY_CATEGORIES }, generatedAt: new Date().toISOString() };
    base.categories.other = [...(base.categories.other || []), { name, amount: '', checked: false }];

    setGroceryList(base);
    setCachedDayList(weekStart, selectedDay, base);
    setAvailableDays((prev) => { const next = new Set(prev); next.add(selectedDay); return next; });
    setManualInput('');
    addToast(`"${name}" added to list`);
  }

  function handleToggleItem(catKey, idx, checked) {
    if (!groceryList || !groceryList.categories[catKey]) return;
    const items = [...groceryList.categories[catKey]];
    items[idx] = { ...items[idx], checked };
    const next = { ...groceryList, categories: { ...groceryList.categories, [catKey]: items } };
    setGroceryList(next);
    setCachedDayList(weekStart, selectedDay, next);
  }

  function handleClearAll() {
    if (!window.confirm('Clear all checked items?')) return;
    if (!groceryList || !groceryList.categories) return;
    const categories = {};
    for (const [key, items] of Object.entries(groceryList.categories)) {
      categories[key] = items.map((item) => ({ ...item, checked: false }));
    }
    const next = { ...groceryList, categories };
    setGroceryList(next);
    setCachedDayList(weekStart, selectedDay, next);
    addToast('Cleared all checkmarks');
  }

  function handleDownloadPdf() {
    if (!user?.pro) {
      track('upgrade_click', { source: 'grocery_pdf_btn' });
      setShowPdfGate(true);
      return;
    }
    track('pdf_export', { source: 'grocery_list' });
    window.print();
  }

  const metrics = React.useMemo(() => {
    let total = 0, checked = 0, totalCost = 0;
    if (groceryList && groceryList.categories) {
      for (const items of Object.values(groceryList.categories)) {
        for (const item of items) {
          total++;
          if (item.checked) checked++;
          if (item.cost) totalCost += item.cost;
        }
      }
    }
    const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
    const budget = profile?.budget || 100;
    const budgetPct = Math.min(100, (totalCost / budget) * 100);
    return { total, checked, totalCost, pct, budget, budgetPct };
  }, [groceryList, profile]);

  const sym = getCurrencySymbol(profile?.currency || 'USD');

  return (
    <AppShell active="groceries" user={user}>
      {!ready ? (
        <div
          aria-live="polite"
          role="status"
          aria-label="Loading your grocery list"
          className="flex justify-center py-24 text-muted-fg"
        >
          <span
            aria-hidden="true"
            className="inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-clr-border border-t-green motion-reduce:animate-none"
          />
        </div>
      ) : (
        <div className={showBanner ? 'pb-20' : ''}>
          {!user?.pro && <ProNudgeBanner />}

          <DaySwitcher
            weekDates={weekDates}
            selectedDay={selectedDay}
            todayStr={todayStr}
            hasListFor={(day) => availableDays.has(day) || !!getCachedDayList(weekStart, day)}
            onSelect={handleSelectDay}
          />

          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 font-display text-2xl font-bold italic text-foreground">
                <Cart width="22" height="22" />
                This Week&rsquo;s Groceries
              </h1>
              <p className="mt-1 text-sm text-muted-fg">
                {weekDates.length ? `Week of ${fmtDate(weekDates[0].date)} – ${fmtDate(weekDates[6].date)}` : 'Loading...'}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="quiet"
                size="sm"
                onClick={handleDownloadPdf}
                title="Download grocery list as PDF"
                className={outlineBtn}
              >
                <FileDown /> Download PDF
              </Button>
              <Button variant="quiet" size="sm" onClick={handleClearAll} className={outlineBtn}>
                Clear All
              </Button>
              <Button size="sm" onClick={handleGenerate} disabled={generating}>
                <Star /> Generate List
              </Button>
            </div>
          </div>

          <div className="mb-5">
            <ProgressCard
              checked={metrics.checked}
              total={metrics.total}
              pct={metrics.pct}
              totalCost={metrics.totalCost}
              budget={metrics.budget}
              budgetPct={metrics.budgetPct}
              sym={sym}
            />
          </div>

          <div className="mb-5 flex gap-2.5">
            <Input
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddManualItem(); } }}
              placeholder="Add item manually..."
              aria-label="Add grocery item manually"
              className="flex-1"
            />
            <Button
              variant="quiet"
              onClick={handleAddManualItem}
              className="border-[1.5px] border-green bg-transparent text-green hover:bg-green hover:text-white"
            >
              + Add
            </Button>
          </div>

          <GroceryCategories
            groceryList={groceryList}
            selectedDay={selectedDay}
            sym={sym}
            onToggleItem={handleToggleItem}
            onGenerate={handleGenerate}
          />
        </div>
      )}

      {ready && showBanner && <InstacartBanner />}
      <LoadingOverlay open={generating} />
      <PdfGateModal open={showPdfGate} onOpenChange={setShowPdfGate} />
      <ToastStack toasts={toasts} />
    </AppShell>
  );
}
