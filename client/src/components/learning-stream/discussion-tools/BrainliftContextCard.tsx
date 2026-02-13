import { makeAssistantToolUI } from '@assistant-ui/react';
import { BrainDumpIcon } from './BrainDumpIcon';

type ContextArgs = Record<string, never>;
type ContextResult = {
  purpose?: string;
  topFacts?: Array<{ id: number; fact: string; score: number; category: string }>;
  followedExperts?: Array<{ name: string }>;
  existingTopics?: string[];
  error?: string;
};

export const BrainliftContextToolUI = makeAssistantToolUI<ContextArgs, ContextResult>({
  toolName: 'get_brainlift_context',
  render: ({ result, status }) => {
    const isRunning = status.type === 'running';

    if (result?.error) {
      return (
        <div className="my-2 flex items-center gap-2 text-[11px] text-destructive">
          <BrainDumpIcon animate={false} />
          <span className="italic">Failed to load context</span>
        </div>
      );
    }

    if (isRunning || !result) {
      return (
        <div className="my-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <BrainDumpIcon animate={false} />
          <span className="italic">Checking existing knowledge...</span>
        </div>
      );
    }

    const parts: string[] = [];
    if (result.topFacts?.length) parts.push(`${result.topFacts.length} facts`);
    if (result.followedExperts?.length) parts.push(`${result.followedExperts.length} experts`);
    if (result.existingTopics?.length) parts.push(`${result.existingTopics.length} topics`);

    return (
      <div className="my-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <BrainDumpIcon animate />
        <span className="italic">
          Loaded BrainLift context{parts.length > 0 && ` — ${parts.join(', ')}`}
        </span>
      </div>
    );
  },
});
