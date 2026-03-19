/**
 * ManualTab — Manual CRUD panel for facts and DOK2 summaries.
 *
 * Renders inside the ExpandedItemView right panel (builder mode).
 * Provides inline add/edit/delete for facts and summaries linked to a source item.
 * Both sections are ALWAYS visible — this is the primary way to add extractions.
 */

import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Plus, Pencil, Trash2, Check, X, BookOpen, FileText } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import type { LearningStreamItem } from '@/hooks/useLearningStream';

interface ManualTabProps {
  slug: string;
  item: LearningStreamItem;
  facts: Array<{ id: number; originalId: string; fact: string; learningStreamItemId?: number | null }>;
  summaries: Array<{ id: number; text: string[]; relatedFactIds: number[]; learningStreamItemId?: number | null }>;
  onMutationSuccess: () => void;
}

// ─── Fact Item ──────────────────────────────────────────────────────────────

function FactItem({ fact, slug, itemId, onSuccess }: {
  fact: { id: number; originalId: string; fact: string };
  slug: string;
  itemId: number;
  onSuccess: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(fact.fact);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch(
        `/api/brainlifts/${slug}/knowledge-tree/items/${itemId}/facts/${fact.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fact: text }),
          credentials: 'include',
        }
      );
      if (!res.ok) throw new Error('Failed to update fact');
      return res.json();
    },
    onSuccess: () => {
      setEditing(false);
      onSuccess();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/brainlifts/${slug}/knowledge-tree/items/${itemId}/facts/${fact.id}`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (!res.ok) throw new Error('Failed to delete fact');
      return res.json();
    },
    onSuccess: () => {
      setConfirmDelete(false);
      onSuccess();
    },
  });

  if (confirmDelete) {
    return (
      <div className="rounded-lg bg-danger/5 px-4 py-3">
        <p className="text-[12px] text-foreground m-0 mb-2">Delete this fact?</p>
        <div className="flex items-center gap-2">
          <TactileButton
            variant="raised"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="text-[11px] px-3 py-1.5"
          >
            {deleteMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : 'Delete'}
          </TactileButton>
          <TactileButton
            variant="inset"
            onClick={() => setConfirmDelete(false)}
            className="text-[11px] px-3 py-1.5"
          >
            Cancel
          </TactileButton>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="rounded-lg bg-card px-4 py-3">
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          className="w-full rounded-lg px-3 py-2 bg-background border border-border text-foreground text-[13px] leading-relaxed
                     focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/20 transition-colors resize-none"
          rows={3}
          autoFocus
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => updateMutation.mutate(editText.trim())}
            disabled={updateMutation.isPending || !editText.trim()}
            className="p-1.5 rounded-md text-success hover:bg-success-soft transition-colors disabled:opacity-50"
          >
            {updateMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          </button>
          <button
            onClick={() => { setEditing(false); setEditText(fact.fact); }}
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group rounded-lg bg-card px-4 py-3 hover:bg-card-elevated transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-semibold text-muted-light tabular-nums tracking-[0.15em]">
            F{fact.originalId}
          </span>
          <p className="font-serif italic text-[13px] text-foreground leading-relaxed m-0 mt-0.5">
            {fact.fact}
          </p>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Edit fact"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-danger hover:bg-danger/5 transition-colors"
            title="Delete fact"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Summary Item ───────────────────────────────────────────────────────────

function SummaryItem({ summary, slug, itemId, onSuccess }: {
  summary: { id: number; text: string[]; relatedFactIds: number[] };
  slug: string;
  itemId: number;
  onSuccess: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/brainlifts/${slug}/knowledge-tree/items/${itemId}/summaries/${summary.id}`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (!res.ok) throw new Error('Failed to delete summary');
      return res.json();
    },
    onSuccess: () => {
      setConfirmDelete(false);
      onSuccess();
    },
  });

  if (confirmDelete) {
    return (
      <div className="rounded-lg bg-danger/5 px-4 py-3">
        <p className="text-[12px] text-foreground m-0 mb-2">Delete this summary?</p>
        <div className="flex items-center gap-2">
          <TactileButton
            variant="raised"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="text-[11px] px-3 py-1.5"
          >
            {deleteMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : 'Delete'}
          </TactileButton>
          <TactileButton
            variant="inset"
            onClick={() => setConfirmDelete(false)}
            className="text-[11px] px-3 py-1.5"
          >
            Cancel
          </TactileButton>
        </div>
      </div>
    );
  }

  return (
    <div className="group rounded-lg bg-card px-4 py-3 hover:bg-card-elevated transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <ul className="m-0 pl-4 space-y-1">
            {summary.text.map((point, idx) => (
              <li key={idx} className="font-serif italic text-[13px] text-foreground leading-relaxed">
                {point}
              </li>
            ))}
          </ul>
          {summary.relatedFactIds.length > 0 && (
            <p className="text-[10px] text-muted-light mt-1.5 m-0 tracking-[0.15em]">
              Based on {summary.relatedFactIds.length} fact{summary.relatedFactIds.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-danger hover:bg-danger/5 transition-colors"
            title="Delete summary"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Fact Form ──────────────────────────────────────────────────────────

function AddFactForm({ slug, itemId, onSuccess, autoFocus }: {
  slug: string;
  itemId: number;
  onSuccess: () => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState('');
  const [showInput, setShowInput] = useState(autoFocus ?? false);

  const mutation = useMutation({
    mutationFn: async (fact: string) => {
      const res = await fetch(
        `/api/brainlifts/${slug}/knowledge-tree/items/${itemId}/facts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fact }),
          credentials: 'include',
        }
      );
      if (!res.ok) throw new Error('Failed to add fact');
      return res.json();
    },
    onSuccess: () => {
      setText('');
      setShowInput(false);
      onSuccess();
    },
  });

  if (!showInput) {
    return (
      <button
        onClick={() => setShowInput(true)}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground
                   bg-transparent border-none cursor-pointer transition-colors px-0 py-1"
      >
        <Plus size={12} />
        Add Fact
      </button>
    );
  }

  return (
    <div className="rounded-lg bg-card px-4 py-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a fact from this source..."
        className="w-full rounded-lg px-3 py-2 bg-background border border-border text-foreground font-serif italic text-[13px] leading-relaxed
                   focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/20 transition-colors resize-none"
        rows={2}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && text.trim()) {
            e.preventDefault();
            mutation.mutate(text.trim());
          }
          if (e.key === 'Escape') {
            setText('');
            setShowInput(false);
          }
        }}
      />
      <div className="flex items-center gap-2 mt-2">
        <TactileButton
          variant="raised"
          onClick={() => mutation.mutate(text.trim())}
          disabled={mutation.isPending || !text.trim()}
          className="text-[11px] px-3 py-1.5 flex items-center gap-1.5"
        >
          {mutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
          Save Fact
        </TactileButton>
        <TactileButton
          variant="inset"
          onClick={() => { setText(''); setShowInput(false); }}
          className="text-[11px] px-3 py-1.5"
        >
          Cancel
        </TactileButton>
      </div>
    </div>
  );
}

