import { TactileButton } from '@/components/ui/tactile-button';

interface PlaceholderStepProps {
  title: string;
  /** Advance to the next step (PATCHes forward when past the high-water mark). */
  onNext: () => void;
  isAdvancing?: boolean;
}

/**
 * Placeholder slot for wizard steps 2-6. Specs 04-06 replace these with the
 * real In Scope / Out of Scope / Categories / Experts / Resources UIs. Keeps
 * the machine traversable end-to-end (working Next) in the meantime.
 */
export function PlaceholderStep({ title, onNext, isAdvancing }: PlaceholderStepProps) {
  return (
    <div className="max-w-[760px]">
      <h2 className="text-[28px] font-bold tracking-tight leading-[1.1] m-0">{title}</h2>
      <p className="font-serif italic text-[15px] text-muted-foreground m-0 mt-3">
        Coming soon. This step is part of the onboarding flow we're still building.
      </p>
      <div className="mt-16">
        <TactileButton
          variant="raised"
          data-testid="button-next-step"
          disabled={isAdvancing}
          onClick={onNext}
          className="text-[12px] uppercase tracking-[0.25em] px-8 py-3"
        >
          {isAdvancing ? 'Saving…' : 'Next'}
        </TactileButton>
      </div>
    </div>
  );
}
