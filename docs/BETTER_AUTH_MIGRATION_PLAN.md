# Better Auth Migration Plan for DOK1GraderV3

## Overview

Better Auth is a comprehensive TypeScript authentication framework with first-class DrizzleORM support. Since the project currently has no active authentication system (only unused auth libraries), this is a fresh implementation.

**Current State:** No authentication - all routes are public, no user/session tables exist.

---

## 1. Installation

```bash
npm install better-auth
```

If installing in both client and server separately:
```bash
cd server && npm install better-auth
cd ../client && npm install better-auth
```

---

## 2. Environment Variables

Add to `.env`:

```env
# Required: Secret key for encryption/hashing
# Generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=your-random-secret-here

# Required: Base URL of your app
BETTER_AUTH_URL=http://localhost:5000
```

---

## 3. DrizzleORM Integration

Create `server/lib/auth.ts`:

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db"; // your drizzle instance

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg", // PostgreSQL
  }),
  emailAndPassword: {
    enabled: true,
  },
  // Optional: Add social providers
  // socialProviders: {
  //   github: {
  //     clientId: process.env.GITHUB_CLIENT_ID!,
  //     clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  //   },
  //   google: {
  //     clientId: process.env.GOOGLE_CLIENT_ID!,
  //     clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  //   },
  // },
});
```

### Drizzle Adapter Options

```typescript
drizzleAdapter(db, {
  provider: "pg",           // "pg" | "mysql" | "sqlite"
  schema: schema,           // Optional: pass your schema for custom table names
  usePlural: true,          // Optional: use plural table names (users, sessions, etc.)
})
```

### Custom Table Names

If you want to use different table names (e.g., `users` instead of `user`):

```typescript
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
      user: schema.users, // map user to users table
    },
  }),
  // OR use modelName:
  user: {
    modelName: "users",
  },
});
```

---

## 4. Core Schema

Better Auth requires 4 tables. Generate them with the CLI:

```bash
npx @better-auth/cli generate
```

Then apply with Drizzle:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

### User Table

| Field | Type | Description |
|-------|------|-------------|
| id | string | Primary key |
| name | string | Display name |
| email | string | Email address |
| emailVerified | boolean | Email verification status |
| image | string? | Profile image URL |
| createdAt | Date | Account creation timestamp |
| updatedAt | Date | Last update timestamp |

### Session Table

| Field | Type | Description |
|-------|------|-------------|
| id | string | Primary key |
| userId | string | Foreign key to user |
| token | string | Unique session token |
| expiresAt | Date | Session expiration |
| ipAddress | string? | Client IP address |
| userAgent | string? | Client user agent |
| createdAt | Date | Session creation timestamp |
| updatedAt | Date | Last update timestamp |

### Account Table

| Field | Type | Description |
|-------|------|-------------|
| id | string | Primary key |
| userId | string | Foreign key to user |
| accountId | string | Provider's account ID |
| providerId | string | Provider identifier (e.g., "credential", "github") |
| accessToken | string? | OAuth access token |
| refreshToken | string? | OAuth refresh token |
| accessTokenExpiresAt | Date? | Token expiration |
| password | string? | Hashed password (for email/password auth) |
| createdAt | Date | Account creation timestamp |
| updatedAt | Date | Last update timestamp |

### Verification Table

| Field | Type | Description |
|-------|------|-------------|
| id | string | Primary key |
| identifier | string | Verification identifier |
| value | string | Verification value/token |
| expiresAt | Date | Expiration timestamp |
| createdAt | Date | Creation timestamp |
| updatedAt | Date | Last update timestamp |

---

## 5. Server Setup (Express)

Mount the auth handler in `server/index.ts`:

```typescript
import { auth } from "./lib/auth";
import { toNodeHandler } from "better-auth/node";

// Mount Better Auth handler BEFORE other routes
app.all("/api/auth/*", toNodeHandler(auth));

// Your existing routes...
app.use(brainliftsRouter);
```

### Creating Auth Middleware

```typescript
// server/middleware/auth.ts
import { auth } from "../lib/auth";
import { Request, Response, NextFunction } from "express";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = await auth.api.getSession({
    headers: req.headers as any,
  });

  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Attach session to request for use in route handlers
  (req as any).session = session;
  next();
}

export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const session = await auth.api.getSession({
    headers: req.headers as any,
  });

  (req as any).session = session;
  next();
}
```

### Using Middleware in Routes

```typescript
// server/routes/brainlifts.ts
import { requireAuth, optionalAuth } from "../middleware/auth";

// Protected route - requires authentication
brainliftsRouter.post("/api/brainlifts", requireAuth, async (req, res) => {
  const session = (req as any).session;
  const brainlift = await createBrainlift({
    ...req.body,
    createdByUserId: session.user.id,
  });
  res.json(brainlift);
});

