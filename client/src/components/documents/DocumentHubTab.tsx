import { ExternalLink, Loader2 } from 'lucide-react';
import type { DeliverableListItem, PlanHistoryItem } from '@shared/routes';
import { useDeliverables, type PlanFilterValue } from '@/hooks/useDeliverables';

interface DocumentHubTabProps {
  slug: string;
}

export function getPlanDisplayLabel(plan: PlanHistoryItem): string {
  return `Plan ${plan.startDate} to ${plan.endDate}`;
}

export function formatDeliverableCreatedDate(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function parsePlanFilterValue(value: string): PlanFilterValue {
  if (value === 'all') return 'all';
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 'all';
}

export function shouldShowDocumentHubEmptyState(deliverables: DeliverableListItem[]): boolean {
  return deliverables.length === 0;
}

function DeliverableRow({ deliverable }: { deliverable: DeliverableListItem }) {
  return (
    <div className="rounded-lg bg-card p-4 border border-border">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {deliverable.scheduledDate}
          </p>
          <p className="m-0 mt-1 text-base text-foreground truncate">{deliverable.title}</p>
          <p className="m-0 mt-1 text-sm text-muted-foreground truncate">{deliverable.taskTitle}</p>
          <p className="m-0 mt-2 text-xs text-muted-foreground">
            Created {formatDeliverableCreatedDate(deliverable.createdAt)}
          </p>
        </div>

        <a
          href={deliverable.docUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline shrink-0"
        >
          Open Doc <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
}

export function DocumentHubTab({ slug }: DocumentHubTabProps) {
  const {
    plans,
    deliverables,
    selectedPlanId,
    setSelectedPlanId,
    isLoading,
    error,
  } = useDeliverables(slug);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl bg-card-elevated shadow-card p-6">
        <h2 className="m-0 text-[30px] leading-tight font-semibold text-foreground">Document Hub</h2>
        <p className="m-0 mt-2 text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          All sprint deliverables
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label htmlFor="document-hub-plan-filter" className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Plan
          </label>
          <select
            id="document-hub-plan-filter"
            value={String(selectedPlanId)}
            onChange={(event) => setSelectedPlanId(parsePlanFilterValue(event.target.value))}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
          >
            <option value="all">All plans</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {getPlanDisplayLabel(plan)}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error && (
        <section className="rounded-xl bg-warning-soft p-4 text-sm text-muted-foreground">
          Failed to load deliverables. Refresh the page and try again.
        </section>
      )}

      <section className="rounded-xl bg-card-elevated shadow-card p-6 space-y-3">
        {shouldShowDocumentHubEmptyState(deliverables) ? (
          <p className="m-0 text-sm text-muted-foreground italic">
            No deliverables yet for this selection.
          </p>
        ) : (
          deliverables.map((deliverable) => (
            <DeliverableRow key={deliverable.id} deliverable={deliverable} />
          ))
        )}
      </section>
    </div>
  );
}
