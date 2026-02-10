import { useQuery } from '@tanstack/react-query';
import type { LearningStreamItem } from '@/hooks/useLearningStream';
import { GradedItemsList } from './GradedItemsList';

interface GradedItemsPageProps {
  slug: string;
}

export function GradedItemsPage({ slug }: GradedItemsPageProps) {
  const gradedQuery = useQuery<LearningStreamItem[]>({
    queryKey: ['learning-stream-graded', slug],
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/learning-stream?status=graded`);
      if (!res.ok) throw new Error('Failed to fetch graded items');
      return res.json();
    },
    enabled: !!slug,
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h2 className="font-serif text-[28px] text-foreground mb-1">Graded Resources</h2>
        <p className="font-serif italic text-sm text-muted-foreground leading-relaxed">
          Archive of resources you've reviewed and rated for quality and alignment.
        </p>
      </div>

      <GradedItemsList
        items={gradedQuery.data ?? []}
        isLoading={gradedQuery.isLoading}
      />
    </div>
  );
}
