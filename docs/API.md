# API Endpoints Map - DOK1 Grader V3

## Overview

- **Total Endpoints:** 36
- **Production Endpoints:** 31
- **Development-Only Endpoints:** 5
- **Domain Routers:** 7

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
| GET | `/api/brainlifts/:slug/grades` | `requireAuth` | Get reading list grades |
| POST | `/api/brainlifts/:slug/grades` | `requireAuth` | Save grade for reading list item |
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

## Research (`server/routes/research.ts`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/brainlifts/:slug/research` | `requireAuth` | Search via Perplexity |
| POST | `/api/brainlifts/:slug/reading-list` | `requireAuth` | Add to reading list |
| POST | `/api/brainlifts/:slug/tweets` | `requireAuth` | Search Twitter for relevant tweets |
| GET | `/api/brainlifts/:slug/feedback` | `requireAuth` | Get source feedback |
| POST | `/api/brainlifts/:slug/feedback` | `requireAuth` | Save source feedback decision |

---

## Analytics (`server/routes/analytics.ts`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/analytics/model-accuracy` | `requireAdmin` | LLM model accuracy stats (admin only) |

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
