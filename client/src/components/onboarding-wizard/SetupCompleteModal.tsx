import { ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { TactileButton } from '@/components/ui/tactile-button';
import { tokens } from '@/lib/colors';

interface SetupCompleteModalProps {
  show: boolean;
  onClose: () => void;
}

/**
 * Onboarding success beat (screen6 restyle), shown as a modal over the Second
 * Brain tab right after the wizard finishes (2026-06-11 amendment — this
 * replaced the wizard's step-7 Done screen). Dashboard shows it exactly once,
 * triggered by the `setup=done` landing param, which it strips so a refresh
 * doesn't re-celebrate. The CTA just dismisses: the student is already
 * standing in the destination.
 */
export function SetupCompleteModal({ show, onClose }: SetupCompleteModalProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[1000] flex items-center justify-center"
          style={{ backgroundColor: tokens.overlay }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15, ease: 'easeIn' } }}
          onClick={onClose}
          data-testid="setup-complete-overlay"
        >
          {/* Celebration entrance: a soft spring scale-up with a touch of
              bounce — livelier than the workhorse modals, calmer than confetti. */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-complete-title"
            data-testid="setup-complete-modal"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              transition: { type: 'spring', duration: 0.5, bounce: 0.3, delay: 0.1 },
            }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15, ease: 'easeIn' } }}
            onClick={(e) => e.stopPropagation()}
            className="w-[92%] max-w-[440px] rounded-xl bg-card-elevated shadow-card px-10 py-14 text-center"
          >
            <h2
              id="setup-complete-title"
              className="text-[26px] font-bold tracking-tight leading-tight m-0"
            >
              Your project is set!
            </h2>
            <p className="font-serif italic text-[15px] text-muted-foreground leading-relaxed mt-5 mb-2">
              You've defined your focus and assembled your expert network.
            </p>
            <p className="font-serif italic text-[15px] text-muted-foreground leading-relaxed mt-2 mb-10">
              Now let's start learning!
            </p>
            <TactileButton
              variant="raised"
              data-testid="button-start-learning"
              onClick={onClose}
              className="w-full text-[13px] py-3 inline-flex items-center justify-center gap-2"
            >
              Start learning
              <ChevronRight size={16} />
            </TactileButton>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
