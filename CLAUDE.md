# DOK1 Grader V3 - Project Guidelines

## Frontend Overview

React 18 + TypeScript frontend in `client/`. Uses TanStack Query for server state, custom hooks for domain logic, Tailwind for styling.

**Key directories:**
- `client/src/pages/` - Route-level components (thin orchestration layers)
- `client/src/components/` - UI components, grouped by feature
- `client/src/hooks/` - Custom hooks for data fetching and business logic
- `client/src/lib/` - Utilities, API client, constants

**Data flow:** Hooks fetch data → Components receive via props → UI renders

---

## Frontend Guidelines

### Components Are Thin

- Components render data, they don't manage it
- Business logic lives in hooks, not components
- Page components should be ~200-400 lines max (orchestration only)

### State Rules

- **Don't use `useState` for business logic** - extract to hooks
- **Before adding `useState`**, ask: "Can this be derived from props or existing state?"
- **Modals own their internal state** - only receive `show`, `onClose`, and essential props
- **Mutations belong with their consumers** - if only one component uses it, that component owns it

### Hook Patterns

```typescript
// Domain hooks encapsulate queries + mutations
export function useSomething(id: string) {
  const query = useQuery({...});
  const mutation = useMutation({...});
  return { data: query.data, update: mutation.mutateAsync, isUpdating: mutation.isPending };
}
```

### Component Extraction

- Extract when UI needs its own state management
- Extract nested conditionals into sub-components
- Tabs, sections, modals → separate component files

---

## Backend Guidelines

Express + TypeScript backend in `server/`. Uses Drizzle ORM, domain-based routing, service layer for business logic.

> **API Reference:** See [`docs/API.md`](docs/API.md) for a complete map of all endpoints.
> - **Before starting backend work:** Review the API map to understand existing endpoints
> - **After completing backend work:** Update the API map with any new/modified endpoints

**Key directories:**
- `server/routes/` - Express routers, one per domain
- `server/services/` - Business logic (e.g., `saveBrainliftFromAI`)
- `server/utils/` - Pure utilities (file extraction, slug generation)
- `server/ai/` - AI service integrations (verification, extraction, research)
- `server/middleware/` - Auth, error handling, brainlift authorization
- `server/storage/` - Modular storage layer (domain-based files)
- `server/seed.ts` - Database seeding logic

### Route Organization

Routes are split by domain. Each file exports a router:
```typescript
// server/routes/experts.ts
export const expertsRouter = Router();
expertsRouter.get('/api/brainlifts/:slug/experts', async (req, res) => {...});
```

Main `routes.ts` just mounts them:
```typescript
app.use(expertsRouter);
app.use(verificationsRouter);
// ...
```

### Where Code Lives

| Type | Location | Example |
|------|----------|---------|
| Route handlers | `routes/{domain}.ts` | HTTP request/response |
| Business logic | `services/{domain}.ts` | `saveBrainliftFromAI` |
| Pure utilities | `utils/{name}.ts` | `extractTextFromHTML` |
| AI integrations | `ai/{service}.ts` | `verifyFactWithAllModels` |
| DB operations | `storage/{domain}.ts` | Domain-split queries with `storage/index.ts` facade |
| Middleware | `middleware/{name}.ts` | `asyncHandler`, `requireBrainliftAccess` |

### Adding New Features

1. **New route?** Add to existing domain router or create new `routes/{domain}.ts`
2. **Complex logic?** Extract to `services/` - routes should be thin
3. **Reusable utility?** Add to `utils/`
4. **New AI capability?** Add to `ai/`

### Rules

- Routes handle HTTP only - no business logic
- Services are framework-agnostic - no `req`/`res`
- Validate with `npm run build` after changes

### Database Migrations

**⚠️ NEVER merge/push code with new migrations to main until those migrations are applied to Neon prod.**

Deploying code that expects schema changes before the DB has them = broken prod.

**Workflow:**
1. Generate migration: `npx drizzle-kit generate`
2. **Apply locally first** against Docker Postgres (container: `wizardly_kalam`, db: `dok1grader_local`):
   ```bash
   docker exec -i wizardly_kalam psql -U postgres -d dok1grader_local < migrations/XXXX_migration_file.sql
   ```
