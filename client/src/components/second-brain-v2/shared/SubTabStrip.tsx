import { useId } from 'react';
import { motion, LayoutGroup } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface SubTabStripProps<T extends string> {
  tabs: ReadonlyArray<{ id: T; label: string }>;
  active: T;
  onChange: (id: T) => void;
  /** Optional layout-id namespace. Defaults to a component-instance-scoped id. */
  layoutIdPrefix?: string;
  className?: string;
}

/**
 * Editorial underlined tab nav. The active indicator is a single
 * `motion.div` shared via `layoutId` so it slides between tabs.
 *
 * Multiple strips on one page get distinct `layoutId` namespaces via
 * `useId`, preventing cross-instance animations.
 */
export function SubTabStrip<T extends string>({
  tabs,
  active,
  onChange,
  layoutIdPrefix,
  className,
}: SubTabStripProps<T>) {
  const instanceId = useId();
  const prefix = layoutIdPrefix ?? `sub-tab-strip-${instanceId}`;

  return (
    <LayoutGroup id={prefix}>
      <nav
        aria-label="Sub-tab navigation"
        className={cn(
          'relative flex items-center gap-1 border-b border-border',
          className,
        )}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              data-state={isActive ? 'active' : 'inactive'}
              onClick={() => onChange(tab.id)}
              className={cn(
                'relative px-4 pb-3 pt-2 font-sans text-[14px] font-medium uppercase tracking-[0.08em] transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              {isActive ? (
                <motion.div
                  layoutId={`${prefix}-underline`}
                  className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-primary"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              ) : null}
            </button>
          );
        })}
      </nav>
    </LayoutGroup>
  );
}
