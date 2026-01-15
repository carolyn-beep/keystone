import { Request, Response, NextFunction } from "express";
import { auth } from "../lib/auth";
import type { Session, User, AuthContext, UserRole } from "@shared/schema";

// Extend Express Request to include session and authContext
declare global {
  namespace Express {
    interface Request {
      session?: {
        session: Session;
        user: User;
      } | null;
      authContext?: AuthContext;
    }
  }
}

/**
 * Build AuthContext from user data
 */
function buildAuthContext(user: User): AuthContext {
  const role = (user.role as UserRole) || "user";
  return {
    userId: user.id,
    role,
    isAdmin: role === "admin",
  };
}

/**
 * Middleware that requires authentication.
 * Attaches session and authContext to request.
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
    req.authContext = buildAuthContext(session.user as User);
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({ error: "Unauthorized" });
  }
}

/**
 * Middleware that requires admin role.
 * Returns 401 if not authenticated, 403 if not admin.
 */
export async function requireAdmin(
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

    const authContext = buildAuthContext(session.user as User);

    if (!authContext.isAdmin) {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
    }

    req.session = session;
    req.authContext = authContext;
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
    req.authContext = session ? buildAuthContext(session.user as User) : undefined;
    next();
  } catch (error) {
    // Don't fail on auth errors for optional auth
    req.session = null;
    req.authContext = undefined;
    next();
  }
}
