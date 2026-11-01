import { useMutation, useQuery } from '@tanstack/react-query';
import type { GeneratedPlanResponse, TaskListItem } from '@shared/routes';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { getTodayLocalDate } from '@/lib/date';

interface ActivePlanResponse {
  plan: GeneratedPlanResponse['plan'] | null;
  tasks: TaskListItem[];
}

interface PollForActivePlanOptions {
  slug: string;
  attempts?: number;
  initialDelayMs?: number;
  intervalMs?: number;
  maxIntervalMs?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  shouldContinue?: () => boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, ms);
});

/**
 * Polls the active-plan endpoint until a `status='active'` plan appears. Kept
 * for tests and for any future caller that needs a blocking wait. The hook
 * itself now relies on react-query's refetchInterval instead.
 */
export async function pollForActivePlanUntilAvailable({
  slug,
  attempts = 18,
  initialDelayMs = 15_000,
  intervalMs = 5_000,
  maxIntervalMs = 15_000,
  fetchImpl = fetch,
  sleepImpl = defaultSleep,
  shouldContinue,
}: PollForActivePlanOptions): Promise<GeneratedPlanResponse | null> {
  if (initialDelayMs > 0) {
    await sleepImpl(initialDelayMs);
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (shouldContinue && !shouldContinue()) {
      return null;
    }

    const res = await fetchImpl(`/api/brainlifts/${slug}/plans/active`, {
      credentials: 'include',
    });

    if (res.ok) {
      const payload = (await res.json()) as ActivePlanResponse;
      if (payload.plan && payload.plan.status === 'active') {
        return {
          plan: payload.plan,
          tasks: payload.tasks,
        };
      }
    }

    if (attempt < attempts - 1) {
      const backoffMs = Math.min(intervalMs + attempt * 2_000, maxIntervalMs);
      await sleepImpl(backoffMs);
    }
  }

  return null;
}

export interface UseSprintResult {
  activePlan: GeneratedPlanResponse | null;
  planStatus: GeneratedPlanResponse['plan']['status'] | null;
  generationError: string | null;
  todayTasks: TaskListItem[];
  generatePlan: (localDate: string) => Promise<GeneratedPlanResponse>;
  refetch: () => void;
  isLoading: boolean;
  isGenerating: boolean;
  error: Error | null;
}

export function useSprint(slug: string): UseSprintResult {
  const localDate = getTodayLocalDate();

  const activePlanQuery = useQuery<ActivePlanResponse>({
    queryKey: ['sprint', slug, 'active-plan'],
    queryFn: async () => {
      const res = await fetch(`/api/brainlifts/${slug}/plans/active`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to fetch active sprint plan');
      }
      return res.json();
    },
    enabled: !!slug,
    refetchInterval: (query) => {
      const status = query.state.data?.plan?.status;
      return status === 'generating' ? 15_000 : false;
    },
  });

  const planStatus = activePlanQuery.data?.plan?.status ?? null;
  const isTasksQueryEnabled = !!slug && planStatus === 'active';

  const todayTasksQuery = useQuery<TaskListItem[]>({
    queryKey: ['sprint', slug, 'today-tasks', localDate],
    queryFn: async () => {
      const search = new URLSearchParams({
        includePastDue: 'true',
        localDate,
      });
      const res = await fetch(`/api/brainlifts/${slug}/tasks?${search.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error("Failed to fetch today's sprint tasks");
      }
      return res.json();
    },
    enabled: isTasksQueryEnabled,
  });

  const invalidateSprintQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['sprint', slug, 'active-plan'] });
    queryClient.invalidateQueries({ queryKey: ['sprint', slug, 'today-tasks'] });
    queryClient.invalidateQueries({ queryKey: ['sprint', slug, 'plans'] });
    queryClient.invalidateQueries({ queryKey: ['sprint', slug, 'deliverables'] });
  };

  const generatePlanMutation = useMutation({
    mutationFn: async (requestLocalDate: string) => {
      const res = await apiRequest('POST', `/api/brainlifts/${slug}/plans`, {
        localDate: requestLocalDate,
      });
      return (await res.json()) as GeneratedPlanResponse;
    },
    onSuccess: (payload) => {
      queryClient.setQueryData<ActivePlanResponse>(['sprint', slug, 'active-plan'], {
        plan: payload.plan,
        tasks: payload.tasks,
      });
      queryClient.invalidateQueries({ queryKey: ['sprint', slug, 'today-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['sprint', slug, 'plans'] });
      queryClient.invalidateQueries({ queryKey: ['sprint', slug, 'deliverables'] });
    },
  });

  const activePlan = activePlanQuery.data?.plan
    ? {
        plan: activePlanQuery.data.plan,
        tasks: activePlanQuery.data.tasks,
      }
    : null;

  return {
    activePlan,
    planStatus,
    generationError: activePlanQuery.data?.plan?.generationError ?? null,
    todayTasks: todayTasksQuery.data ?? [],
    generatePlan: generatePlanMutation.mutateAsync,
    refetch: invalidateSprintQueries,
    isLoading: activePlanQuery.isLoading || (isTasksQueryEnabled && todayTasksQuery.isLoading),
    isGenerating: generatePlanMutation.isPending || planStatus === 'generating',
    error: (generatePlanMutation.error as Error | null)
      ?? (activePlanQuery.error as Error | null)
      ?? (todayTasksQuery.error as Error | null),
  };
}
