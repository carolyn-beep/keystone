import { ReactNode } from 'react';

interface PageHeaderProps {
  /** Optional content rendered before the title (e.g. mobile drawer toggle). */
  leadingSlot?: ReactNode;
  /** Primary heading. */
  title: ReactNode;
  /** Optional subtitle / breadcrumb shown under the title. */
  subtitle?: ReactNode;
  /** Right-aligned actions slot. */
  actions?: ReactNode;
}

/**
 * Uniform ~56px chrome strip rendered at the top of every authenticated page.
 *
 * Layout: `[leadingSlot]  title (+ subtitle)         [actions]`
 *
 * Purely presentational -- no state, no data fetching. Pages own their title,
 * subtitle, and actions content.
 */
export function PageHeader({ leadingSlot, title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 bg-card border-b border-border px-4 sm:px-6 md:px-8">
      {leadingSlot ? <div className="flex shrink-0 items-center">{leadingSlot}</div> : null}

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle ? (
          <div className="truncate text-xs text-muted-foreground mt-0.5">{subtitle}</div>
        ) : null}
      </div>

      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
