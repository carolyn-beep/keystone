import { useState, type FormEvent } from 'react';
import {
  Check,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { ChatConversation } from '@shared/schema';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppShell } from '@/components/layout/AppShell';
import { cn } from '@/lib/utils';

interface ChatConversationSidebarProps {
  conversations: ChatConversation[];
  selectedConversationId: number | null;
  isLoading: boolean;
  isCreating: boolean;
  isRenaming: boolean;
  isDeleting: boolean;
  onCreateConversation: () => Promise<void> | void;
  onSelectConversation: (conversationId: number) => void;
  onRenameConversation: (conversationId: number, title: string) => Promise<void>;
  onDeleteConversation: (conversation: ChatConversation) => void;
  className?: string;
}

function formatConversationTimestamp(updatedAt: Date) {
  const now = new Date();
  const sameDay =
    updatedAt.getFullYear() === now.getFullYear()
    && updatedAt.getMonth() === now.getMonth()
    && updatedAt.getDate() === now.getDate();

  if (sameDay) {
    return updatedAt.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  return updatedAt.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Body-only conversation list for the chat section.
 *
 * Slotted as `AppSidebar.contextualBody` on the chat page. Renders the New
 * chat button + conversation rows (with rename / delete affordances). Brand
 * header, cross-section nav, and user menu live in the unified `AppSidebar`,
 * not here.
 */
export function ChatConversationSidebar({
  conversations,
  selectedConversationId,
  isLoading,
  isCreating,
  isRenaming,
  isDeleting,
  onCreateConversation,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  className,
}: ChatConversationSidebarProps) {
  const [editingConversationId, setEditingConversationId] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Conversation titles have no icon-only equivalent, so the chat contextual
  // body is hidden entirely when the unified sidebar is collapsed to a rail.
  // The "+ New chat" affordance remains reachable via the Cmd+K shortcut and
  // (after expanding) via the existing button.
  const shell = useAppShell();
  if (shell?.isSidebarCollapsed) return null;

  async function handleRenameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (editingConversationId == null) return;

    const trimmedTitle = draftTitle.trim();
    if (!trimmedTitle) return;

    setIsSubmittingEdit(true);

    try {
      await onRenameConversation(editingConversationId, trimmedTitle);
      setEditingConversationId(null);
      setDraftTitle('');
    } finally {
      setIsSubmittingEdit(false);
    }
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="px-3 pt-3 pb-3">
        <button
          type="button"
          onClick={() => void onCreateConversation()}
          disabled={isCreating}
          className={cn(
            'group flex w-full items-center gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-[14px] font-medium text-foreground shadow-sm transition-all',
            'hover:border-primary/40 hover:bg-card-elevated hover:shadow-md',
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          {isCreating ? (
            <Loader2 size={15} className="animate-spin text-muted-foreground" />
          ) : (
            <MessageSquarePlus size={15} className="text-primary" />
          )}
          <span className="flex-1 text-left">New chat</span>
          <span className="text-[11px] text-muted-foreground">⌘K</span>
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-styled px-2 pb-3">
        {isLoading ? (
          <div className="flex items-center gap-2 px-3 py-3 text-[13px] text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            <span>Loading…</span>
          </div>
        ) : conversations.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-[13px] text-muted-foreground">
              No conversations yet.
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground/80">
              Start one above.
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {conversations.map((conversation) => {
              const isSelected = conversation.id === selectedConversationId;
              const isEditing = conversation.id === editingConversationId;

              if (isEditing) {
                return (
                  <form
                    key={conversation.id}
                    onSubmit={handleRenameSubmit}
                    className="rounded-lg bg-card p-2 shadow-sm"
                  >
                    <input
                      name="conversationTitle"
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[14px] text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                      autoFocus
                      placeholder="Conversation title"
                    />
                    <div className="mt-2 flex items-center gap-1">
                      <button
                        type="submit"
                        disabled={isSubmittingEdit || isRenaming}
                        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-60"
                      >
                        {isSubmittingEdit ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Check size={12} />
                        )}
                        Save
                      </button>
                      <button
                        type="button"
                        disabled={isSubmittingEdit || isRenaming}
                        onClick={() => {
                          setEditingConversationId(null);
                          setDraftTitle('');
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-card-elevated hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                );
              }

              return (
                <div
                  key={conversation.id}
                  className={cn(
                    'group relative flex items-center rounded-lg transition-colors',
                    isSelected
                      ? 'bg-card shadow-sm'
                      : 'hover:bg-card/60',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conversation.id)}
                    className="min-w-0 flex-1 px-3 py-2 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <p
                        className={cn(
                          'truncate text-[14px] leading-tight',
                          isSelected
                            ? 'font-medium text-foreground'
                            : 'text-foreground/85',
                        )}
                      >
                        {conversation.title}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatConversationTimestamp(conversation.updatedAt)}
                    </p>
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Conversation actions"
                        className={cn(
                          'mr-1.5 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all',
                          'hover:bg-card-elevated hover:text-foreground',
                          'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100',
                          isSelected && 'opacity-60',
                        )}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-40 rounded-xl border-border/60 bg-card-elevated p-1 shadow-card"
                    >
                      <DropdownMenuItem
                        disabled={isRenaming || isDeleting}
                        onClick={() => {
                          setEditingConversationId(conversation.id);
                          setDraftTitle(conversation.title);
                        }}
                        className="gap-2 rounded-md px-2.5 py-2 text-[13px] cursor-pointer"
                      >
                        <Pencil size={13} />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={isDeleting}
                        onClick={() => onDeleteConversation(conversation)}
                        className="gap-2 rounded-md px-2.5 py-2 text-[13px] text-destructive focus:text-destructive cursor-pointer"
                      >
                        <Trash2 size={13} />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
