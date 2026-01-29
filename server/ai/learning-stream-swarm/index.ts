/**
 * Learning Stream Swarm - Main Entry Point
 *
 * Replaces the 3-method AI research approach with a Claude Agent SDK swarm.
 * One Opus orchestrator spawns 20 parallel Sonnet "web-researcher" subagents,
 * each finding a single high-quality learning resource.
 *
 * Verbose logging: Set SWARM_VERBOSE_LOG=true to enable detailed logging to file.
 * Logs are written to: logs/swarm-{brainliftId}-{timestamp}.log
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { createLearningStreamMcpServer } from './mcp-server';
import { webResearcherAgent } from './web-researcher-agent';
import { buildOrchestratorPrompt } from './orchestrator-prompt';
import type { SwarmResult } from './types';
import * as fs from 'fs';
import * as path from 'path';

export interface SwarmOptions {
  maxTurns?: number;
  maxBudgetUsd?: number;
}

/**
 * Logger class for swarm verbose logging.
 * Writes to both console and file when SWARM_VERBOSE_LOG is enabled.
 */
class SwarmLogger {
  private logFile: string | null = null;
  private writeStream: fs.WriteStream | null = null;
  private verbose: boolean;

  constructor(brainliftId: number) {
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

      this.log('='.repeat(80));
      this.log(`SWARM VERBOSE LOG - Brainlift ID: ${brainliftId}`);
      this.log(`Started: ${new Date().toISOString()}`);
      this.log('='.repeat(80));
    }
  }

  private formatMessage(level: string, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    let formatted = `[${timestamp}] [${level}] ${message}`;
    if (data !== undefined) {
      formatted += '\n' + JSON.stringify(data, null, 2);
    }
    return formatted;
  }

  log(message: string, data?: unknown) {
    const formatted = this.formatMessage('INFO', message, data);
    console.log(`[Swarm] ${message}`);
    if (this.writeStream) {
      this.writeStream.write(formatted + '\n');
    }
  }

  debug(message: string, data?: unknown) {
    if (!this.verbose) return;
    const formatted = this.formatMessage('DEBUG', message, data);
    console.log(`[Swarm:DEBUG] ${message}`);
    if (this.writeStream) {
      this.writeStream.write(formatted + '\n');
    }
  }

  tool(toolName: string, input: unknown) {
    if (!this.verbose) return;
    const formatted = this.formatMessage('TOOL_CALL', `Tool: ${toolName}`, input);
    console.log(`[Swarm:TOOL] Calling: ${toolName}`);
    if (this.writeStream) {
      this.writeStream.write(formatted + '\n');
    }
  }

  toolResult(toolName: string, result: unknown) {
    if (!this.verbose) return;
    // Truncate very long results for console, but write full to file
    const resultStr = JSON.stringify(result);
    const truncated = resultStr.length > 500 ? resultStr.substring(0, 500) + '...' : resultStr;
    console.log(`[Swarm:TOOL] Result from ${toolName}: ${truncated}`);
    if (this.writeStream) {
      const formatted = this.formatMessage('TOOL_RESULT', `Tool: ${toolName}`, result);
      this.writeStream.write(formatted + '\n');
    }
  }

  reasoning(text: string) {
    if (!this.verbose) return;
    // Truncate for console
    const truncated = text.length > 200 ? text.substring(0, 200) + '...' : text;
    console.log(`[Swarm:THINK] ${truncated}`);
    if (this.writeStream) {
      const formatted = this.formatMessage('REASONING', text);
      this.writeStream.write(formatted + '\n');
    }
  }

  subagent(action: 'spawn' | 'complete', agentType: string, details?: unknown) {
    const message = action === 'spawn'
      ? `Spawning subagent: ${agentType}`
      : `Subagent completed: ${agentType}`;
    const formatted = this.formatMessage('SUBAGENT', message, details);
    console.log(`[Swarm:AGENT] ${message}`);
    if (this.writeStream) {
      this.writeStream.write(formatted + '\n');
    }
  }

  error(message: string, error?: unknown) {
    const formatted = this.formatMessage('ERROR', message, error);
    console.error(`[Swarm:ERROR] ${message}`);
    if (this.writeStream) {
      this.writeStream.write(formatted + '\n');
    }
  }

  close() {
    if (this.writeStream) {
      this.log('='.repeat(80));
      this.log(`Swarm log completed: ${new Date().toISOString()}`);
      if (this.logFile) {
        this.log(`Log file: ${this.logFile}`);
      }
      this.log('='.repeat(80));
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
 * @returns SwarmResult with success status, counts, and timing
 */
export async function runLearningStreamSwarm(
  brainliftId: number,
  options: SwarmOptions = {}
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
  logger.log(`Starting swarm for brainlift ${brainliftId}`);
  logger.debug('Options', { maxTurns, maxBudgetUsd });

  try {
    // Create the MCP server for this swarm run
    const mcpServer = createLearningStreamMcpServer();
    logger.debug('MCP server created');

    // Build the orchestrator prompt
    const orchestratorPrompt = buildOrchestratorPrompt(brainliftId);
    logger.debug('Orchestrator prompt built', { promptLength: orchestratorPrompt.length });

    // Run the orchestrator with a simple string prompt
    for await (const message of query({
      prompt: orchestratorPrompt,
      options: {
        model: 'claude-opus-4-5-20251101',
        mcpServers: {
          'learning-stream': mcpServer,
        },
        agents: {
          'web-researcher': webResearcherAgent,
        },
        allowedTools: [
          'Task',
          'mcp__learning-stream__get_brainlift_context',
          'mcp__learning-stream__check_duplicate',
          'mcp__learning-stream__save_learning_item',
          'WebSearch',
          'WebFetch',
        ],
        maxTurns,
        maxBudgetUsd,
        permissionMode: 'bypassPermissions',
      },
    })) {
      // Handle system init message
      if (message.type === 'system' && message.subtype === 'init') {
        logger.debug('System initialized', {
          model: message.model,
          tools: message.tools,
          mcpServers: message.mcp_servers,
        });
      }

      // Handle assistant messages (tool calls and reasoning)
      if (message.type === 'assistant' && 'message' in message) {
        const content = message.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            // Log text reasoning
            if ('type' in block && block.type === 'text' && 'text' in block) {
              logger.reasoning(block.text as string);
            }

            // Log tool calls
            if ('type' in block && block.type === 'tool_use') {
              const toolName = 'name' in block ? (block.name as string) : 'unknown';
              const toolInput = 'input' in block ? block.input : {};

              logger.tool(toolName, toolInput);

              // Special handling for specific tools
              if (toolName === 'Task') {
                const input = toolInput as { subagent_type?: string; prompt?: string; description?: string };
                logger.subagent('spawn', input.subagent_type || 'unknown', {
                  description: input.description,
                  promptPreview: input.prompt?.substring(0, 200) + '...',
                });
              } else if (toolName === 'WebSearch') {
                const input = toolInput as { query?: string };
                logger.debug(`WebSearch query: "${input.query}"`);
              } else if (toolName === 'WebFetch') {
                const input = toolInput as { url?: string };
                logger.debug(`WebFetch URL: ${input.url}`);
              } else if (toolName === 'mcp__learning-stream__save_learning_item') {
                const input = toolInput as { topic?: string; url?: string; type?: string };
                logger.log(`Saving item: [${input.type}] "${input.topic}" - ${input.url}`);
              } else if (toolName === 'mcp__learning-stream__check_duplicate') {
                const input = toolInput as { url?: string };
                logger.debug(`Checking duplicate: ${input.url}`);
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
              const toolUseId = 'tool_use_id' in block ? block.tool_use_id : 'unknown';
              const result = 'content' in block ? block.content : null;
              logger.toolResult(`tool_use_${toolUseId}`, result);

              // Track duplicates from save results
              if (typeof result === 'string' && result.includes('"error":"duplicate"')) {
                duplicatesSkipped++;
                logger.debug('Duplicate URL skipped');
              } else if (typeof result === 'string' && result.includes('"success":true')) {
                totalSaved++;
                logger.debug('Item saved successfully');
              }
            }
          }
        }
      }

      // Handle final result
      if (message.type === 'result') {
        if (message.subtype === 'success') {
          logger.log('Swarm completed successfully');

          const resultText = 'result' in message ? message.result : '';
          logger.debug('Final result', { result: resultText });

          // Try to extract counts from the summary if we didn't track them
          if (typeof resultText === 'string') {
            const savedMatch = resultText.match(/Resources saved:\s*(\d+)/i);
            const duplicatesMatch = resultText.match(/Duplicates skipped:\s*(\d+)/i);

            if (savedMatch && totalSaved === 0) totalSaved = parseInt(savedMatch[1], 10);
            if (duplicatesMatch && duplicatesSkipped === 0) duplicatesSkipped = parseInt(duplicatesMatch[1], 10);
          }

          // Log usage stats if available
          if ('total_cost_usd' in message) {
            logger.log(`Total cost: $${message.total_cost_usd?.toFixed(4)}`);
          }
          if ('usage' in message) {
            logger.debug('Token usage', message.usage);
          }
        } else {
          // Handle error cases
          const errorSubtype = message.subtype;
          if (errorSubtype === 'error_max_turns') {
            errors.push('Max turns exceeded - partial results returned');
            logger.error('Max turns exceeded');
          } else if (errorSubtype === 'error_max_budget_usd') {
            errors.push('Budget limit exceeded - partial results returned');
            logger.error('Budget limit exceeded');
          } else if (errorSubtype === 'error_during_execution') {
            const errorMessages = 'errors' in message ? message.errors : [];
            const errArray = Array.isArray(errorMessages) ? errorMessages : [String(errorMessages)];
            errors.push(...errArray);
            logger.error('Execution errors', errArray);
          }
        }
      }
    }

    const durationMs = Date.now() - startTime;
    logger.log(`Finished in ${(durationMs / 1000).toFixed(2)}s`);
    logger.log(`Results: Saved=${totalSaved}, Duplicates=${duplicatesSkipped}, Errors=${errors.length}`);

    const logFile = logger.getLogFile();
    if (logFile) {
      console.log(`[Swarm] Detailed log written to: ${logFile}`);
    }

    logger.close();

    return {
      success: errors.length === 0,
      totalSaved,
      duplicatesSkipped,
      errors,
      durationMs,
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    logger.error('Fatal error', { message: error.message, stack: error.stack });
    logger.close();

    return {
      success: false,
      totalSaved,
      duplicatesSkipped,
      errors: [error.message || 'Unknown error'],
      durationMs,
    };
  }
}

// Re-export types for external use
export type { SwarmResult };
