import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ExternalLink, Globe, Link2, Plus, X } from 'lucide-react';
import {
  RETRIEVAL_TYPE_META,
  resolveRetrievalType,
} from '@/components/research-stream/retrieval-meta';
import { TactileButton } from '@/components/ui/tactile-button';
import { config } from '@/brand';
import type { WizardPersona } from '@/brand/types';
import { useStarterPack } from '@/hooks/useStarterPack';
import type { LearningStreamItem } from '@/hooks/useLearningStream';
import { ThinkingLine, PackItemSkeletons } from './loading-states';

interface ResourcesStepProps {
  slug?: string;
  /**
   * Finish the wizard: fires POST complete, then hands off to the Second
   * Brain tab (2026-06-11 amendment — Resources is the last step; the
   * success beat is the SetupCompleteModal on the landing page).
   */
  onNext: () => void;
  /** completeOnboarding in flight — disables Finish, shows the busy label. */
  isFinishing: boolean;
  /**
   * Optimistically promoted pack-item ids, lifted to the page so this step
   * and the rail re-render in the same commit (the shared-layoutId fly
   * depends on that — see OnboardingWizard).
   */
  promotedIds: number[];
}

/**
 * Wizard step 6 — Resources (screen5 restyle). Main column: an "Add resources"
 * heading + paste-links input + the Added list (pasted manual items and
 * promoted pack items). Right rail: the brand persona header + the
 * starter-pack section (in-flight progress while running; once ready, pack
 * items stagger in un-added with an opt-in "Add" button).
 *
 * Consumption model (2026-06-11 correction): every pack item is retained as a
 * `pending` Learning Stream item if the student does nothing — inaction
 * discards nothing, and there is no decline control. Clicking Add promotes
 * the item via the existing bookmark mirror (uncategorized `sources` row,
 * item status → `bookmarked`) and the card FLIES from the rail to the main
 * Added list — the same shared-layoutId pattern as the scope steps' chips
 * (promotion is optimistic in the hook so the flight starts on click).
 *
 * Mock delta: the drag-and-drop file upload area is OMITTED (local file upload
 * is increment F1, a feature non-goal).
 */
