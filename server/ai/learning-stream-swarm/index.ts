/**
 * Learning Stream Swarm - Main Entry Point
 *
 * Replaces the 3-method AI research approach with a Claude Agent SDK swarm.
 * One Opus orchestrator spawns N parallel "web-researcher" subagents (configurable
 * via SWARM_AGENT_COUNT env var, default 5), each finding a single learning resource.
 *
 * Per-Agent Logging: Each agent is tracked via parent_tool_use_id correlation.
 * Logs are prefixed with [Swarm:UNIT-XX] for easy debugging.
 *
 * SSE Events: Set onEvent callback to receive real-time swarm events for frontend.
 *
 * Verbose file logging: Set SWARM_VERBOSE_LOG=true to enable detailed logging to file.
 * Logs are written to: logs/swarm-{brainliftId}-{timestamp}.log
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { startMcpServer } from './mcp-server';
import { webResearcherAgent } from './web-researcher-agent';
import { videoResearcherAgent } from './video-researcher-agent';
import { podcastResearcherAgent } from './podcast-researcher-agent';
import { newsResearcherAgent } from './news-researcher-agent';
import { buildOrchestratorPrompt } from './orchestrator-prompt';
import type { SwarmResult, AgentInfo, SwarmEvent, AgentEventType } from './types';
import * as swarmEmitter from './event-emitter';
import * as fs from 'fs';
import * as path from 'path';

export interface SwarmOptions {
  maxTurns?: number;
  maxBudgetUsd?: number;
}

export type SwarmEventCallback = (event: SwarmEvent) => void;

/**
 * Logger class for swarm verbose logging with per-agent support.
 */
class SwarmLogger {
  private logFile: string | null = null;
  private writeStream: fs.WriteStream | null = null;
  private verbose: boolean;
  private agentRegistry: Map<string, AgentInfo> = new Map();
  private agentOutputFiles: Map<string, string> = new Map();
  private emittedSubagentEvents: Set<string> = new Set();
  private agentCounter = 0;
  private brainliftId: number;

  constructor(brainliftId: number) {
    this.brainliftId = brainliftId;
    this.verbose = process.env.SWARM_VERBOSE_LOG === 'true';

    if (this.verbose) {
      // Ensure logs directory exists
      const logsDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      // Create log file with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.logFile = path.join(logsDir, `swarm-${brainliftId}-${timestamp}.log`);
      this.writeStream = fs.createWriteStream(this.logFile, { flags: 'a' });

      this.log('ORCH', '='.repeat(80));
      this.log('ORCH', `SWARM VERBOSE LOG - Brainlift ID: ${brainliftId}`);
      this.log('ORCH', `Started: ${new Date().toISOString()}`);
      this.log('ORCH', '='.repeat(80));
    }
  }

  private formatPrefix(source: string): string {
    return source === 'ORCH' ? '[Swarm:ORCH]' : `[Swarm:${source}]`;
  }

  private formatMessage(level: string, source: string, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    let formatted = `[${timestamp}] [${level}] ${this.formatPrefix(source)} ${message}`;
    if (data !== undefined) {
      formatted += '\n' + JSON.stringify(data, null, 2);
    }
    return formatted;
  }

  log(source: string, message: string, data?: unknown) {
    const formatted = this.formatMessage('INFO', source, message, data);
    console.log(`${this.formatPrefix(source)} ${message}`);
    if (this.writeStream) {
      this.writeStream.write(formatted + '\n');
    }
  }

  debug(source: string, message: string, data?: unknown) {
    if (!this.verbose) return;
    const formatted = this.formatMessage('DEBUG', source, message, data);
    console.log(`${this.formatPrefix(source)} ${message}`);
    if (this.writeStream) {
      this.writeStream.write(formatted + '\n');
    }
  }

  /**
   * Register a new agent and return its UNIT-XX identifier.
   */
  registerAgent(toolUseId: string, description: string, resourceType: string): AgentInfo {
    this.agentCounter++;
    const agentNumber = this.agentCounter;
    const unitId = `UNIT-${String(agentNumber).padStart(2, '0')}`;

    const agentInfo: AgentInfo = {
      agentNumber,
      toolUseId,
      description,
      resourceType,
      status: 'spawning',
      startTime: Date.now(),
      events: [],
    };

    this.agentRegistry.set(toolUseId, agentInfo);
    this.log('ORCH', `Spawning ${unitId} (${resourceType}: ${description})`);

    // Emit to event emitter
    swarmEmitter.registerAgent(this.brainliftId, agentInfo);

    return agentInfo;
  }

