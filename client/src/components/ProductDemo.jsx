export default function ProductDemo() {
  return (
    <section className="relative mx-auto max-w-5xl px-4 py-12 md:py-16">
      {/* Main Interaction Card */}
      <div className="bg-card border border-border rounded-2xl shadow-xl overflow-hidden transition-all duration-300">
        
        {/* Browser Chrome */}
        <div className="flex items-center gap-2 border-b border-hairline bg-subtle px-4 py-3">
          <div className="h-3 w-3 rounded-full bg-muted-fg/30"></div>
          <div className="h-3 w-3 rounded-full bg-muted-fg/30"></div>
          <div className="h-3 w-3 rounded-full bg-muted-fg/30"></div>
          <div className="mx-auto rounded-md border border-hairline bg-card px-3 py-0.5 text-xs text-muted-fg">
            app.mealzy.org/dashboard
          </div>
        </div>

        <div className="p-6 md:p-8">
          
          {/* Step 1: The Inputs (Budget & Preferences) */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
            <span className="text-sm font-medium text-muted-fg">You request:</span>
            <div className="flex items-center gap-1.5 rounded-full bg-subtle border border-border px-3 py-1 text-sm font-semibold text-fg">
              <span>💰</span> $100 Budget
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-subtle border border-border px-3 py-1 text-sm font-semibold text-fg">
              <span>🥗</span> Vegan
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-subtle border border-border px-3 py-1 text-sm font-semibold text-fg">
              <span>👥</span> 2 People
            </div>
          </div>

          {/* Visual Transition: AI Generation */}
          <div className="flex justify-center mb-8">
            <div className="flex flex-col items-center text-muted-fg">
              <div className="h-8 w-px bg-border"></div>
              <svg className="h-6 w-6 text-green my-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              <div className="text-xs font-semibold uppercase tracking-wider text-green mt-1">Mealzy Generates</div>
            </div>
          </div>

          {/* Step 2 & 3: The Output (Plan + Groceries) */}
          <div className="grid gap-6 md:grid-cols-2">
            
            {/* Meal Plan Pane */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex justify-between items-center pb-3 border-b border-hairline mb-4">
                <h3 className="text-sm font-bold text-fg">7-Day Meal Plan</h3>
                <span className="text-xs font-medium text-muted-fg">Targets Met</span>
              </div>
              
              <div className="space-y-4">
                {/* Monday */}
                <div>
                  <div className="text-xs font-bold text-green mb-2 uppercase tracking-wider">Monday</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-fg">Tofu Scramble</span>
                      <span className="text-muted-fg tabular-nums">$3.20</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-fg">Chickpea Salad</span>
                      <span className="text-muted-fg tabular-nums">$4.10</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-fg">Lentil Curry</span>
                      <span className="text-muted-fg tabular-nums">$5.50</span>
                    </div>
                  </div>
                </div>

                {/* Tuesday */}
                <div>
                  <div className="text-xs font-bold text-green mb-2 uppercase tracking-wider">Tuesday</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-fg">Oatmeal & Berries</span>
                      <span className="text-muted-fg tabular-nums">$2.10</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-fg">Vegan Wrap</span>
                      <span className="text-muted-fg tabular-nums">$4.50</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-fg">Pasta Primavera</span>
                      <span className="text-muted-fg tabular-nums">$6.10</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Grocery List Pane */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex justify-between items-center pb-3 border-b border-hairline mb-4">
                <h3 className="text-sm font-bold text-fg">Grocery List</h3>
                <span className="text-xs font-medium text-muted-fg">Auto-Generated</span>
              </div>

              <div className="space-y-4">
                {/* Produce */}
                <div>
                  <div className="text-xs font-bold text-muted-fg mb-2 uppercase tracking-wider">Produce</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-green text-white text-[10px]">✓</span>
                        <span className="text-fg">Mixed Berries</span>
                      </div>
                      <span className="text-muted-fg tabular-nums">$3.50</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-green text-white text-[10px]">✓</span>
                        <span className="text-fg">Spinach</span>
                      </div>
                      <span className="text-muted-fg tabular-nums">$2.00</span>
                    </div>
                  </div>
                </div>

                {/* Pantry */}
                <div>
                  <div className="text-xs font-bold text-muted-fg mb-2 uppercase tracking-wider">Pantry</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-green text-white text-[10px]">✓</span>
                        <span className="text-fg">Red Lentils</span>
                      </div>
                      <span className="text-muted-fg tabular-nums">$2.80</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-green text-white text-[10px]">✓</span>
                        <span className="text-fg">Pasta</span>
                      </div>
                      <span className="text-muted-fg tabular-nums">$2.50</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
          
          {/* Step 4: Total under budget */}
          <div className="mt-8 rounded-xl bg-green/10 border border-green/30 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green text-white text-lg">✓</span>
              <div>
                <div className="text-sm font-semibold text-fg">Total Planned Spend</div>
                <div className="text-xs text-muted-fg">Includes pantry staples</div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-xs text-muted-fg uppercase tracking-wider">Total</div>
                <div className="text-xl font-bold text-fg tabular-nums">$87.50</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-fg uppercase tracking-wider">Remaining</div>
                <div className="text-xl font-bold text-green tabular-nums">$12.50</div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}