import * as React from 'react';
import { readJSON } from '../dashboardUtils';

/* Chart.js is loaded from a CDN <script defer> in client/dashboard.html (see
 * task contract) — this reads the global window.Chart the same way the
 * legacy inline script did, rather than adding an npm dependency. Because
 * the script is deferred, it may not be ready by the time this component
 * mounts, so we poll briefly for window.Chart before giving up.
 *
 * Ported intentionally as a build-once chart: legacy only ever calls
 * buildCalorieHistoryChart() from init(), never again after a plan is
 * generated mid-session — the "today" bar can go stale until reload. Not
 * one of the two named fixes, so that quirk is preserved here rather than
 * "improved" by wiring in a live refresh. */
export default function CalorieHistoryChart({ goalCals }) {
  const canvasRef = React.useRef(null);
  const chartRef = React.useRef(null);

  React.useEffect(() => {
    let cancelled = false;
    let pollTimer = null;

    const build = () => {
      if (cancelled || !canvasRef.current || !window.Chart) return;
      const logs = readJSON('mealzy_nutrition_logs', {});
      const labels = [];
      const data = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
        data.push(logs[dateStr] ? logs[dateStr].calories : 0);
      }

      if (chartRef.current) chartRef.current.destroy();
      chartRef.current = new window.Chart(canvasRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Calories',
              data,
              backgroundColor: data.map((v) => (v > 0 ? 'hsl(152,52%,50%)' : 'hsl(152,52%,85%)')),
              borderRadius: 6,
              borderSkipped: false
            },
            {
              label: 'Goal',
              data: Array(7).fill(goalCals),
              type: 'line',
              borderColor: 'hsl(32,88%,54%)',
              borderDash: [5, 4],
              borderWidth: 2,
              pointRadius: 0,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { font: { family: 'Inter', size: 11 }, boxWidth: 12 } }
          },
          scales: {
            y: { beginAtZero: true, grid: { color: 'hsl(40,20%,92%)' }, ticks: { font: { size: 11 } } },
            x: { grid: { display: false }, ticks: { font: { size: 11 } } }
          }
        }
      });
    };

    if (window.Chart) {
      build();
    } else {
      pollTimer = setInterval(() => {
        if (window.Chart) {
          clearInterval(pollTimer);
          build();
        }
      }, 150);
    }

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [goalCals]);

  React.useEffect(() => () => chartRef.current?.destroy(), []);

  return (
    <div className="rounded-lg border border-hairline bg-cream p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold italic text-foreground">7-Day Calorie History</h2>
        <span className="text-sm text-muted-fg">vs your daily goal</span>
      </div>
      <div className="relative h-[180px]">
        <canvas ref={canvasRef} role="img" aria-label="7-day calorie history bar chart showing daily intake versus daily goal" />
      </div>
    </div>
  );
}
