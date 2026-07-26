/**
 * AlphaX chat opener message.
 *
 * Inserted client-side as a synthetic assistant message (no model call) the
 * first time an AlphaX user lands on an empty chat conversation, gated by the
 * 7-day localStorage cooldown in `lib/chat-greeting-session.ts`. The thread
 * runtime keeps the message in state, so when the student types a reply the
 * full history (including this synthetic turn) is sent to the model.
 */

import { buildKeystoneSyntheticOpenerText } from '@shared/alphax-synthetic-opener';

export function buildKeystoneOpenerText(firstName: string | null | undefined): string {
  return buildKeystoneSyntheticOpenerText(firstName);
}
