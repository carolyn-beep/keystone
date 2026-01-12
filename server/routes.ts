import type { Express } from "express";
import type { Server } from "http";
import { expertsRouter } from "./routes/experts";
import { verificationsRouter } from "./routes/verifications";
import { redundancyRouter } from "./routes/redundancy";
import { researchRouter } from "./routes/research";
import { analyticsRouter } from "./routes/analytics";
import { brainliftsRouter } from "./routes/brainlifts";
import { seedDatabase, backfillOriginalContent } from "./seed";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Mount domain routers
  app.use(expertsRouter);
  app.use(verificationsRouter);
  app.use(redundancyRouter);
  app.use(researchRouter);
  app.use(analyticsRouter);
  app.use(brainliftsRouter);

  await seedDatabase();

  // Backfill originalContent for existing brainlifts that are missing it
  await backfillOriginalContent();

  return httpServer;
}
