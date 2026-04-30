import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, MessageSquareText, PanelLeft } from 'lucide-react';
import type { ChatModelId } from '@shared/chat-models';
import type { ChatConversation } from '@shared/schema';
import { authClient } from '@/lib/auth-client';
import { queryClient } from '@/lib/queryClient';
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
  getChatHomeNavLinks,
  getDefaultChatHomeModelId,
} from '@/components/chat/chat-home-helpers';

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

export default function ChatHome() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === 'admin';

  const [selectedModelId, setSelectedModelId] = useState<ChatModelId>(
    getDefaultChatHomeModelId(),
  );
  const [deleteTarget, setDeleteTarget] = useState<ChatConversation | null>(null);
  const [autoCreateState, setAutoCreateState] = useState<'idle' | 'pending' | 'error'>('idle');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Holds the ID of the conversation auto-created by the homepage-landing
  // path. Only that conversation should be flagged `needsOpener=true`. Manual
  // "New chat" clicks, post-delete fallbacks, and direct `?c=ID` navigation
  // do not fire the opener. See shared/chat-opener.ts.
  const [openerPendingForId, setOpenerPendingForId] = useState<number | null>(null);

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
  const navLinks = getChatHomeNavLinks({
    isAdmin: Boolean(isAdmin),
    email: session?.user?.email,
  });

  useEffect(() => {
    if (conversationsQuery.status !== 'success') return;

    if (selection.shouldCreateConversation) {
      if (autoCreateState !== 'idle') return;

      setAutoCreateState('pending');
      createConversation.mutate({}, {
        onSuccess: (conversation) => {
          setAutoCreateState('idle');
          setIsSidebarOpen(false);
          // This is the homepage-landing auto-create — flag it for the
          // opener trigger. Manual New chat / post-delete fallbacks use
          // their own create paths and do NOT set this flag.
          setOpenerPendingForId(conversation.id);
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
    toast,
  ]);

  async function handleCreateConversation() {
    try {
      const conversation = await createConversation.mutateAsync({});
      setIsSidebarOpen(false);
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
        setIsSidebarOpen(false);
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

  async function handleSignOut() {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          queryClient.clear();
          setLocation('/login');
        },
      },
    });
  }

  const selectedConversationTitle = selectedConversationQuery.data?.conversation.title
    ?? conversations.find((conversation) => conversation.id === selectedConversationId)?.title
    ?? 'New chat';

  const sidebarProps = {
    conversations,
    selectedConversationId,
    navLinks,
    isLoading: conversationsQuery.isLoading,
    isCreating: createConversation.isPending || autoCreateState === 'pending',
    isRenaming: renameConversation.isPending,
    isDeleting: deleteConversation.isPending,
    user: session?.user,
    onCreateConversation: handleCreateConversation,
    onRenameConversation: handleRenameConversation,
    onDeleteConversation: (conversation: ChatConversation) => setDeleteTarget(conversation),
    onSignOut: handleSignOut,
  };

  return (
    <div className="native-chat-shell flex h-screen w-full overflow-hidden bg-background">
      {/* Mobile drawer */}
      {isSidebarOpen ? (
        <div className="fixed inset-0 z-40 xl:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[rgba(34,21,13,0.42)] backdrop-blur-[2px]"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Close conversation drawer"
          />
          <div className="absolute inset-y-0 left-0 w-[84vw] max-w-[320px] border-r border-border/60 bg-sidebar shadow-2xl">
            <ChatConversationSidebar
              {...sidebarProps}
              onSelectConversation={(conversationId) => {
                setIsSidebarOpen(false);
                setLocation(buildChatConversationLocation(conversationId));
              }}
              onClose={() => setIsSidebarOpen(false)}
              className="h-full"
            />
          </div>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="hidden w-[280px] shrink-0 border-r border-border/60 xl:block">
        <ChatConversationSidebar
          {...sidebarProps}
          onSelectConversation={(conversationId) => {
            setLocation(buildChatConversationLocation(conversationId));
          }}
          className="h-full"
        />
      </aside>

      {/* Main thread area */}
      <main className="chat-main relative isolate flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 shadow-[0_1px_3px_rgba(34,21,13,0.05)] sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground xl:hidden"
              aria-label="Open conversation list"
            >
              <PanelLeft size={16} />
            </button>
            <h1 className="truncate font-serif text-[18px] leading-tight text-foreground">
              {selectedConversationTitle}
            </h1>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-hidden">
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
              needsOpener={openerPendingForId === selectedConversationId}
            />
          )}
        </div>
      </main>

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
    </div>
  );
}
