/**
 * Phase3KnowledgeTree — Knowledge Tree list workspace for Builder Phase 3.
 *
 * Three sections: Unprocessed (pending), Triaged (bookmarked), Saved (with extractions).
 * When categories exist, saved section renders as collapsible category groups.
 * Plus swarm status bar, manual source form, and contextual empty states.
 */

import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Plus, ExternalLink, RefreshCw, Search, X, BookOpen, ArrowRight, ChevronDown, ChevronRight, FolderPlus } from 'lucide-react';
import { useLocation } from 'wouter';
import { TactileButton } from '@/components/ui/tactile-button';
import { ResourceTypeBadge } from '@/components/learning-stream/ResourceTypeBadge';
import { useKnowledgeTree, type SavedItemView } from '@/hooks/useKnowledgeTree';
import { useCategories } from '@/hooks/useCategories';
import type { LearningStreamItem } from '@/hooks/useLearningStream';
import {
  computeEmptyState,
  validateManualSource,
  buildItemDetailUrl,
  buildMissionDashboardUrl,
  computeSwarmVisibility,
  computeRelaunchVisibility,
  formatExtractionCounts,
} from './knowledge-tree-helpers';
import {
  shouldShowCategoryGroups,
  groupSavedItemsByCategory,
  computeUncategorizedGroup,
  buildCategoryDropdownOptions,
} from './category-helpers';

// ─── Props ──────────────────────────────────────────────────────────────────

interface Phase3KnowledgeTreeProps {
  slug: string;
}

// ─── URL Navigation Helper ──────────────────────────────────────────────────

function navigateToItemDetail(itemId: number) {
  const params = new URLSearchParams(window.location.search);
  params.set('screen', '3');
  params.set('item', String(itemId));
  const newUrl = `?${params.toString()}`;
  window.history.replaceState(null, '', newUrl);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// ─── SwarmStatusBar ─────────────────────────────────────────────────────────

function SwarmStatusBar({ slug, research }: {
  slug: string;
  research: { isRunning: boolean; canRelaunch: boolean };
}) {
  const [, navigate] = useLocation();
  const visible = computeSwarmVisibility(research);
  if (!visible) return null;

  return (
    <div className="mb-8 rounded-lg bg-info-soft/30 px-5 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-8 h-8">
          <Search size={16} className="text-info animate-pulse" />
        </div>
        <span className="text-sm font-medium text-foreground">
          Research in progress...
        </span>
      </div>
      <button
        onClick={() => navigate(buildMissionDashboardUrl(slug))}
        className="flex items-center gap-1.5 text-xs font-semibold text-info hover:text-info/80 transition-colors cursor-pointer bg-transparent border-none"
      >
        See In Detail
        <ExternalLink size={12} />
      </button>
    </div>
  );
}

// ─── UnprocessedCard ────────────────────────────────────────────────────────

function UnprocessedCard({ item, onOpen, onSkip, isOpening, isSkipping }: {
  item: LearningStreamItem;
  onOpen: (id: number) => void;
  onSkip: (id: number) => void;
  isOpening: boolean;
  isSkipping: boolean;
}) {
  return (
    <div className="bg-card-elevated rounded-xl shadow-card overflow-hidden hover:shadow-card-hover transition-shadow">
      <div className="px-6 py-5">
        {/* Type badge + metadata */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <ResourceTypeBadge type={item.type || 'Unknown'} size="compact" />
          {item.author && item.author !== 'Unknown' && (
            <span className="text-xs text-muted-foreground">{item.author}</span>
          )}
          {item.time && item.time !== 'Unknown' && (
            <span className="text-xs text-muted-foreground">{item.time}</span>
          )}
        </div>

        {/* Title */}
        <h4 className="font-serif text-[17px] font-normal leading-relaxed text-foreground m-0 mb-2">
          {item.topic || 'Untitled Resource'}
        </h4>

        {/* Excerpt */}
        {item.facts && (
          <p className="text-sm text-muted-foreground leading-relaxed m-0 line-clamp-2">
            {item.facts}
          </p>
        )}
      </div>

      {/* Action bar */}
      <div className="px-6 py-3 border-t border-border/50 flex items-center gap-3">
        <TactileButton
          variant="raised"
          onClick={() => onOpen(item.id)}
          disabled={isOpening}
          className="flex items-center gap-2 text-[12px] px-4 py-2"
        >
          {isOpening ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <ArrowRight size={13} />
          )}
          Open
        </TactileButton>

        <TactileButton
          variant="inset"
          onClick={() => onSkip(item.id)}
          disabled={isSkipping}
          className="flex items-center gap-2 text-[12px] px-4 py-2"
        >
          {isSkipping ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <X size={13} />
          )}
          Skip
        </TactileButton>
      </div>
    </div>
  );
}

