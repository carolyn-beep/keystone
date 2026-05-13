import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, PanelLeft } from 'lucide-react';
import type { ChatModelId } from '@shared/chat-models';
import type { ChatConversation } from '@shared/schema';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import {
  CHAT_CONVERSATIONS_QUERY_KEY,
  useChatConversation,
  useChatConversations,
  useCreateChatConversation,
  useDeleteChatConversation,
  useRenameChatConversation,
  resolveChatConversationSelection,
  resolveNextConversationSelectionAfterDelete,
  parseSelectedConversationId,
} from '@/hooks/useChatConversations';
import {
  hasBeenGreetedThisSession,
  markGreetedThisSession,
} from '@/lib/chat-greeting-session';
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

  // Holds the ID of the conversation auto-created by the homepage-landing
  // path. Only that conversation should be flagged `needsOpener=true`. Manual
  // "New chat" clicks, post-delete fallbacks, and direct `?c=ID` navigation
  // do not fire the opener. See client/src/chat/chat-opener.ts.
  const [openerPendingForId, setOpenerPendingForId] = useState<number | null>(null);

  // Holds the ID + text of a conversation auto-created in response to an
  // `?ask=...` URL param (used by the "Chat About This BrainLift" button on
  // BrainLift pages). Fires the ask text as the first visible user message
  // exactly once on entry, then clears. Mutually exclusive with the opener.
  const [askPending, setAskPending] = useState<{ id: number; text: string } | null>(null);

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

  // URL param `?send=...` queues a user message to auto-fire once the
  // conversation is open. Used by Skills "Try it out" and the Sprint plan
  // empty-state shortcut, which navigate to `/?c=<id>&send=<msg>`.
  const initialUserMessage = useMemo(() => {
    if (selectedConversationId == null) return null;
    const params = new URLSearchParams(search);
    const send = params.get('send');
    return send && send.trim().length > 0 ? send : null;
  }, [search, selectedConversationId]);

  // URL params that change routing semantics:
  //   - `new=1`   — force draft mode (sidebar New Chat / Cmd+K /
  //                 post-delete). No opener, no auto-create. The composer
  //                 lazy-creates the chat row on first submit.
  //   - `ask=...` — "Chat About This BrainLift". Eager create + fire the
  //                 ask text as the first visible user message. Bypasses
  //                 the opener cooldown.
  const { forceDraft, askParam } = useMemo(() => {
    const params = new URLSearchParams(search);
    const ask = params.get('ask');
    return {
      forceDraft: params.get('new') === '1',
      askParam: ask && ask.trim() ? ask : null,
    };
  }, [search]);

  // Draft mode: bare `/` (no `?c=`), the user already has at least one
  // conversation AND the 72h opener cooldown is still active. Instead of
  // eagerly creating an empty chat row, render the composer with
  // `conversationId={null}`; `useNativeChatRuntime` will lazy-create on
  // first submit. Also forced when the URL carries `?new=1`.
  const isDraftMode = useMemo(() => {
    if (askParam) return false;
    if (forceDraft) return true;
    if (!selection.shouldCreateConversation) return false;
    if (conversationsQuery.status !== 'success') return false;
    const alreadyGreeted = hasBeenGreetedThisSession();
    return alreadyGreeted && conversations.length > 0;
  }, [askParam, forceDraft, selection.shouldCreateConversation, conversationsQuery.status, conversations.length]);

  useEffect(() => {
    if (conversationsQuery.status !== 'success') return;
    if (!selection.shouldCreateConversation) {
      // Real conversation selected (or none yet). Reset auto-create state
      // and reconcile URL with the resolved selection.
      if (autoCreateState !== 'idle') {
        setAutoCreateState('idle');
      }
      if (
        selectedConversationId != null
        && requestedConversationId !== selectedConversationId
      ) {
        setLocation(buildChatConversationLocation(selectedConversationId));
      }
      return;
    }

    if (isDraftMode) {
      // Draft state — we will NOT auto-create. The composer renders and
      // lazy-creates the row on first submit. Nothing else to do here.
      return;
    }

    if (autoCreateState !== 'idle') return;

    // Eager create path: either `?ask=...` is set, or the user is new /
    // the opener cooldown has expired. Both produce a real DB row up
    // front because they're going to immediately send a message into it
    // (ask text or opener prompt).
    const shouldFireOpener = !askParam;

    setAutoCreateState('pending');
    createConversation.mutate({}, {
      onSuccess: (conversation) => {
        setAutoCreateState('idle');
        if (askParam) {
          setAskPending({ id: conversation.id, text: askParam });
        } else if (shouldFireOpener) {
          setOpenerPendingForId(conversation.id);
          markGreetedThisSession();
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
  }, [
    askParam,
    autoCreateState,
    conversationsQuery.status,
    createConversation,
    isDraftMode,
    requestedConversationId,
    selectedConversationId,
    selection.shouldCreateConversation,
    setLocation,
    toast,
  ]);

  // Lazy-create handler — fired by NativeChatThread once the draft chat
  // has been promoted to a real DB row (i.e. the user sent their first
  // message in draft mode). Invalidate the conversation list so the
  // sidebar picks the new row up, and push the canonical URL so refresh /
  // back navigation behaves correctly. We do this on the SAME tick as
  // create (not after the stream finishes) because the URL change will
  // cause this component to re-render with the new selection; the
  // runtime instance inside NativeChatThread survives because the `key`
  // we use on it is stable across the draft → real transition.
  const handleLazyCreated = useCallback((newConversationId: number) => {
    queryClient.invalidateQueries({ queryKey: CHAT_CONVERSATIONS_QUERY_KEY });
    setLocation(buildChatConversationLocation(newConversationId));
  }, [setLocation]);

  // Sidebar "New chat" / Cmd+K: route to draft mode. We no longer eagerly
  // insert a chat_conversations row — the row is created lazily on the
  // first user submit inside the composer (see `useNativeChatRuntime`).
  // Always route through `?new=1` so a user who landed on `/` with the
  // cooldown expired (and would otherwise get the opener) still gets a
  // clean fresh-chat surface when they explicitly ask for one.
  const handleCreateConversation = useCallback(async () => {
    setLocation('/?new=1');
  }, [setLocation]);

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
        // User deleted their last (or selected) conversation. Drop them
        // into a fresh draft instead of eagerly inserting an empty row.
        setLocation('/?new=1');
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

  // The `key` we pass to NativeChatThread must:
  //   - change when the user switches between different existing
  //     conversations (so the runtime is reset to the new thread); and
  //   - stay stable across the draft → real transition (so the in-flight
  //     send / stream isn't dropped when the URL flips from `/` to
  //     `/?c=<id>` after lazy-create).
  //
  // We use a render-time ref counter: a transition counts as a "switch"
  // only when we go from one concrete conversation id to a different one
  // (or from a concrete id back to draft). Going FROM draft TO a concrete
  // id leaves the key stable — that's exactly the lazy-create promotion.
  const prevSelectedConversationIdRef = useRef<number | null>(selectedConversationId);
  const chatSessionKeyRef = useRef(0);
  if (
    prevSelectedConversationIdRef.current !== null
    && selectedConversationId !== prevSelectedConversationIdRef.current
  ) {
    chatSessionKeyRef.current += 1;
  }
  prevSelectedConversationIdRef.current = selectedConversationId;
  const chatSessionKey = chatSessionKeyRef.current;

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
          // Draft mode: no chat_conversations row exists yet. The runtime
          // will lazy-create one on the first user submit; until then,
          // the composer renders with an empty thread. The wrapper div +
          // `key` here must match the real-conversation branch below so
          // that React reconciles the two as the same element when the
          // URL flips from `/` to `/?c=<id>` after lazy-create. Without
          // the matching wrapper, React sees different child element
          // types at the same position and unmounts the runtime
          // mid-stream — dropping the user's first message.
          <div className="min-h-0 flex-1">
            <NativeChatThread
              key={chatSessionKey}
              conversationId={null}
              initialMessages={null}
              modelId={selectedModelId}
              onModelIdChange={setSelectedModelId}
              needsOpener={false}
              initialAskMessage={null}
              onLazyCreated={handleLazyCreated}
            />
          </div>
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
          <div className="min-h-0 flex-1">
            <NativeChatThread
              key={chatSessionKey}
              conversationId={selectedConversationId}
              initialMessages={selectedConversationQuery.data?.messages}
              modelId={selectedModelId}
              onModelIdChange={setSelectedModelId}
              needsOpener={openerPendingForId === selectedConversationId && !initialUserMessage}
              initialUserMessage={initialUserMessage}
              initialAskMessage={
                askPending && askPending.id === selectedConversationId ? askPending.text : null
              }
            />
          </div>
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
