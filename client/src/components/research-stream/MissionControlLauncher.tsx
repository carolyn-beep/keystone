import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  AlertCircle,
  ChevronDown,
  Combine,
  Globe,
  GraduationCap,
  Headphones,
  LayoutGrid,
  Loader2,
  Mic,
  Minus,
  Pencil,
  Plus,
  Rocket,
  SlidersHorizontal,
  UserCog,
  Users,
  Video,
  Zap,
} from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import { useRunSpecEditor, type Preset } from '@/hooks/useRunSpecEditor';
import { useLaunchResearchStream, LaunchError } from '@/hooks/useLaunchResearchStream';
import { MAX_SLOTS, RETRIEVAL_TYPES, type RetrievalType, type RunRequest } from '@shared/research-stream';
import { cn } from '@/lib/utils';
import { brand } from '@/brand';
import { RETRIEVAL_TYPE_META, PREVIEW_SLOTS } from './retrieval-meta';
import researchApparatusImg from '@/assets/textures/research_apparatus.webp';

// --- Public API ---

export interface SwarmQuota {
  used: number;
  limit: number;
  remaining: number;
}

export interface MissionControlLauncherProps {
  slug: string;
  swarmQuota?: SwarmQuota | null;
  /** Called on successful launch with the new runId. */
  onLaunched: (runId: number) => void;
  onLaunchStarted?: () => void;
  onLaunchSettled?: () => void;
  onLaunchFailed?: () => void;
  initialRunRequest?: RunRequest | null;
  initiallyExpanded?: boolean;
}

// --- Catalog data ---

interface PresetMeta {
  id: Preset;
  label: string;
  sublabel: string;
  Icon: typeof Combine;
  /** Pastel bg + ink color used by the mode card and active ring. */
  bg: string;
  ink: string;
  /** Italic serif copy that appears in the right-rail brief when active. */
  brief: string;
}

const PRESETS: ReadonlyArray<PresetMeta> = [
  {
    id: 'mixed',
    label: 'Mixed',
    sublabel: 'Recommended',
    Icon: Combine,
    bg: 'var(--primary-soft-hex)',
    ink: 'var(--primary-hex)',
    brief:
      'A balanced cross-format sweep. Each agent owns one medium so you triangulate from podcasts, papers, video, newsletters, and news in parallel.',
  },
  {
    id: 'all-podcasts',
    label: 'All Podcasts',
    sublabel: 'Audio first',
    Icon: Mic,
    bg: 'var(--podcast-soft-hex)',
    ink: 'var(--podcast-hex)',
    brief:
      'Five podcast agents hunt for conversational interviews, transcripts, and episode notes. Best for soft-skill topics, debates, and the zeitgeist around your subject.',
  },
  {
    id: 'all-academic',
    label: 'All Academic',
    sublabel: 'Papers only',
    Icon: GraduationCap,
    bg: 'var(--success-soft-hex)',
    ink: 'var(--success-hex)',
    brief:
      'Rigor over speed. Five academic agents pull peer-reviewed papers, preprints, and working drafts. Best for foundational arguments and primary research.',
  },
  {
    id: 'all-video',
    label: 'All Video',
    sublabel: 'Long-form',
    Icon: Video,
    bg: 'var(--danger-soft-hex)',
    ink: 'var(--danger-hex)',
    brief:
      'Long-form context and demos. Five video agents look for keynotes, lectures, and channel deep dives. Best when authors explain themselves on camera.',
  },
  {
    id: 'watch-listen',
    label: 'Watch & Listen',
    sublabel: 'No reading',
    Icon: Headphones,
    bg: 'var(--info-soft-hex)',
    ink: 'var(--info-hex)',
    brief:
      'Zero reading required. Three podcast agents and two video agents work in parallel, ideal for commutes, workouts, and hands-busy absorption.',
  },
];

// --- Main component ---

