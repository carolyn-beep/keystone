# API Endpoints Map - DOK1 Grader V3

## Overview

- **Total Endpoints:** 60
- **Production Endpoints:** 54
- **Development-Only Endpoints:** 6
- **Domain Routers:** 11

---

## Authentication & Authorization

All API endpoints (except `/api/auth/*`) require authentication via Better Auth session cookies.

### Middleware

| Middleware | Description |
|------------|-------------|
| `requireAuth` | Validates session, attaches `req.authContext` with `userId`, `role`, `isAdmin` |
| `requireAdmin` | Same as `requireAuth` + requires `role === 'admin'` |
| `requireBrainliftAccess` | Loads brainlift by `:slug`, checks read access, sets `req.brainlift` |
| `requireBrainliftModify` | Loads brainlift by `:slug`, checks write access, sets `req.brainlift` |
| `requireBrainliftModifyById` | Loads brainlift by `:id`, checks write access, sets `req.brainlift` |
| `asyncHandler` | Wraps async handlers to catch errors and forward to error middleware |

### Roles

| Role | Access |
|------|--------|
| `user` | Own brainlifts only |
| `admin` | All brainlifts (including legacy with `createdByUserId: null`) |

### Authorization Helpers (storage)

| Method | Description |
|--------|-------------|
| `canAccessBrainlift(brainlift, authContext)` | Read access check |
| `canModifyBrainlift(brainlift, authContext)` | Write access check |
| `getBrainliftsForUserPaginated(authContext, offset, limit)` | User's own brainlifts (paginated) |
| `getAllBrainliftsPaginated(offset, limit)` | All brainlifts (admin only, paginated) |

---

## Brainlifts (`server/routes/brainlifts.ts`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/brainlifts` | `requireAuth` | List brainlifts (paginated, 9/page) |
| GET | `/api/brainlifts/:slug` | `requireAuth` | Get brainlift by slug |
| POST | `/api/brainlifts` | `requireAuth` | Create new brainlift |
| DELETE | `/api/brainlifts/:id` | `requireAuth` | Delete brainlift |
| POST | `/api/brainlifts/import` | `requireAuth` | Import from file/URL |
| PATCH | `/api/brainlifts/:slug/update` | `requireAuth` | Update brainlift from new file/URL |
| PATCH | `/api/brainlifts/:slug/author` | `requireAuth` | Update author/owner |
| GET | `/api/brainlifts/:slug/versions` | `requireAuth` | Get version history |

### Pagination (GET `/api/brainlifts`)

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page number (1-indexed, default: 1) |
| `all` | boolean | Admin only: show all brainlifts when `true` |

**Response:**
```json
{
  "brainlifts": [...],
  "pagination": {
    "page": 1,
    "pageSize": 9,
    "total": 25,
    "totalPages": 3
  }
}
```

---

## Native Brainlifts (`server/routes/native-brainlifts.ts`)

Endpoints for creating and managing native (Builder) brainlifts.

| # | Method | Path | Auth | Middleware | Description |
|---|--------|------|------|------------|-------------|
| 1 | `POST` | `/api/brainlifts/native` | `requireAuth` | - | Create a native brainlift with topic, purpose, owner. Returns 201. |
| 2 | `GET` | `/api/brainlifts/:slug/native-details` | `requireAuth` | `requireBrainliftAccess` | Get native builder details (phase progress, suggestion state). Returns 404 if not native. |
| 3 | `PATCH` | `/api/brainlifts/:slug/native-details` | `requireAuth` | `requireBrainliftModify` | Update topic, purpose, owner, or lastActivePhase. Rejects non-native brainlifts. |

### Validation Schemas

- **Create:** `topic` (min 10), `purpose` (min 20), `owner` (optional, nullable)
- **Patch:** All fields optional. `lastActivePhase` must be 1-5. Empty body rejected.

---

## Purpose Suggestions (`server/routes/purpose-suggestions.ts`)

AI-powered purpose suggestion endpoint for the Build from Scratch wizard.

| # | Method | Path | Auth | Middleware | Description |
|---|--------|------|------|------------|-------------|
| 1 | `POST` | `/api/brainlifts/native/purpose-suggestions` | `requireAuth` | - | Returns 3-4 AI-generated purpose phrases for a topic. Degrades to empty array on failure. |

### Validation Schema

- **Input:** `topic` (string, min 10, trimmed)
- **Response:** `{ suggestions: string[] }` (0-4 items)

### Notes

