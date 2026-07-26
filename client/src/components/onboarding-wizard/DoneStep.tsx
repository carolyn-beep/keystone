import { ChevronRight } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';

interface DoneStepProps {
  /** Fires complete then navigates to the Second Brain tab. */
  onEnter: () => void;
  isCompleting: boolean;
}

/**
 * Wizard step 7 — Done (screen6 restyle). Success card confirming the
 * brainlift is set, with the "Enter Learning Stream" handoff CTA.
 */
export function DoneStep({ onEnter, isCompleting }: DoneStepProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-[440px] rounded-xl bg-card-elevated shadow-card px-10 py-14 text-center">
        <h2 className="text-[26px] font-bold tracking-tight leading-tight m-0">
          Your BrainLift is set!
        </h2>
        <p className="font-serif italic text-[15px] text-muted-foreground leading-relaxed mt-5 mb-2">
          You've defined your focus and assembled your expert network.
        </p>
        <p className="font-serif italic text-[15px] text-muted-foreground leading-relaxed mt-2 mb-10">
          Now let's start learning!
        </p>
        <TactileButton
          variant="raised"
          data-testid="button-enter-learning-stream"
          disabled={isCompleting}
          onClick={onEnter}
          className="w-full text-[13px] py-3 inline-flex items-center justify-center gap-2"
        >
          {isCompleting ? 'Finishing…' : 'Enter Learning Stream'}
          <ChevronRight size={16} />
        </TactileButton>
      </div>
    </div>
  );
}