3. Develop and test against the local DB
4. **Only when ready to deploy to prod**, apply to Neon:
   - Use `mcp__Neon__prepare_database_migration` (creates temp branch, tests migration)
   - Verify with `mcp__Neon__describe_table_schema`
   - Apply with `mcp__Neon__complete_database_migration`
5. Then merge/push to main

**⚠️ NEVER use Neon MCP tools during development. Neon is for PRODUCTION only.**

**Local dev config:**
- Docker container: `wizardly_kalam`
- Database: `dok1grader_local`
- User: `postgres`

**Neon prod config:**
- Project: `dok1grader` (ID: `restless-pine-13558418`)
- Database: `neondb`
- Migrations dir: `migrations/`

### Authentication & Authorization

All routes require `requireAuth` middleware (except dev routes). Use brainlift middleware for resource authorization.

```typescript
// Standard pattern: use middleware chain
router.get(
  '/api/brainlifts/:slug/experts',
  requireAuth,              // Validates session, sets req.authContext
  requireBrainliftAccess,   // Loads brainlift, checks read access, sets req.brainlift
  asyncHandler(async (req, res) => {
    // req.brainlift is guaranteed to exist and be accessible
    const experts = await storage.getExpertsByBrainliftId(req.brainlift!.id);
    res.json(experts);
  })
);
```

**Middleware options:**
| Middleware | Use Case |
|------------|----------|
| `requireBrainliftAccess` | Read operations (GET) |
| `requireBrainliftModify` | Write operations (POST/PATCH/DELETE by slug) |
| `requireBrainliftModifyById` | Write operations (DELETE by numeric ID) |

**Key points:**
- Child resources nest under `/api/brainlifts/:slug/...` for authorization context
- Middleware sets `req.brainlift` - don't fetch manually in handlers
- Always wrap async handlers with `asyncHandler()` for error handling
- Use custom error classes (`NotFoundError`, `BadRequestError`, `ForbiddenError`) instead of manual `res.status().json()`

### Error Handling

- Wrap async handlers with `asyncHandler()` from `middleware/error-handler.ts`
- Throw `BadRequestError` (400) for invalid input, `NotFoundError` (404) for missing resources
- Always validate `parseInt()` results: `if (isNaN(id)) throw new BadRequestError('Invalid ID')`

### IDOR Prevention

Child resources (experts, facts, groups) accessed by ID must verify ownership:
- Use `*ForBrainlift` storage functions (e.g., `updateExpertFollowingForBrainlift(expertId, brainliftId, ...)`)
- These include `brainliftId` in the WHERE clause - single query, no extra round-trips
- Return `null`/`false` for missing OR unauthorized - throw `NotFoundError` (prevents enumeration)

### Storage Layer

Split by domain in `server/storage/`. Import via facade: `import { storage } from '../storage'`

### Database Query Patterns

#### Push Computation to the Database

Don't fetch rows to process in JavaScript when the database can do it:

- **Counting** → `COUNT(*)` not `rows.length`
- **Summing/Averaging** → `SUM()`, `AVG()` not `.reduce()`
- **Min/Max** → `MIN()`, `MAX()` not sorting and taking first/last
- **Grouping** → `GROUP BY` not building objects in JS
- **Filtering** → `WHERE` not `.filter()`
- **Null filtering** → `WHERE x IS NOT NULL` not `.filter(r => r.x !== null)`
- **Sorting** → `ORDER BY` not `.sort()`
- **Deduplication** → `DISTINCT` or `DISTINCT ON` not `new Set()` or manual deduping
- **Existence checks** → `SELECT 1 ... LIMIT 1` not fetching to check `.length > 0`
- **Joining related data** → `JOIN` not fetching tables separately and merging in JS
- **Pagination** → `LIMIT/OFFSET` not fetching all and slicing
- **Looking up by list** → `WHERE id IN (...)` not looping with individual queries
- **Batch writes** → Multi-row `INSERT`/`UPDATE` not looping with individual statements
- **Default values** → `COALESCE(column, default)` not applying defaults after fetch
- **Conditional logic** → `CASE WHEN` not ternaries on fetched data
- **Date operations** → `DATE_TRUNC`, `EXTRACT`, interval arithmetic not JS date manipulation