- Uses `google/gemini-2.0-flash-001` (fast tier) via unified AI client
- Caller: `builder.purposeSuggestions`
- Non-blocking: always returns 200, even on AI failure (empty array)

---

## Builder Experts (`server/routes/builder-experts.ts`)

Endpoints for managing builder-authored experts in native brainlifts (suggested + manual).

| # | Method | Path | Auth | Middleware | Description |
|---|--------|------|------|------------|-------------|
| 1 | `GET` | `/api/brainlifts/:slug/builder-experts` | `requireAuth` | `requireBrainliftAccess` | List all builder experts with suggestion status. Rejects non-native brainlifts (400). |
| 2 | `POST` | `/api/brainlifts/:slug/builder-experts` | `requireAuth` | `requireBrainliftModify` | Create a manual saved expert. Triggers phase progress and research queue. Returns 201. |
| 3 | `PATCH` | `/api/brainlifts/:slug/builder-experts/:id` | `requireAuth` | `requireBrainliftModify` | Update expert fields or accept a suggestion (status='saved'). Returns 404 if not found/IDOR. |
| 4 | `PATCH` | `/api/brainlifts/:slug/builder-experts/:id/dismiss` | `requireAuth` | `requireBrainliftModify` | Dismiss a pending suggested expert. Returns 404 if not found. |
| 5 | `DELETE` | `/api/brainlifts/:slug/builder-experts/:id` | `requireAuth` | `requireBrainliftModify` | Delete a builder expert. Triggers phase regression if last saved expert. Returns 204. |
| 6 | `POST` | `/api/brainlifts/:slug/builder-experts/regenerate-suggestions` | `requireAuth` | `requireBrainliftModify` | Clear stale pending suggestions, reset status, re-queue suggestion job. Returns 202. |

### Validation Schemas

- **Create:** `name` (min 1), `who` (min 1), `where` (min 1), `focus` (optional, nullable), `why` (optional, nullable)
- **Patch:** All create fields optional. `status` restricted to `'saved'` (for accepting suggestions).

### Background Job

- `brainlift:suggest-experts` -- AI-generated expert suggestions using `callModelWithFallback(['anthropic/claude-sonnet-4.6', 'anthropic/claude-haiku-4.5'])`

---

## Experts (`server/routes/experts.ts`)

All routes nested under `/api/brainlifts/:slug/experts` for authorization context.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/brainlifts/:slug/experts` | `requireAuth` | Get all experts for brainlift |
| POST | `/api/brainlifts/:slug/experts/refresh` | `requireAuth` | Extract/refresh experts using AI |
| PATCH | `/api/brainlifts/:slug/experts/:id/follow` | `requireAuth` | Update expert following status |
| DELETE | `/api/brainlifts/:slug/experts/:id` | `requireAuth` | Delete an expert |
| GET | `/api/brainlifts/:slug/experts/following` | `requireAuth` | Get followed experts only |

---

## Verifications (`server/routes/verifications.ts`)

All routes nested under `/api/brainlifts/:slug` for authorization context.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/brainlifts/:slug/verifications` | `requireAuth` | Get facts with verification status |
| POST | `/api/brainlifts/:slug/facts/:factId/verify` | `requireAuth` | Multi-LLM verification for single fact |
| POST | `/api/brainlifts/:slug/verify-all` | `requireAuth` | Verify all facts (background) |
| POST | `/api/brainlifts/:slug/verifications/:verificationId/override` | `requireAuth` | Human override verification score |
| POST | `/api/brainlifts/:slug/facts/:factId/human-grade` | `requireAuth` | Human grade for fact |
| GET | `/api/brainlifts/:slug/human-grades` | `requireAuth` | Get human grade overrides |
| GET | `/api/brainlifts/:slug/verification-summary` | `requireAuth` | Get verification stats |

---

## Redundancy (`server/routes/redundancy.ts`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/brainlifts/:slug/analyze-redundancy` | `requireAuth` | Analyze facts for redundancy |
| GET | `/api/brainlifts/:slug/redundancy` | `requireAuth` | Get redundancy groups |
| PATCH | `/api/brainlifts/:slug/redundancy-groups/:groupId` | `requireAuth` | Update group status |

---

## Analytics (`server/routes/analytics.ts`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/analytics/model-accuracy` | `requireAdmin` | LLM model accuracy stats (admin only) |

---

## Learning Stream (`server/routes/learning-stream.ts`)

