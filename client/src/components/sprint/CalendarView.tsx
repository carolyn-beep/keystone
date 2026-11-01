import { Award } from 'lucide-react';
import type { TaskListItem } from '@shared/routes';

interface CalendarViewProps {
  startDate: string;
  endDate: string;
  tasks: TaskListItem[];
  selectedTaskId: number | null;
  selectedDate: string;
  localDate: string;
  onSelectTask: (taskId: number) => void;
  onSelectDay: (date: string) => void;
}

export interface CalendarDayBucket {
  date: string;
  tasks: TaskListItem[];
  totalCount: number;
  completedCount: number;
}

const dayLabelFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

function parseLocalDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildCalendarDays(
  startDate: string,
  endDate: string,
  tasks: TaskListItem[],
): CalendarDayBucket[] {
  const tasksByDate = new Map<string, TaskListItem[]>();
  tasks.forEach((task) => {
    const existing = tasksByDate.get(task.scheduledDate) ?? [];
    existing.push(task);
    tasksByDate.set(task.scheduledDate, existing);
  });

  const days: CalendarDayBucket[] = [];
  const cursor = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);

  while (cursor.getTime() <= end.getTime()) {
    const date = toLocalDateString(cursor);
    const dayTasks = tasksByDate.get(date) ?? [];
    const completedCount = dayTasks.filter((task) => task.isComplete).length;

    days.push({
      date,
      tasks: dayTasks,
      totalCount: dayTasks.length,
      completedCount,
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

export function CalendarView({
  startDate,
  endDate,
  tasks,
  selectedTaskId,
  selectedDate,
  localDate,
  onSelectTask,
  onSelectDay,
}: CalendarViewProps) {
  const days = buildCalendarDays(startDate, endDate, tasks);
  const weekdayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const leadingEmptyCells = days.length > 0 ? parseLocalDate(days[0].date).getDay() : 0;

  return (
    <section className="rounded-xl bg-card-elevated shadow-card p-6">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h3 className="m-0 text-[24px] leading-tight font-semibold text-foreground">Sprint Calendar</h3>
          <p className="m-0 mt-2 text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            30-Day Schedule
          </p>
        </div>
        <p className="m-0 text-xs text-muted-foreground">
          {startDate} to {endDate}
        </p>
      </div>

      <div className="grid grid-cols-7 gap-2 mb-2">
        {weekdayHeaders.map((label) => (
          <div key={label} className="text-[10px] uppercase tracking-[0.24em] font-semibold text-muted-foreground px-2 py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: leadingEmptyCells }).map((_, idx) => (
          <div key={`empty-${idx}`} aria-hidden className="min-h-[122px]" />
        ))}
        {days.map((day) => {
          const date = parseLocalDate(day.date);
          const isToday = day.date === localDate;
          const isSelected = day.date === selectedDate;
          const dayName = dayLabelFormatter.format(date);
          const hasTasks = day.totalCount > 0;
          const isFullyComplete = hasTasks && day.completedCount === day.totalCount;

          const baseClasses = isSelected
            ? 'bg-primary/15 border-primary'
            : isToday
              ? 'bg-primary/10 border-primary/40'
              : 'bg-card border-border hover:border-primary/40';

          return (
            <button
              key={day.date}
              type="button"
              onClick={() => onSelectDay(day.date)}
              className={`text-left rounded-lg border p-3 min-h-[122px] transition-colors ${baseClasses}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-serif text-sm text-foreground">{dayName}</span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{day.date.slice(8)}</span>
              </div>

              {hasTasks ? (
                <div className="mt-3 space-y-1.5">
                  <p className="m-0 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {day.completedCount}/{day.totalCount} complete
                  </p>
                  {day.tasks.slice(0, 2).map((task) => {
                    const isTaskSelected = selectedTaskId === task.id;
                    const isFlagship = task.milestone === 'weekly_artifact';
                    const flagshipClasses = isFlagship ? 'border-l-2 border-warning' : '';
                    return (
                      <span
                        key={task.id}
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectTask(task.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            onSelectTask(task.id);
                          }
                        }}
                        className={`block w-full text-left rounded-md px-2 py-1.5 text-xs transition-colors cursor-pointer ${flagshipClasses} ${
                          isTaskSelected
                            ? 'bg-primary/20 text-foreground'
                            : task.isComplete
                              ? 'bg-success-soft text-foreground'
                              : 'bg-card-elevated text-muted-foreground hover:text-foreground'
                        }`}
                        title={isFlagship ? `Flagship — ${task.title}` : task.title}
                      >
                        <span className="flex items-center gap-1 min-w-0">
                          {isFlagship && <Award size={11} className="shrink-0 text-warning" />}
                          <span className="block truncate">{task.title}</span>
                        </span>
                      </span>
                    );
                  })}
                  {day.tasks.length > 2 && (
                    <p className="m-0 text-[10px] uppercase tracking-[0.18em] text-muted-light">
                      +{day.tasks.length - 2} more tasks
                    </p>
                  )}
                </div>
              ) : (
                <p className="m-0 mt-4 text-xs text-muted-light italic">No tasks</p>
              )}

              {isFullyComplete && (
                <p className="m-0 mt-3 text-[10px] uppercase tracking-[0.2em] text-success">
                  Day complete
                </p>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
