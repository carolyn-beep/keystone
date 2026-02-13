import { makeAssistantToolUI } from '@assistant-ui/react';
import openBookIcon from '@/assets/icons/open-book.svg';

type ArticleArgs = Record<string, never>;
type ArticleResult = {
  contentType?: string;
  title?: string;
  markdown?: string;
  embedType?: string;
  reason?: string;
  status?: string;
  message?: string;
  error?: string;
};

export const ArticleContentToolUI = makeAssistantToolUI<ArticleArgs, ArticleResult>({
  toolName: 'read_article_section',
  render: ({ result, status }) => {
    const isRunning = status.type === 'running';

    if (isRunning) {
      return (
        <div className="my-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <img src={openBookIcon} alt="" className="w-3.5 h-3.5 shrink-0 opacity-40 animate-pulse" />
          <span className="italic">Reading article...</span>
        </div>
      );
    }

    if (result?.error) {
      return (
        <div className="my-2 flex items-center gap-2 text-[11px] text-destructive">
          <img src={openBookIcon} alt="" className="w-3.5 h-3.5 shrink-0 opacity-40" />
          <span className="italic">Failed to read content</span>
        </div>
      );
    }

    if (!result) return null;

    const wordCount = result.markdown
      ? result.markdown.split(/\s+/).length
      : null;

    let summary: string;
    if (result.contentType === 'article' && wordCount) {
      summary = `Read article (~${wordCount.toLocaleString()} words)`;
    } else if (result.contentType === 'embed') {
      summary = `Detected ${result.embedType || 'embed'} — working from metadata`;
    } else if (result.status === 'pending') {
      summary = 'Content extraction in progress';
    } else if (result.contentType === 'fallback') {
      summary = 'Content unavailable — working from metadata';
    } else {
      summary = 'Content loaded';
    }

    return (
      <div className="my-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <img src={openBookIcon} alt="" className="w-3.5 h-3.5 shrink-0 opacity-40" />
        <span className="italic">{summary}</span>
      </div>
    );
  },
});
