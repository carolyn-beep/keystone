# Authorization Implementation Plan

## Overview

Implement role-based authorization with two roles: **User** (default) and **Admin** (full access). Design for future **Guide** role without implementing it.

**Key Decisions:**
- Legacy brainlifts (null owner) → Admins only
- Admin assignment → Manual database update via Neon console
- Role storage → Better Auth admin plugin (adds `role` column to user table)

---

## Phase 1: Schema & Better Auth Admin Plugin

### 1.1 Install and configure Better Auth admin plugin

**File:** `server/lib/auth.ts`

```typescript
import { admin } from "better-auth/plugins";

export const auth = betterAuth({
  // ... existing config
  plugins: [
    admin({
      defaultRole: "user",
    }),
  ],
});
```

### 1.2 Update client auth to include admin plugin

**File:** `client/src/lib/auth-client.ts`

```typescript
import { adminClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [
    adminClient(),
  ],
});
```

### 1.3 Generate and run migration

The admin plugin adds these columns to `user` table:
- `role` (text, default "user")
- `banned` (boolean)
- `banReason` (text)
- `banExpires` (timestamp)

And to `session` table:
- `impersonatedBy` (text)

```bash
npx @better-auth/cli generate
npx drizzle-kit generate
npx drizzle-kit migrate
```

### 1.4 Add performance index

**File:** `shared/schema.ts`

Add index on `brainlifts.createdByUserId` for filtering queries:

```typescript
export const brainlifts = pgTable("brainlifts", {
  // ... existing columns
}, (table) => [
  index("brainlifts_created_by_user_id_idx").on(table.createdByUserId),
]);
```

### 1.5 Add types for authorization

**File:** `shared/schema.ts`

```typescript
export const USER_ROLES = {
  USER: "user",
  ADMIN: "admin",
  // GUIDE: "guide", // Future
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export type AuthContext = {
  userId: string;
  role: UserRole;
  isAdmin: boolean;
};
```

---

## Phase 2: Auth Middleware Enhancement

**File:** `server/middleware/auth.ts`

Update middleware to build `AuthContext` from session:

```typescript
import type { AuthContext, UserRole } from "@shared/schema";

declare global {
  namespace Express {
    interface Request {
      session?: { session: Session; user: User } | null;
      authContext?: AuthContext;
    }
  }
}

function buildAuthContext(user: any): AuthContext {
  const role = (user.role as UserRole) || "user";
  return {
    userId: user.id,
    role,
    isAdmin: role === "admin",
  };
}

export async function requireAuth(req, res, next) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  req.session = session;
  req.authContext = buildAuthContext(session.user);
  next();
}

export async function requireAdmin(req, res, next) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const authContext = buildAuthContext(session.user);
  if (!authContext.isAdmin) {
    return res.status(403).json({ error: "Forbidden: Admin access required" });
  }

  req.session = session;
  req.authContext = authContext;
  next();
}
```

---

## Phase 3: Storage Layer Authorization

**File:** `server/storage.ts`

### 3.1 Add authorization methods to IStorage interface

```typescript
interface IStorage {
  // New auth-aware methods
  getBrainliftsForUser(authContext: AuthContext): Promise<Brainlift[]>;
  canAccessBrainlift(brainlift: Brainlift, authContext: AuthContext): boolean;
  canModifyBrainlift(brainlift: Brainlift, authContext: AuthContext): boolean;
  getBrainliftById(id: number): Promise<Brainlift | undefined>;
  // ... existing methods
}
```

### 3.2 Implement authorization methods

```typescript
// Get brainlifts based on user role
async getBrainliftsForUser(authContext: AuthContext): Promise<Brainlift[]> {
  if (authContext.isAdmin) {
    // Admin sees ALL brainlifts (including legacy)
    return db.select().from(brainlifts).orderBy(brainlifts.id);
  }
  // Regular user sees only their own brainlifts
  return db.select().from(brainlifts)
    .where(eq(brainlifts.createdByUserId, authContext.userId))
    .orderBy(brainlifts.id);
}

// Check read access
canAccessBrainlift(brainlift: Brainlift, authContext: AuthContext): boolean {
  if (authContext.isAdmin) return true;
  if (brainlift.createdByUserId === null) return false; // Legacy = admin only
  return brainlift.createdByUserId === authContext.userId;
}

// Check write access (update/delete)
canModifyBrainlift(brainlift: Brainlift, authContext: AuthContext): boolean {
  if (authContext.isAdmin) return true;
  return brainlift.createdByUserId === authContext.userId;
}

// Helper to get brainlift by ID (for delete endpoint)
async getBrainliftById(id: number): Promise<Brainlift | undefined> {
  const [brainlift] = await db.select().from(brainlifts).where(eq(brainlifts.id, id));
  return brainlift;
}
```

---

## Phase 4: Route Layer Authorization

Apply middleware and authorization checks to all route files.

### 4.1 Brainlifts routes (`server/routes/brainlifts.ts`)

