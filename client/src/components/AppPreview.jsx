import { useState } from 'react';

/* ───────────────────────────────────────────────
   AppPreview — Reusable live CSS "screenshot"
   Renders a stylized Mealzy planner interface.
   Zero dependencies, zero image assets.
   ─────────────────────────────────────────────── */

export default function AppPreview({ highlight = null }) {
  const [checked, setChecked] = useState([true, true, false, false]);

  const toggle = (i) => {
    setChecked((prev) => {
      const next = [...prev];
      next[i] = !next[i];
      return next;
    });
  };

  const meals = [
    { day: 'Mon', meal: 'Chickpea Curry', price: '$8', icon: '🍛' },
    { day: 'Tue', meal: 'Pasta Primavera', price: '$7', icon: '🍝' },
    { day: 'Wed', meal: 'Bean Chili', price: '$6', icon: '🌶️' },
  ];

  const groceries = [
    { name: 'Chickpeas (2 cans)', price: '$3' },
    { name: 'Pasta (500g)', price: '$2' },
    { name: 'Bell peppers (3)', price: '$4' },
    { name: 'Coconut milk', price: '$2' },
  ];

  return (
    <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-gray-200/80 bg-white select-none">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-amber-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 mx-4">
          <div className="max-w-xs mx-auto rounded-md bg-white border border-gray-200 px-3 py-1 text-xs text-gray-400 text-center truncate font-mono">
            app.mealzy.org/plan
          </div>
        </div>
      </div>

      {/* App content */}
      <div className="p-4 md:p-6 bg-parchment">
        {/* Header bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-forest flex items-center justify-center">
              <span className="text-white text-xs font-bold">M</span>
            </div>
            <span className="text-sm font-bold text-forest">Weekly Plan</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Budget</span>
            <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 px-2 py-1">
              <span className="text-xs text-gray-400">$</span>
              <span className="text-sm font-bold text-forest">60</span>
            </div>
          </div>
        </div>

        {/* Budget slider */}
        <div
          className={`mb-5 bg-white rounded-xl border p-3 transition-colors ${
            highlight === 'budget' ? 'border-green-500 ring-2 ring-green-200' : 'border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600">Adjust your budget</span>
            <span className="text-xs font-bold text-green-700">Est. $52</span>
          </div>
          <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="absolute left-0 top-0 h-full w-[65%] bg-green-500 rounded-full" />
            <div className="absolute left-[65%] top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-green-600 rounded-full shadow" />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-gray-400">$20</span>
            <span className="text-[10px] text-gray-400">$300</span>
          </div>
        </div>

        {/* Meal cards */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {meals.map((item) => (
            <div
              key={item.day}
              className={`bg-white rounded-xl border p-2.5 transition-colors ${
                highlight === 'meals' ? 'border-green-500 ring-1 ring-green-200' : 'border-gray-200'
              }`}
            >
              <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">{item.day}</div>
              <div className="w-full aspect-[4/3] bg-cream rounded-lg flex items-center justify-center text-2xl mb-2">
                {item.icon}
              </div>
              <div className="text-[11px] font-semibold text-forest truncate">{item.meal}</div>
              <div className="text-[10px] text-green-700 font-medium">{item.price}</div>
            </div>
          ))}
        </div>

        {/* Grocery list */}
        <div
          className={`bg-white rounded-xl border p-3 transition-colors ${
            highlight === 'grocery' ? 'border-green-500 ring-2 ring-green-200' : 'border-gray-200'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-forest">Grocery List</span>
            <span className="text-[10px] text-green-700 font-medium bg-green-50 px-2 py-0.5 rounded-full">Est. $52</span>
          </div>
          <div className="space-y-1.5">
            {groceries.map((item, i) => (
              <button
                key={i}
                onClick={() => toggle(i)}
                className="w-full flex items-center justify-between text-xs hover:bg-gray-50 rounded-md px-1 -mx-1 py-0.5 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                      checked[i]
                        ? 'border-green-500 bg-green-500'
                        : 'border-gray-300 bg-white'
                    }`}
                  >
                    {checked[i] && (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span className={`${checked[i] ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                    {item.name}
                  </span>
                </div>
                <span className="text-gray-500 font-medium">{item.price}</span>
              </button>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
            <span className="text-[10px] text-gray-400">4 more items</span>
            <span className="text-xs font-bold text-forest">Total: $52</span>
          </div>
        </div>
      </div>
    </div>
  );
}
