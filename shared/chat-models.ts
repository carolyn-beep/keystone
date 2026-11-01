export interface ChatModelOption {
  id: string;
  label: string;
  description: string;
}

// Curated picker. Every entry is an OpenRouter slug that supports tool calling
// and structured outputs (checked against the catalogue 2026-11-01). Order is
// the order shown in the picker: Anthropic tiers, then other labs, then open
// weights. Add a price row in learning-stream-swarm-v2/cost-prices.json when
// a model here is also used by the swarm.
export const CHAT_MODELS = [
  {
    id: 'anthropic/claude-fable-5.1',
    label: 'Claude Fable 5.1',
    description: 'Most capable Anthropic model; reserve for the hardest reasoning and critique.',
  },
  {
    id: 'anthropic/claude-opus-5.5',
    label: 'Claude Opus 5.5',
    description: 'Top-tier reasoning for demanding chat turns.',
  },
  {
    id: 'anthropic/claude-sonnet-5.5',
    label: 'Claude Sonnet 5.5',
    description: 'Best default for deep chat turns and multi-step reasoning.',
  },
  {
    id: 'anthropic/claude-haiku-5.5',
    label: 'Claude Haiku 5.5',
    description: 'Lower-latency option for lightweight chat work.',
  },
  {
    id: 'openai/gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    description: 'OpenAI flagship for general-purpose chat.',
  },
  {
    id: 'google/gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    description: 'Fast Gemini with a large context window.',
  },
  {
    id: 'x-ai/grok-4.7',
    label: 'Grok 4.7',
    description: 'xAI flagship; a different take for second opinions.',
  },
  {
    id: 'moonshotai/kimi-k3.1-pro',
    label: 'Kimi K3.1 Pro',
    description: 'Open-weight frontier model from Moonshot, strong at long documents.',
  },
  {
    id: 'deepseek/deepseek-v4.1-flash',
    label: 'DeepSeek V4.1 Flash',
    description: 'Open-weight, very low cost for everyday chat turns.',
  },
] as const satisfies readonly ChatModelOption[];

export type ChatModelId = (typeof CHAT_MODELS)[number]['id'];

export const DEFAULT_CHAT_MODEL_ID: ChatModelId = 'anthropic/claude-sonnet-5.5';

const CHAT_MODEL_ID_SET = new Set<string>(CHAT_MODELS.map((model) => model.id));

export function isChatModelId(value: string): value is ChatModelId {
  return CHAT_MODEL_ID_SET.has(value);
}

export function getChatModelOption(modelId: string): ChatModelOption | undefined {
  return CHAT_MODELS.find((model) => model.id === modelId);
}
