import { SkeletonBlock } from './SkeletonBlock';

/**
 * Mirror of `client/src/pages/ChatHome.tsx` main column: tall chat thread
 * area with a composer pinned to the bottom.
 */
export function ChatHomeSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Thread surface */}
      <div className="flex-1 min-h-0 overflow-hidden px-4 sm:px-6 md:px-8 py-6">
        <div className="mx-auto flex max-w-[820px] flex-col gap-6">
          <MessageBubbleSkeleton align="assistant" />
          <MessageBubbleSkeleton align="user" />
          <MessageBubbleSkeleton align="assistant" lines={4} />
          <MessageBubbleSkeleton align="user" lines={1} />
          <MessageBubbleSkeleton align="assistant" lines={3} />
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 px-4 sm:px-6 md:px-8 pb-6">
        <div className="mx-auto max-w-[820px] rounded-2xl border border-border bg-card p-3">
          <SkeletonBlock className="h-8 w-full" rounded="md" />
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-7 w-32" rounded="md" />
            </div>
            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-7 w-28" rounded="md" />
              <SkeletonBlock className="h-7 w-7" rounded="full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MessageBubbleSkeletonProps {
  align: 'user' | 'assistant';
  lines?: number;
}

function MessageBubbleSkeleton({ align, lines = 2 }: MessageBubbleSkeletonProps) {
  const isUser = align === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[80%] flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonBlock
            key={i}
            className={`h-3 ${i === lines - 1 ? 'w-1/2' : 'w-72 sm:w-96'}`}
          />
        ))}
      </div>
    </div>
  );
}
