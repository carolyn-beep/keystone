import { useMemo, useState } from 'react';
import { TactileButton } from '@/components/ui/tactile-button';
import { useExpertDiscovery, type ExpertCandidate } from '@/hooks/useExpertDiscovery';
import { canAddManualExpert } from './wizard-machine';

interface ExpertsStepProps {
  slug?: string;
  /** Advance to the next step. Skip is first-class — always available. */
  onNext: () => void;
}

/**
 * Wizard step 5 — Experts (screen4 restyle). Search-grounded candidates with a
 * per-card Add (flips to Added), a local Dismiss, evidence links, and a
 * manual-add form. The CONFIRM control is always enabled: skipping with zero
 * accepts is a first-class path, including while discovery is still in flight.
 *
 * Mock deltas: no candidate portraits (we have no image data — text cards);
 * the right-rail "How it works" / AlphaX Buddy panel belongs to spec 04's
 * suggestion surface, not this step.
 */
export function ExpertsStep({ slug, onNext }: ExpertsStepProps) {
  const { candidates, isLoading, acceptExpert, isAccepting } = useExpertDiscovery(slug, true);

  // In-session UI state: which candidate names have been accepted (Added) and
  // which have been dismissed (removed locally, ephemeral — no server call).
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

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
    <div className="max-w-[920px]">
      <h2 className="text-[28px] font-bold tracking-tight leading-[1.1] m-0">Add experts</h2>
      <p className="font-serif italic text-[15px] text-muted-foreground m-0 mt-3 max-w-[520px]">
        Add 3-5 experts whose perspectives you trust on the topic. You can also do this later if you
        want.
      </p>

      {/* Candidate cards */}
      <div className="mt-10">
        {isLoading ? (
          <p
            data-testid="experts-loading"
            className="font-serif italic text-[14px] text-muted-light m-0"
          >
            Finding experts on your topic…
          </p>
        ) : visibleCandidates.length > 0 ? (
          <div className="flex flex-wrap gap-4">
            {visibleCandidates.map((candidate) => {
              const isAdded = accepted.has(candidate.name.toLowerCase());
              return (
                <div
                  key={candidate.name}
                  data-testid="expert-candidate"
                  className="w-[240px] p-5 rounded-xl bg-card-elevated shadow-card flex flex-col"
                >
                  <h3 className="font-serif text-[18px] text-foreground m-0 leading-tight">
                    {candidate.name}
                  </h3>
                  {candidate.who && (
                    <span className="mt-1.5 text-[10px] uppercase tracking-[0.25em] font-semibold text-muted-foreground">
                      {candidate.who}
                    </span>
                  )}
                  {candidate.why && (
                    <p className="mt-3 font-serif italic text-[13px] text-muted-foreground leading-relaxed m-0">
                      {candidate.why}
                    </p>
                  )}
                  {candidate.where && (
                    <span className="mt-2 text-[12px] text-muted-light">{candidate.where}</span>
                  )}

                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                    {candidate.evidenceUrls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-[10px] uppercase tracking-[0.25em] font-semibold text-primary hover:underline"
                      >
                        Source
                      </a>
                    ))}
                  </div>

                  <div className="mt-5 flex items-center gap-3">
                    <TactileButton
                      variant="raised"
                      data-testid="button-add-expert"
                      disabled={isAdded || isAccepting}
                      onClick={() => void handleAccept(candidate)}
                      className="text-[11px] uppercase tracking-[0.2em] px-4 py-2"
                    >
                      {isAdded ? 'Added' : 'Add'}
                    </TactileButton>
                    {!isAdded && (
                      <button
                        type="button"
                        data-testid="button-dismiss-expert"
                        onClick={() => handleDismiss(candidate)}
                        className="bg-transparent border-none cursor-pointer text-[11px] uppercase tracking-[0.2em] font-semibold text-muted-light hover:text-muted-foreground transition-colors p-0"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
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

      {/* Manual add */}
      <ManualAddForm onAdd={acceptExpert} disabled={isAccepting} />

      {/* Skip / continue — always enabled, including mid-discovery. */}
      <div className="mt-14">
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

interface ManualAddFormProps {
  onAdd: (expert: { name: string; where: string; who?: string; why?: string; focus?: string }) => Promise<unknown>;
  disabled?: boolean;
}

/** Manual-add affordance: name + where required, who/why/focus optional. */
function ManualAddForm({ onAdd, disabled }: ManualAddFormProps) {
  const [name, setName] = useState('');
  const [where, setWhere] = useState('');
  const [who, setWho] = useState('');
  const [why, setWhy] = useState('');
  const canAdd = canAddManualExpert(name, where) && !disabled;

  const handleSubmit = async () => {
    if (!canAdd) return;
    try {
      await onAdd({
        name: name.trim(),
        where: where.trim(),
        who: who.trim() || undefined,
        why: why.trim() || undefined,
      });
      setName('');
      setWhere('');
      setWho('');
      setWhy('');
    } catch {
      // Tracked by react-query; the form keeps its values so the student can retry.
    }
  };

  return (
    <div className="mt-12 max-w-[520px]">
      <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
        Add your own
      </span>
      <div className="mt-4 flex flex-col gap-3">
        <input
          data-testid="input-manual-name"
          type="text"
          value={name}
          placeholder="Name"
          onChange={(e) => setName(e.target.value)}
          className="font-serif text-[16px] text-foreground bg-transparent border-0 border-b border-border focus:border-foreground focus:outline-none placeholder:text-muted-light pb-1"
        />
        <input
          data-testid="input-manual-where"
          type="text"
          value={where}
          placeholder="Handle, site, or affiliation"
          onChange={(e) => setWhere(e.target.value)}
          className="font-serif text-[16px] text-foreground bg-transparent border-0 border-b border-border focus:border-foreground focus:outline-none placeholder:text-muted-light pb-1"
        />
        <input
          data-testid="input-manual-who"
          type="text"
          value={who}
          placeholder="Who they are (optional)"
          onChange={(e) => setWho(e.target.value)}
          className="font-serif text-[15px] text-foreground bg-transparent border-0 border-b border-border focus:border-foreground focus:outline-none placeholder:text-muted-light pb-1"
        />
        <input
          data-testid="input-manual-why"
          type="text"
          value={why}
          placeholder="Why they matter (optional)"
          onChange={(e) => setWhy(e.target.value)}
          className="font-serif text-[15px] text-foreground bg-transparent border-0 border-b border-border focus:border-foreground focus:outline-none placeholder:text-muted-light pb-1"
        />
      </div>
      <div className="mt-5">
        <TactileButton
          variant="inset"
          data-testid="button-manual-add"
          disabled={!canAdd}
          onClick={() => void handleSubmit()}
          className="text-[11px] uppercase tracking-[0.2em] px-5 py-2"
        >
          Add expert
        </TactileButton>
      </div>
    </div>
  );
}
