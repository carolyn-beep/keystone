import type { Express } from "express";
import type { Server } from "http";
import { expertsRouter } from "./routes/experts";
import { verificationsRouter } from "./routes/verifications";
import { redundancyRouter } from "./routes/redundancy";
import { analyticsRouter } from "./routes/analytics";
import { adminRouter } from "./routes/admin";
import { brainliftsRouter } from "./routes/brainlifts";
import { sharesRouter } from "./routes/shares";
import { jobsRouter } from "./routes/jobs";
import { learningStreamRouter } from "./routes/learning-stream";
import { discussionRouter } from "./routes/discussion";
import { dok3Router } from "./routes/dok3";
import { dok4Router } from "./routes/dok4";
import { chatRouter } from "./routes/chat";
import { knowledgeCheckRouter } from "./routes/knowledge-check";
import { nativeBrainliftsRouter } from "./routes/native-brainlifts";
import { purposeSuggestionsRouter } from "./routes/purpose-suggestions";
import { builderExpertsRouter } from "./routes/builder-experts";
import { knowledgeTreeRouter } from "./routes/knowledge-tree";
import { internalRouter } from "./routes/internal";
import { dok1CrudRouter } from "./routes/dok1-crud";
import { dok2CrudRouter } from "./routes/dok2-crud";
import { sprintsRouter } from "./routes/sprints";
import { skillsRouter } from "./routes/skills";
import { errorHandler } from "./middleware/error-handler";
import { seedDatabase, backfillOriginalContent } from "./seed";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Mount domain routers
  app.use(expertsRouter);
  app.use(verificationsRouter);
  app.use(redundancyRouter);
  app.use(analyticsRouter);
  app.use(adminRouter);
  app.use(brainliftsRouter);
  app.use(sharesRouter);
  app.use(jobsRouter);
  app.use(learningStreamRouter);
  app.use(discussionRouter);
  app.use(dok3Router);
  app.use(dok4Router);
  app.use(chatRouter);
  app.use(knowledgeCheckRouter);
  app.use(nativeBrainliftsRouter);
  app.use(purposeSuggestionsRouter);
  app.use(builderExpertsRouter);
  app.use(knowledgeTreeRouter);
  app.use(internalRouter);
  app.use(dok1CrudRouter);
  app.use(dok2CrudRouter);
  app.use(sprintsRouter);
  app.use(skillsRouter);

  // Global error handler - must be after all routes
  app.use(errorHandler);

  await seedDatabase();

  // Backfill originalContent for existing brainlifts that are missing it
  await backfillOriginalContent();

  return httpServer;
}
