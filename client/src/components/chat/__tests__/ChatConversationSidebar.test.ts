import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../ChatConversationSidebar.tsx', import.meta.url),
  'utf8',
);

describe('ChatConversationSidebar (reduced) source', () => {
  it('exports a ChatConversationSidebar function/component', () => {
    expect(source).toMatch(/export\s+function\s+ChatConversationSidebar/);
  });

  it('declares the reduced ChatConversationSidebarProps (no navLinks/user/onSignOut/onClose)', () => {
    expect(source).toMatch(/interface\s+ChatConversationSidebarProps/);
    expect(source).toMatch(/conversations\s*:\s*ChatConversation\[\]/);
    expect(source).toMatch(/selectedConversationId\s*:\s*number\s*\|\s*null/);
    expect(source).toMatch(/isLoading\s*:\s*boolean/);
    expect(source).toMatch(/isCreating\s*:\s*boolean/);
    expect(source).toMatch(/isRenaming\s*:\s*boolean/);
    expect(source).toMatch(/isDeleting\s*:\s*boolean/);
    expect(source).toMatch(/onCreateConversation\s*:/);
    expect(source).toMatch(/onSelectConversation\s*:/);
    expect(source).toMatch(/onRenameConversation\s*:/);
    expect(source).toMatch(/onDeleteConversation\s*:/);

    // Removed props -- must not appear in the props interface.
    expect(source).not.toMatch(/navLinks\s*:/);
    expect(source).not.toMatch(/onSignOut\s*:/);
    expect(source).not.toMatch(/onClose\?:/);
    expect(source).not.toMatch(/user\?:\s*SidebarUser/);
  });

  it('drops dead imports (alpha-buddy avatar, BarChart3, LogOut, Shield, FolderOpen, ChatHomeNavLink, X icon)', () => {
    expect(source).not.toMatch(/alpha-buddy/i);
    expect(source).not.toMatch(/BarChart3/);
    expect(source).not.toMatch(/LogOut/);
    expect(source).not.toMatch(/Shield/);
    expect(source).not.toMatch(/FolderOpen/);
    expect(source).not.toMatch(/ChatHomeNavLink/);
    // The X icon was used solely for the close-drawer affordance and rename
    // cancel button. Rename cancel should switch to a plain "Cancel" label or
    // a different icon; no `X,` import from lucide-react.
    expect(source).not.toMatch(/from\s+['"]lucide-react['"][^;]*\bX\b/);
  });

  it('does not render the surrounding <aside> chrome any more', () => {
    expect(source).not.toMatch(/<aside\b/);
    expect(source).not.toMatch(/bg-sidebar\/60/);
    expect(source).not.toMatch(/backdrop-blur-sm/);
  });

  it('does not render the AlphaX Buddy nameplate', () => {
    expect(source).not.toMatch(/alphax-nameplate/);
    expect(source).not.toMatch(/AlphaX Buddy/i);
    expect(source).not.toMatch(/Brainlift Central/i);
  });

  it('does not render the nav-links footer (Brainlift Library / Analytics / Providers)', () => {
    expect(source).not.toMatch(/Brainlift Library/);
    // The nav-links footer iterated `navLinks.map`. With navLinks gone, no
    // such reference should remain.
    expect(source).not.toMatch(/navLinks\.map/);
  });

  it('does not render the user-menu footer (avatar + Sign out)', () => {
    expect(source).not.toMatch(/Sign out/);
    expect(source).not.toMatch(/Workspace user/);
    // No more user-image / referrerPolicy fallback in this file.
    expect(source).not.toMatch(/referrerPolicy=/);
  });

  it('still renders the New chat button and conversation list affordances', () => {
    expect(source).toMatch(/MessageSquarePlus/);
    expect(source).toMatch(/New chat/);
    expect(source).toMatch(/MoreHorizontal/);
    expect(source).toMatch(/Pencil/);
    expect(source).toMatch(/Trash2/);
  });

  it('preserves the inline rename form behavior', () => {
    expect(source).toMatch(/handleRenameSubmit/);
    expect(source).toMatch(/editingConversationId/);
    expect(source).toMatch(/draftTitle/);
  });
});
