/**
 * Import Agent Conversation Storage
 *
 * Manages conversation persistence for the import agent.
 * Each brainlift has at most one conversation (upsert pattern).
 */

import {
  db, eq,
  importAgentConversations, brainlifts,
} from './base';
import type { ImportPhase } from '@shared/schema';

/** Get the import agent conversation for a brainlift, or null if none exists */
export async function getImportConversation(brainliftId: number) {
  const [conversation] = await db
    .select()
    .from(importAgentConversations)
    .where(eq(importAgentConversations.brainliftId, brainliftId));
  return conversation ?? null;
}

/** Upsert the import agent conversation (messages + phase) */
export async function saveImportConversation(
  brainliftId: number,
  messages: unknown[],
  currentPhase: ImportPhase
) {
  const [result] = await db
    .insert(importAgentConversations)
    .values({
      brainliftId,
      messages,
      currentPhase,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [importAgentConversations.brainliftId],
      set: {
        messages,
        currentPhase,
        updatedAt: new Date(),
      },
    })
    .returning();
  return result;
}

/** Delete the conversation for a brainlift (cleanup after grading starts) */
export async function deleteImportConversation(brainliftId: number) {
  const result = await db
    .delete(importAgentConversations)
    .where(eq(importAgentConversations.brainliftId, brainliftId))
    .returning();
  return result.length > 0;
}

/** Update the brainlift's import status */
export async function updateImportStatus(brainliftId: number, importStatus: string) {
  await db
    .update(brainlifts)
    .set({ importStatus })
    .where(eq(brainlifts.id, brainliftId));
}
