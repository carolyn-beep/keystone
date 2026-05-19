import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  filterBrainliftsByTitle,
  groupBrainliftsByPhase,
  shouldShowBrainliftFilter,
} from '../ProjectPickerDropdown';
import type { UserBrainlift } from '@/hooks/useUserBrainlifts';

const projectPickerSource = fs.readFileSync(
  new URL('../ProjectPicker.tsx', import.meta.url),
  'utf8',
);
const projectPickerDropdownSource = fs.readFileSync(
  new URL('../ProjectPickerDropdown.tsx', import.meta.url),
  'utf8',
);
const chatComposerSource = fs.readFileSync(
  new URL('../ChatComposer.tsx', import.meta.url),
  'utf8',
);
const nativeChatThreadSource = fs.readFileSync(
  new URL('../NativeChatThread.tsx', import.meta.url),
  'utf8',
);
const conversationBrainliftHookSource = fs.readFileSync(
  new URL('../../../hooks/useConversationBrainlift.ts', import.meta.url),
  'utf8',
);
const userBrainliftsHookSource = fs.readFileSync(
  new URL('../../../hooks/useUserBrainlifts.ts', import.meta.url),
  'utf8',
);

const sampleBrainlifts: UserBrainlift[] = [
  { id: 1, slug: 'battery', title: 'Battery Chemistry', phase: 'research' },
  { id: 2, slug: 'marketing', title: 'Marketing Plan', phase: 'authoring' },
  { id: 3, slug: 'coastal', title: 'Coastal Policy', phase: 'research' },
];

describe('ProjectPicker hook contracts', () => {
  it('useConversationBrainlift exposes the spec binding key and PATCH mutation', () => {
    expect(conversationBrainliftHookSource).toContain("['conversation-brainlift', conversationId]");
    expect(conversationBrainliftHookSource).toContain('/api/chat/conversations/${conversationId}/brainlift');
    expect(conversationBrainliftHookSource).toContain('{ brainliftId }');
    expect(conversationBrainliftHookSource).toContain('mutation.mutateAsync');
    expect(conversationBrainliftHookSource).toContain('onError');
    expect(conversationBrainliftHookSource).toContain('previousBinding');
    expect(conversationBrainliftHookSource).toContain('mutationSerialRef');
  });

  it('useUserBrainlifts fetches the slim title list in a single round-trip', () => {
    expect(userBrainliftsHookSource).toContain("'/api/brainlifts/titles'");
    expect(userBrainliftsHookSource).not.toContain('page=');
    expect(userBrainliftsHookSource).toContain("['user-brainlifts']");
  });
});

describe('ProjectPicker component wiring', () => {
  it('supports both bound and draft modes and uses mutation integration', () => {
    expect(projectPickerSource).toContain('BoundProjectPicker');
    expect(projectPickerSource).toContain('DraftProjectPicker');
    expect(projectPickerSource).toContain('ProjectPickerDropdown');
    expect(projectPickerSource).toContain('setBinding(brainliftId)');
    expect(projectPickerSource).toContain('Project switch failed');
    expect(projectPickerSource).toContain('conversationId == null');
  });

  it('draft mode reads pending brainlift id directly (no eager conversation create)', () => {
    // Critical regression guard: the picker must NOT create a conversation
    // row in draft mode. Selection only updates the pending state; the row
    // is lazy-created on first send by the runtime, which then PATCHes the
    // binding before the chat request goes out.
    expect(projectPickerSource).toContain('pendingDraftBrainliftId');
    expect(projectPickerSource).toContain('onPendingDraftBrainliftChange');
    expect(projectPickerSource).not.toContain('createConversation.mutateAsync');
    expect(projectPickerSource).not.toContain('onCreateConversationWithBrainlift');
  });

  it('is mounted inside the composer toolbar (not above the thread as a separate banner)', () => {
    expect(chatComposerSource).toContain("import { ProjectPicker } from './ProjectPicker'");
    expect(chatComposerSource).toContain('<ProjectPicker');
    expect(chatComposerSource).toContain('conversationId={conversationId}');
    expect(chatComposerSource).toMatch(/chat-composer-toolbar-left[\s\S]*<ProjectPicker/);
  });

  it('model picker stays on the right next to send (project picker is left)', () => {
    expect(chatComposerSource).toMatch(/chat-composer-toolbar-right[\s\S]*<ChatModelPicker[\s\S]*ComposerPrimitive\.Send/);
    // Project picker must NOT live in the toolbar-right block.
    const rightBlock = chatComposerSource.split('chat-composer-toolbar-right')[1] ?? '';
    expect(rightBlock).not.toContain('<ProjectPicker');
  });

  it('NativeChatThread holds pending draft brainlift state and feeds the runtime via getter', () => {
    expect(nativeChatThreadSource).toContain('conversationId={effectiveConvId}');
    expect(nativeChatThreadSource).toContain('pendingDraftBrainliftId');
    expect(nativeChatThreadSource).toContain('setPendingDraftBrainliftId');
    expect(nativeChatThreadSource).toContain('getPendingDraftBrainliftId');
  });
});

describe('ProjectPickerDropdown behavior', () => {
  it('groups brainlifts by phase for local rendering', () => {
    expect(groupBrainliftsByPhase(sampleBrainlifts)).toEqual({
      research: [sampleBrainlifts[0], sampleBrainlifts[2]],
      authoring: [sampleBrainlifts[1]],
    });
  });

  it('filters large lists by title client-side', () => {
    expect(shouldShowBrainliftFilter(sampleBrainlifts)).toBe(false);
    expect(shouldShowBrainliftFilter(Array.from({ length: 50 }, (_, index) => ({
      id: index + 1,
      slug: `project-${index + 1}`,
      title: `Project ${index + 1}`,
      phase: 'research' as const,
    })))).toBe(true);
    expect(filterBrainliftsByTitle(sampleBrainlifts, 'policy')).toEqual([sampleBrainlifts[2]]);
  });

  it('renders phase section labels, outside/ESC close hooks, and the per-row select callback', () => {
    expect(projectPickerDropdownSource).toContain('Research Phase');
    expect(projectPickerDropdownSource).toContain('Brainlift Phase');
    expect(projectPickerDropdownSource).toContain('onEscapeKeyDown={onClose}');
    expect(projectPickerDropdownSource).toContain('onPointerDownOutside={onClose}');
    expect(projectPickerDropdownSource).toContain('onSelect(brainlift.id)');
  });

  it('does NOT include a new-project CTA in the dropdown', () => {
    expect(projectPickerDropdownSource).not.toContain('New project');
    expect(projectPickerDropdownSource).not.toContain('onSelect(null)');
  });
});