All routes nested under `/api/brainlifts/:slug/learning-stream` for authorization context.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/brainlifts/:slug/learning-stream` | `requireBrainliftAccess` | Get learning stream items (with filters) |
| GET | `/api/brainlifts/:slug/learning-stream/stats` | `requireBrainliftAccess` | Get stream stats (pending/saved/graded counts) |
| PATCH | `/api/brainlifts/:slug/learning-stream/:itemId/bookmark` | `requireBrainliftModify` | Bookmark/unbookmark an item |
| PATCH | `/api/brainlifts/:slug/learning-stream/:itemId/discard` | `requireBrainliftModify` | Discard/undiscard an item |
| POST | `/api/brainlifts/:slug/learning-stream/:itemId/grade` | `requireBrainliftModify` | Grade an item |
| GET | `/api/brainlifts/:slug/learning-stream/:itemId/content` | `requireBrainliftAccess` | Get extracted content for an item |
| POST | `/api/brainlifts/:slug/learning-stream/refresh` | `requireBrainliftModify` | Trigger research refill |
| GET | `/api/brainlifts/:slug/learning-stream/swarm-events` | `requireBrainliftAccess` | SSE stream for swarm research progress |

---

## Discussion (`server/routes/discussion.ts`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/brainlifts/:slug/discussion` | `requireBrainliftAccess` | Streaming discussion agent (SSE via Vercel AI SDK) |
| GET | `/api/brainlifts/:slug/discussion/suggestions?itemId=X` | `requireBrainliftAccess` | AI-generated discussion starter suggestions (Haiku) |

**Request body:**
```json
{
  "messages": [{ "id": "1", "role": "user", "parts": [{ "type": "text", "text": "..." }] }],
  "itemId": 123
}
```

**Response:** Server-Sent Events stream (UIMessageStream format from Vercel AI SDK).

**Agent tools (server-side, not API endpoints):**
| Tool | Description |
|------|-------------|
| `save_dok1_fact` | Saves a DOK1 fact to the database, queues verification |
| `save_dok2_summary` | Saves a DOK2 summary with related facts, queues grading |
| `get_brainlift_context` | Retrieves existing facts, experts, and topics for cross-reference |
| `read_article_section` | Reads extracted article content (triggers on-demand extraction if pending) |

---

## Internal API (`server/routes/internal.ts`)

> **Note:** Service-to-service only — requires `X-Service-Key` header (validated via `requireServiceAuth` middleware). Used by the Brainlift MCP server.

Service authentication also requires `X-User-Email`, which is trusted as the caller-asserted end user for downstream BrainLift access checks. API key scopes restrict which internal endpoints a service key can reach, but they do not constrain which user email a partner can assert. Restricted partner keys should be issued only to trusted operators.

**User auto-provisioning depends on key scope.** Wildcard (`*`) keys — the first-party MCP — create unknown users on first contact. Scoped keys (e.g. `brainlifts:read`) return `404 Unknown user` for emails that don't already exist on the platform; they cannot insert into the `user` table. This prevents partner integrations from polluting the user table by iterating workspace identities.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/internal/template` | Service Key | Returns the Brainlift markdown template |
| `POST` | `/api/internal/grade` | Service Key | Submit markdown for grading, returns slug |
| `GET` | `/api/internal/brainlifts` | Service Key + `brainlifts:list` | Paginated list of user's brainlifts |
| `GET` | `/api/internal/brainlifts/:slug` | Service Key + `brainlifts:read` | Canonical normalized BrainLift detail contract |
| `GET` | `/api/internal/brainlifts/:slug/status` | Service Key | Grading progress with per-DOK counts |
| `GET` | `/api/internal/brainlifts/:slug/assessment` | Service Key | Paginated assessment results by DOK level |
| `GET` | `/api/internal/brainlifts/:slug/experts` | Service Key | List imported experts for one owned brainlift |
| `POST` | `/api/internal/brainlifts/:slug/experts` | Service Key | Batch-create imported experts and queue rerank |
| `DELETE` | `/api/internal/brainlifts/:slug/experts/:id` | Service Key | Delete one imported expert and queue rerank |

### POST /api/internal/grade

- **Body:** `{ markdown: string, title?: string }`
- **Response (201):** `{ slug, brainliftId, status: 'grading', message, retryAfter: 30 }`
- **Errors:** 400 (empty/unparseable markdown, 0 facts), 401 (invalid key), 429 (rate limited)

### GET /api/internal/brainlifts

- **Query:** `page` (default 1), `pageSize` (default 10, max 20)
- **Response (200):** `{ brainlifts: [...], pagination: { page, pageSize, totalItems, totalPages } }`

