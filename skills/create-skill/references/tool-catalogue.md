# Tool Catalogue

Authoritative list of tools available to the chat agent in this runtime. Reference these names exactly when drafting a skill body. Tools not on this list do not exist; do not reference them.

## Always available

### Brainlift content and grading

| Tool | Purpose |
| :--- | :--- |
| `get_template` | Return the Brainlift markdown template with format rules and quality guidelines. Call before grading, drafting, or restructuring. |
| `grade_brainlift` | Submit a Brainlift for grading. Returns the slug; grading runs asynchronously. |
| `list_brainlifts` | List Brainlifts the current user can access. Each entry includes a `permission` field (`owner`, `editor`, or `viewer`); only `owner` and `editor` may mutate. |
| `get_brainlift_assessment` | Read grading progress or paginated assessment results. Use for full DOK1 to DOK4 chain inspection. `scoreState="non_gradeable"` is not a zero. |

### DOK item curation

| Tool | Purpose |
| :--- | :--- |
| `create_dok1` | Add a DOK1 fact. Triggers verification grading. |
| `create_dok2` | Add a DOK2 summary. One summary point per line. Triggers DOK2 grading. |
| `create_dok3` | Add a DOK3 insight. Must link at least 2 DOK2 summaries from at least 2 different sources. |
| `create_dok4` | Add a DOK4 SPOV. Must link DOK3 insights with one designated as primary. |
| `edit_dok_item` | Edit a DOK item's text and trigger regrading. |
| `delete_dok_item` | Delete a DOK item. Preview impact first; call again with `confirm=true`. |
| `get_stale_items` | List items flagged stale after upstream edits. |
| `dismiss_stale` | Dismiss the stale flag after reviewing the item. |
| `link_dok3` | Attach more DOK2 summaries to a DOK3 insight. |
| `link_dok4` | Attach more DOK3 insights to a DOK4 SPOV; optionally update the primary link. |
| `list_experts` | List experts for a brainlift, including ranking. |
| `create_expert` | Add one or more experts. Ranking refresh runs asynchronously. |
| `delete_expert` | Delete one expert. Ranking refresh runs asynchronously. |

### Sprint plans and deliverables

| Tool | Purpose |
| :--- | :--- |
| `generate_plan` | Generate a 30-day sprint plan from a Brainlift. |
| `get_plan` | Get the current active or generating sprint plan. |
| `list_tasks` | List sprint tasks with date, week, state, and overdue filters. |
| `get_task` | Get one sprint task and its current deliverable state. |
| `save_deliverable` | Create a deliverable for a task (or a standalone Document Hub document if `taskId` is omitted). Returns id and Google Doc URL. |
| `read_deliverable` | Read a deliverable's markdown body and URL. |
| `update_deliverable` | Replace a deliverable's markdown by `taskId` or `deliverableId`. |
| `list_documents` | List Document Hub documents and sprint deliverables with filters. |

### External research

| Tool | Purpose |
| :--- | :--- |
| `web_search_exa` | Web search via Exa. |
| `fetch_url_content` | Fetch and clean URL content. |
| `get_youtube_transcript` | Pull a transcript by YouTube URL or id. |

### Skill runtime

| Tool | Purpose |
| :--- | :--- |
| `load_skill` | Load body and reference manifest for one enabled skill. |
| `load_skill_reference` | Load one reference body for an enabled skill. |

### User interaction

| Tool | Purpose |
| :--- | :--- |
| `ask_user_question` | Ask 1 to N structured questions in a single card. Use for choices ("which X?"), set membership ("which apply"), or fixed structured intake. 2 to 5 options is the sweet spot; batch related questions in one call. Question ids should be short snake_case handles. |

## Admin only (skill management)

Available only when the user has the admin role. Skill bodies should reference these only inside `create-skill` or other admin-only skills.

| Tool | Purpose |
| :--- | :--- |
| `create_skill` | Create a runtime skill atomically (`name`, `description`, `body`, optional `visibility`). |
| `update_skill` | Update name, description, body, or visibility. Does not change references. |
| `add_skill_reference` | Add one reference file to a skill. |
| `update_skill_reference` | Replace the content of one reference file. |
| `delete_skill_reference` | Remove one reference file. |
| `delete_skill` | Soft-delete a skill into Trash. 30-day retention. |

## What does NOT exist in this runtime

Do not reference these in any skill body. They will hallucinate or fail silently.

- Shell, Bash, or arbitrary command execution.
- Filesystem read or write tools.
- Python or any code execution sandbox.
- Image generation, file upload, or arbitrary HTTP outside the listed research tools.
- Subagent spawning or background workers.
- Skill share, unshare, restore, enable, or disable. Those are UI-only and not exposed as chat tools.

If a skill needs information the runtime cannot fetch, prefer `ask_user_question` to put the work back on the user.
