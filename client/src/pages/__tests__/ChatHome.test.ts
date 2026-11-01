import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../ChatHome.tsx', import.meta.url),
  'utf8',
);

describe('ChatHome source (FR5 -- slot-driven page migration)', () => {
  it('does NOT render <AppShell> in its own JSX (RootLayout owns the shell now)', () => {
    expect(source).not.toMatch(/<AppShell\b/);
  });

  it('does NOT import AppShell from the layout barrel', () => {
    expect(source).not.toMatch(
      /import\s*\{[^}]*\bAppShell\b[^}]*\}\s*from\s*['"]@\/components\/layout['"]/,
    );
  });

  it('imports useSidebarSlot and usePageHeaderSlot from the layout barrel', () => {
    expect(source).toMatch(
      /import\s*\{[^}]*\buseSidebarSlot\b[^}]*\}\s*from\s*['"]@\/components\/layout['"]/,
    );
    expect(source).toMatch(
      /import\s*\{[^}]*\busePageHeaderSlot\b[^}]*\}\s*from\s*['"]@\/components\/layout['"]/,
    );
  });

  it('calls useSidebarSlot with the conversation sidebar body and "Recent chats" label', () => {
    expect(source).toMatch(/useSidebarSlot\s*\(/);
    expect(source).toMatch(/label:\s*['"]Recent chats['"]/);
    expect(source).toMatch(/<ChatConversationSidebar\b/);
  });

  it('calls usePageHeaderSlot with leadingSlot=<DrawerToggle /> and title=selectedConversationTitle', () => {
    expect(source).toMatch(/usePageHeaderSlot\s*\(/);
    expect(source).toMatch(/leadingSlot:\s*<DrawerToggle\s*\/>/);
    expect(source).toMatch(/title:\s*selectedConversationTitle/);
  });

  it('keeps the local DrawerToggle component that uses useAppShell()', () => {
    expect(source).toMatch(/function\s+DrawerToggle/);
    expect(source).toMatch(/useAppShell\(\)/);
    expect(source).toMatch(/openDrawer/);
    expect(source).toMatch(/lg:hidden/);
  });

  it('preserves chatSessionKey ref-counted remount logic (untouched by the lift)', () => {
    expect(source).toMatch(/chatSessionKeyRef/);
    expect(source).toMatch(/chatSessionKey/);
    expect(source).toMatch(/<NativeChatThread/);
  });

  it('keeps Cmd+K shortcut and auto-create-on-landing useEffects', () => {
    expect(source).toMatch(/event\.key\.toLowerCase\(\)\s*===\s*['"]k['"]/);
    expect(source).toMatch(/handleCreateConversation/);
    expect(source).toMatch(/shouldCreateConversation/);
  });

  it('still drives selection / rename / delete via useChatConversations hooks', () => {
    expect(source).toMatch(/useChatConversations/);
    expect(source).toMatch(/useCreateChatConversation/);
    expect(source).toMatch(/useRenameChatConversation/);
    expect(source).toMatch(/useDeleteChatConversation/);
  });

  it('passes the auto-send message into NativeChatThread without firing the homepage opener', () => {
    expect(source).toMatch(/initialUserMessage/);
    expect(source).toMatch(/params\.get\(['"]send['"]\)/);
    expect(source).toMatch(/initialUserMessage=\{initialUserMessage\}/);
    expect(source).toMatch(/shouldConsiderOpener=\{homepageOpenerConversationId === selectedConversationId && !initialUserMessage\}|needsOpener=\{openerPendingForId === selectedConversationId && !initialUserMessage\}/);
  });
});
