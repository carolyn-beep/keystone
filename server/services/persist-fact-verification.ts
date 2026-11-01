import type { PersistFactVerificationInput } from '@shared/analytics-types';
import { saveFactVerificationResult } from '../storage/verifications';

/**
 * Persist a completed DOK1 verification snapshot.
 *
 * This is intentionally tolerant: callers should catch and log failures so
 * score recomputation and grading can still finish even if analytics persistence
 * is temporarily unavailable.
 */
export async function persistFactVerification(
  input: PersistFactVerificationInput,
): Promise<void> {
  await saveFactVerificationResult(input);
}
