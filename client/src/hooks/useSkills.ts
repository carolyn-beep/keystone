import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { CHAT_CONVERSATIONS_QUERY_KEY } from './useChatConversations';

export type SkillVisibility = 'public' | 'private';

type JsonDate = string | Date | null;

interface SkillListItemDto {
  id: number;
  name: string;
  description: string;
  visibility: SkillVisibility;
  enabled: boolean;
  createdByUserId: string;
  createdByName: string;
  lastEditedByUserId: string | null;
  lastEditedByName: string | null;
  lastEditedAt: JsonDate;
  referenceCount: number;
  isCreatedByMe: boolean;
}

interface SkillReferenceDto {
  id: number;
  path: string;
  content: string;
}

interface SkillShareDto {
  id: number;
  userId: string;
  userName: string;
  userEmail: string;
  createdByUserId: string;
  createdAt: JsonDate;
}

interface SkillDetailDto extends SkillListItemDto {
  body: string;
  references: SkillReferenceDto[];
  shares: SkillShareDto[];
  deletedAt: JsonDate;
  deletedByUserId: string | null;
  createdAt: JsonDate;
  updatedAt: JsonDate;
}

interface DeletedSkillDto {
  id: number;
  name: string;
  description: string;
  visibility: SkillVisibility;
  deletedAt: JsonDate;
  deletedByUserId: string | null;
  deletedByName: string;
  daysUntilPurge: number;
}

export interface SkillListItem extends Omit<SkillListItemDto, 'lastEditedAt'> {
  lastEditedAt: Date | null;
}

export interface SkillReferenceInput {
  path: string;
  content: string;
}

export interface SkillReference extends SkillReferenceInput {
  id: number;
}

export interface SkillShare extends Omit<SkillShareDto, 'createdAt'> {
  createdAt: Date | null;
}

export interface SkillDetail extends Omit<SkillDetailDto,
  'lastEditedAt' | 'references' | 'shares' | 'deletedAt' | 'createdAt' | 'updatedAt'
> {
  lastEditedAt: Date | null;
  references: SkillReference[];
  shares: SkillShare[];
  deletedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface DeletedSkill extends Omit<DeletedSkillDto, 'deletedAt'> {
  deletedAt: Date | null;
}

export interface SaveSkillRequest {
  name: string;
  description: string;
  body: string;
  visibility: SkillVisibility;
  references: SkillReferenceInput[];
  shareIdentifiers: string[];
}

export interface TryItOutResponse {
  conversationId: number;
  location: string;
  prefill: string;
}

export const SKILLS_QUERY_KEY = ['skills'] as const;
export const SKILLS_TRASH_QUERY_KEY = ['skills', 'trash'] as const;

export function getSkillsQueryKey(opts: { createdByMe?: boolean } = {}) {
  return [...SKILLS_QUERY_KEY, opts.createdByMe ? 'created-by-me' : 'all'] as const;
}

export function getSkillDetailQueryKey(name: string | null | undefined) {
  return [...SKILLS_QUERY_KEY, 'detail', name ?? ''] as const;
}

function asDate(value: JsonDate): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function normalizeListItem(skill: SkillListItemDto): SkillListItem {
  return {
    ...skill,
    lastEditedAt: asDate(skill.lastEditedAt),
  };
}

function normalizeDetail(skill: SkillDetailDto): SkillDetail {
  return {
    ...skill,
    lastEditedAt: asDate(skill.lastEditedAt),
    createdAt: asDate(skill.createdAt),
    updatedAt: asDate(skill.updatedAt),
    deletedAt: asDate(skill.deletedAt),
    references: skill.references,
    shares: skill.shares.map((share) => ({
      ...share,
      createdAt: asDate(share.createdAt),
    })),
  };
}

function normalizeDeleted(skill: DeletedSkillDto): DeletedSkill {
  return {
    ...skill,
    deletedAt: asDate(skill.deletedAt),
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
  });

  if (!response.ok) {
    const message = (await response.text()) || response.statusText;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function invalidateSkillQueries(name?: string): void {
  queryClient.invalidateQueries({ queryKey: SKILLS_QUERY_KEY });
  if (name) {
    queryClient.invalidateQueries({ queryKey: getSkillDetailQueryKey(name) });
  }
}

export function useSkills(opts: { createdByMe?: boolean } = {}) {
  const createdByMe = Boolean(opts.createdByMe);

  return useQuery({
    queryKey: getSkillsQueryKey({ createdByMe }),
    queryFn: async () => {
      const suffix = createdByMe ? '?createdBy=me' : '';
      const data = await fetchJson<{ skills: SkillListItemDto[] }>(`/api/skills${suffix}`);
      return data.skills.map(normalizeListItem);
    },
  });
}

export function useSkillDetail(name: string | null, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: getSkillDetailQueryKey(name),
    enabled: Boolean(name) && (opts.enabled ?? true),
    queryFn: async () => {
      const data = await fetchJson<{ skill: SkillDetailDto }>(`/api/skills/${encodeURIComponent(name!)}`);
      return normalizeDetail(data.skill);
    },
  });
}