export function MissionControlLauncher({
  slug,
  swarmQuota,
  onLaunched,
  onLaunchStarted,
  onLaunchSettled,
  onLaunchFailed,
  initialRunRequest,
  initiallyExpanded = false,
}: MissionControlLauncherProps): JSX.Element {
  const editor = useRunSpecEditor({ seed: initialRunRequest ?? undefined });
  const { launch, isLaunching, error } = useLaunchResearchStream(slug);
  const [expanded, setExpanded] = useState<boolean>(initiallyExpanded);
  const [activePreset, setActivePreset] = useState<Preset | null>(null);
  const hasInitialRunRequest = initialRunRequest != null;

  const isAtLimit = swarmQuota?.remaining === 0;
  const launchDisabled = isAtLimit || isLaunching || !editor.isValid;
  const launchError = error as LaunchError | null;

  const handleLaunch = useCallback(async () => {
    onLaunchStarted?.();
    try {
      const result = await launch(editor.toRunRequest());
      onLaunched(result.runId);
    } catch {
      // surfaced via `error`
      onLaunchFailed?.();
    } finally {
      onLaunchSettled?.();
    }
  }, [launch, editor, onLaunched, onLaunchStarted, onLaunchSettled, onLaunchFailed]);

  const handlePreset = useCallback(
    (p: Preset) => {
      editor.applyPreset(p);
      setActivePreset(p);
    },
    [editor],
  );

  // Auto-pick Mixed the first time the user opens the configure panel.
  // Only fires once; if the user has already chosen a preset or manually set
  // any slot type, we leave their choice alone.
  const hasAutoPickedRef = useRef(false);
  useEffect(() => {
    if (!expanded || hasAutoPickedRef.current) return;
    const hasAnyChoice = hasInitialRunRequest || activePreset !== null || editor.slots.some((s) => s.type);
    if (!hasAnyChoice) {
      editor.applyPreset('mixed');
      setActivePreset('mixed');
    }
    hasAutoPickedRef.current = true;
  }, [expanded, activePreset, editor, hasInitialRunRequest]);

  return (
    <LayoutGroup>
      <div className="relative">
        <AnimatePresence mode="wait" initial={false}>
          {expanded ? (
            <ExpandedView
              key="expanded"
              editor={editor}
              activePreset={activePreset}
              onPreset={handlePreset}
              onLaunch={handleLaunch}
              isLaunching={isLaunching}
              launchDisabled={launchDisabled}
              isAtLimit={isAtLimit}
              swarmQuota={swarmQuota}
              launchError={launchError}
            />
          ) : (
            <CompactView
              key="compact"
              onExpand={() => setExpanded(true)}
              onLaunch={handleLaunch}
              isLaunching={isLaunching}
              launchDisabled={launchDisabled}
              isAtLimit={isAtLimit}
              swarmQuota={swarmQuota}
              launchError={launchError}
            />
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}

// --- Compact (default) view ---

interface CompactViewProps {
  onExpand: () => void;
  onLaunch: () => void;
  isLaunching: boolean;
  launchDisabled: boolean;
  isAtLimit: boolean;
  swarmQuota?: SwarmQuota | null;
  launchError: LaunchError | null;
}

function CompactView({
  onExpand,
  onLaunch,
  isLaunching,
  launchDisabled,
  isAtLimit,
  swarmQuota,
  launchError,
}: CompactViewProps): JSX.Element {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="relative px-1 py-4"
      aria-label="Research swarm launcher"
    >
      {/* Daily-limit signal */}
      {isAtLimit && (
        <div className="flex justify-center mb-6">
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.35em] font-semibold text-warning">
            <span className="w-1.5 h-1.5 rounded-full bg-warning" aria-hidden />
            Daily Limit Reached
          </span>
        </div>
      )}

      {/* Two-card hero */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <AutoOrchestrateCard
          onLaunch={onLaunch}
          isLaunching={isLaunching}
          launchDisabled={launchDisabled}
          isAtLimit={isAtLimit}
        />
        <BuildYourOwnCard onCustomize={onExpand} disabled={isAtLimit} />
      </div>

      {/* Sequence explainer */}
      <LaunchSequence />

      {/* Quota strip */}
      {swarmQuota && (
        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.3em] font-semibold text-muted-light tabular-nums">
          {swarmQuota.used} / {swarmQuota.limit} runs today
        </p>
      )}

      {/* Error */}
      {launchError && (
        <div className="mt-6 max-w-lg mx-auto">
          <ErrorMessage error={launchError} />
        </div>
      )}
    </motion.section>
  );
}

// --- Compact-view cards ---

interface AutoOrchestrateCardProps {
  onLaunch: () => void;
  isLaunching: boolean;
  launchDisabled: boolean;
  isAtLimit: boolean;
}

function AutoOrchestrateCard({
  onLaunch,
  isLaunching,
  launchDisabled,
  isAtLimit,
}: AutoOrchestrateCardProps) {
  return (
    <div className="relative bg-card-elevated shadow-card rounded-xl px-8 py-7 flex flex-col h-full">
      {/* Recommended badge — absolutely positioned so it sits at top-left
          without consuming a layout row; the title row stays centered. */}
      <div className="absolute top-7 left-8">
        <RecommendedBadge />
      </div>

      {/* Header (fixed): title + descriptor */}
      <div>
        <h3 className="font-serif text-[28px] text-foreground text-center leading-tight mb-2">
          Auto Orchestrate
        </h3>
        <p className="font-serif italic text-[13px] text-muted-foreground text-center max-w-sm mx-auto leading-relaxed">
          Let {brand.config.productName} assemble a balanced swarm for your topic. We'll select the right mix of sources, automatically.
        </p>
      </div>

      {/* Variable middle (flex-1): orbital preview, centered */}
      <div className="flex-1 flex items-center justify-center py-4">
        <OrbitVisualization slots={PREVIEW_SLOTS} />
      </div>

      {/* Footer (fixed): chips + button + helper */}
      <div>
        <div className="flex flex-wrap items-center justify-center gap-2 mb-5">
          <StatChip Icon={Users} label="5 Agents" />
          <StatChip Icon={LayoutGrid} label="Cross-format" />
          <StatChip Icon={Zap} label="Fast start" />
        </div>

        {/* Launch button — shared layoutId with the rail's launch button. */}
        <motion.div layoutId="launcher-launch-button">
          <TactileButton
            variant="raised"
            onClick={onLaunch}
            disabled={launchDisabled}
            className="w-full flex items-center justify-center gap-2 px-5 py-3.5 text-[13px] uppercase tracking-[0.25em] font-semibold"
          >
            {isLaunching ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Launching
              </>
            ) : (
              <>
                <Rocket size={16} />
                Launch Swarm
              </>
            )}
          </TactileButton>
        </motion.div>

        <p className="text-center font-serif italic text-[12px] text-muted-light mt-3">
          {isAtLimit
            ? 'Resets at midnight UTC.'
            : 'Best for broad exploration and quick answers.'}
        </p>
      </div>
    </div>
  );
}

