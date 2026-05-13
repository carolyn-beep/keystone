import { useQuery } from '@tanstack/react-query';
import type { Brainlift } from '@shared/schema';

export type UserBrainlift = Pick<Brainlift, 'id' | 'slug' | 'title' | 'phase'>;

interface BrainliftsPageResponse {
  brainlifts: UserBrainlift[];
  pagination?: {
    page: number;
    totalPages: number;
  };
}

export const USER_BRAINLIFTS_QUERY_KEY = ['user-brainlifts'] as const;

async function fetchBrainliftsPage(page: number): Promise<BrainliftsPageResponse> {
  const response = await fetch(`/api/brainlifts?page=${page}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    const message = (await response.text()) || response.statusText;
    throw new Error(message);
  }

  return response.json() as Promise<BrainliftsPageResponse>;
}

export async function fetchUserBrainlifts(): Promise<UserBrainlift[]> {
  const firstPage = await fetchBrainliftsPage(1);
  const totalPages = firstPage.pagination?.totalPages ?? 1;
  const brainlifts = [...firstPage.brainlifts];

  for (let page = 2; page <= totalPages; page += 1) {
    const nextPage = await fetchBrainliftsPage(page);
    brainlifts.push(...nextPage.brainlifts);
  }

  return brainlifts;
}

export function useUserBrainlifts() {
  return useQuery({
    queryKey: USER_BRAINLIFTS_QUERY_KEY,
    queryFn: fetchUserBrainlifts,
  });
}
