import { useState, useCallback } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { tokens } from '@/lib/colors';
import { TactileButton } from '@/components/ui/tactile-button';
import { usePurposeSuggestions } from '@/hooks/usePurposeSuggestions';
import { useCreateNativeBrainlift } from '@/hooks/useCreateNativeBrainlift';

interface BuildFromScratchWizardProps {
  onClose: () => void;
  onSuccess: (slug: string) => void;
  onBack: () => void;
}

const MIN_TOPIC_LENGTH = 10;
const MIN_PURPOSE_LENGTH = 20;

export function BuildFromScratchWizard({ onClose, onSuccess, onBack }: BuildFromScratchWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [topic, setTopic] = useState('');
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState('');

  // Only fetch suggestions when on step 2 with a valid topic
  const suggestionsQuery = usePurposeSuggestions(step === 2 ? topic : null);
  const suggestions = suggestionsQuery.data ?? [];

  const createMutation = useCreateNativeBrainlift();

  const trimmedTopic = topic.trim();
  const trimmedPurpose = purpose.trim();
  const isTopicValid = trimmedTopic.length >= MIN_TOPIC_LENGTH;
  const isPurposeValid = trimmedPurpose.length >= MIN_PURPOSE_LENGTH;

  const handleNext = useCallback(() => {
    if (isTopicValid) {
      setStep(2);
      setError('');
    }
  }, [isTopicValid]);

  const handleBackToStep1 = useCallback(() => {
    setStep(1);
    setError('');
  }, []);

  const handleCreate = useCallback(async () => {
    if (!isPurposeValid || !isTopicValid) return;

    setError('');
    try {
      const result = await createMutation.mutateAsync({
        topic: trimmedTopic,
        purpose: trimmedPurpose,
      });
      onClose();
      onSuccess(result.brainlift.slug);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create brainlift';
      setError(message);
    }
  }, [isPurposeValid, isTopicValid, trimmedTopic, trimmedPurpose, createMutation, onClose, onSuccess]);

  const handleChipClick = useCallback((suggestion: string) => {
    setPurpose(suggestion);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (step === 1 && isTopicValid) {
        handleNext();
      } else if (step === 2 && isPurposeValid && !createMutation.isPending) {
        handleCreate();
      }
    }
  }, [step, isTopicValid, isPurposeValid, createMutation.isPending, handleNext, handleCreate]);

  return (
    <div className="relative z-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={step === 1 ? onBack : handleBackToStep1}
          className="p-1.5 rounded-md bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-wizard-back"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-xl font-semibold text-foreground m-0">
            Build from Scratch
          </h2>
          <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Step {step} of 2
          </span>
        </div>
      </div>

      {step === 1 ? (
        /* ── Step 1: Topic ── */
        <div>
          <p className="font-serif italic text-[14px] text-muted-foreground leading-relaxed mb-6 m-0">
            What subject or domain will this BrainLift cover? Be specific enough to
            focus the knowledge base.
          </p>

          <label className="block mb-2 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Topic
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., Cognitive Behavioral Therapy for Anxiety"
            autoFocus
            data-testid="input-topic"
            className="w-full p-3 rounded-lg text-sm box-border border-none outline-none font-serif"
            style={{
              backgroundColor: tokens.surfaceAlt,
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06), inset 0 1px 2px rgba(0,0,0,0.08)',
            }}
          />
          <p className="mt-2 text-[12px] text-muted-foreground m-0">
            {trimmedTopic.length < MIN_TOPIC_LENGTH
              ? `${MIN_TOPIC_LENGTH - trimmedTopic.length} more characters needed`
              : 'Looks good'}
          </p>

          <div className="flex justify-end mt-8 gap-3">
            <TactileButton
              variant="inset"
              onClick={onBack}
              data-testid="button-cancel-wizard"
              className="text-[12px]"
            >
              Cancel
            </TactileButton>
            <TactileButton
              variant="raised"
              onClick={handleNext}
              disabled={!isTopicValid}
              data-testid="button-next"
              className="text-[12px]"
            >
              Next
            </TactileButton>
          </div>
        </div>
      ) : (
        /* ── Step 2: Purpose ── */
        <div>
          <p className="font-serif italic text-[14px] text-muted-foreground leading-relaxed mb-6 m-0">
            What do you want to accomplish with this BrainLift? Describe your goal
            or the action you are taking.
          </p>

          <label className="block mb-2 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Purpose
          </label>
          <textarea
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., Grade and organize key therapeutic techniques for clinical practice"
            autoFocus
            rows={3}
            data-testid="input-purpose"
            className="w-full p-3 rounded-lg text-sm box-border border-none outline-none font-serif resize-none"
            style={{
              backgroundColor: tokens.surfaceAlt,
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06), inset 0 1px 2px rgba(0,0,0,0.08)',
            }}
          />
          <p className="mt-2 text-[12px] text-muted-foreground m-0">
            {trimmedPurpose.length < MIN_PURPOSE_LENGTH
              ? `${MIN_PURPOSE_LENGTH - trimmedPurpose.length} more characters needed`
              : 'Looks good'}
          </p>

          {/* Suggestion chips */}
          {suggestions.length > 0 && (
            <div className="mt-5">
              <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground block mb-2">
                Suggestions
              </span>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleChipClick(suggestion)}
                    data-testid={`chip-suggestion-${index}`}
                    className="px-3 py-1.5 rounded-lg bg-transparent cursor-pointer transition-all duration-200 font-serif text-[13px] italic hover:shadow-card border border-border text-muted-foreground hover:text-foreground hover:bg-card-elevated"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Suggestion loading indicator */}
          {suggestionsQuery.isLoading && (
            <div className="mt-4 flex items-center gap-2 text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-[11px] italic font-serif">Loading suggestions...</span>
            </div>
          )}

          {/* Error message */}
          {error && (
            <p className="text-destructive text-sm mt-4 m-0">
              {error}
            </p>
          )}

          <div className="flex justify-end mt-8 gap-3">
            <TactileButton
              variant="inset"
              onClick={handleBackToStep1}
              disabled={createMutation.isPending}
              data-testid="button-back-to-step1"
              className="text-[12px]"
            >
              Back
            </TactileButton>
            <TactileButton
              variant="raised"
              onClick={handleCreate}
              disabled={!isPurposeValid || createMutation.isPending}
              data-testid="button-create"
              className="text-[12px]"
            >
              {createMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Creating...
                </span>
              ) : (
                'Create'
              )}
            </TactileButton>
          </div>
        </div>
      )}
    </div>
  );
}
