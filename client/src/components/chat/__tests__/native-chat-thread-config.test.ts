import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  GenericToolCallCard,
  buildNativeChatThreadConfig,
  nativeChatToolUIs,
} from '../native-chat-thread-config';

const source = fs.readFileSync(
  new URL('../native-chat-thread-config.tsx', import.meta.url),
  'utf8',
);

describe('FR4 native-chat-thread-config brand consumption', () => {
  it('imports brand from @/brand', () => {
    expect(source).toMatch(/from\s+['"]@\/brand['"]/);
  });

  it('does NOT import the alpha-buddy asset directly', () => {
    expect(source).not.toMatch(/@\/assets\/chat\/alpha-buddy/);
  });

  it('assistantAvatar is sourced from brand.chatAvatar', () => {
    expect(source).toMatch(/assistantAvatar:\s*brand\.chatAvatar/);
  });
});

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
      'read_deliverable',
      'list_documents',
      'load_skill',
      'load_skill_reference',
      'create_skill',
      'update_skill',
      'add_skill_reference',
      'update_skill_reference',
      'delete_skill_reference',
      'delete_skill',
      'ask_user_question',
    ]));
    expect(toolNames).not.toContain('list_deliverables');
    expect(config.assistantMessage.components.ToolFallback).toBe(GenericToolCallCard);
  });

  it('renders an error-style fallback card with reportable details for unknown tools', () => {
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

    // The fallback is a bug indicator in this app — every shipped tool has a
    // matching makeAssistantToolUI. The card must surface "report this" framing
    // plus the toolName, tool call id, and a UTC timestamp the user can paste.
    expect(markup).toContain('Tool render error');
    expect(markup).toContain('Archive Plan');
    expect(markup).toContain('archive_plan');
    expect(markup).toContain('tc-1');
    expect(markup).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
