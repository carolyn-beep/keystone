import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, ExternalLink, Bookmark, Check, Star, Trash2, User, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { GoDiscussionClosed } from 'react-icons/go';
import { MdOutlineQuiz } from 'react-icons/md';
import { FiEdit3 } from 'react-icons/fi';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { TactileButton } from '@/components/ui/tactile-button';
import { ResourceTypeBadge } from './ResourceTypeBadge';
import { ContentViewer } from './ContentViewer';
import { DiscussionPanel } from './DiscussionPanel';
import { KnowledgeCheckPanel } from './KnowledgeCheckPanel';
import { ManualTab } from '@/components/builder/ManualTab';
import { useItemContent } from '@/hooks/useItemContent';
import { tokens } from '@/lib/colors';
import {
  getTabsForMode,
  formatExtractionBadge,
  shouldShowExtractionBadge,
  shouldShowFooter,
  type ViewMode,
  type RightPanelTab,
  type ExtractionCounts,
} from '@/components/builder/source-detail-helpers';
import type { LearningStreamItem } from '@/hooks/useLearningStream';

interface ExpandedItemViewProps {
  item: LearningStreamItem;
  slug: string;
  onClose: () => void;
  mode?: ViewMode;
  // Stream mode callbacks
  onBookmark?: (item: LearningStreamItem) => void;
  onGrade?: (item: LearningStreamItem) => void;
  onDiscard?: (item: LearningStreamItem) => void;
  onBack?: () => void;
  onNext?: () => void;
  // Builder mode data
  extractionCounts?: ExtractionCounts;
  builderFacts?: Array<{ id: number; originalId: string; fact: string; learningStreamItemId: number | null }>;
  builderSummaries?: Array<{ id: number; text: string[]; learningStreamItemId: number | null; relatedFactIds: number[] }>;
  onMutationSuccess?: () => void;
}

// Icon map for tab keys
const TAB_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  discuss: GoDiscussionClosed,
  quiz: MdOutlineQuiz,
  manual: FiEdit3,
};

