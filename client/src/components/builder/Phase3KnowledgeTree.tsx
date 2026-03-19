/**
 * Phase3KnowledgeTree — Knowledge Tree list workspace for Builder Phase 3.
 *
 * Three sections: Unprocessed (pending), Triaged (bookmarked), Saved (with extractions).
 * When categories exist, saved section renders as collapsible category groups.
 * Plus swarm status bar, manual source form, and contextual empty states.
 */

import { useState, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Plus, RefreshCw, X, BookOpen, ArrowRight, Check, ChevronDown, ChevronRight, FolderPlus } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { TactileButton } from '@/components/ui/tactile-button';
import { ResourceTypeBadge } from '@/components/learning-stream/ResourceTypeBadge';
import { MissionDashboard } from '@/components/learning-stream/MissionDashboard';
import { useKnowledgeTree, type SavedItemView } from '@/hooks/useKnowledgeTree';
import { useCategories } from '@/hooks/useCategories';
import { useSwarmEvents } from '@/hooks/useSwarmEvents';
import type { LearningStreamItem } from '@/hooks/useLearningStream';
import {
  computeEmptyState,
  validateManualSource,
  buildItemDetailUrl,
  computeSwarmVisibility,
  computeRelaunchState,
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

// ─── Swarm Banner + Expandable Observatory ─────────────────────────────────

function SwarmBanner({ slug, research, relaunchResearch, isRelaunching }: {
  slug: string;
  research: { isRunning: boolean; canRelaunch: boolean };
  relaunchResearch: () => Promise<void | unknown>;
  isRelaunching: boolean;
}) {
  const swarmState = useSwarmEvents(slug, true);
  const [expanded, setExpanded] = useState(false);

  const isActive = swarmState.isActive || research.isRunning;
  if (!isActive) return null;

  return (
    <div className="mb-10">
      {/* Compact banner */}
      <div className="rounded-xl shadow-card bg-card-elevated px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-5 h-5 flex items-center justify-center">
              <Loader2 size={16} className="text-info animate-spin" />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-info">
                Research Active
              </span>
              <p className="text-[13px] font-serif italic text-muted-foreground mt-0.5 leading-snug">
                Specialized agents are combing the web for sources tailored to your BrainLift. Inspect them to watch the search unfold.
              </p>
            </div>
          </div>

          <TactileButton
            variant="inset"
            className="text-[11px]"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Hide Agents' : 'Inspect Swarm Agents'}
          </TactileButton>
        </div>
      </div>

      {/* Expanded: full MissionDashboard (hides its own header via CSS) */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-4 [&_header]:hidden">
              <MissionDashboard
                swarmState={swarmState}
                onLaunch={async () => { await relaunchResearch(); }}
                isLaunching={isRelaunching}
                hideWhenIdle={false}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── UnprocessedCard ────────────────────────────────────────────────────────

function UnprocessedCard({ item, onKeep, onDiscard, onOpen, isKeeping, isDiscarding }: {
  item: LearningStreamItem;
  onKeep: (id: number) => void;
  onDiscard: (id: number) => void;
  onOpen: (id: number) => void;
  isKeeping: boolean;
  isDiscarding: boolean;
}) {
  return (
    <div
      className="bg-card-elevated rounded-xl shadow-card overflow-hidden hover:shadow-card-hover transition-shadow cursor-pointer"
      onClick={() => onOpen(item.id)}
    >
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

      {/* Action bar — stopPropagation on the bar itself so no click bleeds to card */}
      <div className="px-6 py-3 border-t border-border/50 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <TactileButton
          variant="raised"
          onClick={() => onKeep(item.id)}
          disabled={isKeeping}
          className="flex items-center gap-2 text-[12px] px-5 py-2.5 min-h-[36px]"
        >
          {isKeeping ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Check size={13} />
          )}
          Keep
        </TactileButton>

        <TactileButton
          variant="inset"
          onClick={() => onDiscard(item.id)}
          disabled={isDiscarding}
          className="flex items-center gap-2 text-[12px] px-5 py-2.5 min-h-[36px]"
        >
          {isDiscarding ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <X size={13} />
          )}
          Discard
        </TactileButton>

        <TactileButton
          variant="inset"
          onClick={() => onOpen(item.id)}
          className="flex items-center gap-2 text-[12px] px-5 py-2.5 min-h-[36px] ml-auto"
        >
          <ArrowRight size={13} />
          Open
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
  const { categories, assignItem, isAssigning, createCategory, isCreating } = useCategories(slug);
  const [open, setOpen] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const newInputRef = useRef<HTMLInputElement>(null);
  const options = buildCategoryDropdownOptions(categories);

  const handleSelect = useCallback(async (categoryId: number | null) => {
    if (categoryId === item.categoryId) {
      setOpen(false);
      return;
    }
    try {
      await assignItem(item.id, categoryId);
    } catch {
      // Error handled by TanStack Query
    }
    setOpen(false);
  }, [assignItem, item.id, item.categoryId]);

  const handleCreateAndAssign = useCallback(async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    try {
      const created = await createCategory(trimmed);
      if (created?.id) {
        await assignItem(item.id, created.id);
      }
    } catch {
      // Error handled by TanStack Query
    }
    setNewCategoryName('');
    setIsAddingNew(false);
    setOpen(false);
  }, [newCategoryName, createCategory, assignItem, item.id]);

  const handleStartAdding = useCallback(() => {
    setIsAddingNew(true);
    // Focus input after render
    setTimeout(() => newInputRef.current?.focus(), 0);
  }, []);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setIsAddingNew(false);
      setNewCategoryName('');
    }
  }, []);

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          disabled={isAssigning}
          className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded
                     bg-card border border-border text-[9px] uppercase tracking-[0.25em] font-semibold text-muted-foreground
                     hover:bg-card-elevated hover:shadow-card transition-all duration-150 cursor-pointer
                     active:scale-[0.97] min-h-[24px]"
        >
          {isAssigning ? '...' : (item.categoryName || 'Uncategorized')}
          <ChevronDown size={10} className="text-muted-light" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          sideOffset={4}
          align="start"
          onClick={(e) => e.stopPropagation()}
          className="min-w-[180px] rounded-lg bg-card-elevated shadow-card-hover py-1 z-[100]
                     animate-in fade-in-0 zoom-in-95 duration-150"
        >
          {options.map(opt => (
            <button
              key={opt.value ?? 'uncategorized'}
              onClick={() => handleSelect(opt.value)}
              className={`w-full text-left px-3 py-2 text-xs font-sans transition-colors duration-100 cursor-pointer border-none bg-transparent
                         hover:bg-background ${opt.value === item.categoryId ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}
            >
              <span className="flex items-center gap-2">
                {opt.value === item.categoryId && <Check size={10} className="text-success" />}
                {opt.label}
              </span>
            </button>
          ))}

          <div className="border-t border-border mt-1 pt-1">
            {isAddingNew ? (
              <div className="px-2 py-1.5 flex items-center gap-1.5">
                <input
                  ref={newInputRef}
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateAndAssign();
                    if (e.key === 'Escape') { setIsAddingNew(false); setNewCategoryName(''); }
                  }}
                  placeholder="Category name..."
                  disabled={isCreating}
                  className="flex-1 bg-background border border-border rounded px-2 py-1 text-xs text-foreground
                             placeholder:text-muted-light focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <button
                  onClick={handleCreateAndAssign}
                  disabled={isCreating || !newCategoryName.trim()}
                  className="p-1 rounded bg-transparent border-none cursor-pointer text-success hover:text-success/80
                             disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isCreating ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                </button>
              </div>
            ) : (
              <button
                onClick={handleStartAdding}
                className="w-full text-left px-3 py-2 text-xs font-sans text-muted-foreground
                           hover:bg-background transition-colors duration-100 cursor-pointer border-none bg-transparent
                           flex items-center gap-2"
              >
                <Plus size={10} />
                New category...
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ─── SavedItemCard ──────────────────────────────────────────────────────────

interface ItemDetailData {
  facts: Array<{ id: number; originalId: string; fact: string }>;
  summaries: Array<{ id: number; text: string[]; relatedFactIds: number[] }>;
}

function SavedItemCard({ item, slug }: {
  item: SavedItemView;
  slug: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<ItemDetailData | null>(null);
  const [loading, setLoading] = useState(false);

  const handleToggleExtractions = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!detail) {
      setLoading(true);
      try {
        const res = await fetch(`/api/brainlifts/${slug}/knowledge-tree/items/${item.id}`);
        if (res.ok) {
          const data = await res.json();
          setDetail({ facts: data.facts, summaries: data.summaries });
        }
      } catch {
        // Fail silently — user can retry
      } finally {
        setLoading(false);
      }
    }
  }, [expanded, detail, slug, item.id]);

  return (
    <div className="bg-card-elevated rounded-xl shadow-card">
      <div className="px-6 py-4">
        {/* ── Top row: badges + actions ── */}
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <ResourceTypeBadge type={item.type || 'Unknown'} size="compact" />
          <CategoryAssignDropdown item={item} slug={slug} />

          {/* ── Always-visible detail button ── */}
          <div className="ml-auto">
            <TactileButton
              variant="raised"
              className="text-[11px]"
              onClick={() => navigateToItemDetail(item.id)}
            >
              Open
            </TactileButton>
          </div>
        </div>

        {/* ── Title ── */}
        <h4 className="font-serif text-[15px] font-normal leading-snug text-foreground m-0 mb-2">
          {item.title || 'Untitled Resource'}
        </h4>

        {/* ── Extraction counts — interactive disclosure trigger ── */}
        <button
          onClick={handleToggleExtractions}
          className="inline-flex items-center gap-1.5 bg-transparent border-none cursor-pointer p-0
                     text-xs text-muted-foreground tabular-nums
                     hover:text-foreground transition-colors duration-150"
        >
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          <span className="underline underline-offset-2 decoration-border hover:decoration-muted-foreground">
            {formatExtractionCounts(item.factCount, item.summaryCount)}
          </span>
        </button>
      </div>

      {/* ── Expanded extractions ── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="border-t border-border mx-6" />
            <div className="px-6 py-4">
              {loading ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Loading extractions...</span>
                </div>
              ) : detail ? (
                <div className="space-y-4">
                  {/* Facts */}
                  {detail.facts.length > 0 && (
                    <div>
                      <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
                        Facts {' \u00b7 '} {detail.facts.length}
                      </span>
                      <div className="mt-2 space-y-1.5">
                        {detail.facts.map(f => (
                          <div key={f.id} className="flex gap-3">
                            <span className="font-serif text-[11px] text-muted-light tabular-nums shrink-0 pt-px">
                              {f.originalId}
                            </span>
                            <p className="font-serif text-[13px] italic text-foreground leading-relaxed m-0">
                              {f.fact}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Summaries */}
                  {detail.summaries.length > 0 && (
                    <div>
                      <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
                        Summaries {' \u00b7 '} {detail.summaries.length}
                      </span>
                      <div className="mt-2 space-y-2">
                        {detail.summaries.map(s => (
                          <div key={s.id}>
                            <ul className="m-0 pl-4 space-y-0.5">
                              {s.text.map((point, i) => (
                                <li key={i} className="font-serif text-[13px] italic text-foreground leading-relaxed">
                                  {point}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
            <div className="space-y-2 pt-2 pb-2">
              {items.length === 0 ? (
                <p className="font-serif text-[13px] italic text-muted-light m-0 py-2">
                  No saved sources in this category yet.
                </p>
              ) : items.map(item => (
                <SavedItemCard key={item.id} item={item} slug={slug} />
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

function SectionHeader({ label, count, subtitle, action }: {
  label: string;
  count: number;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
          {label} {' \u00b7 '} {count}
        </span>
        {subtitle && (
          <p className="font-serif text-[13px] italic text-muted-foreground/70 leading-relaxed m-0 mt-1">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ─── AddSourceButtonOrForm ───────────────────────────────────────────────────

function AddSourceButtonOrForm({ showAddForm, setShowAddForm, handleAddSource, isAddingSource, addSourceError }: {
  showAddForm: boolean;
  setShowAddForm: (v: boolean) => void;
  handleAddSource: (data: { url: string; title: string }) => void;
  isAddingSource: boolean;
  addSourceError: Error | null;
}) {
  return (
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
            variant="raised"
            className="text-[12px] flex items-center gap-2"
            onClick={() => setShowAddForm(true)}
          >
            <Plus size={13} />
            Add New Source
          </TactileButton>
        </motion.div>
      )}
    </AnimatePresence>
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

  const { categories, createCategory, isCreating: isCreatingCategory } = useCategories(slug);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleKeep = useCallback(async (itemId: number) => {
    try {
      await openItem(itemId);
    } catch {
      // Mutation failure handled by TanStack Query
    }
  }, [openItem]);

  const handleDiscard = useCallback(async (itemId: number) => {
    try {
      await skipItem(itemId);
    } catch {
      // Mutation failure handled by TanStack Query
    }
  }, [skipItem]);

  const handleOpenItem = useCallback((itemId: number) => {
    navigateToItemDetail(itemId);
  }, []);

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
  const relaunchState = computeRelaunchState({
    unprocessedCount: unprocessed.length,
    triagedCount: triaged.length,
    savedCount: saved.length,
    canRelaunch: research.canRelaunch,
    isRunning: research.isRunning,
  });

  const addSourceButton = (
    <TactileButton
      variant="raised"
      className="text-[12px] flex items-center gap-2"
      onClick={() => setShowAddForm(true)}
    >
      <Plus size={13} />
      Add New Source
    </TactileButton>
  );

  return (
    <div>
      <PhaseHeader />

      {/* Swarm banner — compact by default, expands to full observatory */}
      <SwarmBanner
        slug={slug}
        research={research}
        relaunchResearch={relaunchResearch}
        isRelaunching={isRelaunching}
      />

      {/* Global empty state */}
      {emptyState && (
        <>
          <EmptyStateMessage message={emptyState.message} />
          {/* Add source always reachable in empty state */}
          <div className="mb-8">
            <AddSourceButtonOrForm
              showAddForm={showAddForm}
              setShowAddForm={setShowAddForm}
              handleAddSource={handleAddSource}
              isAddingSource={isAddingSource}
              addSourceError={addSourceError}
            />
          </div>
        </>
      )}

      {/* Sections */}
      <div className="space-y-8">

      {/* Unprocessed section — or relaunch prompt when empty */}
      {unprocessed.length > 0 ? (
        <>
          <SectionHeader
            label="Unprocessed"
            count={unprocessed.length}
            subtitle="New finds from the research swarm. Keep what looks promising, discard the rest. Once you've triaged everything, you can launch a new swarm for fresh sources."
            action={!showAddForm ? addSourceButton : undefined}
          />
          {showAddForm && (
            <div className="mb-4">
              <ManualSourceForm
                onSubmit={handleAddSource}
                onCancel={() => setShowAddForm(false)}
                isSubmitting={isAddingSource}
                submitError={addSourceError}
              />
            </div>
          )}
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
                    onKeep={handleKeep}
                    onDiscard={handleDiscard}
                    onOpen={handleOpenItem}
                    isKeeping={isOpening}
                    isDiscarding={isSkipping}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      ) : relaunchState.type !== 'hidden' && !emptyState ? (
        <div>
          <div className="mb-4 flex items-center justify-between gap-4">
            <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
              Unprocessed
            </span>
            {!showAddForm && <div className="shrink-0">{addSourceButton}</div>}
          </div>
          {showAddForm && (
            <div className="mb-4">
              <ManualSourceForm
                onSubmit={handleAddSource}
                onCancel={() => setShowAddForm(false)}
                isSubmitting={isAddingSource}
                submitError={addSourceError}
              />
            </div>
          )}
          <div className="flex flex-col items-center py-8 text-center">
            <p className="font-serif text-[14px] italic text-muted-foreground mb-4 max-w-md leading-relaxed">
              {relaunchState.message}
            </p>
            {relaunchState.type === 'ready' && (
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
            )}
          </div>
        </div>
      ) : null}

      {/* Triaged section */}
      {triaged.length > 0 && (
        <>
          <SectionHeader
            label="Triaged"
            count={triaged.length}
            subtitle="Kept sources waiting to be processed. Open one and extract facts or summaries to save it."
          />
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
          <SectionHeader
            label="Saved"
            count={saved.length}
            subtitle="Fully processed sources with extracted facts and summaries."
            action={
              showNewCategoryInput ? (
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
                  variant="raised"
                  onClick={() => setShowNewCategoryInput(true)}
                  className="text-[11px] flex items-center gap-1.5"
                >
                  <FolderPlus size={12} />
                  New Category
                </TactileButton>
              )
            }
          />
          {shouldShowCategoryGroups(categories) ? (
            <SavedSectionGrouped saved={saved} categories={categories} slug={slug} />
          ) : (
            <div className="space-y-2">
              {saved.map((item) => (
                <SavedItemCard key={item.id} item={item} slug={slug} />
              ))}
            </div>
          )}
        </>
      )}

      </div>{/* end sections wrapper */}

      {/* Relaunch in empty state context (no items at all) */}
      {relaunchState.type === 'ready' && emptyState && emptyState.type === 'no-results' && (
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
      <p className="font-serif text-[14px] italic text-muted-foreground leading-relaxed m-0 mb-3">
        This is where you research and read — and what you read becomes the foundation of everything above the bright line. Every source you process here produces two things: facts that ground your knowledge base, and synthesis that's yours alone.
      </p>
      <p className="font-serif text-[14px] italic text-muted-foreground leading-relaxed m-0 pb-6">
        Work through what the research swarm finds, or bring your own sources. The stronger this foundation, the sharper your insights and stances become.
      </p>
    </>
  );
}