// Optional auth - works for both authenticated and anonymous users
brainliftsRouter.get("/api/brainlifts", optionalAuth, async (req, res) => {
  const session = (req as any).session;
  const brainlifts = session
    ? await getBrainliftsByUser(session.user.id)
    : await getPublicBrainlifts();
  res.json(brainlifts);
});
```

---

## 6. Client Setup

Create `client/src/lib/auth-client.ts`:

```typescript
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000",
});
```

---

## 7. Basic Usage

### Sign Up

```typescript
import { authClient } from "@/lib/auth-client";

const handleSignUp = async (email: string, password: string, name: string) => {
  const { data, error } = await authClient.signUp.email({
    email,
    password,
    name,
    callbackURL: "/dashboard", // redirect after email verification
  }, {
    onRequest: () => {
      // Show loading state
    },
    onSuccess: () => {
      // Redirect or show success message
    },
    onError: (ctx) => {
      console.error(ctx.error.message);
    },
  });

  return { data, error };
};
```

### Sign In

```typescript
const handleSignIn = async (email: string, password: string) => {
  const { data, error } = await authClient.signIn.email({
    email,
    password,
    callbackURL: "/dashboard",
    rememberMe: true, // keep session after browser closes
  });

  return { data, error };
};
```

### Sign Out

```typescript
const handleSignOut = async () => {
  await authClient.signOut({
    fetchOptions: {
      onSuccess: () => {
        window.location.href = "/";
      },
    },
  });
};
```

### Social Sign-In

```typescript
const handleGitHubSignIn = async () => {
  await authClient.signIn.social({
    provider: "github",
    callbackURL: "/dashboard",
    errorCallbackURL: "/auth/error",
  });
};
```

---

## 8. Session Management

### Client-Side: useSession Hook

```typescript
import { authClient } from "@/lib/auth-client";

function UserProfile() {
  const {
    data: session,
    isPending,
    error,
    refetch,
  } = authClient.useSession();

  if (isPending) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!session) return <div>Not logged in</div>;

  return (
    <div>
      <h1>Welcome, {session.user.name}</h1>
      <p>Email: {session.user.email}</p>
      <img src={session.user.image} alt="Profile" />
    </div>
  );
}
```

### Client-Side: getSession (non-hook)

```typescript
const { data: session, error } = await authClient.getSession();
```

### Server-Side: Get Session

```typescript
import { auth } from "./lib/auth";

// In Express route
app.get("/api/me", async (req, res) => {
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  res.json({ user: session.user });
});
```

### Session Configuration

```typescript
export const auth = betterAuth({
  session: {
    expiresIn: 60 * 60 * 24 * 7,    // 7 days (in seconds)
    updateAge: 60 * 60 * 24,         // Refresh session daily
    freshAge: 60 * 5,                // Session is "fresh" for 5 minutes
    cookieCache: {
      enabled: true,                 // Cache session in cookie
      maxAge: 5 * 60,               // Cache for 5 minutes
    },
  },
});
```

### Session Management Methods

```typescript
// List all active sessions for user
const sessions = await authClient.listSessions();

// Revoke a specific session
await authClient.revokeSession({ token: "session-token" });

// Revoke all other sessions (except current)
await authClient.revokeOtherSessions();

// Revoke all sessions (logout everywhere)
await authClient.revokeSessions();
```

---

## 9. Linking to Existing Schema

Update `shared/schema.ts` to reference the auth user:

```typescript
import { pgTable, varchar, text, timestamp, boolean } from "drizzle-orm/pg-core";

// Auth tables (generated by Better Auth CLI)
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

// Your existing brainlifts table with foreign key
export const brainlifts = pgTable("brainlifts", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  // Link to auth user
  createdByUserId: text("created_by_user_id").references(() => user.id),
  // ... other fields
});
```

---

## 10. Security Features

### CSRF Protection (enabled by default)

- Origin validation on all requests
- SameSite=Lax cookies by default
- No mutations on GET requests

### Rate Limiting

```typescript
export const auth = betterAuth({
  rateLimit: {
    enabled: true,
    window: 10,        // 10 second window
    max: 100,          // 100 requests per window
    storage: "memory", // or "database" or "secondary-storage"
  },
});
```

### Password Security

- Uses scrypt algorithm by default (memory-hard, CPU-intensive)
- Minimum 8 character passwords by default

### Trusted Origins

```typescript
export const auth = betterAuth({
  trustedOrigins: [
    "https://your-app.com",
    "https://*.your-app.com", // wildcard subdomains
  ],
});
```

---

## 11. Implementation Checklist

### Phase 1: Setup
- [x] Install `better-auth` package (also upgraded drizzle-orm to latest)
- [x] Add environment variables (BETTER_AUTH_SECRET, BETTER_AUTH_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
- [x] Create `server/lib/auth.ts` with Drizzle adapter (Google SSO only, no email/password)
- [x] Generate auth schema and merge into `shared/schema.ts`
- [x] Run Drizzle migrations

### Phase 2: Server Integration
- [x] Mount auth handler in `server/index.ts`
- [x] Create auth middleware (`requireAuth`, `optionalAuth`) in `server/middleware/auth.ts`
- [ ] Update routes to use authentication (part of authorization layer)

### Phase 3: Client Integration
- [x] Create `client/src/lib/auth-client.ts`
- [x] Build Google Sign-In UI component (`/login` page with split layout)
- [x] Implement protected routes (`ProtectedRoute` wrapper component)
- [x] Add session display (`UserMenu` component with avatar, name, sign out)

### Phase 4: Data Migration
- [x] Update `brainlifts` table foreign key to reference `user.id`
- [ ] Migrate existing data (assign to default user or leave null)
- [ ] Update API routes to filter by user

### Phase 5: Authorization (Requires Planning)
- [ ] Plan authorization layer (see Section 14)
- [ ] Implement user-scoped queries
- [ ] Protect routes appropriately

---

## 12. Useful CLI Commands

```bash
# Generate auth schema for your ORM
npx @better-auth/cli generate

