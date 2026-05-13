import {
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL_ID,
  type ChatModelId,
  type ChatModelOption,
} from '@shared/chat-models';

export const CHAT_HOME_ROUTE_PATH = '/';
export const LIBRARY_ROUTE_PATH = '/library';

export interface ChatHomeNavLink {
  href: string;
  label: string;
}

export function buildLibraryLocation(search: string): string {
  const trimmed = search.trim();
  const normalized = trimmed.startsWith('?') ? trimmed.slice(1) : trimmed;

  if (!normalized) {
    return LIBRARY_ROUTE_PATH;
  }

  return `${LIBRARY_ROUTE_PATH}?${normalized}`;
}

export function buildChatConversationLocation(conversationId: number): string {
  const params = new URLSearchParams();
  params.set('c', String(conversationId));
  return `${CHAT_HOME_ROUTE_PATH}?${params.toString()}`;
}

const PROVIDERS_ALLOWED_EMAIL = 'caina.barbosa@trilogy.com';

export function getChatHomeNavLinks(options: { isAdmin: boolean; email?: string | null }): ChatHomeNavLink[] {
  const links: ChatHomeNavLink[] = [
    { href: LIBRARY_ROUTE_PATH, label: 'Projects' },
  ];

  if (options.isAdmin) {
    links.push({ href: '/analytics', label: 'Analytics' });
  }

  if (options.email?.toLowerCase() === PROVIDERS_ALLOWED_EMAIL) {
    links.push({ href: '/admin/providers', label: 'Providers' });
  }

  return links;
}

export function getChatModelPickerOptions(): readonly ChatModelOption[] {
  return CHAT_MODELS;
}

export function getDefaultChatHomeModelId(): ChatModelId {
  return DEFAULT_CHAT_MODEL_ID;
}
