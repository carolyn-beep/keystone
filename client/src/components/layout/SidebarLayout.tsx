import { ReactNode, useRef, useEffect } from 'react';

interface SidebarLayoutProps {
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
  collapsed?: boolean;
}

export function SidebarLayout({ sidebar, header, children, collapsed = false }: SidebarLayoutProps) {
  const hasSidebar = sidebar !== null;
  const mainRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const headerEl = headerRef.current;
    const mainEl = mainRef.current;
    if (!sentinel || !headerEl || !mainEl) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        headerEl.classList.toggle('header-collapsed', !entry.isIntersecting);
      },
      { root: mainEl, threshold: 0, rootMargin: '-1px 0px 0px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground font-sans">
      {/* Header - full width at top */}
      <header
        ref={headerRef}
        className="bg-card border-b border-border shrink-0"
      >
        {header}
      </header>

      {/* Below header: sidebar + scrollable content fill remaining height */}
      <div className="flex flex-1 min-h-0">
        {hasSidebar && (
          <aside
            className="shrink-0 bg-sidebar border-r border-sidebar-border overflow-y-auto overflow-x-hidden transition-[width] duration-300 ease-in-out"
            style={{ width: collapsed ? 56 : 208 }}
          >
            {sidebar}
          </aside>
        )}
        <main ref={mainRef} className="flex-1 overflow-y-auto">
          <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />
          <div className="px-4 py-4 sm:px-6 md:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
