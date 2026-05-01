import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../ChatHome.tsx', import.meta.url),
  'utf8',
);

describe('ChatHome (unified shell) source', () => {
  it('imports AppShell, AppSidebar, PageHeader, useAppShell from the layout barrel', () => {
    expect(source).toMatch(/from\s+['"]@\/components\/layout['"]/);
    expect(source).toMatch(/AppShell/);
    expect(source).toMatch(/AppSidebar/);
    expect(source).toMatch(/PageHeader/);
    expect(source).toMatch(/useAppShell/);
  });

  it('renders <AppShell> as the root chrome with sidebar/header props', () => {
    expect(source).toMatch(/<AppShell\b/);
    // sidebar and header props must be passed.
    expect(source).toMatch(/sidebar=\{/);
    expect(source).toMatch(/header=\{/);
  });

  it('passes <AppSidebar contextualBody=...> with the reduced ChatConversationSidebar', () => {
    expect(source).toMatch(/<AppSidebar\b/);
    expect(source).toMatch(/contextualBody=\{/);
    expect(source).toMatch(/<ChatConversationSidebar\b/);
  });

  it('renders <PageHeader title=...> wired to selectedConversationTitle', () => {
    expect(source).toMatch(/<PageHeader\b/);
    expect(source).toMatch(/title=\{selectedConversationTitle\}/);
    // Leading slot is mandatory for the mobile drawer toggle.
    expect(source).toMatch(/leadingSlot=\{/);
  });

  it('drops the local mobile-drawer state and inline drawer JSX', () => {
    expect(source).not.toMatch(/isSidebarOpen/);
    expect(source).not.toMatch(/setIsSidebarOpen/);
    // The bespoke wrapper class is gone -- AppShell owns layout.
    expect(source).not.toMatch(/native-chat-shell/);
  });

  it('drops handleSignOut (sign-out lives in UserMenu)', () => {
    expect(source).not.toMatch(/handleSignOut/);
    expect(source).not.toMatch(/queryClient\.clear/);
  });

  it('drops the navLinks wiring (SectionNav now owns cross-section nav)', () => {
    expect(source).not.toMatch(/getChatHomeNavLinks/);
    expect(source).not.toMatch(/\bnavLinks\b/);
  });

  it('keeps Cmd+K shortcut and auto-create-on-landing useEffects', () => {
    expect(source).toMatch(/event\.key\.toLowerCase\(\)\s*===\s*['"]k['"]/);
    expect(source).toMatch(/handleCreateConversation/);
    expect(source).toMatch(/shouldCreateConversation/);
  });

  it('uses useAppShell context inside a DrawerToggle for the leading slot', () => {
    // A small local component or inline button reads useAppShell to open the
    // drawer. Either way the source must call the hook.
    expect(source).toMatch(/useAppShell\(\)/);
    expect(source).toMatch(/openDrawer/);
    // The toggle is hidden at lg+ to avoid duplicating the inline sidebar.
    expect(source).toMatch(/lg:hidden/);
  });

  it('still drives selection / rename / delete via useChatConversations hooks', () => {
    expect(source).toMatch(/useChatConversations/);
    expect(source).toMatch(/useCreateChatConversation/);
    expect(source).toMatch(/useRenameChatConversation/);
    expect(source).toMatch(/useDeleteChatConversation/);
  });

  it('passes the reduced sidebarProps (no navLinks, user, onSignOut, onClose)', () => {
    // The sidebarProps object literal (or inline props) must not pass any of
    // the removed keys.
    expect(source).not.toMatch(/onSignOut:/);
    expect(source).not.toMatch(/onClose=/);
    expect(source).not.toMatch(/onClose:/);
  });
});
