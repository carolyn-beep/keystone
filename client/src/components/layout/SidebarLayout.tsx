import { ReactNode } from 'react';

interface SidebarLayoutProps {
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
}

export function SidebarLayout({ sidebar, header, children }: SidebarLayoutProps) {
  const hasSidebar = sidebar !== null;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground font-sans">
      {/* Header - full width at top */}
      <header className="bg-card border-b border-border shrink-0">{header}</header>

      {/* Below header: sidebar + scrollable content fill remaining height */}
      <div className="flex flex-1 min-h-0">
        {hasSidebar && (
          <aside className="w-52 shrink-0 bg-sidebar border-r border-sidebar-border overflow-y-auto">
            {sidebar}
          </aside>
        )}
        <main className="flex-1 px-4 py-4 sm:px-6 md:px-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
