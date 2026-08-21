import * as React from 'react';
import Reveal from '@/components/Reveal';

export default function FounderStory() {
  return (
    <section className="bg-white py-16 sm:py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-[200px_1fr] gap-10 items-start">
          
          {/* Left: Founder photo placeholder */}
          <div className="flex flex-col items-center lg:items-start">
            <div className="w-32 h-32 rounded-full bg-emerald-100 flex items-center justify-center text-4xl font-bold text-emerald-700">
              E
            </div>
            <p className="mt-4 text-sm font-semibold text-gray-900">Emil</p>
            <p className="text-sm text-gray-500">Founder, Mealzy</p>
            <p className="mt-1 text-xs text-gray-500">Sweden</p>
          </div>

          {/* Right: Story */}
          <div className="space-y-5">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              Why I Built Mealzy
            </h2>
            
            <p className="text-lg text-gray-600 leading-relaxed">
              I kept overspending on groceries every week — and still ordering takeout
              because I had nothing planned. Every meal planner I tried suggested recipes that
              blew my budget without ever telling me the price first.
            </p>
            
            <p className="text-lg text-gray-600 leading-relaxed">
              So I built Mealzy — the only planner that treats your grocery budget as a 
              <span className="text-emerald-600 font-semibold"> hard rule</span>, not a suggestion. 
              Every meal is priced before it enters your plan. If it doesn't fit, it doesn't get suggested.
            </p>
            
            <p className="text-lg text-gray-600 leading-relaxed">
              It's just me right now, building this in Sweden. If it saves you money and time, 
              I've done my job.
            </p>

            <div className="pt-2">
              <p className="text-sm text-gray-500">
                Questions? <a href="mailto:support@mealzy.org" className="text-emerald-600 hover:underline">support@mealzy.org</a>
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}