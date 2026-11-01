import { useLocation } from 'wouter';
import { SkeletonBlock } from './SkeletonBlock';
import { ChatHomeSkeleton } from './ChatHomeSkeleton';
import { HomeSkeleton, ProjectCardGridSkeleton } from './HomeSkeleton';
import { DashboardSkeleton } from './DashboardSkeleton';
import { SkillsSkeleton, SkillCardGridSkeleton } from './SkillsSkeleton';
import { AnalyticsSkeleton } from './AnalyticsSkeleton';
import { AdminProvidersSkeleton } from './AdminProvidersSkeleton';

export {
  SkeletonBlock,
  ChatHomeSkeleton,
  HomeSkeleton,
  ProjectCardGridSkeleton,
  DashboardSkeleton,
  SkillsSkeleton,
  SkillCardGridSkeleton,
  AnalyticsSkeleton,
  AdminProvidersSkeleton,
};

/**
 * Route-aware page skeleton, used as the Suspense fallback inside RootLayout
 * so the sidebar + header stay mounted while the lazy page chunk resolves.
 * Renders a skeleton shaped like the page that's about to mount.
 */
export function RouteSkeleton() {
  const [pathname] = useLocation();

  if (pathname === '/library' || pathname === '/library/') return <HomeSkeleton />;
  if (pathname === '/skills' || pathname === '/skills/') return <SkillsSkeleton />;
  if (pathname === '/analytics') return <AnalyticsSkeleton />;
  if (pathname === '/admin/providers') return <AdminProvidersSkeleton />;
  if (pathname.startsWith('/grading/') || (pathname.length > 1 && !pathname.includes('/', 1))) {
    return <DashboardSkeleton />;
  }
  return <ChatHomeSkeleton />;
}
