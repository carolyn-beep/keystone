import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Loader2, SlidersHorizontal } from 'lucide-react';
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
  if (value === 'plan') return 'plan';
  if (value === 'standalone') return 'standalone';
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 'all';
}

export function getPlanFilterDisplayLabel(value: PlanFilterValue, plans: PlanHistoryItem[]): string {
  if (value === 'all') return 'All Documents';
  if (value === 'plan') return 'Plan Documents';
  if (value === 'standalone') return 'Standalone Documents';
  const plan = plans.find((item) => item.id === value);
  return plan ? getPlanDisplayLabel(plan) : 'Selected plan';
}

export function shouldShowDocumentHubEmptyState(deliverables: DeliverableListItem[]): boolean {
  return deliverables.length === 0;
}

function countDocumentBuckets(deliverables: DeliverableListItem[]) {
  let plan = 0;
  let standalone = 0;
  for (const item of deliverables) {
    if (item.taskId == null) standalone += 1;
    else plan += 1;
  }
  return { plan, standalone, total: deliverables.length };
}

interface PlanFilterControlProps {
  plans: PlanHistoryItem[];
  selectedPlanId: PlanFilterValue;
  onSelect: (value: PlanFilterValue) => void;
}

function PlanFilterControl({ plans, selectedPlanId, onSelect }: PlanFilterControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const activeLabel = useMemo(
    () => getPlanFilterDisplayLabel(selectedPlanId, plans),
    [plans, selectedPlanId],
  );
  const isFiltered = selectedPlanId !== 'all';

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  // Stay open on pick — user closes via outside click, escape, or trigger toggle.
  const selectFilter = (value: PlanFilterValue) => {
    onSelect(value);
  };

  const optionClassName = (isSelected: boolean) => `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 ease-out border-0 text-left ${
    isSelected
      ? 'bg-card shadow-card'
      : 'bg-transparent hover:bg-card/70'
  }`;

  const radioClassName = (isSelected: boolean) => `w-3.5 h-3.5 rounded-full border shrink-0 flex items-center justify-center transition-colors duration-150 ${
    isSelected ? 'border-primary' : 'border-border'
  }`;

  return (
    <div ref={filterRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={`group flex items-center gap-2 bg-transparent border-0 px-3 py-2 -mx-3 -my-2 rounded-md cursor-pointer transition-colors duration-200 ease-out text-[10px] uppercase tracking-[0.35em] font-semibold ${
          isFiltered
            ? 'text-primary'
            : 'text-muted-light hover:text-muted-foreground'
        }`}
      >
        <SlidersHorizontal size={14} className="transition-transform duration-200 ease-out group-hover:scale-110" />
        <span className="truncate max-w-[220px]">{isFiltered ? activeLabel : 'FILTER'}</span>
        {isFiltered && (
          <span aria-hidden className="w-1 h-1 rounded-full bg-primary" />
        )}
      </button>

      {isOpen && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-3 w-[320px] bg-card-elevated rounded-xl shadow-[0_12px_32px_-8px_rgba(60,42,26,0.18),0_2px_6px_rgba(60,42,26,0.06)] overflow-hidden z-20 origin-top-right animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-200 ease-out"
        >
          <div className="px-5 pt-5 pb-3 flex items-baseline justify-between">
            <span className="text-[9px] uppercase tracking-[0.35em] font-semibold text-muted-light">
              DOCUMENT SCOPE
            </span>
            {isFiltered && (
              <button
                type="button"
                onClick={() => selectFilter('all')}
                className="text-[9px] uppercase tracking-[0.3em] font-semibold text-muted-light hover:text-muted-foreground transition-colors duration-150 bg-transparent border-0 cursor-pointer p-0"
              >
                Reset
              </button>
            )}
          </div>

          <div className="px-3 pb-3">
            {([
              ['all', 'All Documents'],
              ['plan', 'Plan Documents'],
              ['standalone', 'Standalone Documents'],
            ] as const).map(([value, label]) => {
              const isSelected = selectedPlanId === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => selectFilter(value)}
                  className={optionClassName(isSelected)}
                >
                  <span className={radioClassName(isSelected)}>
                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                  </span>
                  <span className={`flex-1 text-[12px] font-medium tracking-tight ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          {plans.length > 0 && (
            <>
              <div className="mx-5 border-t border-border" />
              <div className="px-5 pt-4 pb-3">
                <span className="text-[9px] uppercase tracking-[0.35em] font-semibold text-muted-light">
                  PLANS
                </span>
              </div>
              <div className="px-3 pb-3 max-h-[280px] overflow-y-auto">
                {plans.map((plan) => {
                  const isSelected = selectedPlanId === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => selectFilter(plan.id)}
                      className={optionClassName(isSelected)}
                    >
                      <span className={radioClassName(isSelected)}>
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                      </span>
                      <span className={`flex-1 min-w-0 truncate text-[12px] font-medium tracking-tight ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {getPlanDisplayLabel(plan)}
                      </span>
                      <span className="text-[10px] text-muted-light tabular-nums font-semibold tracking-[0.05em]">
                        {plan.completedTaskCount}/{plan.taskCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function DeliverableRow({ deliverable }: { deliverable: DeliverableListItem }) {
  const isStandalone = deliverable.taskId == null;
  const kindLabel = isStandalone ? 'Standalone' : 'Sprint Task';

  return (
    <a
      href={deliverable.docUrl}
      target="_blank"
      rel="noreferrer"
      className="group block rounded-xl bg-card-elevated shadow-card hover:shadow-[0_8px_22px_-6px_rgba(60,42,26,0.18),0_2px_6px_rgba(60,42,26,0.06)] transition-shadow duration-200 ease-out no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <article className="flex items-stretch">
        <div className="flex-1 min-w-0 px-8 py-7">
          <div className="flex flex-wrap items-center gap-3 text-[9px] uppercase tracking-[0.35em] font-semibold text-muted-light">
            <span>{kindLabel}</span>
            {deliverable.scheduledDate && (
              <>
                <span aria-hidden className="text-[14px] font-extrabold text-muted-light/60">&middot;</span>
                <span className="tabular-nums tracking-[0.25em]">{deliverable.scheduledDate}</span>
              </>
            )}
          </div>

          <h3
            className="m-0 mt-3 font-serif italic text-[24px] leading-[1.25] text-foreground tracking-tight"
            style={{ textWrap: 'balance' as React.CSSProperties['textWrap'] }}
          >
            {deliverable.title}
          </h3>

          {deliverable.taskTitle && (
            <p className="m-0 mt-2 text-[13px] text-muted-foreground leading-snug truncate">
              {deliverable.taskTitle}
            </p>
          )}

          <p className="m-0 mt-4 text-[10px] uppercase tracking-[0.3em] font-semibold text-muted-light tabular-nums">
            Created {formatDeliverableCreatedDate(deliverable.createdAt)}
          </p>
        </div>

        <div className="hidden md:flex items-center justify-center px-7 border-l border-border/60">
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground group-hover:text-primary transition-colors duration-200">
            Open Doc
            <ArrowUpRight
              size={14}
              className="transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            />
          </span>
        </div>

        <div className="md:hidden px-8 pb-6 -mt-3 flex">
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.35em] font-semibold text-primary">
            Open Doc <ArrowUpRight size={14} />
          </span>
        </div>
      </article>
    </a>
  );
}

interface DocumentCountsLineProps {
  total: number;
  plan: number;
  standalone: number;
}

function DocumentCountsLine({ total, plan, standalone }: DocumentCountsLineProps) {
  if (total === 0) {
    return (
      <span className="text-[11px] uppercase tracking-[0.3em] font-semibold text-muted-light tabular-nums">
        0 documents
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] uppercase tracking-[0.3em] font-semibold text-muted-foreground">
      <span className="tabular-nums">
        {total} {total === 1 ? 'document' : 'documents'}
      </span>
      <span aria-hidden className="text-muted-light/70">&middot;</span>
      <span className="tabular-nums">{plan} from sprints</span>
      <span aria-hidden className="text-muted-light/70">&middot;</span>
      <span className="tabular-nums">{standalone} standalone</span>
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

  const counts = useMemo(() => countDocumentBuckets(deliverables), [deliverables]);

  if (isLoading) {
    return (
      <div className="max-w-[1420px] mx-auto p-12 text-center text-muted-foreground">
        <Loader2 size={24} className="animate-spin inline-block mr-2 align-middle" />
        Loading documents...
      </div>
    );
  }

  return (
    <div className="max-w-[1420px] mx-auto">
      <div className="flex flex-col gap-4 mb-6 pb-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h2
            className="text-[30px] font-bold text-foreground tracking-tight leading-[1.1] m-0"
            style={{ textWrap: 'balance' as React.CSSProperties['textWrap'] }}
          >
            Document Hub
          </h2>
          <p className="text-[15px] text-muted-light m-0 mt-2 max-w-2xl font-serif italic">
            Sprint deliverables and standalone documents saved to this project.
          </p>
          <div className="mt-3">
            <DocumentCountsLine total={counts.total} plan={counts.plan} standalone={counts.standalone} />
          </div>
        </div>

        <div className="shrink-0 md:pt-1">
          <PlanFilterControl
            plans={plans}
            selectedPlanId={selectedPlanId}
            onSelect={setSelectedPlanId}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-warning-soft px-6 py-4 mb-4 shadow-card">
          <p className="m-0 font-serif italic text-[14px] text-muted-foreground leading-relaxed">
            We could not load the documents. Refresh the page and try again.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {shouldShowDocumentHubEmptyState(deliverables) ? (
          <div className="bg-card-elevated rounded-xl shadow-card py-20 px-12">
            <div className="flex flex-col items-center text-center">
              <h3 className="font-serif text-[24px] text-foreground m-0 mb-4">
                No documents yet
              </h3>
              <p
                className="text-[14px] text-muted-light m-0 max-w-md leading-relaxed"
                style={{ textWrap: 'pretty' as React.CSSProperties['textWrap'] }}
              >
                Save a deliverable from a sprint task or drop one in directly through the MCP to populate this hub.
              </p>
            </div>
          </div>
        ) : (
          deliverables.map((deliverable) => (
            <DeliverableRow key={deliverable.id} deliverable={deliverable} />
          ))
        )}
      </div>
    </div>
  );
}