  /**
   * Get the UNIT-XX identifier for a tool_use_id.
   */
  getUnitId(toolUseId: string): string {
    const agent = this.agentRegistry.get(toolUseId);
    if (agent) {
      return `UNIT-${String(agent.agentNumber).padStart(2, '0')}`;
    }
    return 'ORCH';
  }

  /**
   * Get agent info by tool_use_id.
   */
  getAgent(toolUseId: string): AgentInfo | undefined {
    return this.agentRegistry.get(toolUseId);
  }

  setAgentOutputFile(toolUseId: string, outputFile: string | undefined) {
    if (!outputFile || !this.agentRegistry.has(toolUseId)) return;
    this.agentOutputFiles.set(toolUseId, outputFile);
  }

  syncAgentOutputFile(toolUseId: string) {
    const outputFile = this.agentOutputFiles.get(toolUseId);
    if (!outputFile) return;

    let jsonl = '';
    try {
      jsonl = fs.readFileSync(outputFile, 'utf8');
    } catch {
      return;
    }

    const events = parseSubagentOutputEvents(jsonl);
    for (const event of events) {
      const key = `${toolUseId}:${event.key}`;
      if (this.emittedSubagentEvents.has(key)) continue;
      this.emittedSubagentEvents.add(key);

      if (event.kind === 'activity') {
        this.recordActivity(toolUseId, event.eventType, event.data);
      } else {
        this.completeAgent(toolUseId, event.result);
      }
    }
  }

  /**
   * Record an activity for an agent.
   */
  recordActivity(
    toolUseId: string,
    eventType: string,
    data: Record<string, unknown>
  ) {
    const agent = this.agentRegistry.get(toolUseId);
    if (!agent) return;

    agent.events.push({
      timestamp: Date.now(),
      type: eventType as any,
      data,
    });

    if (agent.status === 'spawning') {
      agent.status = 'running';
    }

    // Emit to event emitter
    swarmEmitter.recordAgentActivity(this.brainliftId, toolUseId, eventType, data);
  }

  /**
   * Mark agent as complete with result.
   */
  completeAgent(
    toolUseId: string,
    result: { found: boolean; url?: string; topic?: string; reason?: string }
  ) {
    const agent = this.agentRegistry.get(toolUseId);
    if (!agent) return;
    if (agent.status === 'complete' || agent.status === 'failed') return;

    agent.status = 'complete';
    agent.endTime = Date.now();
    agent.result = result;

    const unitId = this.getUnitId(toolUseId);
    if (result.found) {
      this.log(unitId, `DONE - Found: "${result.topic}"`);
    } else {
      this.log(unitId, `DONE - Not found: ${result.reason}`);
    }

    // Emit to event emitter
    swarmEmitter.completeAgent(this.brainliftId, toolUseId, result);
  }

  /**
   * Log tool call with agent context.
   */
  tool(source: string, toolName: string, input: unknown) {
    if (!this.verbose) return;
    const formatted = this.formatMessage('TOOL_CALL', source, `Tool: ${toolName}`, input);
    console.log(`${this.formatPrefix(source)} ${toolName}`);
    if (this.writeStream) {
      this.writeStream.write(formatted + '\n');
    }
  }

  /**
   * Log tool result with agent context.
   */
  toolResult(source: string, toolName: string, result: unknown) {
    if (!this.verbose) return;
    const resultStr = JSON.stringify(result);
    const truncated = resultStr.length > 500 ? resultStr.substring(0, 500) + '...' : resultStr;
    console.log(`${this.formatPrefix(source)} Result: ${truncated}`);
    if (this.writeStream) {
      const formatted = this.formatMessage('TOOL_RESULT', source, `Tool: ${toolName}`, result);
      this.writeStream.write(formatted + '\n');
    }
  }