// ─── Add Summary Form ───────────────────────────────────────────────────────

function AddSummaryForm({ slug, itemId, facts, onSuccess, autoFocus }: {
  slug: string;
  itemId: number;
  facts: Array<{ id: number }>;
  onSuccess: () => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState('');
  const [showInput, setShowInput] = useState(autoFocus ?? false);

  const mutation = useMutation({
    mutationFn: async (summaryText: string) => {
      const res = await fetch(
        `/api/brainlifts/${slug}/knowledge-tree/items/${itemId}/summaries`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summaryPoints: [summaryText],
            relatedFactIds: facts.map(f => f.id),
          }),
          credentials: 'include',
        }
      );
      if (!res.ok) throw new Error('Failed to add summary');
      return res.json();
    },
    onSuccess: () => {
      setText('');
      setShowInput(false);
      onSuccess();
    },
  });

  if (!showInput) {
    return (
      <button
        onClick={() => setShowInput(true)}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground
                   bg-transparent border-none cursor-pointer transition-colors px-0 py-1"
      >
        <Plus size={12} />
        Add Summary
      </button>
    );
  }

  return (
    <div className="rounded-lg bg-card px-4 py-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write your synthesis of the source material..."
        className="w-full rounded-lg px-3 py-2 bg-background border border-border text-foreground font-serif italic text-[13px] leading-relaxed
                   focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/20 transition-colors resize-none"
        rows={3}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setText('');
            setShowInput(false);
          }
        }}
      />
      <div className="flex items-center gap-2 mt-2">
        <TactileButton
          variant="raised"
          onClick={() => mutation.mutate(text.trim())}
          disabled={mutation.isPending || !text.trim()}
          className="text-[11px] px-3 py-1.5 flex items-center gap-1.5"
        >
          {mutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
          Save Summary
        </TactileButton>
        <TactileButton
          variant="inset"
          onClick={() => { setText(''); setShowInput(false); }}
          className="text-[11px] px-3 py-1.5"
        >
          Cancel
        </TactileButton>
      </div>
    </div>
  );
}