# Apply migrations directly (Kysely adapter only)
npx @better-auth/cli migrate

# Generate Drizzle migration files
npx drizzle-kit generate

# Apply Drizzle migrations
npx drizzle-kit migrate
```

---

## 13. Available Plugins

Better Auth has a plugin system for extended functionality:

| Plugin | Purpose |
|--------|---------|
| `twoFactor` | Two-factor authentication (TOTP) |
| `magicLink` | Email magic link login |
| `passkey` | WebAuthn/Passkey authentication |
| `username` | Username-based login |
| `emailOTP` | One-time password via email |
| `multiSession` | Multiple active sessions per user |

Example:
```typescript
import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";

export const auth = betterAuth({
  plugins: [
    twoFactor(),
  ],
});
```

---

## 14. Authorization Layer (Requires Planning)

> **STOP**: Before implementing this step, create a detailed plan for the authorization layer.

Better Auth only handles **authentication** (who is the user). It does NOT automatically filter data by user. You must implement **authorization** (what can the user access) yourself.

### What Needs Planning

1. **Data ownership** - Which tables need `createdByUserId` filtering?
2. **Route protection** - Which endpoints require auth vs remain public?
3. **Storage layer changes** - New query methods for user-scoped data
4. **Public vs private resources** - Can anonymous users see anything?
5. **Legacy data handling** - What happens to existing brainlifts with null `createdByUserId`?
6. **Related resources** - How do experts, verifications, etc. inherit access from their parent brainlift?

### Key Principle

Without authorization logic, authenticated users would still see ALL brainlifts from ALL users. The auth system only tells you WHO is making the request - your code must decide WHAT they can see.

---

## 15. Deployment Reminders

> **CRITICAL**: Complete these steps before deploying to production.

### Environment Variables (Production)

Set these in your production environment (Vercel, Railway, Render, etc.):

```env
BETTER_AUTH_SECRET=<generate-new-secret-for-prod>
BETTER_AUTH_URL=https://your-production-domain.com
GOOGLE_CLIENT_ID=<same-or-different-for-prod>
GOOGLE_CLIENT_SECRET=<same-or-different-for-prod>
```

### Google OAuth Console

1. Add production redirect URI: `https://your-domain.com/api/auth/callback/google`
2. Verify authorized domains are configured
3. Consider using separate OAuth credentials for prod vs dev

### Database Migrations

**Run migrations on Neon DB BEFORE deploying the new code:**

```bash
# Connect to production database and run migrations
DATABASE_URL=<your-neon-prod-url> npx drizzle-kit migrate
```

Or use Neon's console to run the generated SQL directly.

### Pre-Deployment Checklist

- [ ] Generate new `BETTER_AUTH_SECRET` for production (don't reuse dev secret)
- [ ] Set `BETTER_AUTH_URL` to production domain (no trailing slash)
- [ ] Add Google OAuth redirect URI for production domain
- [ ] Run database migrations on Neon before deploying code
- [ ] Test Google OAuth flow in production after deployment
- [ ] Verify session cookies are being set correctly (check HTTPS/secure cookies)

### Post-Deployment Verification

1. Test Google Sign-In flow end-to-end
2. Verify session persistence (refresh page, check if still logged in)
3. Check browser dev tools for any cookie/CORS issues
4. Monitor error logs for auth-related failures

---

## References

- [Better Auth Documentation](https://better-auth.com)
- [Drizzle Adapter Docs](https://better-auth.com/docs/adapters/drizzle)
- [Session Management](https://better-auth.com/docs/concepts/session-management)
- [CLI Reference](https://better-auth.com/docs/concepts/cli)
