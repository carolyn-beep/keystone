import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Plus, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { TactileButton } from '@/components/ui/tactile-button';
import { config } from '@/brand';
import type { WizardPersona } from '@/brand/types';
import { useExpertDiscovery, type ExpertCandidate } from '@/hooks/useExpertDiscovery';
import { canAddManualExpert } from './wizard-machine';
import { ThinkingLine, ExpertCardSkeletons } from './loading-states';

/** "Tony Whyton" -> "TW" for the engraved portrait placeholder. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

interface ExpertsStepProps {
  slug?: string;
  /** Advance to the next step. Skip is first-class — always available. */
  onNext: () => void;
}

/** A manually-added expert, echoed into the card grid as add feedback. */
interface ManualExpert {
  name: string;
  where: string;
  who?: string;
  why?: string;
}

/**
 * Wizard step 5 — Experts (screen4 restyle). Search-grounded candidates with a
 * per-card Add (flips to Added), a local Dismiss, evidence links, and a
 * manual-add form. The CONFIRM control is always enabled: skipping with zero
 * accepts is a first-class path, including while discovery is still in flight.
 *
 * Mock delta: no candidate portrait photos (we have no image data) — the
 * portrait slot renders an engraved-style initials plate instead.
 */
export function ExpertsStep({ slug, onNext }: ExpertsStepProps) {
  const { candidates, isLoading, acceptExpert, isAccepting, savedExperts, savedExpertsLoaded } =
    useExpertDiscovery(slug, true);

  // In-session UI state: which candidate names have been accepted (Added) and
  // which have been dismissed (removed locally, ephemeral — no server call).
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Manually-added experts echo into the card grid so the add visibly lands
  // (the form alone clearing gave no feedback). If the name matches a visible
  // candidate, that card flips to Added instead of duplicating.
  const [manualExperts, setManualExperts] = useState<ManualExpert[]>([]);

  // Restore previously saved experts on mount. Waits for both discovery and
  // the saved-experts list to settle so candidate matching is accurate.
  // Experts matching a candidate name flip their card to Added; the rest
  // reappear as manual cards.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (isLoading || !savedExpertsLoaded) return;
    seededRef.current = true;
    if (savedExperts.length === 0) return;

    const restoredAccepted = new Set<string>();
    const restoredManuals: ManualExpert[] = [];
    for (const expert of savedExperts) {
      const key = expert.name.toLowerCase();
      if (candidates.some((c) => c.name.toLowerCase() === key)) {
        restoredAccepted.add(key);
      } else {
        restoredManuals.push({
          name: expert.name,
          where: expert.where ?? '',
          who: expert.who ?? undefined,
          why: expert.why ?? undefined,
        });
      }
    }
    if (restoredAccepted.size > 0) setAccepted(restoredAccepted);
    if (restoredManuals.length > 0) setManualExperts(restoredManuals);
  }, [savedExperts, savedExpertsLoaded, isLoading, candidates]);
  const handleManualAdded = (expert: ManualExpert) => {
    const key = expert.name.toLowerCase();
    if (candidates.some((c) => c.name.toLowerCase() === key)) {
      setAccepted((prev) => new Set(prev).add(key));
      return;
    }
    setManualExperts((prev) =>
      prev.some((e) => e.name.toLowerCase() === key) ? prev : [...prev, expert],
    );
  };

  const visibleCandidates = useMemo(
    () => candidates.filter((c) => !dismissed.has(c.name.toLowerCase())),
    [candidates, dismissed],
  );

  const handleAccept = async (candidate: ExpertCandidate) => {
    const key = candidate.name.toLowerCase();
    if (accepted.has(key)) return;
    try {
      await acceptExpert({
        name: candidate.name,
        where: candidate.where,
        who: candidate.who || undefined,
        why: candidate.why || undefined,
        focus: candidate.focus || undefined,
      });
      setAccepted((prev) => new Set(prev).add(key));
    } catch {
      // Accept failure is non-fatal: the card stays in its Add state so the
      // student can retry. The mutation error is tracked by react-query.
    }
  };

  const handleDismiss = (candidate: ExpertCandidate) => {
    setDismissed((prev) => new Set(prev).add(candidate.name.toLowerCase()));
  };

  return (
    <div className="flex flex-1 flex-col max-w-[920px]">
      <h2 className="text-[28px] font-bold tracking-tight leading-[1.1] m-0">Add experts</h2>
      <p className="font-serif italic text-[15px] text-muted-foreground m-0 mt-3 max-w-[520px]">
        Add 3-5 experts whose perspectives you trust on the topic. You can also do this later if you
        want.
      </p>

      {/* Candidate cards */}
      <div className="mt-6">
        {isLoading ? (
          <div className="space-y-4">
            <ThinkingLine message="Finding experts on your topic" data-testid="experts-loading" />
            <ExpertCardSkeletons />
          </div>
        ) : visibleCandidates.length > 0 || manualExperts.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {visibleCandidates.map((candidate) => {
              const isAdded = accepted.has(candidate.name.toLowerCase());
              const subtitle = candidate.who || candidate.where;
              const evidenceUrl = candidate.evidenceUrls[0];
              return (
                <div
                  key={candidate.name}
                  data-testid="expert-candidate"
                  title={candidate.why || undefined}
                  className="relative w-[164px] p-3 rounded-xl bg-card-elevated shadow-card flex flex-col"
                >
                  {/* Local dismiss — quiet x over the portrait corner */}
                  {!isAdded && (
                    <button
                      type="button"
                      data-testid="button-dismiss-expert"
                      aria-label={`Dismiss ${candidate.name}`}
                      onClick={() => handleDismiss(candidate)}
                      className="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                    >
                      <X size={14} />
                    </button>
                  )}

                  {/* Portrait slot — engraved initials plate (no portrait data) */}
                  <div className="aspect-square rounded-md bg-sidebar flex items-center justify-center">
                    <span aria-hidden className="font-serif text-[44px] leading-none text-muted-light">
                      {initialsOf(candidate.name)}
                    </span>
                  </div>

                  <h3 className="m-0 mt-3 text-[13px] font-bold leading-tight text-foreground truncate" title={candidate.name}>
                    {candidate.name}
                  </h3>
                  {subtitle && (
                    <p className="m-0 mt-1 text-[11px] leading-snug text-muted-foreground line-clamp-2 min-h-[28px]">
                      {subtitle}
                    </p>
                  )}
                  {evidenceUrl && (
                    <a
                      href={evidenceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      Learn more
                      <ExternalLink size={10} />
                    </a>
                  )}

                  <div className="mt-auto pt-3">
                    <TactileButton
                      variant={isAdded ? 'inset' : 'raised'}
                      data-testid="button-add-expert"
                      disabled={isAdded || isAccepting}
                      onClick={() => void handleAccept(candidate)}
                      className="w-full text-[10px] uppercase tracking-[0.2em] py-1.5"
                    >
                      {isAdded ? 'Added' : 'Add'}
                    </TactileButton>
                  </div>
                </div>
              );
            })}

            {/* Manually-added experts — same card language, lands as Added */}
            {manualExperts.map((expert) => (
              <motion.div
                key={expert.name}
                initial={{ opacity: 0, scale: 0.85, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', duration: 0.45, bounce: 0 }}
                data-testid="expert-manual-card"
                title={expert.why || undefined}
                className="relative w-[164px] p-3 rounded-xl bg-card-elevated shadow-card flex flex-col"
              >
                <div className="aspect-square rounded-md bg-sidebar flex items-center justify-center">
                  <span aria-hidden className="font-serif text-[44px] leading-none text-muted-light">
                    {initialsOf(expert.name)}
                  </span>
                </div>
                <h3
                  className="m-0 mt-3 text-[13px] font-bold leading-tight text-foreground truncate"
                  title={expert.name}
                >
                  {expert.name}
                </h3>
                <p className="m-0 mt-1 text-[11px] leading-snug text-muted-foreground line-clamp-2 min-h-[28px]">
                  {expert.who || expert.where}
                </p>
                <div className="mt-auto pt-3">
                  <TactileButton
                    variant="inset"
                    disabled
                    className="w-full text-[10px] uppercase tracking-[0.2em] py-1.5"
                  >
                    Added
                  </TactileButton>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <p
            data-testid="experts-empty"
            className="font-serif italic text-[14px] text-muted-foreground m-0"
          >
            No experts found automatically. Add one below, or continue and do this later.
          </p>
        )}
      </div>

      {/* Manual add — collapsed behind an "Add your own" action */}
      <ManualAddForm onAdd={acceptExpert} onAdded={handleManualAdded} disabled={isAccepting} />

      {/* Skip / continue — always enabled, including mid-discovery. */}
      <div className="mt-auto pt-6">
        <TactileButton
          variant="raised"
          data-testid="button-confirm-experts"
          onClick={onNext}
          className="text-[12px] uppercase tracking-[0.25em] px-8 py-3"
        >
          Confirm
        </TactileButton>
      </div>
    </div>
  );
}

/**
 * Rail for step 5 (screen4 mock): brand persona header + a "How it works"
 * note card pinned to the rail foot.
 */
export function ExpertsStepRail() {
  const persona: WizardPersona = config.wizardPersona;
  const { Mascot } = persona;

  return (
    <div className="flex h-full w-full flex-col px-8 py-6" data-testid="experts-rail">
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

      {/* How it works — pinned to the rail foot per the mock */}
      <div className="mt-auto pt-10">
        <div className="rounded-xl bg-card-elevated shadow-card p-6">
          <h3 className="m-0 text-[16px] font-bold leading-tight text-foreground">How it works</h3>
          <p className="m-0 mt-2 font-serif text-[14px] italic text-muted-foreground leading-relaxed">
            Experts are people who write, speak, or post about your topic. We'll pull from their work
            to build your Learning Stream.
          </p>
        </div>
      </div>
    </div>
  );
}

interface ManualAddFormProps {
  onAdd: (expert: { name: string; where: string; who?: string; why?: string; focus?: string }) => Promise<unknown>;
  /** Fires after a successful add so the step can echo the expert as a card. */
  onAdded: (expert: ManualExpert) => void;
  disabled?: boolean;
}

/**
 * Manual-add affordance. Collapsed to a single "Add your own" action; clicking
 * reveals a compact one-row form (name + handle/site, gated on
 * canAddManualExpert). Enter or the plus submits.
 */
function ManualAddForm({ onAdd, onAdded, disabled }: ManualAddFormProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [where, setWhere] = useState('');
  const [who, setWho] = useState('');
  const [why, setWhy] = useState('');
  const canAdd = canAddManualExpert(name, where) && !disabled;

  const handleSubmit = async () => {
    if (!canAdd) return;
    const expert: ManualExpert = {
      name: name.trim(),
      where: where.trim(),
      who: who.trim() || undefined,
      why: why.trim() || undefined,
    };
    try {
      await onAdd(expert);
      onAdded(expert);
      setName('');
      setWhere('');
      setWho('');
      setWhy('');
    } catch {
      // Tracked by react-query; the form keeps its values so the student can retry.
    }
  };

  const submitOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleSubmit();
  };

  const fieldClass =
    'min-w-0 bg-transparent border-0 border-b border-border focus:border-muted-foreground focus:outline-none font-serif text-[15px] text-foreground placeholder:text-muted-light pb-1';

  if (!open) {
    return (
      <div className="mt-6">
        <button
          type="button"
          data-testid="button-manual-open"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 text-[11px] uppercase tracking-[0.2em] font-semibold text-muted-foreground shadow-card transition-transform duration-200 hover:-translate-y-0.5 hover:text-foreground"
        >
          <Plus size={14} />
          Add your own
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: { type: 'spring', duration: 0.3, bounce: 0 } }}
      className="mt-6"
    >
      <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
        Add your own
      </span>
      <div className="mt-3 flex items-end gap-6">
        <input
          data-testid="input-manual-name"
          type="text"
          value={name}
          autoFocus
          placeholder="Name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={submitOnEnter}
          className={`w-[18%] shrink-0 ${fieldClass}`}
        />
        <input
          data-testid="input-manual-where"
          type="text"
          value={where}
          placeholder="Handle or site"
          onChange={(e) => setWhere(e.target.value)}
          onKeyDown={submitOnEnter}
          className={`flex-1 ${fieldClass}`}
        />
        <input
          data-testid="input-manual-who"
          type="text"
          value={who}
          placeholder="Who they are (optional)"
          onChange={(e) => setWho(e.target.value)}
          onKeyDown={submitOnEnter}
          className={`flex-1 ${fieldClass}`}
        />
        <input
          data-testid="input-manual-why"
          type="text"
          value={why}
          placeholder="Why they matter (optional)"
          onChange={(e) => setWhy(e.target.value)}
          onKeyDown={submitOnEnter}
          className={`flex-1 ${fieldClass}`}
        />
        <button
          type="button"
          aria-label="Add expert"
          data-testid="button-manual-add"
          disabled={!canAdd}
          onClick={() => void handleSubmit()}
          className="shrink-0 pb-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          <Plus size={18} />
        </button>
      </div>
    </motion.div>
  );
}
