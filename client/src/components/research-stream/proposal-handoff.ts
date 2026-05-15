import { runRequestSchema, type RunRequest } from '@shared/research-stream';

const STORAGE_PREFIX = 'research-stream:proposal:';
export const RESEARCH_STREAM_CONFIGURE_PARAM = 'swarm';

function storageKey(slug: string): string {
  return `${STORAGE_PREFIX}${slug}`;
}

export function buildResearchStreamConfigureUrl(slug: string): string {
  return `/grading/${slug}?tab=research-stream&configure=${RESEARCH_STREAM_CONFIGURE_PARAM}`;
}

export function stashResearchStreamProposal(slug: string, runRequest: RunRequest): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(storageKey(slug), JSON.stringify(runRequest));
}

export function consumeResearchStreamProposal(slug: string): RunRequest | null {
  if (typeof window === 'undefined') return null;

  const key = storageKey(slug);
  const raw = window.sessionStorage.getItem(key);
  if (!raw) return null;

  window.sessionStorage.removeItem(key);
  try {
    return runRequestSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}
