import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { TactileButton } from '@/components/ui/tactile-button';
import { TreePine, Users } from 'lucide-react';

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
  return (
    <AlertDialog open={show} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-success-soft flex items-center justify-center">
              <Users size={28} className="text-success" />
            </div>
          </div>

          <AlertDialogTitle className="text-xl font-bold text-foreground text-center">
            Your expert foundation is set.
          </AlertDialogTitle>

          <AlertDialogDescription className="font-serif text-sm italic text-muted-foreground leading-relaxed text-center">
            The research swarm is now finding content based on your experts.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex flex-col gap-3 sm:flex-col">
          <TactileButton
            variant="raised"
            className="w-full flex items-center justify-center gap-2"
            onClick={onGoToPhase3}
          >
            <TreePine size={16} />
            Go to Knowledge Tree
          </TactileButton>

          <TactileButton
            variant="inset"
            className="w-full text-muted-foreground"
            onClick={onKeepAdding}
          >
            Keep Adding Experts
          </TactileButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
