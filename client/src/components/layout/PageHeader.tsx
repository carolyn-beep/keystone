import { useContext } from 'react';
import { PageHeaderSlotContext } from './shell-slots';

/**
 * Uniform ~56px chrome strip rendered at the top of every authenticated page.
 *
 * Layout: `[leadingSlot]  title (+ subtitle)         [actions]`
 *
 * Pure presentational. Per-page content comes from PageHeaderSlotContext:
 * pages call usePageHeaderSlot() to push their title / subtitle / leadingSlot
 * / actions into the context. When no page has registered (context value is
 * null) the header renders nothing.
 */
export function PageHeader() {
  const spec = useContext(PageHeaderSlotContext);

  if (!spec) {
    return null;
  }

  if (spec.custom) {
    return <>{spec.custom}</>;
  }

  const { leadingSlot, title, subtitle, actions } = spec;

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
