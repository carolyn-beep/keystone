import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { useLocation, useSearch } from 'wouter';
import { Brainlift } from '@shared/schema';
import { queryClient } from '@/lib/queryClient';
import { authClient } from '@/lib/auth-client';
import { Loader2 } from 'lucide-react';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { HomeHeader } from '@/components/home/HomeHeader';
import { EmptyState } from '@/components/home/EmptyState';
import { BrainliftCard } from '@/components/home/BrainliftCard';
import { LoadMoreButton } from '@/components/home/LoadMoreButton';
import { AddBrainliftModal } from '@/components/home/AddBrainliftModal';
import { FilterTabs } from '@/components/home/FilterTabs';

export default function Home() {
  const [, setLocation] = useLocation();
  const [showModal, setShowModal] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [brainliftToDelete, setBrainliftToDelete] = useState<{ id: number; title: string } | null>(null);
  const prefetchRef = useRef<HTMLDivElement>(null);

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
        const data = await res.json();
        throw new Error(data.message || 'Delete failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brainlifts'] });
      setDeleteModalOpen(false);
      setBrainliftToDelete(null);
    },
  });

  const handleDelete = (e: React.MouseEvent, brainlift: { id: number; title: string }) => {
    e.preventDefault();
    e.stopPropagation();
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
    const newSearch = params.toString();
    setLocation(newSearch ? `/?${newSearch}` : '/');
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-background font-['Inter',-apple-system,sans-serif]">
      <HomeHeader
        adminView={adminView}
        onAddBrainlift={() => setShowModal(true)}
      />

      {/* Thin primary indicator line */}
      <div className="h-0.5 bg-primary" />

      <main className="px-4 sm:px-6 md:px-8 py-4 max-w-[1200px] mx-auto">
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
      </main>

      <AddBrainliftModal
        show={showModal}
        onClose={() => setShowModal(false)}
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
    </div>
  );
}
