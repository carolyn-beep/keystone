export interface ChatModelOption {
  id: string;
  label: string;
  description: string;
}

export const CHAT_MODELS = [
  {
    id: 'anthropic/claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    description: 'Best default for deep chat turns and multi-step reasoning.',
  },
  {
    id: 'qwen/qwen-plus',
    label: 'Qwen Plus',
    description: 'Fast general-purpose model for everyday chat turns.',
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    label: 'Claude Haiku 4.5',
    description: 'Lower-latency option for lightweight chat work.',
  },
] as const satisfies readonly ChatModelOption[];

export type ChatModelId = (typeof CHAT_MODELS)[number]['id'];

export const DEFAULT_CHAT_MODEL_ID: ChatModelId = 'anthropic/claude-sonnet-4.6';

const CHAT_MODEL_ID_SET = new Set<string>(CHAT_MODELS.map((model) => model.id));

export function isChatModelId(value: string): value is ChatModelId {
  return CHAT_MODEL_ID_SET.has(value);
}

export function getChatModelOption(modelId: string): ChatModelOption | undefined {
  return CHAT_MODELS.find((model) => model.id === modelId);
}
