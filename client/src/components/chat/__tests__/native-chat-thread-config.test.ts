import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  GenericToolCallCard,
  buildNativeChatThreadConfig,
  nativeChatToolUIs,
} from '../native-chat-thread-config';

describe('native chat thread config', () => {
  it('registers named tool cards and a generic fallback', () => {
    const config = buildNativeChatThreadConfig();
    const toolNames = config.tools?.map((tool) => tool.unstable_tool.toolName) ?? [];

    expect(toolNames).toHaveLength(nativeChatToolUIs.length);
    expect(toolNames).toEqual(expect.arrayContaining([
      'get_template',
      'list_brainlifts',
      'grade_brainlift',
      'get_brainlift_assessment',
      'create_dok1',
      'delete_dok_item',
      'list_experts',
      'generate_plan',
      'list_tasks',
      'save_deliverable',
      'update_deliverable',
      'load_skill',
    ]));
    expect(config.assistantMessage.components.ToolFallback).toBe(GenericToolCallCard);
  });

  it('renders a generic fallback card for unknown tools without crashing', () => {
    const markup = renderToStaticMarkup(
      createElement(GenericToolCallCard, {
        type: 'tool-call',
        toolCallId: 'tc-1',
        toolName: 'archive_plan',
        args: { planId: 12 },
        argsText: '{"planId":12}',
        result: { ok: true },
        status: { type: 'complete' },
        addResult: () => undefined,
        resume: () => undefined,
      }),
    );

    expect(markup).toContain('Archive Plan');
  });
});
