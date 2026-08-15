import * as React from 'react';

export default function Hero({ onStartPlan, ctaHref }) {
  return (
    <section className="w-full bg-white pt-16 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
        
        {/* Left side: words */}
        <div className="space-y-6">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight">
            Stop Overspending at the Grocery Store
          </h1>
          <p className="text-xl text-gray-600 leading-relaxed">
            Get a complete 7-day meal plan + shopping list that fits 
            <span className="text-emerald-600 font-semibold"> exactly </span> 
            your budget. Set it once. Mealzy builds every meal around it.
          </p>
          
          {/* Little green boxes showing the math */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 inline-flex flex-wrap items-center gap-3 text-sm font-medium text-emerald-800">
            <span className="bg-white px-3 py-1 rounded-full shadow-sm">$60/week budget</span>
            <span>→</span>
            <span className="bg-white px-3 py-1 rounded-full shadow-sm">7 meals planned</span>
            <span>→</span>
            <span className="bg-white px-3 py-1 rounded-full shadow-sm">$47 spent</span>
            <span>→</span>
            <span className="bg-emerald-600 text-white px-3 py-1 rounded-full shadow-sm">$13 saved</span>
          </div>

          <div className="pt-2">
            <button 
              onClick={onStartPlan}
              className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-semibold px-8 py-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer"
            >
              Generate My Free Week →
            </button>
            <p className="mt-3 text-sm text-gray-500 flex flex-wrap gap-4">
              <span>✓ No credit card required</span>
              <span>✓ Cancel anytime</span>
              <span>✓ 14-day money-back guarantee</span>
            </p>
          </div>
        </div>

        {/* Right side: fake phone screen showing the app */}
        <div className="relative">
          <div className="bg-gray-900 rounded-2xl shadow-2xl p-2 sm:p-4 transform rotate-1 hover:rotate-0 transition-transform duration-300">
            <div className="bg-white rounded-xl overflow-hidden">
              <div className="bg-gray-50 p-6 space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <span className="font-bold text-gray-800">Monday</span>
                  <span className="text-emerald-600 font-semibold">$12.40</span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-orange-100 rounded-lg flex-shrink-0"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Greek Yogurt Parfait</p>
                      <p className="text-xs text-gray-500">Breakfast • 455 kcal</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex-shrink-0"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Quinoa Buddha Bowl</p>
                      <p className="text-xs text-gray-500">Lunch • 645 kcal</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-red-100 rounded-lg flex-shrink-0"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Herb-Crusted Salmon</p>
                      <p className="text-xs text-gray-500">Dinner • 840 kcal</p>
                    </div>
                  </div>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3 text-center">
                  <p className="text-sm font-semibold text-emerald-700">
                    Grocery list: 12 items • Est. $47 total
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}