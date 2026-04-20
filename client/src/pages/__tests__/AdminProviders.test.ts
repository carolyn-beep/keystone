import { describe, it, expect } from 'vitest';
import {
  formatFailoverReason,
  formatProviderLabel,
  resolveProviderHealthViewState,
} from '../admin-providers-helpers';

describe('AdminProviders view state', () => {
  it('returns loading when session is pending', () => {
    expect(resolveProviderHealthViewState({
      isSessionPending: true,
      isAdmin: true,
      isLoading: false,
      error: null,
    })).toBe('loading');
  });

  it('returns denied when not admin', () => {
    expect(resolveProviderHealthViewState({
      isSessionPending: false,
      isAdmin: false,
      isLoading: false,
      error: null,
    })).toBe('denied');
  });

  it('returns loading while provider health query is loading', () => {
    expect(resolveProviderHealthViewState({
      isSessionPending: false,
      isAdmin: true,
      isLoading: true,
      error: null,
    })).toBe('loading');
  });

  it('returns error when query fails', () => {
    expect(resolveProviderHealthViewState({
      isSessionPending: false,
      isAdmin: true,
      isLoading: false,
      error: new Error('boom'),
    })).toBe('error');
  });

  it('returns ready when admin and data is available', () => {
    expect(resolveProviderHealthViewState({
      isSessionPending: false,
      isAdmin: true,
      isLoading: false,
      error: null,
    })).toBe('ready');
  });
});

describe('AdminProviders formatting helpers', () => {
  it('formats provider labels', () => {
    expect(formatProviderLabel('openrouter')).toBe('OpenRouter');
    expect(formatProviderLabel('anthropic')).toBe('Anthropic');
    expect(formatProviderLabel('openai')).toBe('OpenAI');
    expect(formatProviderLabel('google')).toBe('Google');
    expect(formatProviderLabel('fireworks')).toBe('Fireworks');
  });

  it('formats known failover reasons', () => {
    expect(formatFailoverReason('retry_exhausted')).toBe('Retry exhausted');
    expect(formatFailoverReason('retry_after_exceeded')).toBe('Retry-After exceeded');
    expect(formatFailoverReason('non_retryable')).toBe('Non-retryable error');
    expect(formatFailoverReason('provider_unavailable')).toBe('Provider unavailable');
    expect(formatFailoverReason('circuit_open')).toBe('Circuit open');
  });

  it('formats unknown failover reasons by title-casing', () => {
    expect(formatFailoverReason('custom_reason_here')).toBe('Custom Reason Here');
  });
});
