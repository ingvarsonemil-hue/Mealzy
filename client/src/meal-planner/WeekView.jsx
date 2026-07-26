import * as React from 'react';
import { toISODate, mondayOf } from './storage';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function MealPopup({ popup, onClose }) {
  const ref = React.useRef(null);

  React.useEffect(() => {
    if (!popup) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [popup, onClose]);

  const [pos, setPos] = React.useState({ left: 0, top: 0 });

  React.useLayoutEffect(() => {
    if (!popup || !ref.current) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = popup.x + 8, top = popup.y + 8;
    const r = ref.current.getBoundingClientRect();
    if (left + r.width > vw - 8) left = Math.max(8, vw - r.width - 8);
    if (top + r.height > vh - 8) top = Math.max(8, popup.y - r.height - 8);
    setPos({ left, top });
  }, [popup]);

  if (!popup) return null;

  return (
    <div
      ref={ref}
      className="fixed z-[200] min-w-[180px] max-w-[240px] rounded-lg border border-clr-border bg-clr-surface p-[0.9rem_1.1rem] shadow-lg"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="mb-[0.3rem] text-[0.72rem] font-bold uppercase tracking-[0.06em] text-muted-fg">{popup.type}</div>
      <div className="mb-2 text-[0.92rem] font-bold leading-tight">{popup.name}</div>
      <div className="flex flex-col gap-[0.2rem] text-[0.82rem] text-muted-fg">
        {popup.meta.map((m, i) => <span key={i}>{m}</span>)}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-[0.6rem] top-2 cursor-pointer border-none bg-transparent p-0 text-base leading-none text-muted-fg"
      >
        ×
      </button>
    </div>
  );
}

export default function WeekView({ currentDate, mealPlans, goalCalories, onSwitchDay, onSwitchDayAndGenerate }) {
  const [popup, setPopup] = React.useState(null);

  const days = React.useMemo(() => {
    const monday = mondayOf(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [currentDate]);

  const todayStr = toISODate(new Date());

  const showPopup = (e, meal) => {
    e.stopPropagation();
    const meta = [
      meal.calories ? `${meal.calories} kcal` : null,
      meal.protein ? `${meal.protein}g protein` : null,
      meal.estimatedCost ? `~$${meal.estimatedCost.toFixed(2)}` : null,
      meal.cookTime ? `${meal.cookTime} min` : null
    ].filter(Boolean);
    setPopup({ x: e.clientX, y: e.clientY, type: meal.type ? meal.type.charAt(0).toUpperCase() + meal.type.slice(1) : 'Meal', name: meal.name, meta });
  };

  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 gap-3 min-[601px]:grid-cols-4 min-[901px]:grid-cols-7">
        {days.map((d, idx) => {
          const dateStr = toISODate(d);
          const meals = mealPlans[dateStr]?.meals || [];
          const isToday = dateStr === todayStr;
          const totalCals = meals.reduce((s, m) => s + (m.calories || 0), 0);
          const calPct = goalCalories > 0 ? Math.min(100, Math.round((totalCals / goalCalories) * 100)) : 0;
          const withinRange = calPct >= 90 && calPct <= 110;
          const barColorVar = meals.length === 0 ? 'var(--color-border)' : withinRange ? 'var(--color-success)' : 'var(--color-warning)';

          return (
            <div
              key={dateStr}
              onClick={() => onSwitchDay(dateStr)}
              className={
                'flex min-h-[160px] cursor-pointer flex-col rounded-md border p-[0.75rem_0.6rem] shadow-card transition-colors hover:border-green ' +
                (isToday ? 'border-green bg-green/10' : 'border-clr-border bg-clr-surface')
              }
            >
              <div className="mb-1 text-xs font-bold uppercase tracking-[0.05em] text-muted-fg">{DAY_NAMES[idx]}</div>
              <div className="mb-[0.6rem] text-[1.1rem] font-extrabold">{d.getDate()}</div>

              {meals.map((m, mi) => (
                <button
                  key={mi}
                  type="button"
                  title={m.name}
                  onClick={(e) => showPopup(e, m)}
                  className="mb-[0.3rem] block w-full cursor-pointer truncate rounded-md border-none bg-green/15 px-[0.4rem] py-[0.2rem] text-left text-[0.68rem] font-semibold text-green"
                >
                  {m.name}
                </button>
              ))}

              {meals.length === 0 ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSwitchDayAndGenerate(dateStr); }}
                  className="w-full cursor-pointer rounded-md border-[1.5px] border-dashed border-green bg-green/10 p-[0.4rem] text-[0.75rem] font-semibold text-green"
                >
                  + Generate
                </button>
              ) : (
                <div className="mt-auto pt-2">
                  <div className="mb-[0.2rem] text-center text-[0.68rem] text-muted-fg">{totalCals} kcal</div>
                  <div className="h-1 overflow-hidden rounded-full bg-clr-border">
                    <div className="h-full rounded-full transition-[width]" style={{ width: calPct + '%', background: barColorVar }} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <MealPopup popup={popup} onClose={() => setPopup(null)} />
    </div>
  );
}
