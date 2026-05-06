import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, MessageSquareText, PanelLeft } from 'lucide-react';
import type { ChatModelId } from '@shared/chat-models';
import type { ChatConversation } from '@shared/schema';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { useToast } from '@/hooks/use-toast';
import {
  useChatConversation,
  useChatConversations,
  useCreateChatConversation,
  useDeleteChatConversation,
  useRenameChatConversation,
  resolveChatConversationSelection,
  resolveNextConversationSelectionAfterDelete,
  parseSelectedConversationId,
} from '@/hooks/useChatConversations';
import { useLocation, useSearch } from 'wouter';
import { ChatConversationSidebar } from '@/components/chat/ChatConversationSidebar';
import { NativeChatThread } from '@/components/chat/NativeChatThread';
import {
  buildChatConversationLocation,
  getDefaultChatHomeModelId,
} from '@/components/chat/chat-home-helpers';
import {
  AppShell,
  AppSidebar,
  PageHeader,
  useAppShell,
} from '@/components/layout';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

interface CenteredStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

function CenteredState({ icon, title, description, action }: CenteredStateProps) {
  return (
    <div className="flex h-full min-h-[420px] items-center justify-center px-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-card-elevated text-primary shadow-sm">
          {icon}
        </div>
        <p className="mt-4 font-serif text-[20px] leading-tight text-foreground">
          {title}
        </p>
        {description ? (
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}

/**
 * Mobile drawer toggle rendered in `<PageHeader leadingSlot>`.
 *
 * Reads `useAppShell()` to call `openDrawer`. Hidden at `lg+` because the
 * inline sidebar is visible there and the toggle would be redundant.
 */
function DrawerToggle() {
  const shell = useAppShell();
  if (!shell) return null;

  return (
    <button
      type="button"
      onClick={shell.openDrawer}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground lg:hidden"
      aria-label="Open navigation"
    >
      <PanelLeft size={16} />
    </button>
  );
}

export default function ChatHome() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();

  const [selectedModelId, setSelectedModelId] = useState<ChatModelId>(
    getDefaultChatHomeModelId(),
  );
  const [deleteTarget, setDeleteTarget] = useState<ChatConversation | null>(null);
  const [autoCreateState, setAutoCreateState] = useState<'idle' | 'pending' | 'error'>('idle');

  // Holds the ID of the empty conversation auto-created from the bare homepage
  // route. The 48h/user cooldown lives in chat-opener.ts; this state only
  // records that the current conversation came from the opener surface.
  const [homepageOpenerConversationId, setHomepageOpenerConversationId] = useState<number | null>(null);

  const conversationsQuery = useChatConversations();
  const createConversation = useCreateChatConversation();
  const renameConversation = useRenameChatConversation();
  const deleteConversation = useDeleteChatConversation();

  const conversations = conversationsQuery.data ?? [];
  const selection = resolveChatConversationSelection({
    search,
    conversations,
  });
  const selectedConversationId = selection.selectedConversationId;
  const requestedConversationId = parseSelectedConversationId(search);
  const selectedConversationQuery = useChatConversation(selectedConversationId);
  const shouldMarkHomepageOpenerConversation = useMemo(() => {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    return !params.has('c') && !params.has('send');
  }, [search]);
  const initialUserMessage = useMemo(() => {
    if (selectedConversationId == null) return null;
    const params = new URLSearchParams(search);
    const send = params.get('send');
    return send && send.trim().length > 0 ? send : null;
  }, [search, selectedConversationId]);

  useEffect(() => {
    if (conversationsQuery.status !== 'success') return;

    if (selection.shouldCreateConversation) {
      if (autoCreateState !== 'idle') return;

      setAutoCreateState('pending');
      createConversation.mutate({}, {
        onSuccess: (conversation) => {
          setAutoCreateState('idle');
          if (shouldMarkHomepageOpenerConversation) {
            setHomepageOpenerConversationId(conversation.id);
          }
          setLocation(buildChatConversationLocation(conversation.id));
        },
        onError: (error) => {
          setAutoCreateState('error');
          toast({
            title: 'Failed to start a chat',
            description: getErrorMessage(error),
            variant: 'destructive',
          });
        },
      });
      return;
    }

    if (autoCreateState !== 'idle') {
      setAutoCreateState('idle');
    }

    if (
      selectedConversationId != null
      && requestedConversationId !== selectedConversationId
    ) {
      setLocation(buildChatConversationLocation(selectedConversationId));
    }
  }, [
    autoCreateState,
    conversationsQuery.status,
    createConversation,
    requestedConversationId,
    selectedConversationId,
    selection.shouldCreateConversation,
    setLocation,
    shouldMarkHomepageOpenerConversation,
    toast,
  ]);

  async function handleCreateConversation() {
    try {
      const conversation = await createConversation.mutateAsync({});
      setLocation(buildChatConversationLocation(conversation.id));
    } catch (error) {
      toast({
        title: 'Failed to create a chat',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (!isShortcut) return;

      event.preventDefault();
      void handleCreateConversation();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  async function handleRenameConversation(conversationId: number, title: string) {
    try {
      await renameConversation.mutateAsync({
        conversationId,
        title,
      });
    } catch (error) {
      toast({
        title: 'Failed to rename conversation',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
      throw error;
    }
  }

  async function handleDeleteConversation() {
    if (!deleteTarget) return;

    const nextSelection = resolveNextConversationSelectionAfterDelete({
      deletedConversationId: deleteTarget.id,
      selectedConversationId,
      conversations,
    });

    try {
      await deleteConversation.mutateAsync({
        conversationId: deleteTarget.id,
      });

      setDeleteTarget(null);

      if (nextSelection.shouldCreateConversation) {
        const conversation = await createConversation.mutateAsync({});
        setLocation(buildChatConversationLocation(conversation.id));
        return;
      }

      if (
        nextSelection.selectedConversationId != null
        && requestedConversationId !== nextSelection.selectedConversationId
      ) {
        setLocation(buildChatConversationLocation(nextSelection.selectedConversationId));
      }
    } catch (error) {
      toast({
        title: 'Failed to delete conversation',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  }

  const selectedConversationTitle = selectedConversationQuery.data?.conversation.title
    ?? conversations.find((conversation) => conversation.id === selectedConversationId)?.title
    ?? 'New chat';
  const selectedConversation = selectedConversationQuery.data?.conversation
    ?? conversations.find((conversation) => conversation.id === selectedConversationId)
    ?? null;

  const sidebarBody = (
    <ChatConversationSidebar
      conversations={conversations}
      selectedConversationId={selectedConversationId}
      isLoading={conversationsQuery.isLoading}
      isCreating={createConversation.isPending || autoCreateState === 'pending'}
      isRenaming={renameConversation.isPending}
      isDeleting={deleteConversation.isPending}
      onCreateConversation={handleCreateConversation}
      onSelectConversation={(conversationId) => {
        setLocation(buildChatConversationLocation(conversationId));
      }}
      onRenameConversation={handleRenameConversation}
      onDeleteConversation={(conversation: ChatConversation) => setDeleteTarget(conversation)}
    />
  );

  return (
    <AppShell
      sidebar={<AppSidebar contextualBody={sidebarBody} contextualLabel="Recent chats" activeSection="chat" />}
      header={
        <PageHeader
          leadingSlot={<DrawerToggle />}
          title={selectedConversationTitle}
        />
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        {conversationsQuery.isLoading ? (
          <CenteredState
            icon={<Loader2 className="h-6 w-6 animate-spin" />}
            title="Loading conversations"
          />
        ) : conversationsQuery.error ? (
          <CenteredState
            icon={<AlertTriangle className="h-6 w-6 text-warning" />}
            title="Conversation list unavailable"
            description={getErrorMessage(conversationsQuery.error)}
            action={
              <button
                type="button"
                onClick={() => conversationsQuery.refetch()}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:opacity-90"
              >
                Retry
              </button>
            }
          />
        ) : autoCreateState === 'pending' && selectedConversationId == null ? (
          <CenteredState
            icon={<Loader2 className="h-6 w-6 animate-spin" />}
            title="Opening your first chat"
          />
        ) : autoCreateState === 'error' && selectedConversationId == null ? (
          <CenteredState
            icon={<AlertTriangle className="h-6 w-6 text-warning" />}
            title="Unable to initialize chat"
            description="We couldn't create the first conversation. Try again to continue."
            action={
              <button
                type="button"
                onClick={() => setAutoCreateState('idle')}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:opacity-90"
              >
                Retry
              </button>
            }
          />
        ) : selectedConversationId == null ? (
          <CenteredState
            icon={<MessageSquareText className="h-6 w-6" />}
            title="Select a conversation"
            description="Choose an existing thread or start a new one from the sidebar."
          />
        ) : selectedConversationQuery.isLoading ? (
          <CenteredState
            icon={<Loader2 className="h-6 w-6 animate-spin" />}
            title="Loading thread"
          />
        ) : selectedConversationQuery.error ? (
          <CenteredState
            icon={<AlertTriangle className="h-6 w-6 text-warning" />}
            title="Thread unavailable"
            description={getErrorMessage(selectedConversationQuery.error)}
            action={
              <button
                type="button"
                onClick={() => selectedConversationQuery.refetch()}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:opacity-90"
              >
                Reload
              </button>
            }
          />
        ) : (
          <NativeChatThread
            key={selectedConversationId}
            conversationId={selectedConversationId}
            initialMessages={selectedConversationQuery.data?.messages}
            modelId={selectedModelId}
            onModelIdChange={setSelectedModelId}
            userId={selectedConversation?.userId ?? null}
            shouldConsiderOpener={homepageOpenerConversationId === selectedConversationId && !initialUserMessage}
            initialUserMessage={initialUserMessage}
          />
        )}
      </div>

      <ConfirmationModal
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        title="Delete conversation"
        description={`Delete "${deleteTarget?.title ?? 'this conversation'}"? The persisted message history for this thread will be removed.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => {
          void handleDeleteConversation();
        }}
        variant="destructive"
        isLoading={deleteConversation.isPending}
      />
    </AppShell>
  );
}
