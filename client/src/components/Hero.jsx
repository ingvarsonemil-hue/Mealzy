import { useState, useCallback } from 'react';

/* ───────────────────────────────────────────────
   Hero — Screenshot-ready version
   Replace mockup placeholder with real app image.
   Expected asset: /images/hero-screenshot.png (or .webp)
   ─────────────────────────────────────────────── */

function IconArrowRight({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function IconCheck({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function Hero({ onStartPlan, ctaHref }) {
  const [email, setEmail] = useState('');

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (onStartPlan) onStartPlan({ email });
  }, [email, onStartPlan]);

  return (
    <section className="relative bg-parchment overflow-hidden">
      {/* Subtle background texture */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
      }} />

      <div className="relative mx-auto max-w-7xl px-4 py-16 md:py-24 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: Copy */}
          <div className="text-center lg:text-left">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-forest tracking-tight leading-[1.1]">
              Stop overspending at the grocery store
            </h1>
            <p className="mt-6 text-lg md:text-xl text-gray-600 max-w-xl mx-auto lg:mx-0">
              Mealzy builds your weekly meal plan around your budget — so you buy only what you need and stop throwing food away.
            </p>

            {/* Value prop boxes */}
            <div className="mt-8 grid grid-cols-3 gap-3 max-w-md mx-auto lg:mx-0">
              <div className="rounded-xl bg-white border border-gray-200 p-3 text-center shadow-sm">
                <div className="text-2xl font-bold text-forest">$60</div>
                <div className="text-xs text-gray-500 mt-1">Typical spend</div>
              </div>
              <div className="rounded-xl bg-white border border-gray-200 p-3 text-center shadow-sm">
                <div className="text-2xl font-bold text-green-600">$47</div>
                <div className="text-xs text-gray-500 mt-1">With Mealzy</div>
              </div>
              <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-center shadow-sm">
                <div className="text-2xl font-bold text-green-700">$13</div>
                <div className="text-xs text-green-700 mt-1 font-medium">Saved</div>
              </div>
            </div>

            {/* CTA */}
            <form onSubmit={handleSubmit} className="mt-8 flex flex-col sm:flex-row gap-3 max-w-md mx-auto lg:mx-0">
              <input
                type="email"
                required
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent bg-white"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-forest text-white px-6 py-3 text-sm font-bold hover:bg-green-900 transition-colors whitespace-nowrap"
              >
                Generate My Free Week
                <IconArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Trust badges */}
            <div className="mt-4 flex flex-wrap items-center justify-center lg:justify-start gap-x-4 gap-y-1 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1">
                <IconCheck className="w-3.5 h-3.5 text-green-600" />
                No credit card
              </span>
              <span className="inline-flex items-center gap-1">
                <IconCheck className="w-3.5 h-3.5 text-green-600" />
                Cancel anytime
              </span>
              <span className="inline-flex items-center gap-1">
                <IconCheck className="w-3.5 h-3.5 text-green-600" />
                14-day money-back
              </span>
            </div>
          </div>

          {/* Right: Real app screenshot */}
          <div className="relative">
            {/* Decorative glow behind screenshot */}
            <div className="absolute -inset-4 bg-green-200/30 rounded-[2rem] blur-2xl" />

            {/* Screenshot container with browser chrome */}
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-gray-200/80 bg-white">
              {/* Browser top bar */}
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 mx-4">
                  <div className="max-w-xs mx-auto rounded-md bg-white border border-gray-200 px-3 py-1 text-xs text-gray-400 text-center truncate">
                    app.mealzy.org/plan
                  </div>
                </div>
              </div>

              {/* THE SCREENSHOT */}
              <img
                src="/images/hero-screenshot.png"
                alt="Mealzy app showing a weekly meal plan with grocery list and budget tracker"
                className="w-full h-auto block"
                loading="eager"
                width="800"
                height="600"
              />
            </div>

            {/* Floating badge */}
            <div className="absolute -bottom-4 -left-4 md:-left-8 bg-white rounded-xl shadow-lg border border-gray-100 p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <IconCheck className="w-5 h-5 text-green-700" />
              </div>
              <div>
                <div className="text-sm font-bold text-forest">$13 saved</div>
                <div className="text-xs text-gray-500">this week alone</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