function RecommendedBadge() {
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-[9px] uppercase tracking-[0.3em] font-semibold"
      style={{
        backgroundColor: 'var(--success-soft-hex)',
        color: 'var(--success-hex)',
      }}
    >
      Recommended
    </span>
  );
}

interface BuildYourOwnCardProps {
  onCustomize: () => void;
  disabled: boolean;
}

function BuildYourOwnCard({ onCustomize, disabled }: BuildYourOwnCardProps) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onCustomize}
      disabled={disabled}
      className={cn(
        'group relative bg-card-elevated shadow-card rounded-xl px-8 py-7 text-left flex flex-col w-full h-full transition-shadow',
        disabled ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-card-hover',
      )}
      aria-label="Customize swarm"
    >
      {/* Header (fixed): title + descriptor (matches left card's structure) */}
      <div>
        <h3 className="font-serif text-[28px] text-foreground text-center leading-tight mb-2">
          Build Your Own Swarm
        </h3>
        <p className="font-serif italic text-[13px] text-muted-foreground text-center max-w-sm mx-auto leading-relaxed">
          Choose your sources and guide each agent. More control. More intent.
        </p>
      </div>

      {/* Variable middle (flex-1): slot rows preview, centered.
          Each row carries a shared layoutId so it morphs into the matching
          slot row in the customize panel on transition. */}
      <div className="flex-1 flex items-center py-4">
        <div className="relative space-y-2 w-full">
          <div
            className="absolute left-[14px] top-3 bottom-3 w-px border-l border-dashed border-border"
            aria-hidden
          />
          {PREVIEW_SLOTS.map((slot, idx) => (
            <PreviewSlotRow key={idx} idx={idx} type={slot.type} />
          ))}
        </div>
      </div>

      {/* Footer (fixed): chips + button + helper */}
      <div>
        <div className="flex flex-wrap items-center justify-center gap-2 mb-5">
          <StatChip Icon={SlidersHorizontal} label="Set source types" />
          <StatChip Icon={UserCog} label="Guide each agent" />
          <StatChip Icon={Globe} label="Global guidance" />
        </div>

        {/* Customize button — outlined sibling to the raised Launch button on
            the left card. Visually parallel, semantically different. */}
        <div className="w-full flex items-center justify-center gap-2 px-5 py-3.5 text-[13px] uppercase tracking-[0.25em] font-semibold text-foreground rounded-md border border-border bg-card group-hover:border-primary/40 transition-colors">
          <SlidersHorizontal size={14} />
          Customize Swarm
        </div>

        <p className="text-center font-serif italic text-[12px] text-muted-light mt-3">
          Best for intentional coverage and deep research.
        </p>
      </div>
    </button>
  );
}

interface StatChipProps {
  Icon: typeof Users;
  label: string;
}

function StatChip({ Icon, label }: StatChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-card rounded-full px-2.5 py-1 text-[9px] uppercase tracking-[0.25em] font-semibold text-muted-foreground border border-border">
      <Icon size={11} className="text-muted-foreground" aria-hidden />
      {label}
    </span>
  );
}

// --- Launch sequence (explainer strip) ---

interface SequenceStep {
  title: string;
  body: string;
}

const SEQUENCE_STEPS: ReadonlyArray<SequenceStep> = [
  {
    title: 'Orchestrator scans your project',
    body: "Reads your topic, brainlift, and Second Brain to design a balanced plan.",
  },
  {
    title: 'Agents fan out across source types',
    body: 'Specialized agents search, filter, and score high-signal content in parallel.',
  },
  {
    title: 'Results return as a curated stream',
    body: 'Balanced, deduplicated, and ready for review.',
  },
];

function LaunchSequence() {
  return (
    <section className="mt-5 bg-card-elevated shadow-card rounded-xl px-8 py-7">
      <div className="text-center mb-6">
        <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
          What happens when you launch
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-x-4 gap-y-6">
        {SEQUENCE_STEPS.map((step, idx) => (
          <Fragment key={step.title}>
            <SequenceStepView step={step} />
            {idx < SEQUENCE_STEPS.length - 1 && <SequenceArrow />}
          </Fragment>
        ))}
      </div>
    </section>
  );
}

function SequenceStepView({ step }: { step: SequenceStep }) {
  return (
    <div className="flex flex-col items-center text-center px-4">
      <h4 className="font-serif text-[14px] text-foreground leading-snug mb-1.5">{step.title}</h4>
      <p className="font-serif italic text-[12px] text-muted-foreground leading-relaxed max-w-[220px]">
        {step.body}
      </p>
    </div>
  );
}

function SequenceArrow() {
  return (
    <div className="hidden md:flex items-center justify-center pt-7" aria-hidden>
      <svg width="60" height="8" viewBox="0 0 60 8">
        <line
          x1="0"
          y1="4"
          x2="50"
          y2="4"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 3"
          className="text-muted-light"
        />
        <path
          d="M48 1.5 L55 4 L48 6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-light"
        />
      </svg>
    </div>
  );
}

interface PreviewSlotRowProps {
  idx: number;
  type: RetrievalType;
}