// ─── Section Empty Prompt ────────────────────────────────────────────────────

function SectionEmptyPrompt({ icon: Icon, message }: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  message: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-primary/5 px-4 py-3">
      <Icon size={16} className="text-muted-light shrink-0" />
      <p className="font-serif italic text-[13px] text-muted-foreground leading-relaxed m-0">
        {message}
      </p>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ManualTab({ slug, item, facts, summaries, onMutationSuccess }: ManualTabProps) {
  const hasFacts = facts.length > 0;
  const hasSummaries = summaries.length > 0;
  const isEmpty = !hasFacts && !hasSummaries;

  return (
    <div className="flex flex-col h-full px-4 py-5 overflow-y-auto">
      {/* DOK1 Facts — always visible */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
              DOK1 Facts
            </span>
            {hasFacts && (
              <span className="px-[6px] py-[1px] rounded bg-muted text-muted-foreground text-[9px] uppercase tracking-[0.25em] font-semibold tabular-nums">
                {facts.length}
              </span>
            )}
          </div>
        </div>

        {!hasFacts && (
          <SectionEmptyPrompt
            icon={BookOpen}
            message="Read through the source, then add the key facts you find."
          />
        )}

        {hasFacts && (
          <div className="space-y-2">
            {facts.map((fact) => (
              <FactItem
                key={fact.id}
                fact={fact}
                slug={slug}
                itemId={item.id}
                onSuccess={onMutationSuccess}
              />
            ))}
          </div>
        )}

        <div className="mt-3">
          <AddFactForm
            slug={slug}
            itemId={item.id}
            onSuccess={onMutationSuccess}
            autoFocus={isEmpty}
          />
        </div>
      </div>

      {/* Separator */}
      <hr className="border-t border-border mb-8 mt-0" />

      {/* DOK2 Summaries — always visible */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
              DOK2 Summaries
            </span>
            {hasSummaries && (
              <span className="px-[6px] py-[1px] rounded bg-muted text-muted-foreground text-[9px] uppercase tracking-[0.25em] font-semibold tabular-nums">
                {summaries.length}
              </span>
            )}
          </div>
        </div>

        {!hasSummaries && (
          <SectionEmptyPrompt
            icon={FileText}
            message={hasFacts
              ? "Synthesize the facts above into a summary."
              : "Summaries synthesize your facts into broader takeaways."
            }
          />
        )}

        {hasSummaries && (
          <div className="space-y-2">
            {summaries.map((summary) => (
              <SummaryItem
                key={summary.id}
                summary={summary}
                slug={slug}
                itemId={item.id}
                onSuccess={onMutationSuccess}
              />
            ))}
          </div>
        )}

        <div className="mt-3">
          <AddSummaryForm
            slug={slug}
            itemId={item.id}
            facts={facts}
            onSuccess={onMutationSuccess}
          />
        </div>
      </div>
    </div>
  );
}
