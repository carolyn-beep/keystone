/**
 * Import Agent Logger
 *
 * Structured verbose logging gated by IMPORT_AGENT_VERBOSE_LOG=true.
 * All messages prefixed with [IMPORT AGENT][brainliftId:X] for easy filtering.
 */

const isVerbose = () => process.env.IMPORT_AGENT_VERBOSE_LOG === 'true';

export function importLog(brainliftId: number, message: string, data?: Record<string, unknown>) {
  if (!isVerbose()) return;
  const prefix = `[IMPORT AGENT][brainliftId:${brainliftId}]`;
  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export function importWarn(brainliftId: number, message: string, data?: Record<string, unknown>) {
  const prefix = `[IMPORT AGENT][brainliftId:${brainliftId}]`;
  if (data) {
    console.warn(`${prefix} ${message}`, data);
  } else {
    console.warn(`${prefix} ${message}`);
  }
}

export function importError(brainliftId: number, message: string, error?: unknown) {
  const prefix = `[IMPORT AGENT][brainliftId:${brainliftId}]`;
  console.error(`${prefix} ${message}`, error instanceof Error ? error.message : error);
}