/** Visual twin of the editable SlotRow but read-only. Shares a layoutId
 *  with the real SlotRow so framer-motion morphs the row between compact
 *  (preview) and expanded (editable) positions. */
function PreviewSlotRow({ idx, type }: PreviewSlotRowProps) {
  const meta = RETRIEVAL_TYPE_META[type];
  const Icon = meta.icon;

  return (
    <motion.div
      layoutId={`launcher-slot-row-${idx}`}
      className="relative flex items-center gap-3 pl-12"
    >
      {/* Numbered bubble */}
      <span
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-7 h-7 rounded-full font-serif text-[14px] shadow-card text-foreground"
        style={{ backgroundColor: meta.bg }}
        aria-hidden
      >
        {idx + 1}
      </span>

      {/* Type chip (non-interactive in preview) */}
      <div
        className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 min-w-[160px]"
        style={{ backgroundColor: meta.bg }}
      >
        <Icon size={13} className="shrink-0" style={{ color: meta.ink }} aria-hidden />
        <span
          className="font-sans text-[11px] uppercase tracking-[0.18em] font-semibold flex-1"
          style={{ color: meta.ink }}
        >
          {meta.label}
        </span>
      </div>

      {/* Focus preview — uses the type's hint copy so each row feels like a
          concrete example rather than an empty form field. */}
      <span className="flex-1 min-w-0 font-serif italic text-[13px] text-muted-light truncate border-b border-dashed border-border/70 py-1.5">
        {meta.hint}
      </span>
    </motion.div>
  );
}

// --- Expanded (configure) view ---

interface ExpandedViewProps {
  editor: ReturnType<typeof useRunSpecEditor>;
  activePreset: Preset | null;
  onPreset: (p: Preset) => void;
  onLaunch: () => void;
  isLaunching: boolean;
  launchDisabled: boolean;
  isAtLimit: boolean;
  swarmQuota?: SwarmQuota | null;
  launchError: LaunchError | null;
}

function ExpandedView({
  editor,
  activePreset,
  onPreset,
  onLaunch,
  isLaunching,
  launchDisabled,
  isAtLimit,
  swarmQuota,
  launchError,
}: ExpandedViewProps): JSX.Element {
  // Auto-scroll the configure surface to the top of the viewport on open so
  // the user doesn't need to scroll manually to find the first field.
  const sectionRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    // rAF lets framer-motion's entry animation start first; the scroll
    // happens once the section is mounted and laid out.
    const raf = requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <motion.section
      ref={sectionRef}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="relative py-6 sm:py-8 scroll-mt-4"
      aria-label="Configure research swarm"
    >
      <BackdropDecor faint />

      <div className="relative w-full">

        {/* Two-column layout: config + preview rail */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* LEFT: Configuration */}
          <div className="space-y-5">
            {/* Topic block */}
            <ConfigBlock>
              <BlockLabel>What do you want to research?</BlockLabel>
              <div className="relative">
                <input
                  type="text"
                  value={editor.topic}
                  onChange={(e) => editor.setTopic(e.target.value)}
                  placeholder="Your research topic"
                  maxLength={500}
                  className="w-full font-serif text-[18px] text-foreground bg-transparent border-0 pl-1 py-2 placeholder:text-muted-light placeholder:italic focus:outline-none"
                  aria-label="Research topic"
                />
              </div>
              <p className="font-serif italic text-[12px] text-muted-light mt-2 leading-relaxed">
                Be specific for better results or leave it blank. The Swarm Orchestrator agent will use your project's content to find relevant, high signal sources for you.
              </p>
              {editor.errors.topic && (
                <p className="text-[11px] text-destructive mt-2">{editor.errors.topic}</p>
              )}
            </ConfigBlock>

            {/* Swarm mode picker */}
            <div>
              <BlockLabel className="mb-3 px-1">Choose a swarm mode</BlockLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {PRESETS.map((preset) => (
                  <ModeCard
                    key={preset.id}
                    preset={preset}
                    active={activePreset === preset.id}
                    onClick={() => onPreset(preset.id)}
                  />
                ))}
              </div>
            </div>

            {/* Slot rows */}
            <ConfigBlock>
              <div className="flex items-baseline justify-between mb-3">
                <BlockLabel>Customize your swarm</BlockLabel>
                <span className="font-serif italic text-[11px] text-muted-light">
                  Each slot is one specialized agent.
                </span>
              </div>
              <div className="relative">
                {/* Connector line (decorative) */}
                <div
                  className="absolute left-[14px] top-3 bottom-3 w-px border-l border-dashed border-border"
                  aria-hidden
                />
                <div className="space-y-2">
                  {editor.slots.slice(0, editor.agentCount).map((slot, idx) => (
                    <motion.div key={idx} layoutId={`launcher-slot-row-${idx}`}>
                      <SlotRow
                        idx={idx}
                        type={slot.type}
                        focus={slot.focus ?? ''}
                        error={editor.errors.slots?.[idx]}
                        canRemove={editor.agentCount > 1}
                        onTypeChange={(t) => editor.setSlotType(idx, t)}
                        onFocusChange={(s) => editor.setSlotFocus(idx, s)}
                        onRemove={() => editor.removeAgent(idx)}
                      />
                    </motion.div>
                  ))}
                </div>
                {/* Add-agent affordance */}
                {editor.agentCount < MAX_SLOTS && (
                  <button
                    type="button"
                    onClick={editor.addAgent}
                    className="mt-3 ml-12 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5"
                  >
                    <Plus size={12} />
                    Add agent
                    <span className="text-muted-light/70 tabular-nums">
                      {editor.agentCount} / {MAX_SLOTS}
                    </span>
                  </button>
                )}
              </div>
            </ConfigBlock>

            {/* Global guidance */}
            <ConfigBlock>
              <BlockLabel className="mb-1">Global guidance</BlockLabel>
              <p className="font-serif italic text-[11px] text-muted-light mb-3">
                Applies to all agents. Useful for soft constraints like "lean recent" or "avoid hype".
              </p>
              <textarea
                value={editor.notes}
                onChange={(e) => editor.setNotes(e.target.value)}
                placeholder="Prioritize actionable insights, practical frameworks, real-world examples. Avoid hype and surface-level takes."
                rows={3}
                maxLength={2000}
                className="w-full font-serif italic text-[14px] text-foreground bg-transparent border-0 px-1 py-1 placeholder:text-muted-light placeholder:not-italic focus:outline-none resize-y leading-relaxed"
                aria-label="Global guidance for all agents"
              />
              <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-border">
                {['Lean recent', 'Avoid hype', 'High signal only', 'Practical examples'].map((tag) => (
                  <GuidanceChip
                    key={tag}
                    label={tag}
                    onClick={() => {
                      const current = editor.notes.trim();
                      const next = current ? `${current} ${tag}.` : `${tag}.`;
                      if (next.length <= 2000) editor.setNotes(next);
                    }}
                  />
                ))}
                {editor.notes && (
                  <span className="ml-auto text-[10px] uppercase tracking-[0.25em] font-semibold text-muted-light tabular-nums">
                    {editor.notes.length} / 2000
                  </span>
                )}
              </div>
              {editor.errors.notes && (
                <p className="text-[11px] text-destructive mt-2">{editor.errors.notes}</p>
              )}
            </ConfigBlock>
          </div>

          {/* RIGHT: Preview rail */}
          <PreviewRail
            slots={editor.slots.slice(0, editor.agentCount)}
            activePreset={activePreset}
            onLaunch={onLaunch}
            isLaunching={isLaunching}
            launchDisabled={launchDisabled}
            isAtLimit={isAtLimit}
            swarmQuota={swarmQuota}
            launchError={launchError}
          />
        </div>
      </div>
    </motion.section>
  );
}

