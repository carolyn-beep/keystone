import type { JobHelpers } from 'graphile-worker';
import { storage } from '../storage';

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface PurgeDeletedSkillsJobPayload {}

export async function purgeDeletedSkillsJob(
  _payload: PurgeDeletedSkillsJobPayload,
  helpers: JobHelpers,
) {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_MS);
  const cutoffIso = cutoff.toISOString();

  helpers.logger.info('Starting deleted skills purge', { cutoff: cutoffIso });

  const deletedCount = await storage.hardDeleteExpiredDeletedSkills(cutoff);

  helpers.logger.info('Deleted skills purge completed', {
    cutoff: cutoffIso,
    deletedCount,
  });

  return {
    success: true,
    deletedCount,
    cutoff: cutoffIso,
    completedAt: new Date().toISOString(),
  };
}
