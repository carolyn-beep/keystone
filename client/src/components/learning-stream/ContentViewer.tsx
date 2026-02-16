import { Loader2, ExternalLink, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Tweet } from 'react-tweet';
import type { ExtractedContent } from '@/hooks/useLearningStream';

interface ContentViewerProps {
  content: ExtractedContent;
  url: string;
  onRetry?: () => void;
}

export function ContentViewer({ content, url, onRetry }: ContentViewerProps) {
  switch (content.contentType) {
    case 'embed':
      return <EmbedViewer content={content} />;
    case 'article':
      return <ArticleViewer content={content} />;
    case 'pdf':
      return <PdfViewer content={content} />;
    case 'pending':
      return <PendingState />;
    case 'fallback':
      return <FallbackState reason={content.reason} url={url} onRetry={onRetry} />;
    default:
      return <FallbackState reason="Unknown content type" url={url} onRetry={onRetry} />;
  }
}

// === Embed renderers ===

function EmbedViewer({ content }: { content: Extract<ExtractedContent, { contentType: 'embed' }> }) {
  switch (content.embedType) {
    case 'youtube':
      return (
        <div className="aspect-video w-full max-w-3xl mx-auto">
          <iframe
            src={`https://www.youtube.com/embed/${content.embedId}`}
            className="w-full h-full rounded-lg"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="YouTube video"
          />
        </div>
      );
    case 'spotify':
      return (
        <div className="w-full max-w-2xl mx-auto">
          <iframe
            src={`https://open.spotify.com/embed/episode/${content.embedId}`}
            className="w-full rounded-lg"
            style={{ height: 352 }}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            title="Spotify episode"
          />
        </div>
      );
    case 'apple-podcast':
      return (
        <div className="w-full max-w-2xl mx-auto">
          <iframe
            src={content.embedUrl}
            className="w-full rounded-lg"
            style={{ height: 175 }}
            allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write"
            sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
            title="Apple Podcasts episode"
          />
        </div>
      );
    case 'tweet':
      return (
        <div className="max-w-xl mx-auto" data-theme="dark">
          <Tweet id={content.tweetId} />
        </div>
      );
    default:
      return null;
  }
}

// === Article renderer ===

function ArticleViewer({ content }: { content: Extract<ExtractedContent, { contentType: 'article' }> }) {
  return (
    <div>
      <div className="prose prose-sm dark:prose-invert max-w-none
        prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
        prose-h1:text-xl prose-h1:border-b prose-h1:border-border prose-h1:pb-2
        prose-h2:text-lg
        prose-h3:text-base
        prose-p:text-foreground prose-p:leading-relaxed prose-p:my-2
        prose-ul:my-2 prose-ul:pl-5
        prose-li:text-foreground prose-li:my-0.5
        prose-strong:text-foreground
        prose-a:text-primary prose-a:no-underline hover:prose-a:underline
        prose-img:rounded-lg prose-img:max-h-96 prose-img:mx-auto
      ">
        <ReactMarkdown>{content.markdown}</ReactMarkdown>
      </div>
    </div>
  );
}

// === PDF renderer ===

function PdfViewer({ content }: { content: Extract<ExtractedContent, { contentType: 'pdf' }> }) {
  return (
    <div className="w-full h-full min-h-[600px] flex flex-col">
      <object
        data={content.url}
        type="application/pdf"
        className="w-full flex-1 min-h-[600px] rounded-lg"
      >
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <p className="text-muted-foreground text-sm">PDF viewer not supported in your browser.</p>
          <a
            href={content.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-primary hover:underline text-sm"
          >
            <ExternalLink size={14} />
            Open PDF in new tab
          </a>
        </div>
      </object>
    </div>
  );
}

// === Pending state ===

function PendingState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <Loader2 size={28} className="animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Content is being extracted...</p>
    </div>
  );
}

// === Fallback state ===

function FallbackState({ reason, url, onRetry }: { reason: string; url: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <p className="text-sm text-muted-foreground max-w-md text-center">
        {reason}
      </p>
      <div className="flex items-center gap-3">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <RotateCcw size={15} />
            Retry extraction
          </button>
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted/70 transition-colors"
        >
          <ExternalLink size={15} />
          Open in new tab
        </a>
      </div>
    </div>
  );
}
