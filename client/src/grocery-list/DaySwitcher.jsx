import { cn } from '@/lib/utils';
import { DAY_ABBR } from './storage';

/* Mon-Sun tabs. `.empty` styling (legacy) -> muted/dashed here; a day with no
 * saved list is still clickable (it just renders the empty state on select). */
export default function DaySwitcher({ weekDates, selectedDay, todayStr, hasListFor, onSelect }) {
  return (
    <div role="tablist" aria-label="Select a day" className="mb-5 flex gap-2 overflow-x-auto pb-1">
      {weekDates.map(({ date, dayName }) => {
        const active = dayName === selectedDay;
        const isToday = date === todayStr;
        const hasList = hasListFor(dayName);
        const dateLabel = new Date(`${date}T00:00:00`).getDate();
        return (
          <button
            key={dayName}
            type="button"
            role="tab"
            aria-selected={active}
            title={hasList ? undefined : 'No grocery list yet for this day'}
            onClick={() => onSelect(dayName)}
            className={cn(
              'flex min-w-[52px] shrink-0 flex-col items-center gap-0.5 rounded-md border px-3 py-2 text-xs font-semibold transition-colors duration-150',
              active
                ? 'border-green bg-green text-white shadow-button'
                : 'border-clr-border bg-clr-surface text-foreground hover:border-green/50',
              !hasList && !active && 'border-dashed text-muted-fg opacity-70'
            )}
          >
            <span className="flex items-center gap-1">
              {DAY_ABBR[dayName]}
              {isToday && (
                <span
                  aria-hidden="true"
                  className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-white' : 'bg-green')}
                />
              )}
            </span>
            <span className={cn('text-sm font-bold', active ? 'text-white' : 'text-foreground')}>{dateLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