// ─── TriagedCard ────────────────────────────────────────────────────────────

function TriagedCard({ item }: { item: LearningStreamItem }) {
  return (
    <div
      className="bg-card-elevated rounded-xl shadow-card overflow-hidden hover:shadow-card-hover transition-shadow cursor-pointer"
      onClick={() => navigateToItemDetail(item.id)}
    >
      <div className="px-6 py-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1.5">
            <ResourceTypeBadge type={item.type || 'Unknown'} size="compact" />
            {item.author && item.author !== 'Unknown' && (
              <span className="text-xs text-muted-foreground">{item.author}</span>
            )}
          </div>
          <h4 className="font-serif text-[15px] font-normal leading-snug text-foreground m-0 truncate">
            {item.topic || 'Untitled Resource'}
          </h4>
        </div>
        <ArrowRight size={14} className="text-muted-foreground shrink-0" />
      </div>
    </div>
  );
}

// ─── CategoryAssignDropdown ─────────────────────────────────────────────────

function CategoryAssignDropdown({ item, slug }: { item: SavedItemView; slug: string }) {
  const { categories, assignItem, isAssigning } = useCategories(slug);
  const [open, setOpen] = useState(false);
  const options = buildCategoryDropdownOptions(categories);

  const handleSelect = useCallback(async (categoryId: number | null, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    if (categoryId === item.categoryId) return;
    try {
      await assignItem(item.id, categoryId);
    } catch {
      // Error handled by TanStack Query
    }
  }, [assignItem, item.id, item.categoryId]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(prev => !prev);
  }, []);

  // Close dropdown when clicking outside
  const handleBlur = useCallback(() => {
    // Small delay to allow click events on options to fire first
    setTimeout(() => setOpen(false), 150);
  }, []);

  return (
    <div className="relative" onBlur={handleBlur}>
      <button
        onClick={handleToggle}
        disabled={isAssigning}
        className="px-[6px] py-[2px] rounded bg-success-soft text-success text-[9px] uppercase tracking-[0.25em] font-semibold
                   hover:bg-success-soft/80 transition-colors cursor-pointer border-none min-h-[24px] min-w-[24px]"
      >
        {isAssigning ? '...' : (item.categoryName || 'Uncategorized')}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] rounded-lg bg-card-elevated shadow-card-hover py-1">
          {options.map(opt => (
            <button
              key={opt.value ?? 'uncategorized'}
              onClick={(e) => handleSelect(opt.value, e)}
              className={`w-full text-left px-3 py-2 text-xs font-sans transition-colors cursor-pointer border-none bg-transparent
                         hover:bg-background ${opt.value === item.categoryId ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SavedItemCard ──────────────────────────────────────────────────────────

function SavedItemCard({ item, slug, showCategoryDropdown = false }: {
  item: SavedItemView;
  slug: string;
  showCategoryDropdown?: boolean;
}) {
  return (
    <div
      className="bg-card-elevated rounded-xl shadow-card overflow-hidden hover:shadow-card-hover transition-shadow cursor-pointer"
      onClick={() => navigateToItemDetail(item.id)}
    >
      <div className="px-6 py-4">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <ResourceTypeBadge type={item.type || 'Unknown'} size="compact" />
          {showCategoryDropdown ? (
            <CategoryAssignDropdown item={item} slug={slug} />
          ) : item.categoryName ? (
            <span className="px-[6px] py-[2px] rounded bg-success-soft text-success text-[9px] uppercase tracking-[0.25em] font-semibold">
              {item.categoryName}
            </span>
          ) : null}
        </div>

        <h4 className="font-serif text-[15px] font-normal leading-snug text-foreground m-0 mb-2">
          {item.title || 'Untitled Resource'}
        </h4>

        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatExtractionCounts(item.factCount, item.summaryCount)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── CategoryGroupSection ───────────────────────────────────────────────────

function CategoryGroupSection({ name, items, slug, defaultCollapsed = false }: {
  name: string;
  items: SavedItemView[];
  slug: string;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (items.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        onClick={() => setCollapsed(prev => !prev)}
        className="flex items-center gap-2 mb-2 cursor-pointer bg-transparent border-none p-0 w-full text-left"
      >
        {collapsed ? (
          <ChevronRight size={12} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={12} className="text-muted-foreground" />
        )}
        <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
          {name} {' \u00b7 '} {items.length}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="space-y-2 pl-5">
              {items.map(item => (
                <SavedItemCard key={item.id} item={item} slug={slug} showCategoryDropdown />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── ManualSourceForm ───────────────────────────────────────────────────────

function ManualSourceForm({ onSubmit, onCancel, isSubmitting, submitError }: {
  onSubmit: (data: { url: string; title: string }) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  submitError: Error | null;
}) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [errors, setErrors] = useState<{ url?: string; title?: string }>({});

  const handleSubmit = useCallback(() => {
    const result = validateManualSource(url, title);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit({ url: url.trim(), title: title.trim() });
  }, [url, title, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      onCancel();
    }
  }, [handleSubmit, onCancel]);

  const displayError = submitError?.message || null;

  return (
    <div className="rounded-xl bg-card-elevated shadow-card p-6">
      <div className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground mb-4">
        Add Your Own Source
      </div>

      <div className="space-y-3">
        <div>
          <input
            type="url"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setErrors(prev => ({ ...prev, url: undefined })); }}
            onKeyDown={handleKeyDown}
            placeholder="https://..."
            className="w-full rounded-lg px-4 py-2.5 bg-background border border-border text-foreground text-sm
                       focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/20 transition-colors"
          />
          {errors.url && (
            <p className="m-0 mt-1 text-[11px] font-medium" style={{ color: 'var(--danger-hex)' }}>
              {errors.url}
            </p>
          )}
        </div>

        <div>
          <input
            type="text"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setErrors(prev => ({ ...prev, title: undefined })); }}
            onKeyDown={handleKeyDown}
            placeholder="Source title"
            className="w-full rounded-lg px-4 py-2.5 bg-background border border-border text-foreground text-sm
                       focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/20 transition-colors"
          />
          {errors.title && (
            <p className="m-0 mt-1 text-[11px] font-medium" style={{ color: 'var(--danger-hex)' }}>
              {errors.title}
            </p>
          )}
        </div>
      </div>

      {displayError && (
        <p className="m-0 mt-3 text-[12px] font-medium" style={{ color: 'var(--danger-hex)' }}>
          {displayError}
        </p>
      )}

      <div className="flex items-center gap-3 mt-4">
        <TactileButton
          variant="raised"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="flex items-center gap-2 text-[12px] px-4 py-2"
        >
          {isSubmitting ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Plus size={13} />
          )}
          Add Source
        </TactileButton>

        <TactileButton
          variant="inset"
          onClick={onCancel}
          disabled={isSubmitting}
          className="text-[12px] px-4 py-2"
        >
          Cancel
        </TactileButton>
      </div>
    </div>
  );
}

// ─── EmptyStateMessage ──────────────────────────────────────────────────────

function EmptyStateMessage({ message }: { message: string }) {
  return (
    <div className="py-12 text-center">
      <p className="font-serif italic text-muted-foreground text-[15px] leading-relaxed max-w-md mx-auto">
        {message}
      </p>
    </div>
  );
}

// ─── Section Header ─────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count: number }) {
  if (count === 0) return null;
  return (
    <div className="mb-4 mt-8 first:mt-0">
      <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
        {label} {' \u00b7 '} {count}
      </span>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function Phase3KnowledgeTree({ slug }: Phase3KnowledgeTreeProps) {
  const {
    unprocessed,
    triaged,
    saved,
    research,
    isLoading,
    skipItem,
    openItem,
    addSource,
    relaunchResearch,
    isSkipping,
    isOpening,
    isAddingSource,
    isRelaunching,
    addSourceError,
  } = useKnowledgeTree(slug);

  const { categories, create: createCategory, isCreating: isCreatingCategory } = useCategories(slug);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleOpen = useCallback(async (itemId: number) => {
    try {
      await openItem(itemId);
      navigateToItemDetail(itemId);
    } catch {
      // Mutation failure handled by TanStack Query
    }
  }, [openItem]);

  const handleSkip = useCallback(async (itemId: number) => {
    try {
      await skipItem(itemId);
    } catch {
      // Mutation failure handled by TanStack Query
    }
  }, [skipItem]);

  const handleAddSource = useCallback(async (data: { url: string; title: string }) => {
    try {
      const result = await addSource(data);
      setShowAddForm(false);
      navigateToItemDetail(result.openDetail.itemId);
    } catch {
      // Error stays in addSourceError for inline display
    }
  }, [addSource]);

  const handleRelaunch = useCallback(async () => {
    try {
      await relaunchResearch();
    } catch {
      // Mutation failure handled by TanStack Query
    }
  }, [relaunchResearch]);

  const handleCreateCategory = useCallback(async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    try {
      await createCategory(trimmed);
      setNewCategoryName('');
      setShowNewCategoryInput(false);
    } catch {
      // Error handled by TanStack Query
    }
  }, [createCategory, newCategoryName]);

  // ── Loading State ─────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div>
        <PhaseHeader />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-muted-foreground" size={24} />
        </div>
      </div>
    );
  }

  // ── Empty State ───────────────────────────────────────────────────────

  const emptyState = computeEmptyState({ unprocessed, triaged, saved, research });
  const showRelaunch = computeRelaunchVisibility({
    unprocessedCount: unprocessed.length,
    canRelaunch: research.canRelaunch,
    isRunning: research.isRunning,
  });

  return (
    <div>
      <PhaseHeader />

      {/* Swarm status */}
      <SwarmStatusBar slug={slug} research={research} />

      {/* Global empty state */}
      {emptyState && <EmptyStateMessage message={emptyState.message} />}

      {/* Unprocessed section */}
      {unprocessed.length > 0 && (
        <>
          <SectionHeader label="Unprocessed" count={unprocessed.length} />
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {unprocessed.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden' }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                >
                  <UnprocessedCard
                    item={item}
                    onOpen={handleOpen}
                    onSkip={handleSkip}
                    isOpening={isOpening}
                    isSkipping={isSkipping}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Triaged section */}
      {triaged.length > 0 && (
        <>
          <SectionHeader label="Triaged" count={triaged.length} />
          <div className="space-y-2">
            {triaged.map((item) => (
              <TriagedCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      {/* Saved section */}
      {saved.length > 0 && (
        <>
          <SectionHeader label="Saved" count={saved.length} />
          {shouldShowCategoryGroups(categories) ? (
            <SavedSectionGrouped saved={saved} categories={categories} slug={slug} />
          ) : (
            <div className="space-y-2">
              {saved.map((item) => (
                <SavedItemCard key={item.id} item={item} slug={slug} />
              ))}
            </div>
          )}

          {/* New Category button */}
          <div className="mt-4">
            {showNewCategoryInput ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateCategory();
                    if (e.key === 'Escape') { setShowNewCategoryInput(false); setNewCategoryName(''); }
                  }}
                  placeholder="Category name"
                  autoFocus
                  className="rounded-lg px-3 py-2 bg-background border border-border text-foreground text-xs
                             focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/20 transition-colors"
                />
                <TactileButton
                  variant="raised"
                  onClick={handleCreateCategory}
                  disabled={isCreatingCategory || !newCategoryName.trim()}
                  className="text-[11px] px-3 py-1.5"
                >
                  {isCreatingCategory ? <Loader2 size={11} className="animate-spin" /> : 'Add'}
                </TactileButton>
                <TactileButton
                  variant="inset"
                  onClick={() => { setShowNewCategoryInput(false); setNewCategoryName(''); }}
                  className="text-[11px] px-3 py-1.5"
                >
                  Cancel
                </TactileButton>
              </div>
            ) : (
              <TactileButton
                variant="inset"
                onClick={() => setShowNewCategoryInput(true)}
                className="text-[11px] flex items-center gap-1.5"
              >
                <FolderPlus size={12} />
                New Category
              </TactileButton>
            )}
          </div>
        </>
      )}

      {/* Relaunch button */}
      {showRelaunch && !emptyState && (
        <div className="mt-8 text-center">
          <TactileButton
            variant="inset"
            onClick={handleRelaunch}
            disabled={isRelaunching}
            className="flex items-center gap-2 text-[12px] mx-auto"
          >
            {isRelaunching ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Start New Research
          </TactileButton>
        </div>
      )}

      {/* Relaunch in empty state context */}
      {showRelaunch && emptyState && emptyState.type === 'no-results' && (
        <div className="flex justify-center gap-3">
          <TactileButton
            variant="raised"
            onClick={handleRelaunch}
            disabled={isRelaunching}
            className="flex items-center gap-2 text-[12px]"
          >
            {isRelaunching ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Start New Research
          </TactileButton>
        </div>
      )}

      {/* Add source button / form */}
      <div className="mt-8 mb-12">
        <AnimatePresence initial={false}>
          {showAddForm ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              <ManualSourceForm
                onSubmit={handleAddSource}
                onCancel={() => setShowAddForm(false)}
                isSubmitting={isAddingSource}
                submitError={addSourceError}
              />
            </motion.div>
          ) : (
            <motion.div
              key="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <TactileButton
                variant="inset"
                className="text-[12px] flex items-center gap-2"
                onClick={() => setShowAddForm(true)}
              >
                <Plus size={13} />
                Add Source
              </TactileButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── SavedSectionGrouped ─────────────────────────────────────────────────────

function SavedSectionGrouped({ saved, categories, slug }: {
  saved: SavedItemView[];
  categories: Array<{ id: number; name: string; sortOrder: number | null; sourceCount: number }>;
  slug: string;
}) {
  const groups = groupSavedItemsByCategory(saved, categories);
  const uncategorizedItems = computeUncategorizedGroup(saved);

  return (
    <div>
      {groups.map(group => (
        <CategoryGroupSection
          key={group.categoryId}
          name={group.categoryName}
          items={group.items}
          slug={slug}
        />
      ))}
      {uncategorizedItems.length > 0 && (
        <CategoryGroupSection
          name="Uncategorized"
          items={uncategorizedItems}
          slug={slug}
        />
      )}
    </div>
  );
}

// ─── PhaseHeader ────────────────────────────────────────────────────────────

function PhaseHeader() {
  return (
    <>
      <div className="flex items-center gap-4 mb-2">
        <span className="font-serif text-[42px] leading-none text-muted-light font-normal tracking-wide">
          3
        </span>
        <h2 className="text-[26px] font-bold text-foreground tracking-tight leading-[1.1] m-0">
          Knowledge Tree
        </h2>
      </div>
      <p className="font-serif text-[14px] italic text-muted-foreground leading-relaxed m-0 mb-2">
        This is where your reading goes. Each source you add feeds into a structured tree of facts and your own synthesis.
      </p>
      <p className="font-serif text-[14px] italic text-muted-foreground leading-relaxed m-0 pb-6">
        Open sources from the research swarm, skip what doesn't fit, and add your own. The goal is a curated collection of voices that each contribute real knowledge to your BrainLift.
      </p>
    </>
  );
}
