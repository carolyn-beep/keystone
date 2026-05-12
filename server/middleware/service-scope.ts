import type { NextFunction, Request, RequestHandler, Response } from 'express';

export function requireServiceScope(scope: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.serviceAuth) {
      res.status(401).json({ error: 'Missing service authentication' });
      return;
    }

    const scopes = Array.isArray(req.serviceAuth.scopes) ? req.serviceAuth.scopes : [];
    if (scopes.includes('*') || scopes.includes(scope)) {
      next();
      return;
    }

    res.status(403).json({ error: 'Insufficient service key scope' });
  };
}