// --- Sub-components ---

function BackdropDecor({ faint = false }: { faint?: boolean }) {
  // Image height tracks the section height (auto width keeps proportion).
  // Section min-h drives the image size, so to shrink/grow the apparatus
  // glyph, adjust the section's min-height.
  return (
    <div
      aria-hidden
      className={cn(
        'absolute inset-0 bg-no-repeat bg-center pointer-events-none',
        faint ? 'opacity-[0.02]' : 'opacity-[0.05]',
      )}
      style={{ backgroundImage: `url(${researchApparatusImg})`, backgroundSize: 'auto 100%' }}
    />
  );
}

function ConfigBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card-elevated shadow-card rounded-xl px-5 py-4 sm:px-6 sm:py-5">
      {children}
    </div>
  );
}

function BlockLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'block text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}

interface ModeCardProps {
  preset: PresetMeta;
  active: boolean;
  onClick: () => void;
}

function ModeCard({ preset, active, onClick }: ModeCardProps) {
  const { Icon, bg, ink } = preset;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-lg px-2 py-3 text-center transition-all duration-200',
        active
          ? 'bg-card-elevated shadow-card ring-1 ring-foreground/20'
          : 'bg-card hover:bg-card-elevated hover:shadow-card border border-border',
      )}
    >
      <span
        className="flex items-center justify-center w-8 h-8 rounded-md shrink-0"
        style={{ backgroundColor: bg, color: ink }}
        aria-hidden
      >
        <Icon size={15} />
      </span>
      <span className="font-serif text-[13px] text-foreground leading-tight">
        {preset.label}
      </span>
      <span className="text-[9px] uppercase tracking-[0.25em] font-semibold text-muted-light">
        {preset.sublabel}
      </span>
    </button>
  );
}

interface SlotRowProps {
  idx: number;
  type?: RetrievalType;
  focus: string;
  error?: string;
  canRemove: boolean;
  onTypeChange: (t: RetrievalType) => void;
  onFocusChange: (s: string) => void;
  onRemove: () => void;
}

