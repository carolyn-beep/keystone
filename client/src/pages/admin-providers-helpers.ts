import type { ProviderHealthProvider } from '@shared/provider-health-types';

export type ProviderHealthViewState = 'loading' | 'denied' | 'error' | 'ready';

export function formatProviderLabel(provider: ProviderHealthProvider): string {
  const labels: Record<ProviderHealthProvider, string> = {
    openrouter: 'OpenRouter',
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    google: 'Google',
    fireworks: 'Fireworks',
  };
  return labels[provider];
}

export function formatFailoverReason(reason: string): string {
  const normalized = reason.trim();
  const mapping: Record<string, string> = {
    retry_exhausted: 'Retry exhausted',
    retry_after_exceeded: 'Retry-After exceeded',
    non_retryable: 'Non-retryable error',
    provider_unavailable: 'Provider unavailable',
    circuit_open: 'Circuit open',
  };
  if (mapping[normalized]) return mapping[normalized];
  return normalized
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function resolveProviderHealthViewState({
  isSessionPending,
  isAdmin,
  isLoading,
  error,
}: {
  isSessionPending: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  error: unknown;
}): ProviderHealthViewState {
  if (isSessionPending) return 'loading';
  if (!isAdmin) return 'denied';
  if (isLoading) return 'loading';
  if (error) return 'error';
  return 'ready';
}
