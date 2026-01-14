import { Request, Response, NextFunction } from "express";
import { auth } from "../lib/auth";
import type { Session, User } from "@shared/schema";

// Extend Express Request to include session
declare global {
  namespace Express {
    interface Request {
      session?: {
        session: Session;
        user: User;
      } | null;
    }
  }
}

/**
 * Middleware that requires authentication.
 * Returns 401 if user is not authenticated.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as any,
    });

    if (!session) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.session = session;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({ error: "Unauthorized" });
  }
}

/**
 * Middleware that optionally attaches session to request.
 * Does not block unauthenticated requests.
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as any,
    });

    req.session = session;
    next();
  } catch (error) {
    // Don't fail on auth errors for optional auth
    req.session = null;
    next();
  }
}
