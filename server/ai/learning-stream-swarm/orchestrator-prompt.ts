/**
 * Orchestrator Prompt Builder
 *
 * Generates the prompt for the Opus orchestrator that will:
 * 1. Get brainlift context via MCP tool
 * 2. Design N diverse research tasks (configurable via SWARM_AGENT_COUNT)
 * 3. Spawn all N web-researcher agents IN PARALLEL via Task tool
 * 4. Collect results and call save_learning_item for each
 * 5. Report summary
 */

import { SWARM_AGENT_COUNT, generateResourceDistribution, type ResourceType } from './types';

/**
 * Generate research task assignments based on resource type distribution.
 * Returns a list of task descriptions for the orchestrator to execute.
 */
function generateTaskAssignments(): string {
  const tasks: string[] = [];
  let taskNum = 1;
  const distribution = generateResourceDistribution(SWARM_AGENT_COUNT);

  for (const [resourceType, count] of Object.entries(distribution) as [ResourceType, number][]) {
    for (let i = 0; i < count; i++) {
      let focus: string;
      switch (resourceType) {
        case 'Substack':
          focus = i === 0 ? 'from a listed expert' :
                  i === 1 ? 'about a specific fact/topic' :
                  i === 2 ? 'with contrarian or alternative perspective' :
                  'general topic coverage';
          break;
        case 'Academic Paper':
          focus = i === 0 ? 'foundational research on core concepts' :
                  i === 1 ? 'recent findings (last 2 years)' :
                  'meta-analysis or literature review';
          break;
        case 'Twitter':
          focus = i === 0 ? 'thread from a listed expert' :
                  i === 1 ? 'educational thread with data/evidence' :
                  'thread discussing a specific fact';
          break;
        case 'Blog':
          focus = i === 0 ? 'technical deep-dive' :
                  i === 1 ? 'practical how-to or guide' :
                  'thought leadership piece';
          break;
        case 'Research':
          focus = i === 0 ? 'industry report or white paper' :
                  i === 1 ? 'case study with real examples' :
                  'data-driven analysis';
          break;
        case 'Podcast':
          focus = i === 0 ? 'interview with expert in the field' :
                  'educational episode on core topic';
          break;
        case 'Video':
          focus = i === 0 ? 'conference talk or lecture' :
                  'educational explainer or tutorial';
          break;
        default:
          focus = 'general coverage';
      }
      tasks.push(`Task ${taskNum}: Find a ${resourceType} - Focus: ${focus}`);
      taskNum++;
    }
  }

  return tasks.join('\n');
}

/**
 * Build the orchestrator prompt for a given brainlift ID.
 */
export function buildOrchestratorPrompt(brainliftId: number): string {
  const taskAssignments = generateTaskAssignments();

  return `You are a Learning Stream Research Orchestrator. Your job is to coordinate a swarm of ${SWARM_AGENT_COUNT} web researchers to find high-quality learning resources for a brainlift.

## Your Mission
Find ${SWARM_AGENT_COUNT} diverse, high-quality learning resources by delegating research to specialized web-researcher agents.

## Step 1: Get Brainlift Context
FIRST, use the get_brainlift_context tool with brainliftId: ${brainliftId}

This will return:
- title: The brainlift topic
- description: What the brainlift is about
- displayPurpose: The learning purpose
- facts: Key facts to find resources about
- experts: Experts to prioritize content from
- existingTopics: Topics already in the learning stream (AVOID DUPLICATES)

## Step 2: Spawn ${SWARM_AGENT_COUNT} Web Researchers IN PARALLEL

CRITICAL: You MUST spawn ALL ${SWARM_AGENT_COUNT} researchers in a SINGLE message using multiple Task tool calls. Do NOT spawn them sequentially.

For each task, use the Task tool with:
- subagent_type: "web-researcher"
- description: Brief 3-5 word summary
- prompt: Include the research criteria AND brainlift context (see format below)

Here are your ${SWARM_AGENT_COUNT} research tasks:
${taskAssignments}

## Task Prompt Format
For each Task tool call, structure the prompt like this:

\`\`\`
Find a [RESOURCE_TYPE] resource.

SEARCH FOCUS: [specific focus from task assignment]

BRAINLIFT CONTEXT:
- Title: [brainlift title]
- Purpose: [brainlift purpose/description]
- Key Facts to Cover:
  [list 3-5 relevant facts]
- Prioritized Experts:
  [list experts whose content to prioritize]

AVOID THESE EXISTING TOPICS:
[list existing topics to avoid duplicates]

Return ONLY the JSON result.
\`\`\`

## Step 3: Process Results

After all researchers return, for EACH successful result (where found=true):
1. Parse the JSON response
2. Call save_learning_item with brainliftId: ${brainliftId} and all resource fields

## Step 4: Report Summary

After saving all items, report:
- Total researchers spawned: ${SWARM_AGENT_COUNT}
- Resources found: [count]
- Resources saved: [count]
- Duplicates skipped: [count]
- Failures: [count with brief reasons]

## Important Rules
1. PARALLEL EXECUTION: Spawn all ${SWARM_AGENT_COUNT} agents in ONE message with multiple Task calls
2. DIVERSITY: Each researcher has a unique focus - maintain this diversity
3. EXPERT PRIORITY: Researchers looking for expert content should prioritize listed experts
4. DUPLICATE HANDLING: The researchers will check for duplicates, but the save tool also handles them gracefully
5. ERROR TOLERANCE: If some researchers fail, continue with others and report failures

Begin by getting the brainlift context.`;
}
