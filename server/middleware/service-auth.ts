/**
 * Service-to-service authentication middleware.
 *
 * Validates X-Service-Key header against the api_keys table,
 * resolves the user from X-User-Email, enforces rate limits, and sets
 * req.authContext.
 *
 * User resolution depends on the key's scope:
 *   - Wildcard ('*') keys auto-provision unknown emails (first-party MCP).
 *   - Scoped keys (e.g. 'brainlifts:read') return 404 for unknown emails;
 *     they cannot create users.
 */

import { Request, Response, NextFunction } from 'express';
import { validateApiKey, findOrCreateUserByEmail, findUserByEmail } from '../storage/api-keys';
import { RateLimiter } from './rate-limiter';
import type { UserRole } from '@shared/schema';

// Extend Express Request to include serviceAuth
declare global {
  namespace Express {
    interface Request {
      serviceAuth?: {
        apiKeyId: number;
        apiKeyName: string;
        scopes: string[];
      };
    }
  }
}

// Module-level rate limiter instance (shared across requests)
const rateLimiter = new RateLimiter();

/**
 * Middleware that authenticates service-to-service requests.
 *
 * Required headers:
 *   X-Service-Key: API key for the calling service
 *   X-User-Email: End user's email address
 *   X-User-Name: End user's display name (optional, defaults to email prefix)
 *
 * Sets:
 *   req.authContext — same shape as requireAuth
 *   req.serviceAuth — { apiKeyId, apiKeyName, scopes } for logging and scope checks
 */
export async function requireServiceAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // 1. Validate service key
    const serviceKey = req.get('X-Service-Key');
    if (!serviceKey) {
      res.status(401).json({ error: 'Missing service key' });
      return;
    }

    const apiKey = await validateApiKey(serviceKey);
    if (!apiKey) {
      res.status(401).json({ error: 'Invalid service key' });
      return;
    }

    // 2. Check rate limit
    const rateLimit = apiKey.rateLimit ?? 60;
    const rateLimitResult = rateLimiter.check(String(apiKey.id), rateLimit);
    if (!rateLimitResult.allowed) {
      res.set('Retry-After', String(rateLimitResult.retryAfter));
      res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: rateLimitResult.retryAfter,
      });
      return;
    }

    // 3. Resolve user.
    //    Wildcard-scope keys (the first-party MCP) auto-provision unknown
    //    emails; scoped partner keys MUST NOT. A scoped key calling with an
    //    unknown email is a 404, not a silent insert — otherwise any caller
    //    can pollute the user table by iterating workspace identities.
    const userEmail = req.get('X-User-Email');
    if (!userEmail) {
      res.status(401).json({ error: 'Missing user email' });
      return;
    }

    const scopes = apiKey.scopes ?? ['*'];
    const isWildcardKey = scopes.includes('*');

    let userId: string;
    let role: string;

    if (isWildcardKey) {
      const userName = req.get('X-User-Name') || userEmail.split('@')[0];
      ({ userId, role } = await findOrCreateUserByEmail(userEmail, userName));
    } else {
      const existing = await findUserByEmail(userEmail);
      if (!existing) {
        res.status(404).json({ error: 'Unknown user' });
        return;
      }
      ({ userId, role } = existing);
    }

    // 4. Set auth context (same shape as requireAuth)
    const userRole = (role as UserRole) || 'user';
    req.authContext = {
      userId,
      role: userRole,
      isAdmin: userRole === 'admin',
    };

    // 5. Set service auth metadata
    req.serviceAuth = {
      apiKeyId: apiKey.id,
      apiKeyName: apiKey.name,
      scopes,
    };

    next();
  } catch (error) {
    console.error('Service auth middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