| Endpoint | Method | Auth | Authorization |
|----------|--------|------|---------------|
| `/api/brainlifts` | GET | `requireAuth` | Filter via `getBrainliftsForUser()` |
| `/api/brainlifts/:slug` | GET | `requireAuth` | `canAccessBrainlift()` |
| `/api/brainlifts` | POST | `requireAuth` | Set `createdByUserId` |
| `/api/brainlifts/:id` | DELETE | `requireAuth` | `canModifyBrainlift()` |
| `/api/brainlifts/import` | POST | `requireAuth` | Set `createdByUserId` |
| `/api/brainlifts/:slug/update` | PATCH | `requireAuth` | `canModifyBrainlift()` |
| `/api/brainlifts/:slug/author` | PATCH | `requireAuth` | `canModifyBrainlift()` |
| `/api/grades` | POST | `requireAuth` | Via parent brainlift |

### 4.2 Other routes

All routes in these files need `requireAuth` middleware:
- `server/routes/experts.ts` - Check parent brainlift access
- `server/routes/verifications.ts` - Check parent brainlift access
- `server/routes/redundancy.ts` - Check parent brainlift access
- `server/routes/research.ts` - Check parent brainlift access

**Analytics routes** (`server/routes/analytics.ts`):
- `/api/model-accuracy` → `requireAdmin` (system-wide data)

**Dev routes** (`server/routes/dev.ts`):
- Keep as-is (already gated by NODE_ENV)

### 4.3 Route pattern example

```typescript
// List - filtered by user
brainliftsRouter.get(api.brainlifts.list.path, requireAuth, async (req, res) => {
  const brainlifts = await storage.getBrainliftsForUser(req.authContext!);
  res.json(brainlifts);
});

// Get single - with access check
brainliftsRouter.get(api.brainlifts.get.path, requireAuth, async (req, res) => {
  const brainlift = await storage.getBrainliftBySlug(req.params.slug);
  if (!brainlift) return res.status(404).json({ message: "Brainlift not found" });
  if (!storage.canAccessBrainlift(brainlift, req.authContext!)) {
    return res.status(403).json({ message: "Access denied" });
  }
  res.json(brainlift);
});

// Delete - with modify check
brainliftsRouter.delete('/api/brainlifts/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const brainlift = await storage.getBrainliftById(id);
  if (!brainlift) return res.status(404).json({ message: "Brainlift not found" });
  if (!storage.canModifyBrainlift(brainlift, req.authContext!)) {
    return res.status(403).json({ message: "Access denied" });
  }
  await storage.deleteBrainlift(id);
  res.json({ message: "Brainlift deleted successfully" });
});

// Create - set userId
brainliftsRouter.post('/api/brainlifts/import', requireAuth, upload.single('file'), async (req, res) => {
  // ... existing extraction logic ...
  const brainlift = await saveBrainliftFromAI(brainliftData, content, sourceType, req.authContext!.userId);
  res.status(201).json(brainlift);
});
```

---

## Phase 5: Service Layer Updates

**File:** `server/services/brainliftService.ts`

Update `saveBrainliftFromAI` to accept userId parameter:

```typescript
export async function saveBrainliftFromAI(
  data: BrainliftAIData,
  content: string,
  sourceType: string,
  userId: string  // Add this parameter
): Promise<BrainliftData> {
  // ... existing logic
  const brainlift = await storage.createBrainlift(
    brainliftData,
    factsData,
    clustersData,
    readingData,
    userId  // Pass to storage
  );
  // ...
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `server/lib/auth.ts` | Add admin plugin |
| `client/src/lib/auth-client.ts` | Add adminClient plugin |
| `shared/schema.ts` | Add AuthContext type, UserRole enum, index |
| `server/middleware/auth.ts` | Add `buildAuthContext()`, `requireAdmin()` |
| `server/storage.ts` | Add `getBrainliftsForUser()`, `canAccessBrainlift()`, `canModifyBrainlift()`, `getBrainliftById()` |
| `server/routes/brainlifts.ts` | Add middleware, authorization checks |
| `server/routes/experts.ts` | Add middleware, parent brainlift checks |
| `server/routes/verifications.ts` | Add middleware, parent brainlift checks |
| `server/routes/redundancy.ts` | Add middleware, parent brainlift checks |
| `server/routes/research.ts` | Add middleware, parent brainlift checks |
| `server/routes/analytics.ts` | Add `requireAdmin` middleware |
| `server/services/brainliftService.ts` | Accept userId in `saveBrainliftFromAI()` |

---

## Admin Setup (Post-Deployment)

After deploying, manually set admin role in Neon DB:

```sql
UPDATE "user" SET role = 'admin' WHERE email = 'your-admin@email.com';
```

---

## Future: Guide Role Extension

When implementing Guide role:

1. Add `guide_students` table:
```typescript
export const guideStudents = pgTable("guide_students", {
  id: serial("id").primaryKey(),
  guideUserId: text("guide_user_id").notNull().references(() => user.id),
  studentUserId: text("student_user_id").notNull().references(() => user.id),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
}, (table) => [
  index("guide_students_guide_idx").on(table.guideUserId),
  index("guide_students_student_idx").on(table.studentUserId),
]);
```

2. Update `getBrainliftsForUser()` to include students' brainlifts for guides
3. Update `canAccessBrainlift()` to allow guides to read students' data

---

## Verification

1. **Build check:** `npm run build`
2. **Test user flow:**
   - Sign in as regular user
   - Create brainlift → verify ownership set
   - List brainlifts → verify only own brainlifts shown
   - Access other user's brainlift → verify 403
3. **Test admin flow:**
   - Set user as admin in DB
   - List brainlifts → verify all brainlifts shown (including legacy)
   - Delete any brainlift → verify works
4. **Test public view:** `/view/:slug` should still work without auth
