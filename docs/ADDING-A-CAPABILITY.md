# Adding a Capability

How a new thing an agent can *do* goes from idea to agent-invocable in Keystone. There are two kinds of capability, with different authoring paths but the same governance and reliability guarantees.

| | **Skill** | **Tool** |
|---|---|---|
| What it is | A packaged expert procedure the agent loads on demand | A primitive the model calls directly (function calling) |
| Lives in | Postgres (`skills`, `skill_resources`, …) | Code (`server/ai/chat/tools/<domain>.ts`) |
| Authored by | Admins, **from chat** | Engineers, in the repo |
| Ships by | A DB write through a validated save path | A code change + deploy |
| Selected by | The model, from its trigger description | The model, from its `description` + `inputSchema` |

Skills are the fast path for domain teams (no platform expertise required). Tools are the primitive layer skills and the agent ultimately drive. Both reach the model through the same registry and MCP surface.

---

## Path A — a Skill (from chat, no code)

An admin describes the skill in conversation; the seeded `create-skill` skill drives a **draft → review → save** loop. The write goes through the authoring tools (`create_skill`, `update_skill`, `add_skill_reference`, …), which are gated by `AuthContext.isAdmin` in [`server/ai/chat/tools/index.ts`](../server/ai/chat/tools/index.ts) and validated by the atomic save path in [`server/storage/skills.ts`](../server/storage/skills.ts).

**What the platform enforces on every write** (see `server/storage/skills.ts`):

- `name` is lowercase kebab-case, starts with a letter/number, and is **globally unique — including names sitting in Trash**.
- `description` ≤ 500 characters; `body` ≤ 100 KB.
- up to **20 reference files**, each ≤ 50 KB, no path traversal in reference paths.
- `visibility` is never defaulted — the author must confirm public vs. private before anything saves.

**Grounding, not guessing.** Three seeded references keep authored skills honest:

- `tool-catalogue.md` — the real tool names a skill is allowed to drive.
- `skill-template.md` — the canonical body skeleton (Voice, Prerequisites, "What this is NOT", Procedure, Output Format, Anti-patterns).
- `description-patterns.md` — worked examples of trigger-first descriptions plus a pre-save checklist.

**Write the description like an API, not a blurb.** A skill's `description` is the *only* signal the orchestrating model uses to select it from the catalogue, and it competes for the model's attention against every other skill. So it names the user's likely phrasing, the output produced, and the primary tools driven — a list of concrete triggers, not a topic summary. A sloppy description doesn't just fail to help; it crowds out the skills that would.

## Path B — a Tool (in code)

A tool is a typed function the model can call. The shape (see [`server/ai/chat/tools/project.ts`](../server/ai/chat/tools/project.ts) for a concrete example):

```ts
create_blank_project: tool({
  description: CREATE_BLANK_PROJECT_DESCRIPTION, // the model's only cue for when to call it
  inputSchema: z.object({
    title: z.string().trim().min(1),
    description: z.string().trim().optional()
      .describe('Optional one-line description of the research direction.'),
  }),
  execute: async ({ title, description }) => { /* … */ },
}),
```

Steps:

1. **Define** the tool in the relevant domain file under `server/ai/chat/tools/`. Give it a Zod `inputSchema` (validated before `execute` runs) and a description written for the model.
2. **Register** it in `buildNativeChatTools()` ([`server/ai/chat/tools/index.ts`](../server/ai/chat/tools/index.ts)). Registration is where **governance** lives — tools are composed by domain and gated by context, e.g. admin-only management tools and mode-specific sets:

   ```ts
   return {
     ...buildChatSkillTools({ authContext }),
     ...(authContext.isAdmin ? buildAdminSkillManagementTools({ authContext }) : {}),
     ...(isResearch ? researchBrainliftTools : gradingTools),
     // …
   };
   ```
3. **Test** it in `server/ai/chat/tools/__tests__/` (every existing tool has coverage there). Tests are the deployment gate — the suite runs green in CI before anything ships.

## Context engineering (why the registry stays cheap)

Skills load through **three-level progressive disclosure** so the whole catalogue costs almost nothing in context until a capability actually fires:

1. **Catalogue** (`name` + `description`) is always in the system prompt.
2. **Body** loads only when the model calls `load_skill`; the response is the body plus a manifest of reference *paths*, never their contents.
3. **References** load one at a time, only when the model calls `load_skill_reference`.

Design a capability's surface for the model's budget: a tight description, a minimal `inputSchema`, and references pulled only when needed.

## Reliability guarantees a capability inherits

A capability doesn't have to hand-roll resilience — the platform provides it:

- **Provider resilience.** Any model call a tool makes routes through the [unified AI client](../server/ai/client): timeout, retry with backoff, a circuit breaker on the primary provider, and automatic failover to a mapped fallback tier.
- **A typed error taxonomy** ([`server/ai/client/errors.ts`](../server/ai/client/errors.ts)) — `RetryableError`, `NonRetryableError`, `RateLimitError`, `TimeoutError`, `AllModelsFailed` — classifies failures so retry/failover behave correctly (retryable status set: `429, 500, 502, 503`).
- **Safe failure shapes.** Authorization-aware tools collapse unauthorized / disabled / deleted / unknown to the same not-found-shaped error, so private capability names can't be enumerated. Background jobs are non-throwing and write a fallback state rather than getting stuck.
- **Observability.** Every logical model call emits a `CallRecord` (model, provider, duration, tokens, estimated cost, retry count, failover reason); chat turns emit structured telemetry. These are the feedback loop for surfacing tool failures and capability gaps.

## Reaching agents outside the app

A capability isn't limited to the in-app chat. The same platform surface is exposed to any MCP-compatible agent through the companion [`keystone-mcp`](https://github.com/carolyn-beep/keystone-mcp) Cloudflare Worker (Google OAuth), backed by a service-authenticated internal API (`server/routes/internal.ts`, behind `requireServiceAuth`). Build the capability once; both the native agent and external agents can invoke it.

---

See [`docs/DEEP-DIVE.md`](DEEP-DIVE.md) for the full Runtime Skills Library, Native Chat Runtime, and Unified AI Client sections.
