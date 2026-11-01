import { seedRuntimeSkillsIfEmpty } from "./runtimeSkillsSeed";

/**
 * Boot-time seeding.
 *
 * Only the runtime skills library is seeded (from the committed migration
 * SQL, and only when the `skills` table is empty). No brainlift content is
 * seeded: a fresh deployment starts with an empty library and users create
 * their own documents.
 */
export async function seedDatabase() {
  console.log("Checking seed data...");
  await seedRuntimeSkillsIfEmpty();
}