export function ExpandedItemView({
  item,
  slug,
  onClose,
  mode,
  onBookmark,
  onGrade,
  onDiscard,
  onBack,
  onNext,
  extractionCounts,
  builderFacts,
  builderSummaries,
  onMutationSuccess,
}: ExpandedItemViewProps) {
  const { data: content, retryExtraction } = useItemContent(slug, item);
  const containerRef = useRef<HTMLDivElement>(null);
  const tabs = getTabsForMode(mode);
  const [activePanel, setActivePanel] = useState<RightPanelTab>(tabs[0].key);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Scroll into view after layout animation settles
  useEffect(() => {
    const timer = setTimeout(() => {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const hasActions = !!(onBookmark || onGrade || onDiscard);
  const hasNavigation = !!(onBack || onNext);
  const resourceType = item.type || 'Unknown';
  const showBadge = shouldShowExtractionBadge(mode);
  const showFooter = shouldShowFooter(mode, hasActions, hasNavigation);

  return (
    <div ref={containerRef} className="bg-card-elevated rounded-xl shadow-card overflow-hidden flex flex-col max-h-[79vh]">
      {/* Header */}
      <div className="flex-shrink-0 px-8 py-5 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <ResourceTypeBadge type={resourceType} size="compact" />
            {item.author && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                <User size={12} />
                {item.author}
              </span>
            )}
            {item.time && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                <Clock size={12} />
                {item.time}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                title="Open original source"
              >
                <ExternalLink size={14} />
                Access Source
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Title row with extraction counts aligned right */}
        <div className="flex items-baseline justify-between gap-6 mt-2">
          <h3 className="font-serif text-[20px] italic leading-relaxed text-foreground mb-0 min-w-0">
            {item.topic || 'Untitled Resource'}
          </h3>

          {showBadge && extractionCounts && (
            <div className="flex items-baseline gap-5 shrink-0">
              <div className="flex items-baseline gap-1.5">
                <span className="font-serif text-[20px] leading-none tabular-nums"
                      style={{ color: extractionCounts.facts > 0 ? tokens.success : tokens.textMuted }}>
                  {extractionCounts.facts}
                </span>
                <span className="text-[9px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
                  {extractionCounts.facts === 1 ? 'Fact' : 'Facts'}
                </span>
              </div>
              <span aria-hidden className="text-[14px] font-extrabold text-muted-light">&middot;</span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-serif text-[20px] leading-none tabular-nums"
                      style={{ color: extractionCounts.summaries > 0 ? tokens.info : tokens.textMuted }}>
                  {extractionCounts.summaries}
                </span>
                <span className="text-[9px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
                  {extractionCounts.summaries === 1 ? 'Summary' : 'Summaries'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content + Discussion split */}
      <PanelGroup direction="horizontal" className="flex-1 min-h-0">
        {/* Left: Content viewer */}
        <Panel defaultSize={60} minSize={30}>
          <div className="h-full overflow-y-auto p-6 scrollbar-styled">
            {content ? (
              <ContentViewer content={content} url={item.url} onRetry={retryExtraction} />
            ) : (
              <ContentViewer content={{ contentType: 'pending' }} url={item.url} />
            )}
          </div>
        </Panel>

        {/* Resize handle */}
        <PanelResizeHandle className="w-[3px] bg-border hover:bg-primary/40 transition-colors cursor-col-resize hidden lg:block" />

        {/* Right: Discussion / Quiz or Manual panel (hidden on small screens) */}
        <Panel defaultSize={40} minSize={20} className="hidden lg:block">
          <div className="flex flex-col h-full">
            {/* Floating pill toggle */}
            <div className="flex justify-center py-2.5 shrink-0">
              <div className="inline-flex rounded-full p-0.5" style={{ backgroundColor: tokens.surfaceAlt, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08)' }}>
                {tabs.map((tab) => {
                  const isActive = activePanel === tab.key;
                  const Icon = TAB_ICONS[tab.key] ?? GoDiscussionClosed;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActivePanel(tab.key)}
                      className="relative flex items-center justify-center gap-1.5 px-5 py-1.5 rounded-full border-none cursor-pointer text-[11px] font-semibold uppercase tracking-[0.15em] transition-colors duration-200 bg-transparent"
                      style={{ color: isActive ? '#3D2A1A' : tokens.textMuted }}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="panel-toggle-pill"
                          className="absolute inset-0 rounded-full"
                          style={{
                            background: 'linear-gradient(to bottom, #E8D9C8, #D4C4AD)',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.1)',
                          }}
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10 flex items-center gap-1.5">
                        <Icon size={14} />
                        {tab.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Panel content — all mounted, visibility toggled */}
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-styled">
              <div style={{ display: activePanel === 'discuss' ? 'contents' : 'none' }}>
                <DiscussionPanel
                  slug={slug}
                  itemId={item.id}
                  item={item}
                  builderMode={mode === 'builder'}
                />
              </div>
              {mode !== 'builder' && (
                <div style={{ display: activePanel === 'quiz' ? 'contents' : 'none' }}>
                  <KnowledgeCheckPanel slug={slug} itemId={item.id} item={item} />
                </div>
              )}
              {mode === 'builder' && (
                <div style={{ display: activePanel === 'manual' ? 'contents' : 'none' }}>
                  <ManualTab
                    slug={slug}
                    item={item}
                    facts={builderFacts ?? []}
                    summaries={builderSummaries ?? []}
                    onMutationSuccess={onMutationSuccess ?? (() => {})}
                  />
                </div>
              )}
            </div>
          </div>
        </Panel>
      </PanelGroup>

      {/* Actions footer */}
      {showFooter && (
        <div className="flex-shrink-0 px-8 py-4 border-t border-border flex items-center justify-between bg-sidebar/30">
          <div className="flex items-center gap-3">
            {onBookmark && (
              <motion.div layoutId={`action-save-${item.id}`}>
                <TactileButton
                  variant="raised"
                  onClick={() => onBookmark(item)}
                  className="flex items-center gap-2 text-[13px]"
                >
                  {mode === 'builder' ? <Check size={15} /> : <Bookmark size={15} />}
                  {mode === 'builder' ? 'Keep' : 'Save'}
                </TactileButton>
              </motion.div>
            )}
            {onGrade && (
              <motion.div layoutId={`action-grade-${item.id}`}>
                <TactileButton
                  variant="raised"
                  onClick={() => onGrade(item)}
                  className="flex items-center gap-2 text-[13px]"
                >
                  <Star size={15} />
                  Grade
                </TactileButton>
              </motion.div>
            )}
            {onDiscard && (
              <motion.div layoutId={`action-skip-${item.id}`}>
                <TactileButton
                  variant="inset"
                  onClick={() => onDiscard(item)}
                  className="flex items-center gap-2 text-[13px]"
                >
                  <Trash2 size={15} />
                  Discard
                </TactileButton>
              </motion.div>
            )}
          </div>

          {hasNavigation && (
            <div className="flex items-center gap-2">
              {onBack && (
                <TactileButton
                  variant="raised"
                  onClick={onBack}
                  className="flex items-center gap-2 text-[13px]"
                >
                  <ChevronLeft size={15} />
                  Back
                </TactileButton>
              )}
              {onNext && (
                <TactileButton
                  variant="raised"
                  onClick={onNext}
                  className="flex items-center gap-2 text-[13px]"
                >
                  Next
                  <ChevronRight size={15} />
                </TactileButton>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