export function ResourcesStep({ slug, onNext, isFinishing, promotedIds }: ResourcesStepProps) {
  const { packItems, manualItems, addResource, isAdding } = useStarterPack(slug);
  const [draft, setDraft] = useState('');
  const [duplicateUrl, setDuplicateUrl] = useState<string | null>(null);

  // Promoted pack items land in the main Added list (their rail card flies
  // over via the shared layoutId). `promotedIds` is the page-level optimistic
  // signal (same-commit with the rail); `status === 'bookmarked'` is the
  // server truth after refetch/resume.
  const promotedPack = packItems.filter(
    (it) => it.status === 'bookmarked' || promotedIds.includes(it.id),
  );

  const submit = async () => {
    const url = draft.trim();
    if (url.length === 0 || isAdding) return;
    try {
      const result = await addResource(url);
      setDuplicateUrl(result.duplicate ? result.item.url : null);
      setDraft('');
    } catch {
      // Tracked by react-query; keep the draft so the student can retry.
    }
  };

  return (
    <div className="flex flex-1 flex-col max-w-[760px]">
      <h2 className="text-[28px] font-bold tracking-tight leading-[1.1] m-0">Add resources</h2>
      <p className="font-serif italic text-[15px] text-muted-foreground m-0 mt-3 max-w-[520px]">
        Add any learning material you have — articles, links. Start with 3-5 to give your BrainLift a
        foundation.
      </p>

      {/* Paste-links input */}
      <div className="mt-10 max-w-[520px]">
        <div className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 shadow-card">
          <Link2 size={16} className="shrink-0 text-muted-light" />
          <input
            data-testid="input-paste-link"
            type="url"
            value={draft}
            placeholder="Paste a link"
            onChange={(e) => {
              setDraft(e.target.value);
              setDuplicateUrl(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
            className="flex-1 bg-transparent border-0 text-[15px] text-foreground focus:outline-none placeholder:text-muted-light"
          />
          <button
            type="button"
            aria-label="Add link"
            data-testid="button-add-link"
            disabled={isAdding}
            onClick={() => void submit()}
            className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            <Plus size={18} />
          </button>
        </div>
        {duplicateUrl && (
          <p
            data-testid="resources-duplicate-note"
            className="m-0 mt-2 font-serif italic text-[13px] text-muted-light"
          >
            Already added — that link is already in your resources.
          </p>
        )}
      </div>

      {/* Added list: pasted manual items + promoted pack items */}
      {(manualItems.length > 0 || promotedPack.length > 0) && (
        <div className="mt-8 flex flex-col gap-3 max-w-[520px]" data-testid="resources-added-list">
          <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Added
          </span>
          {manualItems.map((item) => (
            <ManualResourceRow key={item.id} item={item} slug={slug} />
          ))}
          {promotedPack.map((item) => (
            <ResourceCard
              key={item.id}
              item={item}
              layoutId={packCardLayoutId(item.id)}
              testId="pack-item-added"
              trailing={
                <span className="inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  <Check size={12} strokeWidth={2.6} />
                  Added
                </span>
              }
            />
          ))}
        </div>
      )}

      {/* Finish — last wizard step: completes onboarding and hands off */}
      <div className="mt-auto pt-8">
        <TactileButton
          variant="raised"
          data-testid="button-confirm-resources"
          disabled={isFinishing}
          onClick={onNext}
          className="text-[12px] uppercase tracking-[0.25em] px-8 py-3"
        >
          {isFinishing ? 'Finishing…' : 'Finish'}
        </TactileButton>
      </div>
    </div>
  );
}

// ─── Shared item card ──────────────────────────────────────────────────────

/**
 * Canonical source-type badge meta — the same icon/color set the Second Brain
 * source cards use (resolveRetrievalType handles free-text variants).
 */
function metaFor(type: string | null | undefined) {
  const resolved = resolveRetrievalType(type);
  return resolved ? RETRIEVAL_TYPE_META[resolved] : null;
}

const packSpring = { type: 'spring', duration: 0.45, bounce: 0 } as const;

/** Shared-layout id linking a rail pack card to its Added-list twin. */
const packCardLayoutId = (itemId: number) => `pack-item-${itemId}`;

/**
 * One resource card (type icon, title, subline, trailing control), shared by
 * the rail's pack items, the promoted Added-list twins, and pasted manual
 * rows. `layoutId` pairs rail/list twins for the fly-across; `entrance`
 * opts into the rail's staggered pop-in.
 */
function ResourceCard({
  item,
  trailing,
  subline,
  layoutId,
  entrance = false,
  testId = 'resource-item',
}: {
  item: LearningStreamItem;
  trailing: ReactNode;
  /** Custom subline (e.g. the manual rows' fetching state); defaults to author · type. */
  subline?: ReactNode;
  layoutId?: string;
  entrance?: boolean;
  testId?: string;
}) {
  const meta = metaFor(item.type);
  const typeLabel = meta?.label ?? item.type;
  return (
    <motion.div
      layout
      layoutId={layoutId}
      initial={entrance ? { opacity: 0, y: 10, scale: 0.95 } : false}
      animate={entrance ? { opacity: 1, y: 0, scale: 1 } : undefined}
      transition={packSpring}
      data-testid={testId}
      className="flex items-center gap-3 rounded-xl bg-card-elevated p-2.5 shadow-card"
    >
      {meta ? (
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: meta.bg }}
        >
          <meta.icon size={18} style={{ color: meta.ink }} />
        </span>
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sidebar">
          <Globe size={18} className="text-muted-foreground" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[13px] font-semibold leading-snug text-foreground line-clamp-2">
          {item.topic === item.url ? hostnameOf(item.url) : item.topic}
        </p>
        <span className="mt-0.5 block truncate text-[11px] text-muted-light">
          {subline ?? (
            <>
              {item.author}
              {item.author && typeLabel ? ' · ' : ''}
              {typeLabel}
            </>
          )}
        </span>
      </div>
      {trailing}
    </motion.div>
  );
}

/** Display fallback while a pasted item's title is still the raw URL. */
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * A pasted manual item with a remove (discard) control. Items are inserted
 * with placeholders (URL as title) that the extraction job backfills; until
 * then the card shows the hostname with a quiet "Fetching details" line (the
 * hook polls while extraction pends).
 */
function ManualResourceRow({ item, slug }: { item: LearningStreamItem; slug?: string }) {
  const { decline, isDeclining } = useStarterPack(slug);
  const awaitingDetails = item.extractedContent == null;
  return (
    <ResourceCard
      item={item}
      subline={
        awaitingDetails ? (
          <span className="italic" data-testid="resource-item-fetching">
            Fetching details…
          </span>
        ) : undefined
      }
      trailing={
        <button
          type="button"
          aria-label="Remove resource"
          data-testid="button-decline-resource"
          disabled={isDeclining}
          onClick={() => void decline(item.id)}
          className="shrink-0 text-muted-light transition-colors hover:text-muted-foreground disabled:opacity-40"
        >
          <X size={15} />
        </button>
      }
    />
  );
}

// ─── Starter-pack rail ─────────────────────────────────────────────────────

const VISIBLE_COUNT = 4;
const ROTATION_INTERVAL = 4500;

/**
 * Rail for step 6: persona header + the starter-pack section. Shows up to 4
 * items at a time in a windowed carousel. Auto-cycles every ROTATION_INTERVAL ms.
 * Clicking Add or the external-link pauses auto-cycling; the window then becomes
 * scroll-driven (mouse wheel advances/retreats items with directional animations).
 * No native scroll container or scrollbar ever appears.
 */
export function ResourcesStepRail({
  slug,
  promotedIds,
  onPromote,
}: {
  slug: string | undefined;
  /** Page-level optimistic promoted ids (same-commit with the step's list). */
  promotedIds: number[];
  /** Page-level promote handler (optimistic setState + the bookmark PATCH). */
  onPromote: (itemId: number) => void;
}) {
  const { status, packItems } = useStarterPack(slug);
  const persona: WizardPersona = config.wizardPersona;
  const { Mascot } = persona;

  // Accumulated items (stable order, grows as swarm delivers).
  const [displayItems, setDisplayItems] = useState<LearningStreamItem[]>([]);
  useEffect(() => {
    setDisplayItems((prev) => {
      const known = new Set(prev.map((p) => p.id));
      const added = packItems.filter((p) => !known.has(p.id));
      return added.length ? [...prev, ...added] : prev;
    });
  }, [packItems]);

  // Stagger: reveal the initial window one card at a time (hard cap at VISIBLE_COUNT).
  // Cards beyond the window join the cycling pool silently.
  const [revealed, setRevealed] = useState(0);
  useEffect(() => {
    if (revealed >= VISIBLE_COUNT) return;
    if (revealed >= displayItems.length) return;
    const t = setTimeout(() => setRevealed((r) => r + 1), 110);
    return () => clearTimeout(t);
  }, [revealed, displayItems.length]);

  // Cycling / scroll state.
  const [startIndex, setStartIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1); // 1=forward/down, -1=backward/up
  const [cyclingPaused, setCyclingPaused] = useState(false);

  // Live lookup for freshest fields (extraction backfill, status changes).
  const liveById = new Map(packItems.map((it) => [it.id, it]));

  // Full cycling pool: all non-promoted displayItems.
  const nonPromotedItems = displayItems
    .map((item) => liveById.get(item.id) ?? item)
    .filter((item) => item.status !== 'bookmarked' && !promotedIds.includes(item.id));

  const windowSize = Math.min(VISIBLE_COUNT, nonPromotedItems.length);

  // Keep the pool size fresh inside the wheel handler without stale closure.
  const nonPromotedCountRef = useRef(0);
  nonPromotedCountRef.current = nonPromotedItems.length;

  // Scroll-wheel: always active (does not pause cycling — clicking does that).
  // Attached to the always-mounted rail div so the listener is live on mount.
  const railRef = useRef<HTMLDivElement>(null);
  const wheelAccumRef = useRef(0);
  const lastAdvanceRef = useRef(0);
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const total = nonPromotedCountRef.current;
      if (total <= VISIBLE_COUNT) return;
      e.preventDefault();
      wheelAccumRef.current += e.deltaY;
      const now = Date.now();
      if (Math.abs(wheelAccumRef.current) >= 40 && now - lastAdvanceRef.current > 180) {
        const dir = (wheelAccumRef.current > 0 ? 1 : -1) as 1 | -1;
        setDirection(dir);
        setStartIndex((i) => (i + dir + total) % total);
        wheelAccumRef.current = 0;
        lastAdvanceRef.current = now;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Auto-rotation: advances forward when stagger is done and pool is larger than window.
  useEffect(() => {
    if (cyclingPaused || nonPromotedItems.length <= VISIBLE_COUNT || revealed < windowSize) return;
    const t = setInterval(() => {
      setDirection(1);
      setStartIndex((i) => i + 1);
    }, ROTATION_INTERVAL);
    return () => clearInterval(t);
  }, [cyclingPaused, nonPromotedItems.length, revealed, windowSize]);

  // Windowed slice (wrapping). Always 4 items — scroll and cycling both drive this.
  const visibleCards =
    nonPromotedItems.length === 0
      ? []
      : Array.from(
          { length: windowSize },
          (_, i) => nonPromotedItems[(startIndex + i) % nonPromotedItems.length],
        );

  const allPromoted =
    displayItems.length > 0 && revealed >= windowSize && nonPromotedItems.length === 0;

  const pauseCycling = () => setCyclingPaused(true);

  // Direction-aware enter/exit: new items slide in from the direction of travel,
  // departing items exit the opposite way.
  const enterY = direction * 14;
  const exitY = -direction * 36;

  return (
    <div ref={railRef} className="flex h-full w-full flex-col px-8 py-6" data-testid="resources-rail">
      {/* Persona header */}
      <div className="flex items-center gap-3">
        {Mascot ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-card shadow-card">
            <Mascot className="h-full w-full object-contain" />
          </span>
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground shadow-card">
            {persona.name.slice(0, 2)}
          </span>
        )}
        <span className="text-[15px] font-bold text-foreground" data-testid="persona-name">
          {persona.name}
        </span>
      </div>

      {/* Starter-pack section */}
      <div className="mt-auto pt-10" data-testid="starter-pack-section">
        <motion.h3
          layout="position"
          transition={packSpring}
          className="m-0 text-[18px] font-bold leading-tight text-foreground"
        >
          No material? Try this starter pack
        </motion.h3>
        <motion.p
          layout="position"
          transition={packSpring}
          className="m-0 mt-1 font-serif text-[14px] italic text-muted-foreground"
        >
          Scroll for more resources to get you started
        </motion.p>

        {status === 'running' && displayItems.length === 0 ? (
          <div className="mt-5 space-y-4">
            <ThinkingLine message="Gathering a few starting points" data-testid="starter-pack-progress" />
            <PackItemSkeletons />
          </div>
        ) : allPromoted ? (
          <p
            data-testid="starter-pack-all-added"
            className="m-0 mt-5 font-serif text-[14px] italic text-muted-light"
          >
            All added to your resources.
          </p>
        ) : displayItems.length > 0 ? (
          // Single windowed carousel — auto-cycles; scroll wheel always drives it too.
          <div
            className="relative mt-5 flex flex-col gap-2.5 overflow-hidden"
            data-testid="starter-pack-items"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {visibleCards.slice(0, revealed).map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: enterY }}
                  animate={{ opacity: 1, y: 0, transition: { type: 'tween', duration: 0.32, ease: 'easeOut' } }}
                  exit={{ opacity: 0, y: exitY, transition: { type: 'tween', duration: 0.2, ease: 'easeIn' } }}
                >
                  <ResourceCard
                    item={item}
                    layoutId={packCardLayoutId(item.id)}
                    entrance={false}
                    testId="starter-pack-item"
                    trailing={
                      <span className="flex shrink-0 items-center gap-1">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open ${item.topic} in a new tab`}
                          data-testid="link-open-pack-item"
                          onClick={pauseCycling}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-light transition-colors hover:text-foreground"
                        >
                          <ExternalLink size={14} />
                        </a>
                        <TactileButton
                          variant="raised"
                          data-testid="button-promote-pack-item"
                          aria-label={`Add ${item.topic} to your Second Brain`}
                          onClick={() => { pauseCycling(); onPromote(item.id); }}
                          className="shrink-0 text-[10px] uppercase tracking-[0.15em] px-3 py-1.5"
                        >
                          Add
                        </TactileButton>
                      </span>
                    }
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <p
            data-testid="starter-pack-empty"
            className="m-0 mt-5 font-serif text-[14px] italic text-muted-light"
          >
            Nothing to suggest yet — paste your own links to get started.
          </p>
        )}
      </div>
    </div>
  );
}
