import { Award, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TaskListItem } from '@shared/routes';

interface TaskDetailProps {
  task: TaskListItem | null;
  taskMissing: boolean;
}

export function formatTaskStateLabel(task: TaskListItem): string {
  if (task.isComplete) return 'Complete';
  if (task.isPastDue) return 'Overdue';
  return 'In Progress';
}

export function TaskDetail({ task, taskMissing }: TaskDetailProps) {
  if (!task) {
    return (
      <section className="rounded-xl bg-card-elevated shadow-card p-6">
        <h3 className="m-0 text-[24px] leading-tight font-semibold text-foreground">Task Detail</h3>
        <p className="m-0 mt-3 text-sm text-muted-foreground">
          {taskMissing
            ? 'The selected task is no longer in this sprint. Choose another task from the calendar or today list.'
            : 'Select a task to inspect its details and deliverable status.'}
        </p>
      </section>
    );
  }

  const stateLabel = formatTaskStateLabel(task);
  const isFlagship = task.milestone === 'weekly_artifact';

  return (
    <section className={`rounded-xl bg-card-elevated shadow-card p-6 ${isFlagship ? 'border-l-4 border-warning' : ''}`}>
      {isFlagship && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2">
          <Award size={16} className="text-warning" />
          <span className="text-[11px] uppercase tracking-[0.26em] font-semibold text-warning">
            Flagship Deliverable
          </span>
        </div>
      )}
      <h3 className="m-0 text-[24px] leading-tight font-semibold text-foreground">Task Detail</h3>

      <div className="mt-5 space-y-4">
        <div>
          <p className="m-0 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Title</p>
          <p className="m-0 mt-2 text-lg text-foreground">{task.title}</p>
        </div>

        <div>
          <p className="m-0 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Description</p>
          <div className="prose prose-sm max-w-none mt-2 text-muted-foreground leading-relaxed
            prose-p:text-muted-foreground prose-p:my-2
            prose-strong:text-foreground prose-strong:font-semibold
            prose-em:text-muted-foreground
            prose-a:text-primary prose-a:no-underline hover:prose-a:underline
            prose-code:text-foreground prose-code:bg-card prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
            prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-li:text-muted-foreground
            prose-h1:text-foreground prose-h2:text-foreground prose-h3:text-foreground prose-h4:text-foreground
            prose-blockquote:text-muted-foreground prose-blockquote:border-l-border">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.description}</ReactMarkdown>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg bg-card p-3">
            <p className="m-0 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Scheduled Date</p>
            <p className="m-0 mt-2 text-sm text-foreground">{task.scheduledDate}</p>
          </div>
          <div className="rounded-lg bg-card p-3">
            <p className="m-0 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Status</p>
            <p className="m-0 mt-2 text-sm text-foreground">{stateLabel}</p>
          </div>
        </div>

        <div className="rounded-lg bg-card p-3">
          <p className="m-0 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Deliverable</p>
          {task.deliverable ? (
            <div className="mt-2 space-y-2">
              <p className="m-0 text-sm text-foreground">{task.deliverable.title}</p>
              <a
                href={task.deliverable.docUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Open in Google Docs <ExternalLink size={14} />
              </a>
            </div>
          ) : (
            <p className="m-0 mt-2 text-sm text-muted-foreground italic">
              No Google Doc has been created for this task yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
