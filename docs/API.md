# API Endpoints Map - DOK1 Grader V3

## Overview

- **Total Endpoints:** 32
- **Production Endpoints:** 28
- **Development-Only Endpoints:** 4
- **Domain Routers:** 7

---

## Experts (`server/routes/experts.ts`)

| Method | Endpoint | Line | Description |
|--------|----------|------|-------------|
| GET | `/api/brainlifts/:slug/experts` | 8 | Get all experts for a brainlift |
| POST | `/api/brainlifts/:slug/experts/refresh` | 24 | Extract/refresh experts using AI |
| PATCH | `/api/experts/:id/follow` | 69 | Update expert following status |
| DELETE | `/api/experts/:id` | 87 | Delete an expert |
| GET | `/api/brainlifts/:slug/experts/following` | 99 | Get followed experts only |

---

## Verifications (`server/routes/verifications.ts`)

| Method | Endpoint | Line | Description |
|--------|----------|------|-------------|
| GET | `/api/brainlifts/:slug/verifications` | 13 | Get facts with verification status |
| POST | `/api/facts/:factId/verify` | 33 | Multi-LLM verification for single fact |
| POST | `/api/brainlifts/:slug/verify-all` | 111 | Verify all facts (background) |
| POST | `/api/verifications/:verificationId/override` | 191 | Human override verification score |
| POST | `/api/facts/:factId/human-grade` | 209 | Human grade for fact |
| GET | `/api/brainlifts/:slug/human-grades` | 234 | Get human grade overrides |
| GET | `/api/brainlifts/:slug/verification-summary` | 262 | Get verification stats |

---

## Redundancy (`server/routes/redundancy.ts`)

| Method | Endpoint | Line | Description |
|--------|----------|------|-------------|
| POST | `/api/brainlifts/:slug/analyze-redundancy` | 10 | Analyze facts for redundancy |
| GET | `/api/brainlifts/:slug/redundancy` | 45 | Get redundancy groups |
| PATCH | `/api/redundancy-groups/:groupId` | 88 | Update group status |

---

## Research (`server/routes/research.ts`)

| Method | Endpoint | Line | Description |
|--------|----------|------|-------------|
| POST | `/api/brainlifts/:slug/research` | 10 | Search via Perplexity |
| POST | `/api/brainlifts/:slug/reading-list` | 103 | Add to reading list |
| POST | `/api/brainlifts/:slug/tweets` | 129 | Search Twitter for relevant tweets |
| GET | `/api/brainlifts/:slug/feedback` | 259 | Get source feedback |
| POST | `/api/brainlifts/:slug/feedback` | 276 | Save source feedback decision |

---

## Brainlifts (`server/routes/brainlifts.ts`)

| Method | Endpoint | Line | Description |
|--------|----------|------|-------------|
| GET | `/api/brainlifts` | 20 | List all brainlifts |
| GET | `/api/brainlifts/:slug` | 26 | Get brainlift by slug |
| POST | `/api/brainlifts` | 35 | Create new brainlift |
| DELETE | `/api/brainlifts/:id` | 63 | Delete brainlift |
| POST | `/api/brainlifts/import` | 78 | Import from file/URL |
| GET | `/api/brainlifts/:slug/grades` | 159 | Get reading list grades |
| POST | `/api/grades` | 181 | Save grade for reading list item |
| PATCH | `/api/brainlifts/:slug/update` | 202 | Update brainlift from new file/URL |
| PATCH | `/api/brainlifts/:slug/author` | 375 | Update author/owner |
| GET | `/api/brainlifts/:slug/versions` | 391 | Get version history |

---

## Analytics (`server/routes/analytics.ts`)

| Method | Endpoint | Line | Description |
|--------|----------|------|-------------|
| GET | `/api/analytics/model-accuracy` | 8 | LLM model accuracy stats |

---

## Dev (`server/routes/dev.ts`)

> **Note:** Development only — gated on `NODE_ENV !== 'production'`

| Method | Endpoint | Line | Description |
|--------|----------|------|-------------|
| POST | `/dev/fetch-workflowy` | 92 | Fetch raw Workflowy content |
| POST | `/dev/parse-workflowy` | 132 | Parse Workflowy to brainlift |
| GET | `/dev/parse-workflowy` | 187 | Parse via query param |
| POST | `/dev/extract-experts` | 240 | Extract experts with diagnostics |
