import { useState } from 'react';
import { ChevronDown, FolderOpen, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConversationBrainlift } from '@/hooks/useConversationBrainlift';
import { useUserBrainlifts } from '@/hooks/useUserBrainlifts';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import ProjectPickerDropdown from './ProjectPickerDropdown';

export interface ProjectPickerProps {
  /** Current conversation id; null means draft mode (no row yet). */
  conversationId: number | null;
  /**
   * Draft-mode selection. Held by the runtime; the lazy-create flow PATCHes
   * the binding right after the conversation row is created so the very
   * first chat request resolves mode against the bound brainlift.
   */
  pendingDraftBrainliftId?: number | null;
  onPendingDraftBrainliftChange?: (brainliftId: number | null) => void;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

interface PickerButtonProps {
  label: string;
  isOpen: boolean;
  isLoading?: boolean;
  isPlaceholder?: boolean;
}

function PickerButton({ label, isOpen, isLoading, isPlaceholder }: PickerButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'project-picker-trigger inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-card px-3 py-2 text-[13px] font-medium text-foreground shadow-none transition-colors hover:bg-sidebar focus:outline-none focus:ring-0',
        isOpen && 'bg-sidebar',
      )}
      aria-label="Choose project for this conversation"
      aria-expanded={isOpen}
    >
      <FolderOpen size={13} className="shrink-0 opacity-60" aria-hidden />
      <span
        className={cn(
          'max-w-[220px] truncate font-serif text-[13px] leading-none sm:max-w-[300px]',
          isPlaceholder && 'italic text-muted-foreground',
        )}
      >
        {label}
      </span>
      {isLoading ? (
        <Loader2 size={12} className="shrink-0 animate-spin opacity-60" />
      ) : null}
      <ChevronDown
        size={13}
        className={cn(
          'shrink-0 opacity-60 transition-transform duration-200',
          isOpen && 'rotate-180',
        )}
        aria-hidden
      />
    </button>
  );
}

function BoundProjectPicker({ conversationId }: { conversationId: number }) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const { data, isLoading, setBinding } = useConversationBrainlift(conversationId);
  const currentBrainlift = data?.brainlift ?? null;
  const currentBrainliftId = data?.brainliftId ?? null;

  const hasUnknownBinding = currentBrainliftId != null && currentBrainlift == null;
  const label = currentBrainlift?.title
    ?? (hasUnknownBinding ? `Project #${currentBrainliftId}` : 'No project yet');
  const isPlaceholder = currentBrainlift == null && !hasUnknownBinding;

  async function handleSelect(brainliftId: number | null) {
    setIsOpen(false);

    try {
      await setBinding(brainliftId);
    } catch (error) {
      setIsOpen(true);
      toast({
        title: 'Project switch failed',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <div>
          <PickerButton
            label={isLoading && !data ? 'Loading project' : label}
            isOpen={isOpen}
            isLoading={isLoading}
            isPlaceholder={isPlaceholder}
          />
        </div>
      </DropdownMenuTrigger>
      <ProjectPickerDropdown
        currentBrainliftId={currentBrainliftId}
        onSelect={(brainliftId) => {
          void handleSelect(brainliftId);
        }}
        onClose={() => setIsOpen(false)}
      />
    </DropdownMenu>
  );
}

function DraftProjectPicker({
  pendingDraftBrainliftId,
  onPendingDraftBrainliftChange,
}: {
  pendingDraftBrainliftId: number | null;
  onPendingDraftBrainliftChange: (brainliftId: number | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: brainlifts = [], isLoading } = useUserBrainlifts();
  const picked = pendingDraftBrainliftId == null
    ? null
    : brainlifts.find((b) => b.id === pendingDraftBrainliftId) ?? null;
  const hasUnknownPending = pendingDraftBrainliftId != null && picked == null;
  const label = picked?.title
    ?? (hasUnknownPending ? `Project #${pendingDraftBrainliftId}` : 'No project yet');
  const isPlaceholder = picked == null && !hasUnknownPending;

  function handleSelect(brainliftId: number | null) {
    setIsOpen(false);
    onPendingDraftBrainliftChange(brainliftId);
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <div>
          <PickerButton
            label={label}
            isOpen={isOpen}
            isLoading={isLoading && brainlifts.length === 0}
            isPlaceholder={isPlaceholder}
          />
        </div>
      </DropdownMenuTrigger>
      <ProjectPickerDropdown
        currentBrainliftId={pendingDraftBrainliftId}
        onSelect={handleSelect}
        onClose={() => setIsOpen(false)}
        draftMode
      />
    </DropdownMenu>
  );
}

export function ProjectPicker({
  conversationId,
  pendingDraftBrainliftId = null,
  onPendingDraftBrainliftChange,
}: ProjectPickerProps) {
  if (conversationId == null) {
    if (!onPendingDraftBrainliftChange) return null;
    return (
      <DraftProjectPicker
        pendingDraftBrainliftId={pendingDraftBrainliftId}
        onPendingDraftBrainliftChange={onPendingDraftBrainliftChange}
      />
    );
  }
  return <BoundProjectPicker conversationId={conversationId} />;
}

export default ProjectPicker;
