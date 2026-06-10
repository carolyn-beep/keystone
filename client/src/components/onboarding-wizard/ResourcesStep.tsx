import { useState } from 'react';
import { Link2, Plus, X } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import { config } from '@/brand';
import type { WizardPersona } from '@/brand/types';
import { useStarterPack } from '@/hooks/useStarterPack';
import type { LearningStreamItem } from '@/hooks/useLearningStream';

interface ResourcesStepProps {
  slug?: string;
  /** Advance to the next step (forward PATCH to step 7). */
  onNext: () => void;
}

/**
 * Wizard step 6 — Resources (screen5 restyle). Main column: an "Add resources"
 * heading + paste-links input + the pasted manual items. Right rail: the brand
 * persona header + the starter-pack section (in-flight progress while running;
 * once ready, pack items keep-by-default with a per-item decline; zero
 * survivors → a quiet paste-only note).
 *
 * Mock deltas: the drag-and-drop file upload area is OMITTED (local file upload
 * is increment F1, a feature non-goal); the mock's opt-in "Add/Added" buttons
 * become keep-by-default with a decline control (accepted pack items stay
 * `pending`; declined become `discarded`).
 */
export function ResourcesStep({ slug, onNext }: ResourcesStepProps) {
  const { manualItems, addResource, isAdding } = useStarterPack(slug);
  const [draft, setDraft] = useState('');
  const [duplicateUrl, setDuplicateUrl] = useState<string | null>(null);

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
    <div className="max-w-[760px]">
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

      {/* Pasted items */}
      {manualItems.length > 0 && (
        <div className="mt-8 flex flex-col gap-3 max-w-[520px]" data-testid="resources-added-list">
          <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Added
          </span>
          {manualItems.map((item) => (
            <ResourceRow key={item.id} item={item} slug={slug} />
          ))}
        </div>
      )}

      {/* Confirm / continue */}
      <div className="mt-14">
        <TactileButton
          variant="raised"
          data-testid="button-confirm-resources"
          onClick={onNext}
          className="text-[12px] uppercase tracking-[0.25em] px-8 py-3"
        >
          Confirm
        </TactileButton>
      </div>
    </div>
  );
}

/** A pasted manual item (URL as title) with a remove (decline) control. */
function ResourceRow({ item, slug }: { item: LearningStreamItem; slug?: string }) {
  const { decline, isDeclining } = useStarterPack(slug);
  return (
    <div
      data-testid="resource-item"
      className="flex items-center justify-between gap-3 rounded-xl bg-card-elevated px-4 py-3 shadow-card"
    >
      <span className="truncate font-serif text-[14px] text-foreground">{item.topic}</span>
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
    </div>
  );
}

/**
 * Rail for step 6: persona header + the starter-pack section. In-flight progress
 * while `running`; once `ready`, pack items keep-by-default with a per-item
 * decline; zero surviving items → a quiet empty note (paste-only presentation).
 */
export function ResourcesStepRail({ slug }: { slug: string | undefined }) {
  const { status, packItems, decline, isDeclining } = useStarterPack(slug);
  const persona: WizardPersona = config.wizardPersona;
  const { Mascot } = persona;

  return (
    <div className="flex h-full w-full flex-col px-8 py-6" data-testid="resources-rail">
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
        <h3 className="m-0 text-[18px] font-bold leading-tight text-foreground">
          No material? Try this starter pack
        </h3>
        <p className="m-0 mt-1 font-serif text-[14px] italic text-muted-foreground">
          A couple of resources to get you started
        </p>

        {status === 'running' ? (
          <p
            data-testid="starter-pack-progress"
            className="m-0 mt-5 font-serif text-[14px] italic text-muted-light"
          >
            Gathering a few starting points…
          </p>
        ) : packItems.length > 0 ? (
          <div className="mt-5 flex flex-col gap-3" data-testid="starter-pack-items">
            {packItems.map((item) => (
              <div
                key={item.id}
                data-testid="starter-pack-item"
                className="flex items-start justify-between gap-3 rounded-xl bg-card px-4 py-3 shadow-card"
              >
                <div className="min-w-0">
                  <p className="m-0 truncate font-serif text-[14px] text-foreground">{item.topic}</p>
                  {item.author && (
                    <span className="mt-1 block text-[10px] uppercase tracking-[0.25em] font-semibold text-muted-light">
                      {item.author}
                      {item.type ? ` · ${item.type}` : ''}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`Decline ${item.topic}`}
                  data-testid="button-decline-pack-item"
                  disabled={isDeclining}
                  onClick={() => void decline(item.id)}
                  className="shrink-0 text-[10px] uppercase tracking-[0.2em] font-semibold text-muted-light transition-colors hover:text-muted-foreground disabled:opacity-40"
                >
                  Decline
                </button>
              </div>
            ))}
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
