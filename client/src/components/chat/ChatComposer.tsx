import { createContext, useContext, type ReactNode } from 'react';
import { ArrowUp, Paperclip, Square } from 'lucide-react';
import { ComposerPrimitive, useThread } from '@assistant-ui/react';
import type { ChatModelId } from '@shared/chat-models';
import { ChatModelPicker } from './ChatModelPicker';

interface ChatComposerSettings {
  modelId: ChatModelId;
  onModelIdChange: (next: ChatModelId) => void;
}

const ChatComposerSettingsContext = createContext<ChatComposerSettings | null>(null);

export function ChatComposerSettingsProvider({
  modelId,
  onModelIdChange,
  children,
}: ChatComposerSettings & { children: ReactNode }) {
  return (
    <ChatComposerSettingsContext.Provider value={{ modelId, onModelIdChange }}>
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
  const { modelId, onModelIdChange } = useChatComposerSettings();
  const isRunning = useThread((t) => t.isRunning);
  const allowAttachments = useThread((t) => t.capabilities.attachments);

  return (
    <ComposerPrimitive.Root className="chat-composer-root">
      <ComposerPrimitive.Input
        autoFocus
        rows={1}
        placeholder="Ask AlphaX Buddy…"
        className="chat-composer-input"
      />

      <div className="chat-composer-toolbar">
        <div className="chat-composer-toolbar-left">
          {allowAttachments ? (
            <ComposerPrimitive.AddAttachment
              aria-label="Attach file"
              className="chat-composer-icon-button"
            >
              <Paperclip size={16} strokeWidth={2} />
            </ComposerPrimitive.AddAttachment>
          ) : null}
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