  reasoning(source: string, text: string) {
    if (!this.verbose) return;
    const truncated = text.length > 200 ? text.substring(0, 200) + '...' : text;
    console.log(`${this.formatPrefix(source)} [THINK] ${truncated}`);
    if (this.writeStream) {
      const formatted = this.formatMessage('REASONING', source, text);
      this.writeStream.write(formatted + '\n');
    }
  }

  error(source: string, message: string, error?: unknown) {
    const formatted = this.formatMessage('ERROR', source, message, error);
    console.error(`${this.formatPrefix(source)} ERROR: ${message}`);
    if (this.writeStream) {
      this.writeStream.write(formatted + '\n');
    }
  }

  /**
   * Get all registered agents.
   */
  getAgents(): AgentInfo[] {
    return Array.from(this.agentRegistry.values());
  }

  close() {
    if (this.writeStream) {
      this.log('ORCH', '='.repeat(80));
      this.log('ORCH', `Swarm log completed: ${new Date().toISOString()}`);
      if (this.logFile) {
        this.log('ORCH', `Log file: ${this.logFile}`);
      }
      this.log('ORCH', '='.repeat(80));
      this.writeStream.end();
    }
  }

  getLogFile(): string | null {
    return this.logFile;
  }
}

/**
 * Run the learning stream research swarm for a brainlift.
 *
 * @param brainliftId - The brainlift to research for
 * @param options - Optional configuration for the swarm
 * @param onEvent - Optional callback to receive real-time swarm events
 * @returns SwarmResult with success status, counts, and timing
 */
