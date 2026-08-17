// Apply every migration in migrations/*.sql to a fresh public schema.
//
// This mirrors the proven local bootstrap: a plain `drizzle-kit push` is NOT
// enough for the test suite, because it skips the raw-SQL constraints/indexes
// that live in the migration files. So instead we replay the migrations
// literally.
//
// The migrations directory intentionally contains DUPLICATE objects (e.g. two
// `0000_*.sql` files that both `CREATE TABLE "account"`). Replaying every file
// in filename order therefore produces harmless "already exists" (and, for a
// few drop/alter statements, "does not exist") errors. Those are tolerated;
// any other error fails the run loudly so real schema breakage is never masked.
//
// Usage: DATABASE_URL=postgres://... node scripts/apply-migrations.mjs

import "dotenv/config"; // load .env for local runs; a no-op in CI where DATABASE_URL is set directly
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "migrations");

// Errors we tolerate: replaying duplicate migration files re-creates objects
// that already exist, or drops/alters ones a later duplicate already removed.
const TOLERATED = /already exists|does not exist/i;

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set to apply migrations.");
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    throw new Error(`No .sql files found in ${migrationsDir}`);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let tolerated = 0;
  let statements = 0;

  try {
    console.log("Resetting public schema...");
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");

    for (const file of files) {
      const sql = readFileSync(join(migrationsDir, file), "utf8");
      const parts = sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const statement of parts) {
        statements++;
        try {
          await client.query(statement);
        } catch (err) {
          const message = err && err.message ? err.message : String(err);
          if (TOLERATED.test(message)) {
            tolerated++;
            console.log(`  tolerated (${file}): ${message}`);
            continue;
          }
          console.error(`\nFATAL error in ${file}:\n${message}\n`);
          console.error("Offending statement:\n" + statement + "\n");
          throw err;
        }
      }
    }

    console.log("\n--- migration summary ---");
    console.log(`files applied:      ${files.length}`);
    console.log(`statements run:     ${statements}`);
    console.log(`tolerated errors:   ${tolerated}`);
    console.log("Migrations applied successfully.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
