import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Loader2, Search, AlertCircle } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import { useRunSpecEditor, type Preset } from '@/hooks/useRunSpecEditor';
import { useLaunchResearchStream, LaunchError } from '@/hooks/useLaunchResearchStream';
import { RETRIEVAL_TYPES, type RetrievalType } from '@shared/research-stream';
import queueClearedImg from '@/assets/textures/research_queue_cleared_bg.webp';

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
}

const PRESETS: ReadonlyArray<{ id: Preset; label: string }> = [
  { id: 'mixed', label: 'Mixed' },
  { id: 'all-podcasts', label: 'All Podcasts' },
  { id: 'all-academic', label: 'All Academic' },
  { id: 'all-video', label: 'All Video' },
  { id: 'custom', label: 'Custom' },
];

const SLOT_TYPE_LABELS: Record<RetrievalType, string> = {
  Substack: 'Substack',
  AcademicPaper: 'Academic',
  Twitter: 'Twitter',
  Video: 'Video',
  Podcast: 'Podcast',
  News: 'News',
};

export function MissionControlLauncher({
  slug,
  swarmQuota,
  onLaunched,
}: MissionControlLauncherProps): JSX.Element {
  const editor = useRunSpecEditor();
  const { launch, isLaunching, error } = useLaunchResearchStream(slug);
  const [showCustomize, setShowCustomize] = useState<boolean>(false);
  const [activePreset, setActivePreset] = useState<Preset | null>(null);

  const isAtLimit = swarmQuota?.remaining === 0;
  const launchDisabled = isAtLimit || isLaunching || !editor.isValid;

  const handleLaunch = useCallback(async () => {
    try {
      const result = await launch(editor.toRunRequest());
      onLaunched(result.runId);
    } catch {
      // error is surfaced via the `error` field returned from the hook.
    }
  }, [launch, editor, onLaunched]);

  const handlePreset = useCallback(
    (p: Preset) => {
      editor.applyPreset(p);
      setActivePreset(p);
    },
    [editor],
  );

  const launchLabel = (() => {
    if (isAtLimit) return 'Daily Limit Reached';
    if (isLaunching) return 'Launching...';
    return 'Launch Research Stream';
  })();

  const launchError = error as LaunchError | null;

  return (
    <div className="relative py-16 border-t border-border">
      {/* Subtle parchment background texture, dynamic visibility based on
          expansion would mask too much editor content — keep it gentle. */}
      <div
        className="absolute inset-0 opacity-[0.05] bg-no-repeat bg-center pointer-events-none"
        style={{ backgroundImage: `url(${queueClearedImg})`, backgroundSize: '50%' }}
      />

      <div className="relative max-w-3xl mx-auto px-6">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-10">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="w-20 h-20 rounded-full flex items-center justify-center border border-border mb-6"
          >
            <Search size={32} className="text-muted-foreground" />
          </motion.div>
          <h3 className="font-serif text-3xl text-foreground mb-3">Launch Research Stream</h3>
          <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
            {isAtLimit
              ? "You've used all your daily swarm runs. Come back tomorrow for more research."
              : 'Deploy five specialized agents to discover learning resources. Customize the plan or launch as-is.'}
          </p>
        </div>

        {/* Customize toggle - small-caps sans-serif per neo-editorial */}
        <div className="flex justify-center mb-6">
          <button
            type="button"
            onClick={() => setShowCustomize((v) => !v)}
            aria-expanded={showCustomize}
            className="flex items-center gap-2 px-4 py-2 text-[11px] uppercase tracking-[0.25em] font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            {showCustomize ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <span>Customize</span>
          </button>
        </div>

        {/* Customize panel (collapsed by default) */}
        <AnimatePresence initial={false}>
          {showCustomize && (
            <motion.div
              key="customize"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="bg-card-elevated rounded-xl shadow-card p-8 mb-8">
                {/* Topic */}
                <label className="block mb-6">
                  <span className="block text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground mb-2">
                    Topic
                  </span>
                  <input
                    type="text"
                    value={editor.topic}
                    onChange={(e) => editor.setTopic(e.target.value)}
                    placeholder="e.g. John Carmack on real-time systems"
                    maxLength={500}
                    className="w-full font-serif text-[15px] text-foreground bg-background border border-border rounded-md px-4 py-2.5 placeholder:text-muted-light placeholder:italic focus:outline-none focus:border-primary/40 transition-colors"
                  />
                  {editor.errors.topic && (
                    <span className="block mt-1 text-xs text-destructive">
                      {editor.errors.topic}
                    </span>
                  )}
                </label>

                {/* Presets */}
                <div className="mb-6">
                  <span className="block text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground mb-3">
                    Presets
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {PRESETS.map((preset) => {
                      const isActive = activePreset === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handlePreset(preset.id)}
                          className={`px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.2em] font-semibold transition-all ${
                            isActive
                              ? 'bg-primary/10 text-foreground border border-primary/30'
                              : 'bg-card text-muted-foreground border border-border hover:text-foreground'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Slot rows */}
                <div className="mb-6">
                  <span className="block text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground mb-3">
                    Slots
                  </span>
                  <div className="space-y-2">
                    {editor.slots.map((slot, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 bg-card border border-border rounded-md p-3"
                      >
                        <span className="font-serif text-[18px] text-muted-light w-6 text-center shrink-0">
                          {idx + 1}
                        </span>
                        <select
                          value={slot.type ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v) editor.setSlotType(idx, v as RetrievalType);
                          }}
                          className="font-sans text-[12px] uppercase tracking-[0.15em] font-semibold text-foreground bg-background border border-border rounded px-2 py-1.5 focus:outline-none focus:border-primary/40"
                        >
                          <option value="">— Any —</option>
                          {RETRIEVAL_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {SLOT_TYPE_LABELS[t]}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={slot.focus ?? ''}
                          onChange={(e) => editor.setSlotFocus(idx, e.target.value)}
                          placeholder="Focus (optional)"
                          maxLength={500}
                          className="flex-1 font-serif italic text-[14px] text-foreground bg-transparent border-0 border-b border-border px-1 py-1 placeholder:text-muted-light placeholder:not-italic focus:outline-none focus:border-primary/40"
                        />
                        {editor.errors.slots?.[idx] && (
                          <span className="text-xs text-destructive shrink-0">
                            {editor.errors.slots[idx]}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground mb-2">
                    Notes
                  </span>
                  <textarea
                    value={editor.notes}
                    onChange={(e) => editor.setNotes(e.target.value)}
                    placeholder="Global guidance: e.g. lean recent, avoid intro-level"
                    rows={3}
                    maxLength={2000}
                    className="w-full font-serif italic text-[14px] text-foreground bg-background border border-border rounded-md px-4 py-2.5 placeholder:text-muted-light placeholder:not-italic focus:outline-none focus:border-primary/40 transition-colors resize-y"
                  />
                  {editor.errors.notes && (
                    <span className="block mt-1 text-xs text-destructive">
                      {editor.errors.notes}
                    </span>
                  )}
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error region */}
        {launchError && (
          <div className="mb-6 max-w-md mx-auto">
            <ErrorMessage error={launchError} />
          </div>
        )}

        {/* Launch button + quota */}
        <div className="flex flex-col items-center">
          <TactileButton
            variant="raised"
            onClick={handleLaunch}
            disabled={launchDisabled}
            className="flex items-center gap-3 px-8 py-4 text-[14px]"
          >
            {isLaunching ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {launchLabel}
              </>
            ) : isAtLimit ? (
              <>{launchLabel}</>
            ) : (
              <>
                <Search size={18} />
                {launchLabel}
              </>
            )}
          </TactileButton>

          {swarmQuota && (
            <p className="mt-4 text-xs text-muted-foreground tabular-nums">
              {swarmQuota.used}/{swarmQuota.limit} daily runs used
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ErrorMessage({ error }: { error: LaunchError }): JSX.Element {
  // Branch off the error.code from useLaunchResearchStream for spec FR3 success criteria.
  if (error.code === 'research_run_in_progress') {
    const existingRunId = error.details?.existingRunId;
    return (
      <div className="bg-warning/5 border border-warning/30 rounded-md p-4 flex items-start gap-3">
        <AlertCircle size={18} className="text-warning shrink-0 mt-0.5" />
        <div>
          <span className="block text-[10px] uppercase tracking-[0.25em] font-semibold text-warning mb-1">
            Run In Progress
          </span>
          <p className="font-serif italic text-[13px] text-muted-foreground leading-relaxed">
            A swarm is already running for this brainlift
            {typeof existingRunId === 'number' ? ` (run #${existingRunId})` : ''}.
            Wait for it to complete before launching another.
          </p>
        </div>
      </div>
    );
  }
  if (error.code === 'daily_limit_reached') {
    const { limit, used } = error.details ?? {};
    return (
      <div className="bg-warning/5 border border-warning/30 rounded-md p-4 flex items-start gap-3">
        <AlertCircle size={18} className="text-warning shrink-0 mt-0.5" />
        <div>
          <span className="block text-[10px] uppercase tracking-[0.25em] font-semibold text-warning mb-1">
            Daily Limit Reached
          </span>
          <p className="font-serif italic text-[13px] text-muted-foreground leading-relaxed">
            You've used {String(used)}/{String(limit)} daily swarm runs. Resets at midnight UTC.
          </p>
        </div>
      </div>
    );
  }
  if (error.code === 'invalid_run_request') {
    return (
      <div className="bg-destructive-soft border border-destructive/30 rounded-md p-4 flex items-start gap-3">
        <AlertCircle size={18} className="text-destructive shrink-0 mt-0.5" />
        <div>
          <span className="block text-[10px] uppercase tracking-[0.25em] font-semibold text-destructive mb-1">
            Invalid Request
          </span>
          <p className="font-serif italic text-[13px] text-muted-foreground leading-relaxed">
            {error.message}
          </p>
        </div>
      </div>
    );
  }
  // server_error fallback
  return (
    <div className="bg-destructive-soft border border-destructive/30 rounded-md p-4 flex items-start gap-3">
      <AlertCircle size={18} className="text-destructive shrink-0 mt-0.5" />
      <div>
        <span className="block text-[10px] uppercase tracking-[0.25em] font-semibold text-destructive mb-1">
          Launch Failed
        </span>
        <p className="font-serif italic text-[13px] text-muted-foreground leading-relaxed">
          {error.message || 'An unexpected error occurred. Try again.'}
        </p>
      </div>
    </div>
  );
}