export async function runLearningStreamSwarm(
  brainliftId: number,
  options: SwarmOptions = {},
  onEvent?: SwarmEventCallback
): Promise<SwarmResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let totalSaved = 0;
  let duplicatesSkipped = 0;

  const {
    maxTurns = 60,
    maxBudgetUsd = 5.0,
  } = options;

  const logger = new SwarmLogger(brainliftId);
  logger.log('ORCH', `Starting swarm for brainlift ${brainliftId}`);
  logger.log('ORCH', `Orchestrator model: opus (override: ${process.env.ANTHROPIC_DEFAULT_OPUS_MODEL || 'none'})`);
  logger.log('ORCH', `Researcher model: ${webResearcherAgent.model} (override: ${process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || 'none'})`);
  logger.log('ORCH', `ANTHROPIC_BASE_URL: ${process.env.ANTHROPIC_BASE_URL || '(not set)'}`);
  logger.debug('ORCH', 'Options', { maxTurns, maxBudgetUsd });

  // Start swarm tracking
  swarmEmitter.startSwarm(brainliftId);

  // Subscribe to events if callback provided
  let unsubscribe: (() => void) | null = null;
  if (onEvent) {
    unsubscribe = swarmEmitter.subscribe(brainliftId, onEvent);
  }

  // Track pending tool calls to map results back to agents
  const pendingToolCalls = new Map<
    string,
    { agentToolUseId: string; toolName: string; toolInput: unknown }
  >();

  // Start the HTTP MCP server so both orchestrator and subagents can reach it
  const mcpHandle = await startMcpServer();
  logger.log('ORCH', `MCP HTTP server started at ${mcpHandle.url}`);

  try {
    // Build the orchestrator prompt
    const orchestratorPrompt = buildOrchestratorPrompt(brainliftId);
    logger.debug('ORCH', 'Orchestrator prompt built', { promptLength: orchestratorPrompt.length });

    // Run the orchestrator with a simple string prompt
    for await (const message of query({
      prompt: orchestratorPrompt,
      options: {
        model: 'sonnet',
        mcpServers: {
          'learning-stream': {
            type: 'http',
            url: mcpHandle.url,
          },
          'exa': {
            type: 'http',
            url: `https://mcp.exa.ai/mcp?tools=web_search_exa&exaApiKey=${process.env.EXA_API_KEY || ''}`,
          },
          'yt-mcp': {
            type: 'stdio',
            command: 'npx',
            args: ['-y', 'yt-mcp'],
            env: {
              YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || '',
            },
          },
        },
        agents: {
          'web-researcher': webResearcherAgent,
          'video-researcher': videoResearcherAgent,
          'podcast-researcher': podcastResearcherAgent,
          'news-researcher': newsResearcherAgent,
        },
        allowedTools: [
          'Agent',
          'mcp__learning-stream__get_brainlift_context',
          'mcp__learning-stream__check_duplicate',
          'mcp__learning-stream__save_learning_item',
          'mcp__exa__web_search_exa',
          'mcp__yt-mcp__getVideoDetails',
          'WebFetch',
        ],
        maxTurns,
        maxBudgetUsd,
        permissionMode: 'bypassPermissions',
      },
    })) {
      // Determine the source context for this message
      // If parent_tool_use_id is set, this is from a subagent
      const parentToolUseId = 'parent_tool_use_id' in message ? message.parent_tool_use_id : null;
      const source = parentToolUseId ? logger.getUnitId(parentToolUseId as string) : 'ORCH';

      // Log ALL message types for debugging
      logger.debug(source, `Message received: type=${message.type}, subtype=${'subtype' in message ? message.subtype : 'none'}`);

      // Handle system init message
      if (message.type === 'system' && message.subtype === 'init') {
        logger.debug('ORCH', 'System initialized', {
          model: message.model,
          tools: message.tools,
          mcpServers: message.mcp_servers,
        });
      }

      if (message.type === 'system' && message.subtype === 'task_progress') {
        const toolUseId = 'tool_use_id' in message ? message.tool_use_id : undefined;
        if (typeof toolUseId === 'string' && logger.getAgent(toolUseId)) {
          logger.syncAgentOutputFile(toolUseId);
        }
      }

      if (message.type === 'system' && message.subtype === 'task_notification') {
        const toolUseId = 'tool_use_id' in message ? message.tool_use_id : undefined;
        if (typeof toolUseId === 'string' && logger.getAgent(toolUseId)) {
          logger.setAgentOutputFile(
            toolUseId,
            'output_file' in message ? message.output_file : undefined
          );
          logger.syncAgentOutputFile(toolUseId);
        }
      }

      // Handle assistant messages (tool calls and reasoning)
      if (message.type === 'assistant' && 'message' in message) {
        const content = message.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            // Log text reasoning
            if ('type' in block && block.type === 'text' && 'text' in block) {
              const text = block.text as string;

              // Detect API errors in the response
              if (text.includes('API Error') || text.includes('"error":{') || text.includes('No allowed providers')) {
                logger.error(source, `API ERROR DETECTED IN RESPONSE:\n${text}`);
                console.error(`\n${'='.repeat(80)}`);
                console.error(`[Swarm] API ERROR DETECTED`);
                console.error(`Source: ${source}`);
                console.error(`Full error text:\n${text}`);
                console.error(`${'='.repeat(80)}\n`);
              }

              logger.reasoning(source, text);
              if (parentToolUseId) {
                logger.recordActivity(parentToolUseId as string, 'reasoning', {
                  text: text.substring(0, 500),
                });
              }
            }

            // Log tool calls
            if ('type' in block && block.type === 'tool_use') {
              const toolUseId = 'id' in block ? (block.id as string) : 'unknown';
              const toolName = 'name' in block ? (block.name as string) : 'unknown';
              const toolInput = 'input' in block ? block.input : {};

              logger.tool(source, toolName, toolInput);

              // Track pending tool call for result mapping
              if (parentToolUseId) {
                pendingToolCalls.set(toolUseId, {
                  agentToolUseId: parentToolUseId as string,
                  toolName,
                  toolInput,
                });
              }

              // Special handling for Task tool - register new agent
              if (toolName === 'Agent') {
                const input = toolInput as {
                  subagent_type?: string;
                  prompt?: string;
                  description?: string;
                };
                // Extract resource type from description or prompt
                const resourceType = extractResourceType(input.description || input.prompt || '');
                logger.registerAgent(
                  toolUseId,
                  input.description || 'Research task',
                  resourceType
                );
              }
              // Handle web research tools from subagents
              else if (toolName === 'mcp__exa__web_search_exa' && parentToolUseId) {
                const input = toolInput as { query?: string };
                const unitId = logger.getUnitId(parentToolUseId as string);
                logger.log(unitId, `Exa Search: "${input.query}"`);
                logger.recordActivity(parentToolUseId as string, 'search', {
                  query: input.query,
                });
              } else if (toolName === 'WebFetch' && parentToolUseId) {
                const input = toolInput as { url?: string };
                const unitId = logger.getUnitId(parentToolUseId as string);
                logger.log(unitId, `WebFetch: ${input.url}`);
                logger.recordActivity(parentToolUseId as string, 'fetch', {
                  url: input.url,
                });
              } else if (toolName === 'mcp__yt-mcp__getVideoDetails' && parentToolUseId) {
                const input = toolInput as { videoId?: string };
                const unitId = logger.getUnitId(parentToolUseId as string);
                logger.log(unitId, `YouTube: Getting details for video ${input.videoId}`);
                logger.recordActivity(parentToolUseId as string, 'fetch', {
                  videoId: input.videoId,
                  source: 'youtube',
                });
              } else if (toolName === 'mcp__learning-stream__check_duplicate' && parentToolUseId) {
                const input = toolInput as { url?: string };
                logger.recordActivity(parentToolUseId as string, 'check_duplicate', {
                  url: input.url,
                });
              } else if (toolName === 'mcp__learning-stream__save_learning_item') {
                const input = toolInput as { topic?: string; url?: string; type?: string };
                logger.log(source, `Saving: [${input.type}] "${input.topic}" - ${input.url}`);
                if (parentToolUseId) {
                  logger.recordActivity(parentToolUseId as string, 'save_item', {
                    topic: input.topic,
                    url: input.url,
                    type: input.type,
                  });
                }
              }
            }
          }
        }
      }

      // Handle tool results
      if (message.type === 'user' && 'message' in message) {
        const content = message.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if ('type' in block && block.type === 'tool_result') {
              const toolUseId = 'tool_use_id' in block ? (block.tool_use_id as string) : 'unknown';
              const result = 'content' in block ? block.content : null;

              // Check if this is a subagent's tool result
              const pendingCall = pendingToolCalls.get(toolUseId);
              if (pendingCall) {
                logger.toolResult(
                  logger.getUnitId(pendingCall.agentToolUseId),
                  pendingCall.toolName,
                  result
                );
                if (pendingCall.toolName === 'mcp__learning-stream__save_learning_item') {
                  const input = pendingCall.toolInput as {
                    topic?: string;
                    url?: string;
                    type?: string;
                  };
                  const resultText = extractResultText(result) || '';
                  if (resultText.includes('"success":true')) {
                    logger.completeAgent(pendingCall.agentToolUseId, {
                      found: true,
                      topic: input.topic?.trim(),
                      url: input.url?.trim(),
                    });
                  } else if (resultText.includes('"error":"duplicate"')) {
                    logger.completeAgent(pendingCall.agentToolUseId, {
                      found: false,
                      reason: 'Duplicate URL skipped',
                    });
                  }
                }
                pendingToolCalls.delete(toolUseId);
              } else {
                // Check if this is a Task tool result (agent completion)
                const agent = logger.getAgent(toolUseId);
                if (agent) {
                  const resultText = extractResultText(result);
                  if (isAgentLaunchAcknowledgement(resultText)) {
                    logger.setAgentOutputFile(toolUseId, extractAgentOutputFile(resultText));
                    logger.syncAgentOutputFile(toolUseId);
                  } else {
                    const parsedResult = parseAgentResult(result);
                    logger.completeAgent(toolUseId, parsedResult);
                  }
                }

                logger.toolResult(source, `tool_use_${toolUseId}`, result);
              }

              // Track duplicates and saves from results
              const resultText = extractResultText(result);
              if (resultText) {
                if (resultText.includes('"error":"duplicate"')) {
                  duplicatesSkipped++;
                  logger.debug(source, 'Duplicate URL skipped');
                } else if (resultText.includes('"success":true')) {
                  totalSaved++;
                  logger.debug(source, 'Item saved successfully');
                }
              }
            }
          }
        }
      }

      // Handle final result
      if (message.type === 'result') {
        if (message.subtype === 'success') {
          logger.log('ORCH', 'Swarm completed successfully');

          const resultText = 'result' in message ? message.result : '';
          logger.debug('ORCH', 'Final result', { result: resultText });

          // Try to extract counts from the summary if we didn't track them
          if (typeof resultText === 'string') {
            const savedMatch = resultText.match(/Resources saved:\s*(\d+)/i);
            const duplicatesMatch = resultText.match(/Duplicates skipped:\s*(\d+)/i);

            if (savedMatch && totalSaved === 0) totalSaved = parseInt(savedMatch[1], 10);
            if (duplicatesMatch && duplicatesSkipped === 0)
              duplicatesSkipped = parseInt(duplicatesMatch[1], 10);
          }

          // Log usage stats if available
          if ('total_cost_usd' in message) {
            logger.log('ORCH', `Total cost: $${message.total_cost_usd?.toFixed(4)}`);
          }
          if ('usage' in message) {
            logger.debug('ORCH', 'Token usage', message.usage);
          }
        } else {
          // Handle error cases
          const errorSubtype = message.subtype;

          // Log full error message for debugging
          console.error(`\n${'='.repeat(80)}`);
          console.error(`[Swarm] RESULT ERROR: subtype=${errorSubtype}`);
          console.error(`Full message: ${JSON.stringify(message, null, 2)}`);
          console.error(`${'='.repeat(80)}\n`);

          if (errorSubtype === 'error_max_turns') {
            errors.push('Max turns exceeded - partial results returned');
            logger.error('ORCH', 'Max turns exceeded');
          } else if (errorSubtype === 'error_max_budget_usd') {
            errors.push('Budget limit exceeded - partial results returned');
            logger.error('ORCH', 'Budget limit exceeded');
          } else if (errorSubtype === 'error_during_execution') {
            const errorMessages = 'errors' in message ? message.errors : [];
            const errArray = Array.isArray(errorMessages) ? errorMessages : [String(errorMessages)];
            errors.push(...errArray);
            logger.error('ORCH', 'Execution errors', errArray);
          } else {
            // Unknown error subtype
            errors.push(`Unknown error: ${errorSubtype}`);
            logger.error('ORCH', `Unknown error subtype: ${errorSubtype}`, message);
          }
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const agents = logger.getAgents();
    const completedAgents = agents.filter((a) => a.status === 'complete').length;

    logger.log('ORCH', `Finished in ${(durationMs / 1000).toFixed(2)}s`);
    logger.log(
      'ORCH',
      `Results: Saved=${totalSaved}, Duplicates=${duplicatesSkipped}, Agents=${completedAgents}/${agents.length}, Errors=${errors.length}`
    );

    const logFile = logger.getLogFile();
    if (logFile) {
      console.log(`[Swarm] Detailed log written to: ${logFile}`);
    }

    logger.close();

    // Shut down the HTTP MCP server
    await mcpHandle.stop();

    // End swarm tracking
    const result: SwarmResult = {
      success: errors.length === 0,
      totalSaved,
      duplicatesSkipped,
      errors,
      durationMs,
    };

    swarmEmitter.endSwarm(brainliftId, result);

    // Cleanup subscription
    if (unsubscribe) unsubscribe();

    return result;
  } catch (error: any) {
    const durationMs = Date.now() - startTime;

    // Extract all available error info
    const errorInfo = {
      message: error.message,
      name: error.name,
      code: error.code,
      status: error.status,
      statusCode: error.statusCode,
      response: error.response,
      body: error.body,
      cause: error.cause,
    };

    console.error(`\n${'='.repeat(80)}`);
    console.error(`[Swarm] FATAL ERROR`);
    console.error(`Error info: ${JSON.stringify(errorInfo, null, 2)}`);
    console.error(`Stack: ${error.stack}`);
    console.error(`${'='.repeat(80)}\n`);

    logger.error('ORCH', 'Fatal error', errorInfo);
    logger.close();

    // Shut down the HTTP MCP server
    await mcpHandle.stop().catch(() => {});

    const result: SwarmResult = {
      success: false,
      totalSaved,
      duplicatesSkipped,
      errors: [error.message || 'Unknown error'],
      durationMs,
    };

    swarmEmitter.endSwarm(brainliftId, result);

    // Cleanup subscription
    if (unsubscribe) unsubscribe();

    return result;
  }
}

