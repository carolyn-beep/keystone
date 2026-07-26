**BrainLift Skills Library**

v0.2 — April 26, 2026  |  47 skills total: 34 at May 10 → 45 at June → 47 at July

Document owner: Carolyn Driscoll

**Naming convention for skill outputs (locked):**
`{document_type}__{title-slug}__{YYYY-MM-DD}.gdoc`
Every skill that writes to Drive uses this format. The Business Evaluator parses these prefixes to route documents to rubric dimensions.

---

## **Content**

| Skill | Description | Tier | Asset | Kind | Ship |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **daily-content-brief** | Generate a daily content brief from brainlift context | Fast | — | Generative | Shipped |
| **30-day-social-plan** | Build a 30-day social media plan | Quality | social-plan | Generative | Shipped |

## **Defense**

| Skill | Description | Tier | Asset | Kind | Ship |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **fact-check-draft** | Fact-check a provided draft against brainlift DOK items | Standard | — | Generative | Shipped |
| **investor-qa-prep** | Prepare investor Q&A responses from SPOVs and facts | Quality | — | Generative | Shipped |
| **x-argument-prep** | Generate an X-ready position with counter-replies and rebuttals | Quality | — | Generative | Shipped |
| **stress-test-my-spov** | Pressure-test a SPOV through guided checkpoints | — | — | Interactive | Shipped |
| **rewrite-your-weakest** | Identify and rewrite the weakest DOK item, with quality gate | — | rewrite-record | Interactive | Shipped |
| **adversarial-challenges** | One-shot generation of the 3 strongest opposing POVs against a stance, sourced from evidence + peers + X discourse | Quality | adversarial-record | Generative | **May 10** |
| **gap-analyzer** | "What am I missing?" pass over body of work — flags thin categories, unsupported claims, weak evidence chains. v0.5 returns gap list; resolution-workflow shipped later | Quality | gap-report | Generative | **May 10** |
| **compose-from-stance** | Compose an X-ready post from a brainlift stance, with cited evidence | Standard | x-post-draft | Generative | **May 10** |
| **draft-rebuttal-with-evidence** | Draft a rebuttal to a specific X reply, grounded in brainlift facts | Standard | rebuttal-draft | Generative | **May 10** |

## **Strategy**

| Skill | Description | Tier | Asset | Kind | Ship |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **pitch-deck-outline** | Produce a 10-slide pitch deck outline | Quality | pitch_deck | Generative | Shipped |
| **elevator-pitch** | Draft an elevator pitch at a specified length | Standard | — | Generative | Shipped |
| **gtm-30-day** | Create a 30-day go-to-market plan | Quality | gtm_plan | Generative | Shipped |
| **pick-your-hill** | Choose which SPOV to defend most strongly | — | — | Interactive | Shipped |
| **mission-sharpening** | Socratic probes that sharpen the mission statement, with quality gate | — | mission-revision | Interactive | Shipped |
| **build-30-day-blueprint** | Generate 1-day / 1-week / 1-month / 30-day sprint plan with testable deliverables. Reserves one task per horizon for cross-domain work when adjacent-industry context is supplied | Quality | sprint_blueprint | Generative | **May 10** |
| **compose-business-plan** | Synthesize the brainlift's portfolio (pitch deck, GTM, pricing, pro forma, etc.) into a complete business plan document — the primary input for the Business Evaluator | Quality | business_plan | Generative | **May 10** |
| **monetization-path** | Recommend monetization path (B2B enterprise vs. B2C audience-first vs. marketplace, etc.) based on brainlift business profile, with reasoning for why other paths don't fit | Quality | monetization-recommendation | Interactive | June |

## **Ops**

| Skill | Description | Tier | Asset | Kind | Ship |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **pro-forma** | Generate a pro forma financial projection | Quality | pro_forma | Generative | Shipped |
| **patent-formation-brief** | Draft a patent formation brief | Quality | — | Generative | Shipped |
| **next-action** | Suggest the single most impactful next action | Fast | — | Generative | Shipped |
| **plan-debate** | When a student wants to deviate from a Scope Breaker plan, system pushes back with reasoned argument before accepting the change. Solves the autonomy / enforcement tension | — | plan-debate-record | Interactive | June |
| **unit-economics-validator** | Validates the unit economics in a business plan against contribution margin, gross margin, CAC payback, burn multiple thresholds; flags AI-native exception | Quality | unit-econ-report | Generative | June |
| **direct-instruction-provisional-patent** | Direct-instruction module on what a provisional patent is, why you'd file one, the public-information misconception, and how to file | Standard | — | Generative | June |
| **direct-instruction-pricing-101** | Direct-instruction module on pricing fundamentals — why free is the enemy, value vs. cost-plus, premium as quality signal | Standard | — | Generative | June |
| **direct-instruction-tam** | Direct-instruction module on TAM / SAM / SOM, market sizing methodology, common errors | Standard | — | Generative | June |

## **Discovery**

