import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';
import { getProviderBreaker } from '../ai/client/circuit-breaker';
import { getFailoverCount, getRecentFailoverEvents } from '../ai/client/provider-events';
import type { ProviderName } from '../ai/client/types';
import type {
  ProviderFailoverEvent,
  ProviderHealthProvider,
  ProviderHealthResponse,
  ProviderHealthSnapshot,
} from '@shared/provider-health-types';

const PROVIDERS: ProviderHealthProvider[] = [
  'openrouter',
  'fireworks',
];

export const adminRouter = Router();

adminRouter.get(
  '/api/admin/providers',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const providers: ProviderHealthSnapshot[] = PROVIDERS.map((provider) => {
      const breaker = getProviderBreaker(provider as ProviderName);
      return {
        provider,
        state: breaker.getState(),
        failoversLast24h: getFailoverCount(provider as ProviderName),
      };
    });

    const recentFailovers: ProviderFailoverEvent[] = getRecentFailoverEvents().map((event) => ({
      timestamp: event.timestamp.toISOString(),
      caller: event.caller,
      originalModel: event.originalModel,
      actualModel: event.actualModel,
      failedProvider: event.failedProvider as ProviderHealthProvider,
      failoverProvider: event.failoverProvider as ProviderHealthProvider,
      reason: event.reason,
    }));

    const payload: ProviderHealthResponse = {
      providers,
      recentFailovers,
      generatedAt: new Date().toISOString(),
    };

    res.json(payload);
  })
);