/**
 * Extract text content from a tool result, handling various formats.
 * Reuses extractTextFromToolResult for consistency across SDK versions.
 */
function extractResultText(result: unknown): string | null {
  return extractTextFromToolResult(result);
}

/**
 * Extract text from a tool result, handling all SDK formats:
 * - string: "the text"
 * - array:  [{type:'text', text:'...'}]
 * - SDK 0.2.79 Agent tool: {data: {status:'completed', content: [{type:'text', text:'...'}]}}
 * - nested: {content: ...} or {data: {content: ...}}
 */
function extractTextFromToolResult(content: unknown): string | null {
  if (typeof content === 'string') return content;

  // Array of content blocks: [{type:'text', text:'...'}]
  if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const block of content) {
      if (typeof block === 'string') {
        texts.push(block);
      } else if (typeof block === 'object' && block !== null && 'text' in block) {
        texts.push(block.text as string);
      }
    }
    return texts.length > 0 ? texts.join('\n') : null;
  }

  // Object — SDK 0.2.79 Agent tool returns {data: {status, content: [...]}}
  if (typeof content === 'object' && content !== null) {
    const obj = content as Record<string, unknown>;

    // Direct text field
    if ('text' in obj && typeof obj.text === 'string') return obj.text;

    // {data: {content: [...]}} — Agent tool result wrapper
    if ('data' in obj && typeof obj.data === 'object' && obj.data !== null) {
      return extractTextFromToolResult((obj.data as Record<string, unknown>).content);
    }

    // {content: ...} — generic wrapper
    if ('content' in obj) {
      return extractTextFromToolResult(obj.content);
    }
  }

  return null;
}