### GET /api/internal/brainlifts/:slug

Canonical read-only BrainLift detail response for partner integrations. Returns current normalized state only; it does not include original imported content, classification, summary, or contradiction clusters.

- **Headers:** `X-Service-Key` is required. `X-User-Email` identifies the asserted user for BrainLift access checks.
- **Query:** `include` optional comma-separated allowlist. Supported value: `grading`.
- **Freshness:** no freshness signal is provided in this release. Clients should fetch on a cadence appropriate to their use case.
- **Trust model:** service auth trusts `X-User-Email` as the caller-asserted user. API key scopes limit endpoint access when scopes are enabled, but do not prevent asserted-user impersonation by a trusted service key.
- **Errors:** 400 for unknown include values, 401 for invalid service key, 404 for unknown slug or inaccessible BrainLift.

**Response (200):**
```json
{
  "id": 123,
  "slug": "example-brainlift",
  "title": "Example BrainLift",
  "purpose": "Short purpose, or description fallback",
  "author": "Author Name",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "experts": [
    {
      "id": 1,
      "name": "Expert Name",
      "who": "Researcher",
      "focus": "Topic",
      "why": "Relevant",
      "where": "@expert",
      "rankScore": 8,
      "rationale": "High-signal source",
      "twitterHandle": "@expert",
      "isFollowing": true
    }
  ],
  "dok1": [
    {
      "id": 10,
      "originalId": "1.1",
      "text": "Fact text",
      "category": "Category",
      "source": "Source citation",
      "note": "Grading note"
    }
  ],
  "dok2": [
    {
      "id": 20,
      "sourceName": "Source name",
      "sourceUrl": "https://example.com",
      "displayTitle": "Source synthesis",
      "category": "Category",
      "points": [{ "id": 21, "text": "Point text", "sortOrder": 0 }],
      "linkedDok1Ids": [10]
    }
  ],
  "dok3": [
    {
      "id": 30,
      "text": "Insight text",
      "status": "linked",
      "frameworkName": null,
      "frameworkDescription": null,
      "linkedDok2Ids": [20]
    }
  ],
  "dok4": [
    {
      "id": 40,
      "text": "SPOV text",
      "status": "graded",
      "linkedDok3Ids": [30],
      "primaryDok3Id": 30,
      "positionSummary": "Concise position"
    }
  ]
}
```

When `?include=grading` is present, every DOK item includes a `grading` key. Items without grading output return `"grading": null`; items with grading output nest grading fields under that key. DOK3/DOK4 `status` remains top-level because it is content state, not grading metadata.

```json
{
  "dok1": [{ "id": 10, "text": "Fact text", "grading": { "score": 5, "status": "graded" } }],
  "dok2": [{ "id": 20, "points": [], "linkedDok1Ids": [10], "grading": { "grade": 4, "feedback": "Good synthesis", "status": "graded" } }],
  "dok3": [{ "id": 30, "text": "Insight", "status": "graded", "linkedDok2Ids": [20], "grading": { "score": 4, "rationale": "Reason", "feedback": "Feedback", "criteriaBreakdown": null } }],
  "dok4": [{ "id": 40, "text": "SPOV", "status": "rejected", "linkedDok3Ids": [30], "primaryDok3Id": 30, "positionSummary": null, "grading": { "score": null, "rationale": null, "feedback": null, "criteriaBreakdown": null, "rejectionReason": "Reason", "rejectionCategory": "not_spiky" } }]
}
```

**Status enum values:**

- DOK3: `pending_linking`, `linked`, `grading`, `graded`, `error`, `scratchpadded`
- DOK4: `pending_linking`, `linked`, `grading`, `graded`, `rejected`, `error`

### GET /api/internal/brainlifts/:slug/status

- **Response (200):** `{ slug, title, status, progress: { dok1..dok4: { total, graded, pending, error } }, score, retryAfter, createdAt }`
- **Errors:** 404 (unknown slug or wrong user)

### GET /api/internal/brainlifts/:slug/assessment

- **Query:** `dok` (required, 1-4), `page` (default 1), `pageSize` (default 20, max 50), `detail` ('summary' | 'full')
- **Response (200):** `{ slug, dok, status, items: [...], pagination }`
- **Errors:** 400 (missing/invalid dok), 404 (unknown slug or wrong user)

### GET /api/internal/brainlifts/:slug/experts