| Skill | Description | Tier | Asset | Kind | Ship |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **idea-validator** | Evaluate a new idea against brainlift context | Standard | — | Generative | Shipped |
| **research-briefing** | Produce a research briefing on a topic | Standard | research-note | Generative | Shipped |
| **audience-expertise-audit** | Audit audience expertise gaps | Quality | — | Generative | Shipped |
| **adjacent-industries** | Identify adjacent industries, audience expansions, and benchmarks | Standard | — | Generative | Shipped |
| **cross-domain-synthesis** | Find non-obvious combinations across brainlifts | Quality | — | Generative | Shipped |
| **teach-back** | Student explains a DOK3 insight back, validated for understanding (absorbed into Knowledge Check feature on May 10) | — | teach-back-record | Interactive | Shipped |
| **validate-experiential-claim** | Cross-check a student's experiential / "learned-by-doing" claim against their sourced material and published literature; flag if uncorroborated | Standard | experiential-validation | Generative | **May 10** |
| **bad-idea-learning** | Extract structured lessons from an abandoned or failed business idea — what part survives, what entrepreneurial muscle was built, what to carry forward | — | bad-idea-debrief | Interactive | June |
| **customer-discovery-designer** | Design 5 customer-discovery experiments to validate the riskiest assumptions in a business idea; specify what evidence would falsify each | Quality | discovery-plan | Generative | June |
| **competitive-landscape-scan** | "Who else is doing this and why will you win?" — distinct from adjacent-industries; specifically scans competitors and articulates the win condition | Quality | competitive_analysis | Generative | July |

## **Founder's Desk**

| Skill | Description | Tier | Asset | Kind | Ship |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **business-stress-test** | Stress-test a business idea through 7 critical filters before investing time or capital — one-sentence clarity, demand vs supply, revenue-capability loop, ROIC, talent, moat, earned media | — | stress-test-record | Generative | Shipped |
| **gtm-evaluator** | Evaluate and redesign a go-to-market strategy using an earned-media-first, direct-to-customer framework | — | — | Generative | Shipped |
| **one-sentence-pitch** | Compress a business into one sentence that triggers an emotional reaction and earns the next conversation | — | one_sentence_pitch | Generative | Shipped |
| **pricing-advisor** | Analyze pricing strategy and deliver blunt, actionable recommendations (principles: charge highest, free is enemy, tier architecture) | — | pricing_strategy | Generative | Shipped |
| **product-tier-architect** | Design a multi-tier product architecture — brand anchor, core, scale, and entry products | — | tier_architecture | Generative | Shipped |
| **talent-magnet-job-spec** | Write job specs that attract exceptional talent and repel the wrong candidates | — | team_plan | Generative | Shipped |
| **risk-premortem** | "What kills this business in 18 months?" — distinct from business-stress-test (which is a 7-filter pre-investment check). This is post-commitment failure-mode surfacing | — | risk-premortem | Generative | June |
| **pricing-strategy-comparison** | Compare the 3 most plausible pricing strategies for the business, recommend one, explain why the others don't fit (sub-skill orbiting pricing-advisor) | — | pricing-comparison | Generative | June |
| **one-liner-memo-evaluator** | Evaluator counterpart to one-sentence-pitch. Scores an existing one-liner against the one-liner criteria (emotional trigger, obvious, earns next conversation) and suggests revisions | — | one-liner-evaluation | Generative | June |
| **tam-checker** | Sanity-check market sizing claims against the market-sizing framework (small markets with high prices > big markets with low prices for most categories; 20-100 customer enterprise plays valid) | — | tam-check | Generative | June |
| **founder-readiness-assessment** | "Can these people execute?" Self-assessment for student founders against named benchmarks (founder-market fit, hiring discipline, speed of iteration, capital readiness) | — | founder-readiness | Interactive | July |

---

## Summary by ship window

| Ship | Total skills | Δ |
| :---- | :---- | :---- |
| Shipped (existing) | 27 | — |
| **May 10, 2026** | **34** | +7 |
| June 2026 | 45 | +11 |
| July 2026 | 47 | +2 |

## Summary by category (at July)

| Category | Skill count |
| :---- | :---- |
| Content | 2 |
| Defense | 9 |
| Strategy | 8 |
| Ops | 8 |
| Discovery | 10 |
| Founder's Desk | 11 |
| **Total** | **48** |

(48 in category breakdown vs. 47 in ship table because `teach-back` is being absorbed into the Knowledge Check feature on May 10 but remains callable as a skill — count once.)

---

## Features that consume / orchestrate skills (not skills themselves)

These are full platform features. Skills feed into them; they are not in the skills list.

| Feature | Ship | Relationship to skills |
| :---- | :---- | :---- |
| **Skills Library** (host + visibility) | May 10 | The catalog and execution layer for all skills above |
| **Daily Action Digest** | May 10 | Surfaces relevant skills daily based on student state |
| **Knowledge Check** (extension) | May 10 | Absorbs `teach-back` interactive flow + adds free-response grading |
| **Learned-by-Doing Facts** (data type) | May 10 | Pairs with `validate-experiential-claim` skill |
| **Drive Asset Integration** | May 10 | All skill outputs save to per-brainlift Drive folder |
| **Business Evaluator** | June | Reads the document portfolio in Drive and evaluates against an 8-dimension rubric (named-source research foundation). Recommends sub-skills to close gaps. Persistent scoring + history. **Not a skill — a parallel grader to the BrainLift grader.** |
| **Debate Agent** | July | Multi-turn adversarial dialogue, configurable adversaries, evidence-grounded, Scope Breaker autonomy integration. **Not a skill — a full feature.** |

---

## Outstanding decisions

1. ~~File naming convention~~ — Locked above
2. **Skills page UI** — minimum: catalog page grouped by category. Stretch: cmd-K palette, inline contextual suggestions
3. **`adversarial-challenges` placement** — keep as standalone Defense skill, or merge as a generative mode of `stress-test-my-spov`. Current spec: standalone.
4. **`gap-analyzer` resolution workflow** — v0.5 ships May 10 as skill returning a gap list. The "no skip button" / 3-response flow (prove / ask for resources / declare out of scope) ships post-May 10 as a platform extension if validated by usage.
5. **Direct Instruction category** — currently scattered into Ops. If the count grows past 5–6, consider splitting into its own "Education" category.

---

*Last updated: April 26, 2026 by Carolyn Driscoll*
