import { createContext, useContext, type ReactNode } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { ComposerPrimitive, useThread } from '@assistant-ui/react';
import type { ChatModelId } from '@shared/chat-models';
import { brand } from '@/brand';
import { ChatModelPicker } from './ChatModelPicker';
import { ProjectPicker } from './ProjectPicker';

interface ChatComposerSettings {
  modelId: ChatModelId;
  onModelIdChange: (next: ChatModelId) => void;
  /** Current conversation id; null while in draft mode. */
  conversationId: number | null;
  /**
   * In draft mode the user can pick a project before any conversation
   * exists; the choice is held here and applied by the runtime PATCH right
   * after the lazy-create resolves (so the first chat request already sees
   * the binding when resolving mode).
   */
  pendingDraftBrainliftId: number | null;
  setPendingDraftBrainliftId: (id: number | null) => void;
}

const ChatComposerSettingsContext = createContext<ChatComposerSettings | null>(null);

export function ChatComposerSettingsProvider({
  modelId,
  onModelIdChange,
  conversationId,
  pendingDraftBrainliftId,
  setPendingDraftBrainliftId,
  children,
}: ChatComposerSettings & { children: ReactNode }) {
  return (
    <ChatComposerSettingsContext.Provider
      value={{
        modelId,
        onModelIdChange,
        conversationId,
        pendingDraftBrainliftId,
        setPendingDraftBrainliftId,
      }}
    >
      {children}
    </ChatComposerSettingsContext.Provider>
  );
}

function useChatComposerSettings(): ChatComposerSettings {
  const value = useContext(ChatComposerSettingsContext);
  if (!value) {
    throw new Error('ChatComposer must be rendered inside ChatComposerSettingsProvider.');
  }
  return value;
}

export function ChatComposer() {
  const {
    modelId,
    onModelIdChange,
    conversationId,
    pendingDraftBrainliftId,
    setPendingDraftBrainliftId,
  } = useChatComposerSettings();
  const isRunning = useThread((t) => t.isRunning);

  return (
    <ComposerPrimitive.Root className="chat-composer-root">
      <ComposerPrimitive.Input
        autoFocus
        rows={1}
        placeholder={brand.config.chatPlaceholder}
        className="chat-composer-input"
        addAttachmentOnPaste={false}
      />

      <div className="chat-composer-toolbar">
        <div className="chat-composer-toolbar-left">
          <ProjectPicker
            conversationId={conversationId}
            pendingDraftBrainliftId={pendingDraftBrainliftId}
            onPendingDraftBrainliftChange={setPendingDraftBrainliftId}
          />
        </div>

        <div className="chat-composer-toolbar-right">
          <ChatModelPicker value={modelId} onValueChange={onModelIdChange} />

          {isRunning ? (
            <ComposerPrimitive.Cancel
              aria-label="Stop generating"
              className="chat-composer-send"
            >
              <Square size={12} strokeWidth={3} fill="currentColor" />
            </ComposerPrimitive.Cancel>
          ) : (
            <ComposerPrimitive.Send
              aria-label="Send message"
              className="chat-composer-send"
            >
              <ArrowUp size={16} strokeWidth={2.4} />
            </ComposerPrimitive.Send>
          )}
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
}