function SlotRow({ idx, type, focus, error, canRemove, onTypeChange, onFocusChange, onRemove }: SlotRowProps) {
  const meta = type ? RETRIEVAL_TYPE_META[type] : null;
  // Generic placeholder that explains the field, not the type. The type hint
  // already lives in the dropdown picker under each option.
  const placeholder = 'Focus topic for this agent (optional, leave blank if unsure)';

  return (
    <div className="relative flex items-center gap-3 pl-12">
      {/* Slot number bubble (sits on top of the dashed connector) */}
      <span
        className={cn(
          'absolute left-0 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-7 h-7 rounded-full font-serif text-[14px] shadow-card',
          type ? 'text-foreground' : 'bg-card text-muted-light border border-border shadow-none',
        )}
        style={type && meta ? { backgroundColor: meta.bg } : undefined}
        aria-hidden
      >
        {idx + 1}
      </span>

      {/* Type picker (custom popover) */}
      <TypeSelect
        value={type ?? null}
        onChange={onTypeChange}
        ariaLabel={`Slot ${idx + 1} content type`}
      />

      {/* Focus field — clearly editable: dashed underline + pencil affordance.
          The dashed line goes solid + colored on focus. Pencil hides while typing. */}
      <label className="group relative flex-1 min-w-0 flex items-center">
        <input
          type="text"
          value={focus}
          onChange={(e) => onFocusChange(e.target.value)}
          placeholder={placeholder}
          maxLength={500}
          className={cn(
            'w-full font-serif italic text-[13px] text-foreground bg-transparent px-1 py-1.5 pr-6',
            'border-0 border-b border-dashed border-border/70',
            'placeholder:text-muted-light placeholder:italic',
            'focus:outline-none focus:border-solid focus:border-primary/50',
            'hover:border-primary/30 transition-colors',
          )}
          aria-label={`Slot ${idx + 1} focus`}
        />
        {!focus && (
          <Pencil
            size={11}
            aria-hidden
            className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-light pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity"
          />
        )}
      </label>

      {error && (
        <span className="text-[10px] text-destructive shrink-0">{error}</span>
      )}

      {/* Remove-agent button — only when more than one agent remains. */}
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        aria-label={`Remove agent ${idx + 1}`}
        className={cn(
          'shrink-0 flex items-center justify-center w-6 h-6 rounded-md transition-colors',
          canRemove
            ? 'text-muted-light hover:text-destructive hover:bg-destructive/5'
            : 'text-muted-light/30 cursor-not-allowed',
        )}
      >
        <Minus size={13} />
      </button>
    </div>
  );
}

interface TypeSelectProps {
  value: RetrievalType | null;
  onChange: (t: RetrievalType) => void;
  ariaLabel: string;
}

/** Custom dropdown for picking a retrieval type. Uses a popover panel with
 *  icon + label rows. Native <select> looked god awful — this matches the
 *  neo-editorial palette and shows each type in its assigned color. */
function TypeSelect({ value, onChange, ariaLabel }: TypeSelectProps) {
  const [open, setOpen] = useState<boolean>(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const meta = value ? RETRIEVAL_TYPE_META[value] : null;
  const TriggerIcon = meta?.icon;

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex items-center gap-2 rounded-md border px-2.5 py-1.5 min-w-[160px] transition-colors',
          'hover:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/30',
          open ? 'border-primary/40' : 'border-border',
        )}
        style={{ backgroundColor: meta ? meta.bg : 'transparent' }}
      >
        {TriggerIcon && meta ? (
          <TriggerIcon size={13} className="shrink-0" style={{ color: meta.ink }} aria-hidden />
        ) : (
          <span
            className="w-[13px] h-[13px] rounded-full border border-dashed border-muted-light shrink-0"
            aria-hidden
          />
        )}
        <span
          className="font-sans text-[11px] uppercase tracking-[0.18em] font-semibold flex-1 text-left"
          style={{ color: meta ? meta.ink : 'var(--text-primary-hex)' }}
        >
          {meta?.label ?? 'Any'}
        </span>
        <ChevronDown
          size={12}
          className={cn('shrink-0 transition-transform', open && 'rotate-180')}
          style={{ color: meta ? meta.ink : 'var(--text-secondary-hex)', opacity: 0.7 }}
          aria-hidden
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-30 left-0 top-full mt-1.5 w-[220px] bg-card-elevated rounded-lg shadow-card border border-border py-1 overflow-hidden"
        >
          {RETRIEVAL_TYPES.map((t) => {
            const tm = RETRIEVAL_TYPE_META[t];
            const TIcon = tm.icon;
            const isActive = value === t;
            return (
              <li key={t}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    onChange(t);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors',
                    'hover:bg-card',
                    isActive && 'bg-card',
                  )}
                >
                  <span
                    className="flex items-center justify-center w-6 h-6 rounded-md shrink-0"
                    style={{ backgroundColor: tm.bg, color: tm.ink }}
                    aria-hidden
                  >
                    <TIcon size={12} />
                  </span>
                  <span className="flex flex-col min-w-0 flex-1">
                    <span className="font-sans text-[11px] uppercase tracking-[0.18em] font-semibold text-foreground leading-tight">
                      {tm.label}
                    </span>
                    <span className="font-serif italic text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">
                      {tm.hint}
                    </span>
                  </span>
                  {isActive && (
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: tm.ink }}
                      aria-hidden
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function GuidanceChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[10px] uppercase tracking-[0.25em] font-semibold text-muted-foreground bg-card hover:bg-card-elevated hover:text-foreground border border-border rounded-full px-2.5 py-1 transition-colors"
    >
      + {label}
    </button>
  );
}

// --- Preview rail ---

interface PreviewRailProps {
  slots: Array<{ type?: RetrievalType }>;
  activePreset: Preset | null;
  onLaunch: () => void;
  isLaunching: boolean;
  launchDisabled: boolean;
  isAtLimit: boolean;
  swarmQuota?: SwarmQuota | null;
  launchError: LaunchError | null;
}

