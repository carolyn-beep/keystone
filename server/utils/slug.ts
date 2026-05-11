import { storage } from "../storage";
import { BadRequestError } from "../middleware/error-handler";

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function generateUniqueSlug(title: string, retryCount = 0): Promise<string> {
  let baseSlug = generateSlug(title);
  let slug = baseSlug;
  let counter = 1;

  // On retry, add a random suffix to avoid race conditions
  if (retryCount > 0) {
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    baseSlug = `${baseSlug}-${randomSuffix}`;
    slug = baseSlug;
  }

  while (true) {
    const existing = await storage.getBrainliftBySlug(slug);
    if (!existing) {
      return slug;
    }
    counter++;
    slug = `${baseSlug}-${counter}`;
  }
}

/**
 * Strict slug generator for agent-driven creation paths.
 *
 * Unlike `generateUniqueSlug`, this does NOT silently append `-2`, `-3`, etc.
 * on collision. If the derived slug already exists, throws a `BadRequestError`
 * with a message the agent is trained to interpret: it must call the edit
 * tools instead of trying again with a different title.
 *
 * Used by the MCP `create_brainlift` tool. Human import flows still go through
 * `generateUniqueSlug` so they keep the silent-suffix behaviour.
 */
export async function assertSlugAvailable(title: string): Promise<string> {
  const slug = generateSlug(title);
  if (!slug) {
    throw new BadRequestError('Could not derive a slug from the provided title.');
  }
  const existing = await storage.getBrainliftBySlug(slug);
  if (existing) {
    throw new BadRequestError('This BrainLift already exists. Use the edit tools instead.');
  }
  return slug;
}
