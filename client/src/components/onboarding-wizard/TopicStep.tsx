import { useState } from 'react';
import { TactileButton } from '@/components/ui/tactile-button';
import { config } from '@/brand';
import { useOnboardingSuggestions } from '@/hooks/useOnboardingSuggestions';
import { canConfirmTopic } from './wizard-machine';
import { SuggestionSurface } from './SuggestionSurface';

interface TopicStepProps {
  /** Fires the create mutation; resolves once the project exists. */
  onConfirm: (topic: string) => Promise<void>;
  isSubmitting: boolean;
  /** Inline create error (stays on step 1 on failure). */
  error?: string | null;
  /** Controlled topic value (lifted so the rail's chip-accept can fill it). */
  topic: string;
  onTopicChange: (topic: string) => void;
}

/**
 * Wizard step 1 — Topic (screen1 restyle). A fill-in-the-blank prompt
 * "I want to become an expert in ___" with a CONFIRM action. Nothing persists
 * until confirm; CONFIRM is disabled until the trimmed topic reaches 3 chars.
 * Topic state is lifted to the page so the rail's suggestion chips can fill it.
 */
export function TopicStep({ onConfirm, isSubmitting, error, topic, onTopicChange }: TopicStepProps) {
  const canConfirm = canConfirmTopic(topic) && !isSubmitting;

  const handleConfirm = () => {
    if (!canConfirm) return;
    // The create error is surfaced to the user via the `error` prop (react-query
    // mutation state); swallow the rejection here so it isn't an unhandled
    // promise rejection. The wizard stays on step 1 on failure.
    void onConfirm(topic.trim()).catch(() => {});
  };

  return (
    <div className="max-w-[760px]">
      <h2 className="text-[28px] font-bold tracking-tight leading-[1.1] m-0">What's your topic?</h2>
      <p className="font-serif italic text-[15px] text-muted-foreground m-0 mt-2">
        Keep it broad. We'll narrow things down later on.
      </p>

      <div className="mt-12">
        <label htmlFor="wizard-topic" className="font-serif text-[34px] leading-[1.25] text-foreground">
          I want to become an expert in{' '}
        </label>
        <input
          id="wizard-topic"
          data-testid="input-topic"
          type="text"
          value={topic}
          autoFocus
          placeholder="Marine Biology"
          onChange={(e) => onTopicChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
          }}
          className="font-serif text-[34px] leading-[1.25] text-foreground bg-transparent border-0 border-b border-border focus:border-foreground focus:outline-none placeholder:text-muted-light w-full mt-4 pb-1"
        />
      </div>

      {error && (
        <p data-testid="topic-error" className="font-serif italic text-[14px] text-destructive mt-6 m-0">
          {error}
        </p>
      )}

      <div className="mt-16">
        <TactileButton
          variant="raised"
          data-testid="button-confirm-topic"
          disabled={!canConfirm}
          onClick={handleConfirm}
          className="text-[12px] uppercase tracking-[0.25em] px-8 py-3"
        >
          {isSubmitting ? 'Creating…' : 'Confirm'}
        </TactileButton>
      </div>
    </div>
  );
}

/**
 * Rail for step 1: topic-idea chips. Tapping a chip fills the topic input
 * (the user still confirms explicitly — no auto-advance). Pre-create, so the
 * topic suggestion endpoint is hit (no slug).
 */
export function TopicStepRail({ onAccept }: { onAccept: (topic: string) => void }) {
  const { suggestions, isLoading, refresh, refreshUsed } = useOnboardingSuggestions({ kind: 'topic' });

  return (
    <SuggestionSurface
      persona={config.wizardPersona}
      title="Need a starting point?"
      helper="Tap an idea to fill it in, or type your own"
      suggestions={suggestions}
      loading={isLoading}
      onAccept={onAccept}
      onRefresh={refresh}
      refreshUsed={refreshUsed}
      refreshLabel="More ideas"
    />
  );
}