export function useDeletedSkills(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: SKILLS_TRASH_QUERY_KEY,
    enabled: opts.enabled ?? true,
    queryFn: async () => {
      const data = await fetchJson<{ skills: DeletedSkillDto[] }>('/api/skills/trash');
      return data.skills.map(normalizeDeleted);
    },
  });
}

export function useCreateSkill() {
  return useMutation({
    mutationFn: async (input: SaveSkillRequest) => {
      const response = await apiRequest('POST', '/api/skills', input);
      const data = await response.json() as { skill: SkillDetailDto };
      return normalizeDetail(data.skill);
    },
    onSuccess: (skill) => {
      invalidateSkillQueries(skill.name);
    },
  });
}

export function useUpdateSkill() {
  return useMutation({
    mutationFn: async ({ currentName, input }: { currentName: string; input: SaveSkillRequest }) => {
      const response = await apiRequest('PUT', `/api/skills/${encodeURIComponent(currentName)}`, input);
      const data = await response.json() as { skill: SkillDetailDto };
      return normalizeDetail(data.skill);
    },
    onSuccess: (skill, variables) => {
      invalidateSkillQueries(skill.name);
      if (variables.currentName !== skill.name) {
        invalidateSkillQueries(variables.currentName);
      }
    },
  });
}

export function useDeleteSkill() {
  return useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest('DELETE', `/api/skills/${encodeURIComponent(name)}`);
      return response.json() as Promise<{ deleted: true }>;
    },
    onSuccess: (_, name) => {
      invalidateSkillQueries(name);
      queryClient.invalidateQueries({ queryKey: SKILLS_TRASH_QUERY_KEY });
    },
  });
}

export function useRestoreSkill() {
  return useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest('POST', `/api/skills/${encodeURIComponent(name)}/restore`);
      return response.json() as Promise<{ restored: true }>;
    },
    onSuccess: (_, name) => {
      invalidateSkillQueries(name);
      queryClient.invalidateQueries({ queryKey: SKILLS_TRASH_QUERY_KEY });
    },
  });
}

export function useSetSkillEnabled() {
  return useMutation({
    mutationFn: async ({ name, enabled }: { name: string; enabled: boolean }) => {
      const response = await apiRequest('PUT', `/api/skills/${encodeURIComponent(name)}/enabled`, { enabled });
      return response.json() as Promise<{ enabled: boolean }>;
    },
    onSuccess: (_, variables) => {
      invalidateSkillQueries(variables.name);
    },
  });
}

export function useGrantSkillShare() {
  return useMutation({
    mutationFn: async ({ name, identifier }: { name: string; identifier: string }) => {
      const response = await apiRequest('POST', `/api/skills/${encodeURIComponent(name)}/shares`, { identifier });
      const data = await response.json() as { share: SkillShareDto };
      return {
        ...data.share,
        createdAt: asDate(data.share.createdAt),
      } satisfies SkillShare;
    },
    onSuccess: (_, variables) => {
      invalidateSkillQueries(variables.name);
    },
  });
}

export function useRevokeSkillShare() {
  return useMutation({
    mutationFn: async ({ name, shareId }: { name: string; shareId: number }) => {
      const response = await apiRequest('DELETE', `/api/skills/${encodeURIComponent(name)}/shares/${shareId}`);
      return response.json() as Promise<{ revoked: true }>;
    },
    onSuccess: (_, variables) => {
      invalidateSkillQueries(variables.name);
    },
  });
}

export function useTryItOutSkill() {
  return useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest('POST', `/api/skills/${encodeURIComponent(name)}/try-it-out`);
      return response.json() as Promise<TryItOutResponse>;
    },
    onSuccess: (_, name) => {
      invalidateSkillQueries(name);
      queryClient.invalidateQueries({ queryKey: CHAT_CONVERSATIONS_QUERY_KEY });
    },
  });
}
