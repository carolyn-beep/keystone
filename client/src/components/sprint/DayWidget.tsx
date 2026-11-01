import { Award } from 'lucide-react';
import type { TaskListItem } from '@shared/routes';

interface DayWidgetProps {
  tasks: TaskListItem[];
  allTasks: TaskListItem[];
  localDate: string;
  selectedDate: string;
  selectedTaskId: number | null;
  onSelectTask: (taskId: number) => void;
}

export interface TodayTaskBuckets {
  today: TaskListItem[];
  overdue: TaskListItem[];
}

function byScheduledDate(taskA: TaskListItem, taskB: TaskListItem): number {
  if (taskA.scheduledDate === taskB.scheduledDate) {
    return taskA.id - taskB.id;
  }
  return taskA.scheduledDate.localeCompare(taskB.scheduledDate);
}

export function splitTodayAndOverdueTasks(tasks: TaskListItem[], localDate: string): TodayTaskBuckets {
  const today = tasks
    .filter((task) => task.scheduledDate === localDate)
    .sort(byScheduledDate);

  const overdue = tasks
    .filter((task) => task.isPastDue && !task.isComplete)
    .sort(byScheduledDate);

  return { today, overdue };
}

function parseLocalDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

const dayHeadingFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
});

function TaskRow({
  task,
  selectedTaskId,
  onSelectTask,
}: {
  task: TaskListItem;
  selectedTaskId: number | null;
  onSelectTask: (taskId: number) => void;
}) {
  const isSelected = selectedTaskId === task.id;
  const isFlagship = task.milestone === 'weekly_artifact';
  const status = task.isComplete ? 'complete' : task.isPastDue ? 'overdue' : 'open';

  return (
    <button
      type="button"
      onClick={() => onSelectTask(task.id)}
      className={`w-full text-left rounded-lg p-3 transition-colors ${
        isFlagship ? 'border-l-4 border-warning' : ''
      } ${
        isSelected
          ? 'bg-primary/20'
          : task.isComplete
            ? 'bg-success-soft'
            : task.isPastDue
              ? 'bg-warning-soft'
              : 'bg-card'
      }`}
    >
      {isFlagship && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <Award size={12} className="text-warning" />
          <span className="text-[9px] uppercase tracking-[0.26em] font-semibold text-warning">
            Flagship
          </span>
        </div>
      )}
      <p className="m-0 text-sm text-foreground">{task.title}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {task.scheduledDate}
        </span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {status}
        </span>
      </div>
    </button>
  );
}

export function DayWidget({
  tasks,
  allTasks,
  localDate,
  selectedDate,
  selectedTaskId,
  onSelectTask,
}: DayWidgetProps) {
  const isViewingToday = selectedDate === localDate;
  const buckets = splitTodayAndOverdueTasks(tasks, localDate);

  const selectedDayTasks = allTasks
    .filter((task) => task.scheduledDate === selectedDate)
    .sort(byScheduledDate);

  const heading = isViewingToday ? 'Today' : dayHeadingFormatter.format(parseLocalDate(selectedDate));
  const subtitle = isViewingToday ? 'Due Now + Overdue' : 'Scheduled Tasks';

  return (
    <section className="rounded-xl bg-card-elevated shadow-card p-6">
      <h3 className="m-0 text-[24px] leading-tight font-semibold text-foreground">{heading}</h3>
      <p className="m-0 mt-2 text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
        {subtitle}
      </p>

      {isViewingToday ? (
        <div className="mt-5 space-y-5">
          <div>
            <p className="m-0 text-[10px] uppercase tracking-[0.22em] font-semibold text-muted-foreground">
              Today ({buckets.today.length})
            </p>
            <div className="mt-2 space-y-2">
              {buckets.today.length > 0 ? (
                buckets.today.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={onSelectTask}
                  />
                ))
              ) : (
                <p className="m-0 text-sm text-muted-light italic">No tasks scheduled for today.</p>
              )}
            </div>
          </div>

          <div>
            <p className="m-0 text-[10px] uppercase tracking-[0.22em] font-semibold text-muted-foreground">
              Overdue ({buckets.overdue.length})
            </p>
            <div className="mt-2 space-y-2">
              {buckets.overdue.length > 0 ? (
                buckets.overdue.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={onSelectTask}
                  />
                ))
              ) : (
                <p className="m-0 text-sm text-muted-light italic">No overdue incomplete tasks.</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5">
          <p className="m-0 text-[10px] uppercase tracking-[0.22em] font-semibold text-muted-foreground">
            {selectedDate} ({selectedDayTasks.length})
          </p>
          <div className="mt-2 space-y-2">
            {selectedDayTasks.length > 0 ? (
              selectedDayTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  selectedTaskId={selectedTaskId}
                  onSelectTask={onSelectTask}
                />
              ))
            ) : (
              <p className="m-0 text-sm text-muted-light italic">No tasks scheduled for this day.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