- **Response (200):** `[{ id, name, who, why, focus, where, rankScore, rationale, twitterHandle, source, isFollowing }]`
- **Ordering:** `rankScore DESC NULLS LAST`, then newest ID first
- **Errors:** 404 (unknown slug or wrong user)

### POST /api/internal/brainlifts/:slug/experts

- **Body:** `{ experts: [{ name, who, why, focus?, where? }] }`
- **Response (201):** created expert rows with assigned IDs and null ranking fields until rerank completes
- **Side effect:** queues `experts:rerank` with a per-brainlift `jobKey`
- **Errors:** 400 (invalid payload), 404 (unknown slug or wrong user)

### DELETE /api/internal/brainlifts/:slug/experts/:id

- **Response (204):** no content
- **Side effect:** queues `experts:rerank` with a per-brainlift `jobKey`
- **Errors:** 400 (invalid ID), 404 (unknown slug, wrong user, or missing expert)

---

## Dev (`server/routes/dev.ts`)

> **Note:** Development only — gated on `NODE_ENV !== 'production'`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/dev/fetch-workflowy` | None | Fetch raw Workflowy content |
| POST | `/dev/fetch-workflowy-hierarchy` | None | Fetch Workflowy with hierarchy tree and marker stats |
| POST | `/dev/parse-workflowy` | None | Parse Workflowy to brainlift |
| GET | `/dev/parse-workflowy` | None | Parse via query param |
| POST | `/dev/extract-experts` | None | Extract experts with diagnostics |
| POST | `/dev/extract-dok2` | None | Extract DOK1 + DOK2 summaries with relationships |

### POST `/dev/fetch-workflowy-hierarchy`

Returns hierarchy tree with marker detection stats (DOK1, DOK2, Source, Category markers).

**Response:**
```json
{
  "success": true,
  "data": {
    "markdown": "...",
    "hierarchy": [...]
  },
  "diagnostics": {
    "timing": { "total": 1234 },
    "metadata": {
      "markdownLength": 50000,
      "hierarchyRoots": 3,
      "totalNodes": 500,
      "dok1Markers": 25,
      "dok2Markers": 20,
      "sourceMarkers": 30,
      "categoryMarkers": 10
    }
  }
}
```

### POST `/dev/extract-dok2`

Extracts DOK1 facts and DOK2 summary groups from a Workflowy hierarchy.

**Request:**
```json
{
  "url": "https://workflowy.com/s/example/ABC123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "dok1Facts": [...],
    "dok1FactsTotal": 150,
    "dok2Summaries": [
      {
        "id": "1",
        "sourceName": "Academic Article on NIL",
        "sourceUrl": "https://example.com/article",
        "sourceWorkflowyNodeId": "node_123",
        "category": "Amateurism",
        "points": [
          { "id": "1.1", "text": "Summary point 1" },
          { "id": "1.2", "text": "Summary point 2" }
        ],
        "relatedDOK1Ids": ["1", "2", "3"],
        "workflowyNodeId": "node_456"
      }
    ]
  },
  "diagnostics": {
    "timing": { "total": 2500 },
    "metadata": {
      "dok1NodesFound": 25,
      "dok2NodesFound": 20,
      "totalFactsExtracted": 150,
      "totalDOK2PointsExtracted": 80,
      "sourcesAttributed": 145,
      "categoriesFound": ["Amateurism", "NIL Policy", "NCAA Rules"]
    }
  }
}
```

---

## Route Design Principles

### Nested Routes Pattern

All child resource routes include the parent brainlift slug for authorization:

```
# Good - authorization context in URL
PATCH /api/brainlifts/:slug/experts/:id/follow

# Avoid - requires extra DB lookup for authorization
PATCH /api/experts/:id/follow
```

### Authorization Flow

1. `requireAuth` validates session, sets `req.authContext`
2. `requireBrainliftAccess`/`requireBrainliftModify` loads brainlift, checks permission, sets `req.brainlift`
3. `asyncHandler` catches errors and forwards to error middleware
4. Handler uses `req.brainlift` directly

```typescript
router.patch(
  '/api/brainlifts/:slug/experts/:id/follow',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const expertId = parseInt(req.params.id);
    if (isNaN(expertId)) throw new BadRequestError('Invalid expert ID');

    // Use *ForBrainlift function to verify child resource ownership
    const updated = await storage.updateExpertFollowingForBrainlift(
      expertId, req.brainlift!.id, req.body.isFollowing
    );
    if (!updated) throw new NotFoundError('Expert not found');

    res.json(updated);
  })
);
```
