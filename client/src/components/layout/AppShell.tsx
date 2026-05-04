import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';

interface AppShellProps {
  /** The unified <AppSidebar/>. Required (sole sidebar). */
  sidebar: ReactNode;
  /** The page <PageHeader/>. Required (every page has one). */
  header: ReactNode;
  /** Page content rendered inside scrollable <main>. */
  children: ReactNode;
}

interface AppShellContextValue {
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  /** Whether the inline sidebar (lg+) is collapsed to an icon-only rail. */
  isSidebarCollapsed: boolean;
  toggleSidebarCollapsed: () => void;
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'app-shell:sidebar-collapsed';

const AppShellContext = createContext<AppShellContextValue | null>(null);

/**
 * Hook for shell descendants to access the mobile drawer state.
 *
 * Returns `null` outside an `<AppShell />` so callers can branch on whether
 * the drawer is even available (e.g. `PageHeader.leadingSlot` rendering a
 * hamburger toggle only when inside a shell).
 */
export function useAppShell(): AppShellContextValue | null {
  return useContext(AppShellContext);
}

/**
 * Single-sidebar app shell.
 *
 * Layout: `[sidebar (left, lg+)] | [header (top) + scrollable main (below)]`.
 *
 * Below the `lg` breakpoint, the sidebar is hidden inline and instead overlaid
 * as a drawer driven by internal state. `PageHeader.leadingSlot` is the
 * canonical place to render a hamburger toggle (consume `useAppShell()`).
 */
export function AppShell({ sidebar, header, children }: AppShellProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setIsDrawerOpen((open) => !open), []);
  const toggleSidebarCollapsed = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // localStorage unavailable (private mode, quota): fall back to in-memory state.
      }
      return next;
    });
  }, []);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!isDrawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isDrawerOpen]);

  const ctx: AppShellContextValue = {
    isDrawerOpen,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    isSidebarCollapsed,
    toggleSidebarCollapsed,
  };

  return (
    <AppShellContext.Provider value={ctx}>
      <div className="h-screen flex bg-background text-foreground font-sans">
        {/* Inline sidebar (lg+). Width animates between expanded (248px) and
            icon-only rail (64px). Drawer (mobile) always uses the full width. */}
        <aside
          className={`hidden lg:flex shrink-0 flex-col bg-sidebar border-r border-sidebar-border overflow-hidden transition-[width] duration-200 ease-out ${
            isSidebarCollapsed ? 'w-16' : 'w-[248px]'
          }`}
          aria-label="Primary navigation"
        >
          {sidebar}
        </aside>

        {/* Mobile drawer overlay (< lg) */}
        {isDrawerOpen ? (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-foreground/40"
              onClick={closeDrawer}
            />
            <aside
              className="relative z-10 w-[248px] shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border overflow-hidden"
              aria-label="Primary navigation (drawer)"
            >
              {sidebar}
            </aside>
          </div>
        ) : null}

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {header}
          <main className="flex-1 min-h-0 overflow-y-auto scrollbar-styled">
            {children}
          </main>
        </div>
      </div>
    </AppShellContext.Provider>
  );
}
