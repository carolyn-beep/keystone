import { ReactNode, Suspense, useEffect, useId, useState } from 'react';
import { useLocation } from 'wouter';
import { AppShell, useAppShell } from './AppShell';
import { AppSidebar } from './AppSidebar';
import { PageHeader } from './PageHeader';
import {
  PageHeaderSlotContext,
  PageHeaderSlotSetterContext,
  SidebarSlotContext,
  SidebarSlotSetterContext,
  SIDEBAR_SLOT_DEFAULT,
  type PageHeaderSlotSpec,
  type SidebarSlotSpec,
} from './shell-slots';
import {
  NO_OP_ONBOARDING_ANCHOR_REGISTRY,
  OnboardingAnchorContext,
} from '@/lib/onboarding-anchors-context';
import { RouteSkeleton } from './skeletons';

interface RootLayoutProps {
  children: ReactNode;
}

/**
 * Empty placeholder for the future Buddy assistant pane. Stage 0 ships the
 * mount slot only; Stage 1+ will populate it.
 */
function BuddyMountSlot() {
  return null;
}

/**
 * Empty placeholder for the future SpotlightHost overlay. Stage 0 ships the
 * mount slot only; Stage 1 will populate it.
 */
function SpotlightMountSlot() {
  return null;
}

/**
 * Mounted-once-per-session shell that lives above the authenticated route
 * switch. Owns the single AppShell instance (so drawer + collapse state
 * survive navigation), provides the slot contexts that pages register their
 * sidebar / header content into, and reserves empty mount slots for the
 * Stage 1+ Buddy assistant pane and SpotlightHost overlay.
 *
 * Pages do not render AppShell themselves -- they call useSidebarSlot /
 * usePageHeaderSlot to push their contextual chrome into the persistent shell.
 */
export function RootLayout({ children }: RootLayoutProps) {
  const instanceId = useId();
  const [sidebarSpec, setSidebarSpec] = useState<SidebarSlotSpec>(SIDEBAR_SLOT_DEFAULT);
  const [pageHeaderSpec, setPageHeaderSpec] = useState<PageHeaderSlotSpec | null>(null);

  return (
    <OnboardingAnchorContext.Provider value={NO_OP_ONBOARDING_ANCHOR_REGISTRY}>
      <SidebarSlotContext.Provider value={sidebarSpec}>
        <SidebarSlotSetterContext.Provider value={setSidebarSpec}>
          <PageHeaderSlotContext.Provider value={pageHeaderSpec}>
            <PageHeaderSlotSetterContext.Provider value={setPageHeaderSpec}>
              <div data-shell-instance-id={instanceId} className="contents">
                <SpotlightMountSlot />
                <AppShell sidebar={<AppSidebar />} header={<PageHeader />}>
                  <DrawerAutoCloseOnNavigate />
                  <Suspense fallback={<RouteSkeleton />}>{children}</Suspense>
                </AppShell>
                <BuddyMountSlot />
              </div>
            </PageHeaderSlotSetterContext.Provider>
          </PageHeaderSlotContext.Provider>
        </SidebarSlotSetterContext.Provider>
      </SidebarSlotContext.Provider>
    </OnboardingAnchorContext.Provider>
  );
}

/**
 * Watches the wouter location and closes the mobile drawer whenever the path
 * changes. Rendered as a tiny child of AppShell so it can read the
 * AppShellContext via useAppShell().
 */
function DrawerAutoCloseOnNavigate() {
  const [pathname] = useLocation();
  const shell = useAppShell();

  useEffect(() => {
    shell?.closeDrawer();
  }, [pathname, shell]);

  return null;
}
