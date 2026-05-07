import {
  CHAT_HOME_ROUTE_PATH,
  LIBRARY_ROUTE_PATH,
} from '@/components/chat/chat-home-helpers';

export const APP_PROTECTED_ROUTE_ORDER = [
  CHAT_HOME_ROUTE_PATH,
  '/analytics',
  '/admin/providers',
  LIBRARY_ROUTE_PATH,
  '/brainlifts/:slug',
  '/grading/:slug',
  '/:slug',
] as const;
