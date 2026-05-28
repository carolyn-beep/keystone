/**
 * Dok1ExplainerHelpButton — icon-only help trigger for the FactGradingPanel header.
 *
 * Hover/focus surfaces a tooltip reading "How DOK1s are graded"; click opens the
 * explainer modal via the onClick prop. The button is CSS-hidden below the md
 * breakpoint so the help affordance does not appear on mobile.
 *
 * Spec: features/pedagogy/dok1-rubric-explainer/specs/02-wiring/spec.md (FR1)
 */

import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface Dok1ExplainerHelpButtonProps {
  onClick: () => void;
}

export function Dok1ExplainerHelpButton({ onClick }: Dok1ExplainerHelpButtonProps): JSX.Element {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            aria-label="How DOK1s are graded"
            className="hidden md:inline-flex items-center justify-center w-8 h-8 rounded-full bg-transparent border border-border text-muted-foreground hover:text-foreground hover:bg-card transition-colors cursor-pointer"
          >
            <HelpCircle size={16} aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="bg-card border-border text-muted-foreground text-[11px] uppercase tracking-[0.25em] font-semibold">
          How DOK1s are graded
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
