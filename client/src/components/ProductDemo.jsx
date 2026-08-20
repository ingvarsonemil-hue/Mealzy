export default function ProductDemo() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-12 md:py-16">
      <div className="bg-cream border border-border rounded-xl shadow-lg overflow-hidden">
        
        {/* Chat Header */}
        <div className="flex items-center gap-2 border-b border-hairline bg-muted-bg px-4 py-3">
          <div className="h-3 w-3 rounded-full bg-muted-fg/30"></div>
          <div className="h-3 w-3 rounded-full bg-muted-fg/30"></div>
          <div className="h-3 w-3 rounded-full bg-muted-fg/30"></div>
          <div className="mx-auto rounded-md border border-border bg-cream px-3 py-0.5 text-sm text-muted-fg font-body">
            Mealzy Conversation
          </div>
        </div>

        <div className="p-6 md:p-8 grid gap-8 md:grid-cols-2 items-center">
          
          {/* Left: The Conversation */}
          <div className="space-y-4">
            {/* Mealzy Ask 1 */}
            <div className="flex justify-start">
              <div className="max-w-xs bg-muted-bg border border-border rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm font-body text-foreground">
                What's your weekly grocery budget?
              </div>
            </div>
            {/* User Ans 1 */}
            <div className="flex justify-end">
              <div className="max-w-xs bg-green text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm font-body font-semibold">
                $60
              </div>
            </div>
            {/* Mealzy Ask 2 */}
            <div className="flex justify-start">
              <div className="max-w-xs bg-muted-bg border border-border rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm font-body text-foreground">
                How many people are you feeding?
              </div>
            </div>
            {/* User Ans 2 */}
            <div className="flex justify-end">
              <div className="max-w-xs bg-green text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm font-body font-semibold">
                2
              </div>
            </div>
            {/* Mealzy Ask 3 */}
            <div className="flex justify-start">
              <div className="max-w-xs bg-muted-bg border border-border rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm font-body text-foreground">
                Any dietary preferences?
              </div>
            </div>
            {/* User Ans 3 */}
            <div className="flex justify-end">
              <div className="max-w-xs bg-green text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm font-body font-semibold">
                No preference
              </div>
            </div>
            {/* Mealzy Processing */}
            <div className="flex justify-start">
              <div className="max-w-xs bg-muted-bg border border-border rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm font-body text-muted-fg italic">
                Building your week...
              </div>
            </div>
          </div>

          {/* Right: The Result */}
          <div className="rounded-lg border border-border bg-cream p-5 shadow-sm">
            <div className="grid grid-cols-3 gap-4 pb-4 border-b border-hairline">
              <div>
                <div className="text-xs text-muted-fg uppercase tracking-wider font-body">Budget</div>
                <div className="text-xl font-bold text-foreground tabular-nums font-display">$60</div>
              </div>
              <div>
                <div className="text-xs text-muted-fg uppercase tracking-wider font-body">Planned</div>
                <div className="text-xl font-bold text-foreground tabular-nums font-display">$52</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-fg uppercase tracking-wider font-body">Remaining</div>
                <div className="text-xl font-bold text-green tabular-nums font-display">$8</div>
              </div>
            </div>
            
            <div className="mt-4 space-y-3">
              <div className="text-xs font-bold text-muted-fg uppercase tracking-wider font-body">Preview</div>
              <div className="flex items-center justify-between text-sm font-body">
                <span className="text-foreground">Tofu Scramble</span>
                <span className="text-muted-fg tabular-nums">$3.20</span>
              </div>
              <div className="flex items-center justify-between text-sm font-body">
                <span className="text-foreground">Chickpea Salad</span>
                <span className="text-muted-fg tabular-nums">$4.10</span>
              </div>
              <div className="flex items-center justify-between text-sm font-body">
                <span className="text-foreground">Lentil Curry</span>
                <span className="text-muted-fg tabular-nums">$5.50</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}