/**
 * Extract resource type from task description.
 */
function extractResourceType(text: string): string {
  const types = ['Substack', 'Academic Paper', 'Twitter', 'Podcast', 'Video', 'News'];
  for (const type of types) {
    if (text.toLowerCase().includes(type.toLowerCase())) {
      return type;
    }
  }
  return 'Unknown';
}

type ParsedSubagentOutputEvent =
  | {
      kind: 'activity';
      key: string;
      eventType: AgentEventType;
      data: Record<string, unknown>;
    }
  | {
      kind: 'complete';
      key: string;
      result: { found: boolean; url?: string; topic?: string; reason?: string };
    };

function extractAgentOutputFile(text: string | null): string | undefined {
  if (!text) return undefined;
  return text.match(/^output_file:\s*(.+)$/m)?.[1]?.trim();
}

function parseSubagentOutputEvents(jsonl: string): ParsedSubagentOutputEvent[] {
  const events: ParsedSubagentOutputEvent[] = [];
  const toolUses = new Map<string, { name: string; input: Record<string, unknown> }>();

  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry: any;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }

    const content = entry?.message?.content;
    if (entry?.type === 'assistant' && Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === 'text' && typeof block.text === 'string') {
          events.push({
            kind: 'activity',
            key: `reasoning:${entry.uuid}:${block.text}`,
            eventType: 'reasoning',
            data: { text: block.text.substring(0, 500) },
          });
        }

        if (block?.type === 'tool_use' && typeof block.id === 'string') {
          const input = isRecord(block.input) ? block.input : {};
          toolUses.set(block.id, { name: String(block.name || ''), input });
          const activity = getActivityFromSubagentToolUse(block.name, input);
          if (activity) {
            events.push({
              kind: 'activity',
              key: `tool:${block.id}`,
              eventType: activity.eventType,
              data: activity.data,
            });
          }
        }
      }
    }

    if (entry?.type === 'user' && Array.isArray(content)) {
      for (const block of content) {
        if (block?.type !== 'tool_result' || typeof block.tool_use_id !== 'string') continue;
        const toolUse = toolUses.get(block.tool_use_id);
        if (!toolUse || toolUse.name !== 'mcp__learning-stream__save_learning_item') continue;

        const resultText = extractResultText(block.content) || '';
        if (resultText.includes('"success":true')) {
          events.push({
            kind: 'complete',
            key: `complete:${block.tool_use_id}`,
            result: {
              found: true,
              topic: typeof toolUse.input.topic === 'string' ? toolUse.input.topic.trim() : undefined,
              url: typeof toolUse.input.url === 'string' ? toolUse.input.url.trim() : undefined,
            },
          });
        } else if (resultText.includes('"error":"duplicate"')) {
          events.push({
            kind: 'complete',
            key: `complete:${block.tool_use_id}`,
            result: {
              found: false,
              reason: 'Duplicate URL skipped',
              url: typeof toolUse.input.url === 'string' ? toolUse.input.url.trim() : undefined,
            },
          });
        }
      }
    }
  }

  return events;
}

