import { useQuery } from '@tanstack/react-query';
import type { Brainlift } from '@shared/schema';

export type UserBrainlift = Pick<Brainlift, 'id' | 'slug' | 'title' | 'phase'>;

interface BrainliftTitlesResponse {
  brainlifts: UserBrainlift[];
}

export const USER_BRAINLIFTS_QUERY_KEY = ['user-brainlifts'] as const;

export async function fetchUserBrainlifts(): Promise<UserBrainlift[]> {
  const response = await fetch('/api/brainlifts/titles', {
    credentials: 'include',
  });

  if (!response.ok) {
    const message = (await response.text()) || response.statusText;
    throw new Error(message);
  }

  const payload = (await response.json()) as BrainliftTitlesResponse;
  return payload.brainlifts;
}

export function useUserBrainlifts() {
  return useQuery({
    queryKey: USER_BRAINLIFTS_QUERY_KEY,
    queryFn: fetchUserBrainlifts,
  });
}
