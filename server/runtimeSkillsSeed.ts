import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import { db } from './db';

const RUNTIME_SKILLS_MIGRATION = 'migrations/0031_runtime_skills_library.sql';
const SEED_INSERT_PATTERN = /^\s*(?:WITH\s+[\s\S]+?\)\s+)?INSERT INTO "(user|skills|skill_resources|skill_shares)"/i;

function firstRow<T>(result: { rows?: T[] } | T[]): T | undefined {
  return Array.isArray(result) ? result[0] : result.rows?.[0];
}

function getRuntimeSkillSeedStatements(): string[] {
  const migrationPath = path.resolve(process.cwd(), RUNTIME_SKILLS_MIGRATION);
  if (!existsSync(migrationPath)) {
    return [];
  }

  return readFileSync(migrationPath, 'utf-8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => SEED_INSERT_PATTERN.test(statement));
}

export async function seedRuntimeSkillsIfEmpty(): Promise<void> {
  const tableResult = await db.execute<{ skillsTable: string | null }>(
    sql`select to_regclass('public.skills') as "skillsTable"`,
  );
  const tableRow = firstRow(tableResult);

  if (!tableRow?.skillsTable) {
    return;
  }

  const countResult = await db.execute<{ skillCount: number }>(
    sql`select count(*)::int as "skillCount" from skills`,
  );
  const countRow = firstRow(countResult);

  if ((countRow?.skillCount ?? 0) > 0) {
    return;
  }

  const seedStatements = getRuntimeSkillSeedStatements();
  if (seedStatements.length === 0) {
    console.warn('Runtime skills table is empty, but seed migration SQL was not found.');
    return;
  }

  for (const statement of seedStatements) {
    await db.execute(sql.raw(statement));
  }

  console.log(`Seeded runtime skills from ${RUNTIME_SKILLS_MIGRATION}`);
}
