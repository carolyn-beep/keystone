import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { TactileButton } from '@/components/ui/tactile-button';

interface CelebrationModalProps {
  show: boolean;
  onClose: () => void;
  onGoToPhase3: () => void;
  onKeepAdding: () => void;
}

export function CelebrationModal({
  show,
  onClose,
  onGoToPhase3,
  onKeepAdding,
}: CelebrationModalProps) {
  const confettiFired = useRef(false);

  useEffect(() => {
    if (show && !confettiFired.current) {
      confettiFired.current = true;
      // Staggered bursts for a richer effect
      const fire = (opts: confetti.Options) =>
        confetti({
          ...opts,
          disableForReducedMotion: true,
          colors: ['#56643F', '#D97706', '#3B6E8F', '#953A34', '#22150D'],
        });

      fire({ particleCount: 60, spread: 55, origin: { x: 0.3, y: 0.6 } });
      setTimeout(() => fire({ particleCount: 50, spread: 65, origin: { x: 0.7, y: 0.55 } }), 150);
      setTimeout(() => fire({ particleCount: 40, spread: 80, origin: { x: 0.5, y: 0.5 } }), 300);
    }
    if (!show) {
      confettiFired.current = false;
    }
  }, [show]);

  return (
    <AlertDialog open={show} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent className="max-w-sm p-8">
        <AlertDialogHeader className="text-center space-y-4">
          <AlertDialogTitle className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground text-center m-0">
            Knowledge Tree Unlocked!
          </AlertDialogTitle>

          <AlertDialogDescription asChild>
            <div className="text-center space-y-3">
              <p className="font-serif text-[18px] italic text-foreground leading-relaxed m-0">
                Your expert foundation is ready.
              </p>
              <p className="font-serif text-[13px] italic text-muted-foreground leading-relaxed m-0">
                A research swarm is already hunting for sources based on the experts you chose.
                The Knowledge Tree is where you'll triage, extract, and organize what it finds.
              </p>
              <p className="font-serif text-[13px] italic text-muted-foreground leading-relaxed m-0">
                No rush — you can keep curating your expert list anytime.
                The sources our agents collect will be waiting for you when you're ready.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex flex-col gap-3 sm:flex-col mt-4">
          <TactileButton
            variant="raised"
            className="w-full text-[12px]"
            onClick={onGoToPhase3}
          >
            Enter the Knowledge Tree
          </TactileButton>

          <TactileButton
            variant="inset"
            className="w-full text-[12px] text-muted-foreground"
            onClick={onKeepAdding}
          >
            Keep Adding Experts
          </TactileButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