function PreviewRail({
  slots,
  activePreset,
  onLaunch,
  isLaunching,
  launchDisabled,
  isAtLimit,
  swarmQuota,
  launchError,
}: PreviewRailProps) {
  const stats = useMemo(() => computeSwarmStats(slots), [slots]);
  const presetMeta = activePreset
    ? PRESETS.find((p) => p.id === activePreset) ?? null
    : null;

  return (
    <aside className="lg:sticky lg:top-6 self-start">
      <div className="bg-card-elevated rounded-xl shadow-card p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Swarm Preview
          </span>
        </div>

        {/* Orbital visualization */}
        <OrbitVisualization slots={slots} />

        {/* Stat pair */}
        <div className="grid grid-cols-2 gap-2 mt-5 mb-5">
          <PreviewStat value={stats.agentCount} label="Agents" />
          <PreviewStat value={stats.typeCount} label={stats.typeCount === 1 ? 'Type' : 'Types'} />
        </div>

        <Divider />

        {/* Mode brief */}
        <ModeBrief preset={presetMeta} />

        <Divider />

        {/* Content breakdown */}
        <div className="mt-4 mb-5">
          <span className="block text-[9px] uppercase tracking-[0.3em] font-semibold text-muted-foreground mb-3">
            Content breakdown
          </span>
          <ContentBreakdown distribution={stats.distribution} />
        </div>

        {/* Error */}
        {launchError && (
          <div className="mb-4">
            <ErrorMessage error={launchError} />
          </div>
        )}

        {/* Launch CTA — shared layoutId with the auto-orchestrate card's
            launch button so it morphs between compact and expanded views. */}
        <motion.div layoutId="launcher-launch-button">
          <TactileButton
            variant="raised"
            onClick={onLaunch}
            disabled={launchDisabled}
            className="w-full flex items-center justify-center gap-2 px-5 py-3.5 text-[13px] uppercase tracking-[0.25em] font-semibold"
          >
            {isLaunching ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Launching
              </>
            ) : (
              <>
                <Rocket size={16} />
                Launch Swarm
              </>
            )}
          </TactileButton>
        </motion.div>

        {/* Quota */}
        {swarmQuota && (
          <p className="mt-3 text-center text-[10px] uppercase tracking-[0.3em] font-semibold text-muted-light tabular-nums">
            {swarmQuota.used} / {swarmQuota.limit} runs today
          </p>
        )}
      </div>
    </aside>
  );
}

function Divider() {
  return <div className="h-px bg-border" aria-hidden />;
}

function PreviewStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-card rounded-lg px-3 py-3 text-center">
      <div className="font-serif text-[28px] leading-none text-foreground tabular-nums">{value}</div>
      <div className="mt-1 text-[9px] uppercase tracking-[0.3em] font-semibold text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function ModeBrief({ preset }: { preset: PresetMeta | null }) {
  // No active preset (shouldn't happen since we auto-pick Mixed, but handle
  // gracefully for the edge case where the editor was hand-built one slot
  // at a time without touching the mode cards).
  if (!preset) {
    return (
      <div className="mt-4 mb-5">
        <span className="block text-[9px] uppercase tracking-[0.3em] font-semibold text-muted-foreground mb-2">
          Run Brief
        </span>
        <p className="font-serif italic text-[12px] text-muted-foreground leading-relaxed">
          Pick a mode above or hand-pick slot types to define this run.
        </p>
      </div>
    );
  }

  const { Icon, label, brief, bg, ink } = preset;
  return (
    <div className="mt-4 mb-5">
      <div className="flex items-center gap-2 mb-2.5">
        <span
          className="flex items-center justify-center w-6 h-6 rounded-md shrink-0"
          style={{ backgroundColor: bg, color: ink }}
          aria-hidden
        >
          <Icon size={12} />
        </span>
        <span className="text-[9px] uppercase tracking-[0.3em] font-semibold text-muted-foreground">
          Run Brief
        </span>
        <span className="ml-auto text-[10px] uppercase tracking-[0.25em] font-semibold" style={{ color: ink }}>
          {label}
        </span>
      </div>
      <p className="font-serif italic text-[12px] text-foreground leading-relaxed">
        {brief}
      </p>
      {/* Compact run-detail strip: time + step cap. Helps the user understand
          the cost of a launch without leaving the rail. */}
      <div className="flex items-center gap-3 mt-3 text-[9px] uppercase tracking-[0.25em] font-semibold text-muted-light">
        <span>~ 2-4 min</span>
        <span aria-hidden className="text-muted-light/60">·</span>
        <span>8 steps / agent</span>
      </div>
    </div>
  );
}

