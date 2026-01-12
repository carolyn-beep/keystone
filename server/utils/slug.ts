import { storage } from "../storage";

export function generateSlug(title: string): string {
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
