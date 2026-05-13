import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../NativeChatThread.tsx', import.meta.url),
  'utf8',
);

describe('NativeChatThread source', () => {
  it('auto-sends an initial user message via threadRuntime.append', () => {
    expect(source).toMatch(/AutoSendTrigger/);
    expect(source).toMatch(/initialUserMessage/);
    expect(source).toMatch(/threadRuntime\.append\(/);
  });

  it('guards auto-send with a module-level Set per conversation id', () => {
    expect(source).toMatch(/firedAutoSendForConversation/);
    expect(source).toMatch(/firedAutoSendForConversation\.add\(conversationId\)/);
  });

  it('keeps homepage opener triggering separate from auto-send wiring', () => {
    expect(source).toMatch(/OpenerTrigger/);
    expect(source).toMatch(/shouldConsiderOpener=\{shouldConsiderOpener\}/);
    expect(source).toMatch(/userId=\{userId\}/);
  });
});
