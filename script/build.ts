import { build as esbuild } from "esbuild";
import { build as viteBuild, loadEnv } from "vite";
import { copyFile, readFile, rm } from "fs/promises";
import path from "path";
import { checkBrandBundle, type BrandId } from "./check-brand-bundle";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  // Validate brand selection BEFORE building. Vite reads `VITE_BRAND` from
  // process.env or `.env`; we mirror that resolution here so the error is
  // clear and consistent regardless of how the var was provided.
  const env = loadEnv("production", path.resolve(process.cwd()), "");
  // Normalize the brand id before validating. We accept any capitalization
  // (e.g. "Keystone") and treat the retired id "alphax" as its successor
  // "keystone", then mirror the normalized value into process.env so Vite
  // resolves the exact same brand downstream.
  const rawBrand = (process.env.VITE_BRAND ?? env.VITE_BRAND ?? "").toLowerCase();
  const brand = rawBrand === "alphax" ? "keystone" : rawBrand;
  process.env.VITE_BRAND = brand;
  if (brand !== "keystone" && brand !== "brainlift") {
    throw new Error(
      `[build] VITE_BRAND must be 'keystone' or 'brainlift'; got: ${JSON.stringify(brand)}. `
        + "Set VITE_BRAND in your .env / Render env vars.",
    );
  }

  console.log(`building client (brand=${brand})...`);
  await viteBuild();

  console.log(`checking client bundle for brand=${brand} leaks...`);
  await checkBrandBundle(brand as BrandId, "dist/public");

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: "dist/index.mjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
    banner: {
      js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    },
  });

  await copyFile("server/jobs/crontab", "dist/crontab");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
