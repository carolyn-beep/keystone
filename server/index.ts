// Load environment variables from .env file (must be first!)
import "dotenv/config";

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedProductionIfEmpty } from "./seedProduction";
import { auth } from "./lib/auth";
import { toNodeHandler } from "better-auth/node";
import { startWorker, stopWorker } from "./jobs/worker";
import { pool } from "./db";
import { assertPangramConfigured } from "./ai/pangram/client";
import { loadModelPrices } from "./ai/learning-stream-swarm-v2/cost";

// Fail loudly at startup if required third-party API keys are missing.
// PANGRAM_API_KEY powers the AI Writing Signal feature; the analyze job will
// always fail without it.
assertPangramConfigured();

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: '5mb', // Increased for dev endpoints handling large brainlift content
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Better Auth handler - must be before other routes
app.all("/api/auth/*", toNodeHandler(auth));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      // Only log the response body preview on error responses — for 2xx/3xx the
      // body is just the data we returned (visible in the DB and the browser
      // Network tab), so the preview is noise. Errors are where the body
      // actually carries diagnostic value.
      const isError = res.statusCode >= 400;
      if (capturedJsonResponse && isError) {
        const jsonStr = JSON.stringify(capturedJsonResponse);
        logLine += ` :: ${jsonStr.length > 200 ? jsonStr.slice(0, 200) + '...' : jsonStr}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Seed production database if empty
  await seedProductionIfEmpty();

  // Load model token prices into the in-memory cache (seeds DB from JSON if empty)
  await loadModelPrices();

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Start Graphile Worker (Option 1: same process)
  let worker = null;
  try {
    worker = await startWorker();
    log('[Worker] Started successfully', 'server');
  } catch (error) {
    log(`[Worker] Failed to start: ${error}`, 'server');
    // Don't crash server if worker fails - log and continue
  }

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    log(`Received ${signal}, shutting down gracefully...`, 'server');

    // Stop accepting new connections and wait for in-flight HTTP requests to complete
    await new Promise<void>((resolve) => {
      httpServer.close(() => {
        log('HTTP server closed', 'server');
        resolve();
      });
    });

    // Stop worker (waits for in-flight jobs to complete)
    // Note: The worker shares the pool with Express routes.
    // Graphile Worker's stop() method does NOT close the pool automatically,
    // so we must close it explicitly after the worker stops.
    if (worker) {
      await stopWorker();
    }

    // Close database pool after all work is done
    // This ensures in-flight HTTP requests and jobs have completed
    await pool.end();

    log('Shutdown complete', 'server');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
