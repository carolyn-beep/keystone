import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { useLocation, useSearch } from 'wouter';
import { Brainlift } from '@shared/schema';
import { queryClient } from '@/lib/queryClient';
import { authClient } from '@/lib/auth-client';
import { Loader2, Upload, Plus, Shield } from 'lucide-react';
import { tokens } from '@/lib/colors';
import { AppShell, AppSidebar, PageHeader } from '@/components/layout';
import { TactileButton } from '@/components/ui/tactile-button';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { useToast } from '@/hooks/use-toast';
import { EmptyState } from '@/components/home/EmptyState';
import { BrainliftCard } from '@/components/home/BrainliftCard';
import { LoadMoreButton } from '@/components/home/LoadMoreButton';
import { AddBrainliftModal } from '@/components/home/AddBrainliftModal';
import { FilterTabs } from '@/components/home/FilterTabs';
import { buildLibraryLocation } from '@/components/chat/chat-home-helpers';

export default function Home() {
  const [, setLocation] = useLocation();
  const [modalMode, setModalMode] = useState<'import' | 'create' | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [brainliftToDelete, setBrainliftToDelete] = useState<{ id: number; title: string } | null>(null);
  const prefetchRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Get session to check if user is admin
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === 'admin';

  // Admin view state from URL query param (?admin=true)
  // Filter state from URL query param (?filter=owned|shared)
  const searchString = useSearch();
  const adminView = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get('admin') === 'true' && isAdmin;
  }, [searchString, isAdmin]);

  const filter = useMemo(() => {
    const params = new URLSearchParams(searchString);
    const filterParam = params.get('filter');
    return (filterParam === 'owned' || filterParam === 'shared') ? filterParam : 'all';
  }, [searchString]);

  interface PaginatedResponse {
    brainlifts: Brainlift[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['/api/brainlifts', adminView, filter] as const,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (adminView) params.set('all', 'true');
      if (filter !== 'all') params.set('filter', filter);
      params.set('page', String(pageParam));
      const res = await fetch(`/api/brainlifts?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json() as Promise<PaginatedResponse>;
    },
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
    initialPageParam: 1,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Flatten all pages into single array
  const brainlifts = data?.pages.flatMap(page => page.brainlifts) ?? [];
  const totalCount = data?.pages[0]?.pagination.total ?? 0;
  const loadedCount = brainlifts.length;
  const remainingCount = totalCount - loadedCount;

  // Prefetch next page when user approaches bottom (Intersection Observer)
  useEffect(() => {
    if (!prefetchRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          // Prefetch silently - data will be ready when they click Load More
          fetchNextPage();
        }
      },
      { rootMargin: '200px' } // Trigger 200px before element is visible
    );

    observer.observe(prefetchRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/brainlifts/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const text = await res.text();
        let message = 'Delete failed';
        if (text) {
          try {
            const data = JSON.parse(text) as { message?: string };
            message = data.message || message;
          } catch {
            message = text;
          }
        }
        throw new Error(message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brainlifts'] });
      setDeleteModalOpen(false);
      setBrainliftToDelete(null);
      toast({
        title: 'Brainlift deleted',
        description: 'The brainlift was deleted successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to delete brainlift',
        description: error instanceof Error ? error.message : 'Delete failed',
        variant: 'destructive',
      });
    },
  });

  const handleDelete = (e: React.MouseEvent, brainlift: { id: number; title: string; canDelete: boolean }) => {
    e.preventDefault();
    e.stopPropagation();

    if (!brainlift.canDelete) {
      toast({
        title: 'Cannot delete brainlift',
        description: 'Only the owner can delete this brainlift.',
        variant: 'destructive',
      });
      return;
    }

    setBrainliftToDelete(brainlift);
    setDeleteModalOpen(true);
  };

  const confirmDelete = () => {
    if (brainliftToDelete) {
      deleteMutation.mutate(brainliftToDelete.id);
    }
  };

  const handleBrainliftImportSuccess = (slug: string) => {
    setLocation(`/grading/${slug}`);
  };

  const handleFilterChange = useCallback((newFilter: 'all' | 'owned' | 'shared') => {
    const params = new URLSearchParams(window.location.search);
    if (newFilter === 'all') {
      params.delete('filter');
    } else {
      params.set('filter', newFilter);
    }
    setLocation(buildLibraryLocation(params.toString()));
  }, [setLocation]);

  // Toggle ?admin=true on the current URL while preserving other query params.
  // Writes through history and dispatches popstate so wouter's useSearch
  // picks up the change without a full re-render cycle.
  const handleAdminViewToggle = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    if (adminView) {
      params.delete('admin');
    } else {
      params.set('admin', 'true');
    }
    const newSearch = params.toString();
    const newUrl = newSearch ? `?${newSearch}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [adminView]);

  const headerActions = (
    <div className="flex items-center gap-3 flex-wrap">
      {isAdmin && (
        <button
          onClick={handleAdminViewToggle}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150"
          style={{
            backgroundColor: adminView ? tokens.primarySoft : 'transparent',
            border: `1px solid ${adminView ? tokens.primary : tokens.border}`,
            color: adminView ? tokens.primary : tokens.textSecondary,
          }}
          onMouseEnter={(e) => {
            if (!adminView) {
              e.currentTarget.style.borderColor = tokens.primary;
              e.currentTarget.style.color = tokens.primary;
            }
          }}
          onMouseLeave={(e) => {
            if (!adminView) {
              e.currentTarget.style.borderColor = tokens.border;
              e.currentTarget.style.color = tokens.textSecondary;
            }
          }}
        >
          <Shield size={16} />
          Admin View
          <span
            className="relative inline-flex items-center w-9 h-5 rounded-full transition-colors duration-200"
            style={{
              backgroundColor: adminView ? tokens.primary : tokens.border,
            }}
          >
            <span
              className="absolute w-4 h-4 bg-white rounded-full shadow transition-transform duration-200"
              style={{
                transform: adminView ? 'translateX(18px)' : 'translateX(2px)',
              }}
            />
          </span>
        </button>
      )}

      <TactileButton
        variant={process.env.NODE_ENV === 'production' ? 'raised' : 'inset'}
        data-testid="button-import-brainlift"
        onClick={() => setModalMode('import')}
        className="flex items-center gap-2"
      >
        <Upload size={16} />
        Import Brainlift
      </TactileButton>

      {process.env.NODE_ENV !== 'production' && (
        <TactileButton
          variant="raised"
          data-testid="button-create-brainlift"
          onClick={() => setModalMode('create')}
          className="flex items-center gap-2"
        >
          <Plus size={18} />
          Create Brainlift
        </TactileButton>
      )}
    </div>
  );

  return (
    <AppShell
      sidebar={<AppSidebar contextualBody={null} />}
      header={<PageHeader title="Brainlift Library" actions={headerActions} />}
    >
      <div className="px-4 sm:px-6 md:px-8 py-4 max-w-[1200px] mx-auto">
        {/* Filter Tabs */}
        <FilterTabs
          activeFilter={filter}
          onFilterChange={handleFilterChange}
        />

        {isLoading ? (
          <div className="flex justify-center p-10">
            <Loader2 size={32} className="animate-spin text-muted-foreground" />
          </div>
        ) : brainlifts.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
              {brainlifts.map((brainlift) => (
                <BrainliftCard
                  key={brainlift.slug}
                  brainlift={brainlift}
                  adminView={adminView}
                  canDelete={brainlift.createdByUserId === session?.user?.id}
                  onDelete={handleDelete}
                />
              ))}
            </div>

            {/* Prefetch sentinel - triggers prefetch 200px before visible */}
            <div ref={prefetchRef} className="h-1" />

            {/* Load More Button */}
            {hasNextPage && (
              <LoadMoreButton
                onClick={() => fetchNextPage()}
                isLoading={isFetchingNextPage}
                remainingCount={remainingCount}
              />
            )}

            {/* End of list indicator */}
            {!hasNextPage && brainlifts.length > 0 && (
              <p className="text-center text-muted-foreground text-sm mt-8">
                Showing all {totalCount} brainlifts
              </p>
            )}
          </>
        )}
      </div>

      <AddBrainliftModal
        show={modalMode !== null}
        mode={modalMode ?? 'import'}
        onClose={() => setModalMode(null)}
        onSuccess={handleBrainliftImportSuccess}
      />

      <ConfirmationModal
        open={deleteModalOpen}
        onOpenChange={(open) => {
          setDeleteModalOpen(open);
          if (!open) setBrainliftToDelete(null);
        }}
        title="Delete Brainlift"
        description={`Are you sure you want to delete "${brainliftToDelete?.title || 'this brainlift'}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        variant="destructive"
        isLoading={deleteMutation.isPending}
      />
    </AppShell>
  );
}
