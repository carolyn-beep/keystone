import { useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { Loader2, ExternalLink, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Tweet } from 'react-tweet';
import type { ExtractedContent } from '@/hooks/useLearningStream';

/**
 * Selection payload emitted by the article body's mouseup handler. `rect`
 * coordinates are translated into the wrapper's local space (top-left of the
 * article wrapper container is the origin) so the parent popover can position
 * with plain `position: absolute` and scroll naturally with the article.
 *
 * Per spec 03 Decision 3, the handler emits null for selections shorter than
 * 2 trimmed characters (filters accidental click-drags).
 */
export interface ReaderSelectionPayload {
  text: string;
  rect: { top: number; right: number; bottom: number; left: number };
  lineRects: Array<{ top: number; right: number; bottom: number; left: number }>;
  articleBodyRect: { right: number; bottom: number };
}

interface ContentViewerProps {
  content: ExtractedContent;
  url: string;
  onRetry?: () => void;
  /**
   * Fires on mouseup inside the article body wrapper. Payload is null when
   * the selection is empty or under 2 chars (spec 03 FR1).
   *
   * Only wired for the 'article' content branch. Embeds, PDFs, pending and
   * fallback states do not register the handler.
   */
  onTextSelection?: (payload: ReaderSelectionPayload | null) => void;
}

export function ContentViewer({ content, url, onRetry, onTextSelection }: ContentViewerProps) {
  switch (content.contentType) {
    case 'embed':
      return <EmbedViewer content={content} />;
    case 'article':
      return <ArticleViewer content={content} onTextSelection={onTextSelection} />;
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

function ArticleViewer({
  content,
  onTextSelection,
}: {
  content: Extract<ExtractedContent, { contentType: 'article' }>;
  onTextSelection?: (payload: ReaderSelectionPayload | null) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Spec 03 FR1: surface selections inside the article body to the parent so
  // it can render <QuoteSelectionPopover>. Per Decision 1, mouseup is preferred
  // over selectionchange (selectionchange fires continuously during drag and
  // is fiddly to debounce). Per Decision 3, trimmed selections shorter than
  // 2 chars emit null (filters accidental click-drags).
  function handleMouseUp(_event: ReactMouseEvent<HTMLDivElement>) {
    if (!onTextSelection) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    const rawText = selection?.toString() ?? '';
    const text = rawText.trim();

    if (text.length < 2 || !selection || selection.rangeCount === 0) {
      onTextSelection(null);
      return;
    }

    // Gate by container: anchorNode must lie inside the wrapper. This
    // prevents drawer-metadata selections that started outside but bled into
    // the wrapper from emitting a positive signal.
    const anchorNode = selection.anchorNode;
    if (!anchorNode || !wrapper.contains(anchorNode)) {
      onTextSelection(null);
      return;
    }

    // Translate the selection rect into the positioned scroll panel's
    // coordinate space. The article body is nested inside padded panel chrome,
    // while QuoteSelectionPopover is an absolute child of that panel.
    const range = selection.getRangeAt(0);
    const selectionRect = range.getBoundingClientRect();
    const positioningRoot =
      wrapper.offsetParent instanceof HTMLElement ? wrapper.offsetParent : wrapper;
    const rootRect = positioningRoot.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const toLocalRect = (rect: DOMRect) => ({
      top: rect.top - rootRect.top + positioningRoot.scrollTop,
      right: rect.right - rootRect.left + positioningRoot.scrollLeft,
      bottom: rect.bottom - rootRect.top + positioningRoot.scrollTop,
      left: rect.left - rootRect.left + positioningRoot.scrollLeft,
    });
    const localSelectionRect = toLocalRect(selectionRect);
    const lineRects = Array.from(range.getClientRects()).map(toLocalRect);

    onTextSelection({
      text,
      rect: localSelectionRect,
      lineRects,
      articleBodyRect: {
        right: wrapperRect.right - rootRect.left + positioningRoot.scrollLeft,
        bottom: wrapperRect.bottom - rootRect.top + positioningRoot.scrollTop,
      },
    });
  }

  return (
    <div>
      <div
        ref={wrapperRef}
        data-reader-article-body
        onMouseUp={handleMouseUp}
        className="prose prose-sm dark:prose-invert max-w-none
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