The database is optimized for these operations, uses indexes effectively, and avoids transferring unnecessary data over the wire.

#### Index What You Query

Add indexes for columns that appear in `WHERE`, `JOIN ON`, and `ORDER BY` clauses—especially on tables expected to grow. For queries filtering on multiple columns, use composite indexes with the most selective column first.

Review query patterns before they ship, not after performance degrades.

#### Avoid `as any`

Cast to specific types, not `any`. If the type is known after validation, use the actual union type. If there's a genuine structural mismatch that can't be fixed upstream, add a comment explaining the cast.

Exception: `catch (error: any)` is acceptable since caught errors are inherently untyped.

### Background Jobs

**⚠️ MANDATORY: Follow these steps exactly. NO shortcuts. Type safety is non-negotiable.**

**Adding a new job (3 steps):**

1. **Create job file** `server/jobs/{name}Job.ts`:
   ```typescript
   import type { JobHelpers } from 'graphile-worker';

   export async function myJob(
     payload: { userId: number; data: string },  // Explicit inline type
     helpers: JobHelpers
   ) {
     helpers.logger.info('Job started', { userId: payload.userId });
     // Implementation
     return { result: 'success' };
   }
   ```

2. **Register in** `server/jobs/tasks.ts`:
   ```typescript
   import { myJob } from './myJob';

   const tasks = {
     'example:hello': exampleJob,
     'my:job': myJob,
   } as const;  // REQUIRED
   ```

3. **Queue anywhere**:
   ```typescript
   import { withJob } from '../utils/withJob';

   await withJob('my:job')
     .forPayload({ userId: 123, data: 'test' })
     .queue();
   ```

**MANDATORY RULES:**
- ✅ Explicit payload type inline with function signature
- ✅ `as const` in tasks registry
- ❌ NO `Task` type on job functions
- ❌ NO `any` types in payload
- ❌ NO type assertions (`as`) in payload

---

## Styling Guidelines

Tailwind CSS for all styling. Avoid inline styles except for dynamic runtime values.

### Use Tailwind Classes

```tsx
// Good
<div className="bg-card p-4 rounded-lg text-foreground">

// Bad - inline styles for static values
<div style={{ backgroundColor: tokens.surface, padding: '16px' }}>
```

### Keep Inline Styles for Dynamic Values Only

```tsx
// Dynamic value - must be inline
<div style={{ width: `${percentage}%` }}>
<div style={{ backgroundColor: isActive ? tokens.success : tokens.danger }}>
<span style={{ ...getScoreChipColors(score) }}>

// Static token - use Tailwind
<div className="bg-card">  // not style={{ backgroundColor: tokens.surface }}
```

### Color Mappings

| Token | Tailwind |
|-------|----------|
| `tokens.surface` | `bg-card` |
| `tokens.surfaceAlt` | `bg-sidebar` |
| `tokens.bg` | `bg-background` |
| `tokens.textPrimary` | `text-foreground` |
| `tokens.textSecondary` | `text-muted-foreground` |
| `tokens.primary` | `bg-primary` / `text-primary` |
| `tokens.success/warning/info` | `bg-success` / `text-warning` / etc. |
| `tokens.successSoft` | `bg-success-soft` |

### CSS Variables & Tailwind Config

Custom design tokens live in `client/src/index.css` (both `:root` and `.dark`). Tailwind config in `tailwind.config.ts` references these via `var()`.

**Always define values in CSS first, then reference in Tailwind** - don't hardcode values directly in `tailwind.config.ts`. Direct values can fail to apply reliably; CSS variables work consistently.

```css
/* index.css */
:root { --shadow-card: 0 2px 6px rgba(0,0,0,0.06); }
.dark { --shadow-card: 0 2px 6px rgba(0,0,0,0.25); }
```

```typescript
/* tailwind.config.ts */
boxShadow: { card: "var(--shadow-card)" }
```

### Refactoring

Use the `styler` sub-agent (`.claude/agents/styler.md`) for batch conversion of inline styles to Tailwind.