function OrbitVisualization({ slots }: { slots: ReadonlyArray<{ type?: RetrievalType }> }) {
  // Resolve the icon set; "Any" slots show as muted dots
  const ringSlots = slots.slice(0, 5);
  // Square frame + circular orbit (not an egg).
  const SIZE = 260;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = 100;

  return (
    <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
      {/* Outer ring (circle) */}
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 w-full h-full"
        aria-hidden
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.5"
          strokeDasharray="2 3"
          className="text-muted-light"
        />
      </svg>

      {/* Center hub */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-card shadow-card flex items-center justify-center">
        <Combine size={22} className="text-primary" aria-hidden />
      </div>

      {/* Orbiting type icons */}
      {ringSlots.map((slot, i) => {
        const angle = (i / ringSlots.length) * Math.PI * 2 - Math.PI / 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        const meta = slot.type ? RETRIEVAL_TYPE_META[slot.type] : null;
        const Icon = meta?.icon;

        return (
          <div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: x, top: y }}
          >
            <span
              className={cn(
                'flex items-center justify-center w-11 h-11 rounded-full transition-colors shadow-card',
                meta ? '' : 'bg-card border border-dashed border-border text-muted-light shadow-none',
              )}
              style={meta ? { backgroundColor: meta.bg, color: meta.ink } : undefined}
              aria-label={meta?.label ?? `Slot ${i + 1}: unassigned`}
            >
              {Icon ? <Icon size={17} /> : <span className="text-[13px] font-serif">{i + 1}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface SwarmStats {
  agentCount: number;
  typeCount: number;
  /** Ordered array of [type, count] for visible breakdown bars. */
  distribution: Array<{ type: RetrievalType | 'Any'; count: number }>;
}

function computeSwarmStats(slots: Array<{ type?: RetrievalType }>): SwarmStats {
  const counts = new Map<RetrievalType | 'Any', number>();
  slots.forEach((s) => {
    const key: RetrievalType | 'Any' = s.type ?? 'Any';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  // Stable order: known retrieval types first (in registry order), then 'Any'
  const distribution: Array<{ type: RetrievalType | 'Any'; count: number }> = [];
  RETRIEVAL_TYPES.forEach((t) => {
    const c = counts.get(t);
    if (c) distribution.push({ type: t, count: c });
  });
  const anyCount = counts.get('Any');
  if (anyCount) distribution.push({ type: 'Any', count: anyCount });

  const typedSlots = slots.filter((s) => s.type);
  const uniqueTypes = new Set(typedSlots.map((s) => s.type));

  return {
    agentCount: slots.length,
    typeCount: uniqueTypes.size,
    distribution,
  };
}

function ContentBreakdown({ distribution }: { distribution: SwarmStats['distribution'] }) {
  const total = distribution.reduce((acc, d) => acc + d.count, 0);
  if (total === 0) return <p className="text-[12px] italic text-muted-light">No slots configured yet.</p>;

  return (
    <ul className="space-y-2">
      {distribution.map(({ type, count }) => {
        const meta = type === 'Any' ? null : RETRIEVAL_TYPE_META[type];
        const label = meta?.label ?? 'Any';
        const Icon = meta?.icon;
        const pct = Math.round((count / total) * 100);
        const inkColor = meta?.ink ?? 'var(--text-muted-light-hex, currentColor)';

        return (
          <li key={String(type)} className="flex items-center gap-2 text-[11px]">
            {Icon ? (
              <Icon size={11} className="shrink-0" style={{ color: inkColor }} aria-hidden />
            ) : (
              <span className="w-[11px] h-[11px] rounded-full border border-dashed border-muted-light shrink-0" aria-hidden />
            )}
            <span className="font-sans uppercase tracking-[0.18em] text-[10px] font-semibold text-foreground w-20 shrink-0 truncate">
              {label}
            </span>
            <div className="flex-1 h-1.5 bg-card rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${pct}%`, backgroundColor: inkColor, opacity: 0.85 }}
              />
            </div>
            <span className="font-sans text-[10px] font-semibold text-muted-foreground tabular-nums w-10 text-right">
              {pct}%
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// --- Error block (preserved from previous implementation) ---

function ErrorMessage({ error }: { error: LaunchError }): JSX.Element {
  if (error.code === 'research_run_in_progress') {
    const existingRunId = error.details?.existingRunId;
    return (
      <ErrorContainer tone="warning" title="Run In Progress">
        A swarm is already running for this brainlift
        {typeof existingRunId === 'number' ? ` (run #${existingRunId})` : ''}.
        Wait for it to complete before launching another.
      </ErrorContainer>
    );
  }
  if (error.code === 'daily_limit_reached') {
    const { limit, used } = error.details ?? {};
    return (
      <ErrorContainer tone="warning" title="Daily Limit Reached">
        You've used {String(used)}/{String(limit)} daily swarm runs. Resets at midnight UTC.
      </ErrorContainer>
    );
  }
  if (error.code === 'invalid_run_request') {
    return (
      <ErrorContainer tone="destructive" title="Invalid Request">
        {error.message}
      </ErrorContainer>
    );
  }
  return (
    <ErrorContainer tone="destructive" title="Launch Failed">
      {error.message || 'An unexpected error occurred. Try again.'}
    </ErrorContainer>
  );
}

function ErrorContainer({
  tone,
  title,
  children,
}: {
  tone: 'warning' | 'destructive';
  title: string;
  children: React.ReactNode;
}) {
  const isWarn = tone === 'warning';
  return (
    <div
      className={cn(
        'rounded-md p-3 flex items-start gap-2.5',
        isWarn ? 'bg-warning/5 border border-warning/30' : 'bg-destructive-soft border border-destructive/30',
      )}
    >
      <AlertCircle
        size={14}
        className={cn('shrink-0 mt-0.5', isWarn ? 'text-warning' : 'text-destructive')}
        aria-hidden
      />
      <div>
        <span
          className={cn(
            'block text-[10px] uppercase tracking-[0.25em] font-semibold mb-1',
            isWarn ? 'text-warning' : 'text-destructive',
          )}
        >
          {title}
        </span>
        <p className="font-serif italic text-[12px] text-muted-foreground leading-relaxed">{children}</p>
      </div>
    </div>
  );
}