function getActivityFromSubagentToolUse(
  toolName: unknown,
  input: Record<string, unknown>
): { eventType: AgentEventType; data: Record<string, unknown> } | null {
  switch (toolName) {
    case 'mcp__exa__web_search_exa':
      return { eventType: 'search', data: { query: input.query } };
    case 'WebFetch':
      return { eventType: 'fetch', data: { url: input.url } };
    case 'mcp__yt-mcp__getVideoDetails':
      return { eventType: 'fetch', data: { videoId: input.videoId, source: 'youtube' } };
    case 'mcp__learning-stream__check_duplicate':
      return { eventType: 'check_duplicate', data: { url: input.url } };
    case 'mcp__learning-stream__save_learning_item':
      return {
        eventType: 'save_item',
        data: { topic: input.topic, url: input.url, type: input.type },
      };
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/**
 * Parse the agent's final result from tool result content.
 */
function parseAgentResult(content: unknown): {
  found: boolean;
  url?: string;
  topic?: string;
  reason?: string;
} {
  try {
    // Extract text from whatever format the SDK gives us.
    // SDK 0.2.79 Agent tool returns: { data: { status, content: [{type:'text', text:'...'}], ... } }
    const jsonStr = extractTextFromToolResult(content);

    if (!jsonStr) {
      return { found: false, reason: 'No result content' };
    }

    // Try to parse JSON from the content
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      // Fix literal newlines inside JSON string values before parsing
      const sanitized = jsonMatch[0].replace(/(?<=:\s*"[^"]*)\n(?=[^"]*")/g, ' ');
      const parsed = JSON.parse(sanitized);
      const found = parsed.found === true || parsed.found === 'true';
      const notFound = parsed.found === false || parsed.found === 'false';

      if (notFound) {
        return { found: false, reason: parsed.reason || 'Unknown reason' };
      }
      if (found && parsed.resource) {
        return {
          found: true,
          url: parsed.resource.url?.trim(),
          topic: parsed.resource.topic?.trim(),
        };
      }
    }

    return parseAgentSummaryResult(jsonStr) || { found: false, reason: 'Could not parse result' };
  } catch {
    return { found: false, reason: 'Parse error' };
  }
}

function isAgentLaunchAcknowledgement(text: string | null): boolean {
  return Boolean(
    text &&
      text.includes('Async agent launched successfully') &&
      text.includes('agentId:') &&
      text.includes('output_file:')
  );
}

function parseAgentSummaryResult(text: string): {
  found: boolean;
  topic?: string;
  reason?: string;
} | null {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }

  if (/found\s*&\s*saved/i.test(normalized) || /found and saved/i.test(normalized)) {
    const quotedTitle = normalized.match(/[“"]([^”"]+)[”"]/)?.[1];
    const italicTitle = normalized.match(/\*([^*\n]+)\*/)?.[1]?.replace(/^["“]|["”]$/g, '');
    return {
      found: true,
      topic: (quotedTitle || italicTitle || normalized.split('\n')[0]).trim(),
    };
  }

  if (/not found|no resource|could not find|failed/i.test(normalized)) {
    return { found: false, reason: normalized.split('\n')[0] };
  }

  return null;
}

// Re-export types and event emitter functions for external use
export type { SwarmResult, SwarmEvent, AgentInfo };
export { swarmEmitter };
export const __learningStreamSwarmTestInternals = {
  extractAgentOutputFile,
  isAgentLaunchAcknowledgement,
  parseAgentResult,
  parseAgentSummaryResult,
  parseSubagentOutputEvents,
};
