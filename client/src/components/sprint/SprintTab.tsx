import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { GeneratedPlanResponse, TaskListItem } from '@shared/routes';
import { useSprint } from '@/hooks/useSprint';
import { getTodayLocalDate } from '@/lib/date';
import { TactileButton } from '@/components/ui/tactile-button';
import { CalendarView } from './CalendarView';
import { DayWidget } from './DayWidget';
import { TaskDetail } from './TaskDetail';

interface SprintTabProps {
  slug: string;
  viewTaskId: number | null;
  onSelectTask: (taskId: number | null) => void;
}

export function parseTaskViewId(viewValue: string | null): number | null {
  if (!viewValue) return null;
  const match = /^task-(\d+)$/.exec(viewValue);
  if (!match) return null;
  return Number(match[1]);
}

export function resolveSelectedTask(
  activePlan: GeneratedPlanResponse | null,
  todayTasks: TaskListItem[],
  viewTaskId: number | null,
): TaskListItem | null {
  if (!activePlan) return null;
  if (viewTaskId !== null) {
    return activePlan.tasks.find((task) => task.id === viewTaskId) ?? null;
  }

  if (todayTasks.length > 0) {
    const firstFromToday = activePlan.tasks.find((task) => task.id === todayTasks[0].id);
    if (firstFromToday) return firstFromToday;
  }

  return activePlan.tasks[0] ?? null;
}

export function shouldShowSprintEmptyState(activePlan: GeneratedPlanResponse | null): boolean {
  if (!activePlan) return true;
  return activePlan.plan.status === 'failed';
}

export function SprintTab({ slug, viewTaskId, onSelectTask }: SprintTabProps) {
  const localDate = getTodayLocalDate();
  const {
    activePlan,
    planStatus,
    generationError,
    todayTasks,
    isLoading,
    refetch,
  } = useSprint(slug);
  const [selectedDate, setSelectedDate] = useState<string>(localDate);

  const selectedTask = useMemo(
    () => resolveSelectedTask(activePlan, todayTasks, viewTaskId),
    [activePlan, todayTasks, viewTaskId],
  );

  if (isLoading && !activePlan) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  if (planStatus === 'generating') {
    return (
      <section className="max-w-3xl mx-auto rounded-xl bg-card-elevated shadow-card p-8 text-center">
        <Loader2 size={28} className="animate-spin text-primary mx-auto" />
        <h2 className="m-0 mt-4 text-[24px] leading-tight font-semibold text-foreground">Building your 30-day sprint</h2>
        <p className="m-0 mt-3 text-sm text-muted-foreground leading-relaxed">
          This usually takes 3–5 minutes. You can leave this page open or come back later — we'll keep checking in the background.
        </p>
      </section>
    );
  }

  if (shouldShowSprintEmptyState(activePlan)) {
    const failed = activePlan?.plan.status === 'failed';
    return (
      <section className="max-w-3xl mx-auto rounded-xl bg-card-elevated shadow-card p-8">
        <h2 className="m-0 text-[30px] leading-tight font-semibold text-foreground">Sprint</h2>
        <p className="m-0 mt-3 text-sm text-muted-foreground leading-relaxed">
          Your 30-day execution sprint unlocks calendar planning, today priorities, and document tracking once it's generated.
        </p>

        {failed && (
          <div className="mt-5 rounded-lg bg-warning-soft p-3 text-sm text-muted-foreground">
            Previous generation failed{generationError ? `: ${generationError}` : '.'} Start a new one from your coach in the MCP.
          </div>
        )}

        <div className="mt-6 rounded-lg border border-border bg-card p-5">
          <p className="m-0 text-[11px] uppercase tracking-[0.22em] font-semibold text-foreground">
            Generate from your coach
          </p>
          <p className="m-0 mt-3 text-sm text-muted-foreground leading-relaxed">
            Sprint generation runs through a short diagnosis conversation with your coach in the Brainlift MCP — that's how the plan gets tailored to where you actually are. Ask your coach to generate your sprint and come back to this tab once it's ready.
          </p>
          <p className="m-0 mt-3 text-xs text-muted-light italic">
            In-platform generation is coming soon.
          </p>
        </div>

        <div className="mt-5">
          <TactileButton
            variant="inset"
            onClick={refetch}
            className="text-[12px] uppercase tracking-[0.22em]"
          >
            Refresh
          </TactileButton>
        </div>
      </section>
    );
  }

  if (!activePlan) {
    return null;
  }

  const taskMissing = viewTaskId !== null && !selectedTask;

  return (
    <div className="space-y-5">
      <section className="rounded-xl bg-card-elevated shadow-card p-6">
        <h2 className="m-0 text-[30px] leading-tight font-semibold text-foreground">Sprint</h2>
        <p className="m-0 mt-2 text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          Active Plan · {activePlan.plan.startDate} to {activePlan.plan.endDate}
        </p>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-5">
        <CalendarView
          startDate={activePlan.plan.startDate}
          endDate={activePlan.plan.endDate}
          tasks={activePlan.tasks}
          selectedTaskId={selectedTask?.id ?? null}
          selectedDate={selectedDate}
          localDate={localDate}
          onSelectTask={onSelectTask}
          onSelectDay={setSelectedDate}
        />

        <div className="space-y-5">
          <DayWidget
            tasks={todayTasks}
            allTasks={activePlan.tasks}
            localDate={localDate}
            selectedDate={selectedDate}
            selectedTaskId={selectedTask?.id ?? null}
            onSelectTask={onSelectTask}
          />
          <TaskDetail task={selectedTask} taskMissing={taskMissing} />
        </div>
      </div>
    </div>
  );
}
