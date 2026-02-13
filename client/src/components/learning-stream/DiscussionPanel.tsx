import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { Thread, ThreadConfigProvider, makeMarkdownText } from '@assistant-ui/react-ui';
import { useDiscussion } from '@/hooks/useDiscussion';
import owlAvatar from '@/assets/bl_profile/friendly-owl.webp';
import { FactSavedToolUI } from './discussion-tools/FactSavedCard';
import { SummarySavedToolUI } from './discussion-tools/SummarySavedCard';
import { BrainliftContextToolUI } from './discussion-tools/BrainliftContextCard';
import { ArticleContentToolUI } from './discussion-tools/ArticleContentCard';
import type { LearningStreamItem } from '@/hooks/useLearningStream';

const MarkdownText = makeMarkdownText();

interface DiscussionPanelProps {
  slug: string;
  itemId: number;
  item: LearningStreamItem;
}

interface Suggestion {
  text: string;
  prompt: string;
}

export function DiscussionPanel({ slug, itemId, item }: DiscussionPanelProps) {
  const runtime = useDiscussion(slug, itemId);

  const { data: suggestionsData } = useQuery<{ suggestions: Suggestion[] }>({
    queryKey: ['discussion-suggestions', slug, itemId],
    queryFn: async () => {
      const res = await fetch(
        `/api/brainlifts/${slug}/discussion/suggestions?itemId=${itemId}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('Failed to fetch suggestions');
      return res.json();
    },
    staleTime: Infinity, // Suggestions don't change for the same item
  });

  const suggestions = useMemo(
    () => suggestionsData?.suggestions ?? [],
    [suggestionsData]
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadConfigProvider
        config={{
          assistantAvatar: {
            src: owlAvatar,
            alt: 'Study partner',
            fallback: 'SP',
          },
          welcome: {
            message: 'Ready to start building knowledge together?',
            suggestions,
          },
          userMessage: {
            allowEdit: false,
          },
          assistantMessage: {
            components: {
              Text: MarkdownText,
            },
          },
          tools: [
            FactSavedToolUI,
            SummarySavedToolUI,
            BrainliftContextToolUI,
            ArticleContentToolUI,
          ],
        }}
      >
        <div className="flex flex-col h-full bg-card-elevated">
          <Thread />
        </div>
      </ThreadConfigProvider>
    </AssistantRuntimeProvider>
  );
}
