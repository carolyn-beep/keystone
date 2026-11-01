import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { authClient } from '@/lib/auth-client';
import { useSidebarSlot } from '@/components/layout';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { TactileButton } from '@/components/ui/tactile-button';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  type SaveSkillRequest,
  type SkillListItem,
  useCreateSkill,
  useDeleteSkill,
  useDeletedSkills,
  useRestoreSkill,
  useSetSkillEnabled,
  useSkillDetail,
  useSkills,
  useTryItOutSkill,
  useUpdateSkill,
} from '@/hooks/useSkills';
import { SkillsLibraryView } from '@/components/skills/SkillsLibraryView';
import { SkillsTrashView } from '@/components/skills/SkillsTrashView';
import { SkillEditor, type SkillEditorHandle } from '@/components/skills/SkillEditor';

type SkillsView = 'library' | 'create' | 'trash';
const VALID_VIEWS: SkillsView[] = ['library', 'create', 'trash'];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

function resolveView(raw: string | null, isAdmin: boolean): {
  view: SkillsView;
  editingName: string | null;
} {
  if (raw === 'edit') return { view: 'library', editingName: null };
  if (raw && (VALID_VIEWS as string[]).includes(raw)) {
    const v = raw as SkillsView;
    if ((v === 'create' || v === 'trash') && !isAdmin) {
      return { view: 'library', editingName: null };
    }
    return { view: v, editingName: null };
  }
  return { view: 'library', editingName: null };
}

export default function Skills() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === 'admin';

  const params = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const createdByMe = params.get('createdBy') === 'me';
  const rawView = params.get('view');
  const editingNameParam = rawView === 'edit' ? params.get('name') : null;
  const { view } = resolveView(rawView, isAdmin);
  const isEditing = rawView === 'edit' && Boolean(editingNameParam) && isAdmin;

  const [deleteTarget, setDeleteTarget] = useState<{ name: string } | null>(null);

  const [isDirty, setIsDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const [isSavingFromGuard, setIsSavingFromGuard] = useState(false);
  // Lets our own post-Save / post-Discard nav skip the pushState guard.
  const bypassGuardRef = useRef(false);
  const editorRef = useRef<SkillEditorHandle | null>(null);

  const skillsQuery = useSkills({ createdByMe });
  const detailQuery = useSkillDetail(editingNameParam, {
    enabled: isEditing,
  });
  const deletedSkillsQuery = useDeletedSkills({
    enabled: isAdmin && view === 'trash',
  });
  const createSkill = useCreateSkill();
  const updateSkill = useUpdateSkill();
  const deleteSkill = useDeleteSkill();
  const restoreSkill = useRestoreSkill();
  const setSkillEnabled = useSetSkillEnabled();
  const tryItOutSkill = useTryItOutSkill();

  const updateUrl = useCallback(
    (next: { view?: SkillsView | 'edit'; name?: string | null; createdBy?: boolean }) => {
      const nextParams = new URLSearchParams(searchString);
      if (next.view !== undefined) {
        if (next.view === 'library') {
          nextParams.delete('view');
          nextParams.delete('name');
        } else {
          nextParams.set('view', next.view);
        }
      }
      if (next.name !== undefined) {
        if (next.name === null) nextParams.delete('name');
        else nextParams.set('name', next.name);
      }
      if (next.createdBy === true) nextParams.set('createdBy', 'me');
      if (next.createdBy === false) nextParams.delete('createdBy');
      const nextSearch = nextParams.toString();
      setLocation(nextSearch ? `/skills?${nextSearch}` : '/skills');
    },
    [searchString, setLocation],
  );

  const handleStartEdit = (skill: SkillListItem) => {
    updateUrl({ view: 'edit', name: skill.name });
  };

  const handleToggleEnabled = async (skill: SkillListItem) => {
    try {
      await setSkillEnabled.mutateAsync({ name: skill.name, enabled: !skill.enabled });
      toast({
        title: !skill.enabled ? 'Skill enabled' : 'Skill disabled',
        description: `${skill.name} has been ${!skill.enabled ? 'enabled' : 'disabled'} for your chat prompts.`,
      });
    } catch (error) {
      toast({
        title: 'Could not update skill',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleTryItOut = async (skill: SkillListItem) => {
    try {
      const result = await tryItOutSkill.mutateAsync(skill.name);
      const separator = result.location.includes('?') ? '&' : '?';
      setLocation(`${result.location}${separator}send=${encodeURIComponent(result.prefill)}`);
    } catch (error) {
      toast({
        title: 'Could not start a skill chat',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleSave = async (
    input: SaveSkillRequest,
    mode: 'create' | 'edit',
    currentName: string | null,
  ): Promise<{ success: boolean }> => {
    try {
      const saved = mode === 'create'
        ? await createSkill.mutateAsync(input)
        : await updateSkill.mutateAsync({ currentName: currentName!, input });
      toast({
        title: mode === 'create' ? 'Skill created' : 'Skill saved',
        description: `${saved.name} is available to authorized users in new conversations.`,
      });
      return { success: true };
    } catch (error) {
      toast({
        title: 'Could not save skill',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
      return { success: false };
    }
  };

  const handleSaveSuccess = useCallback(() => {
    setIsDirty(false);
    bypassGuardRef.current = true;
    updateUrl({ view: 'library', name: null });
  }, [updateUrl]);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSkill.mutateAsync(deleteTarget.name);
      toast({
        title: 'Skill moved to Trash',
        description: `${deleteTarget.name} can be restored before the retention window expires.`,
      });
      if (editingNameParam === deleteTarget.name) {
        updateUrl({ view: 'library', name: null });
      }
      setDeleteTarget(null);
    } catch (error) {
      toast({
        title: 'Could not delete skill',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const handleRestore = async (name: string) => {
    try {
      await restoreSkill.mutateAsync(name);
      toast({
        title: 'Skill restored',
        description: `${name} is back in the skills catalogue.`,
      });
    } catch (error) {
      toast({
        title: 'Could not restore skill',
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  };

  const skills = skillsQuery.data ?? [];
  const deletedSkills = deletedSkillsQuery.data ?? [];
  const isMutating =
    setSkillEnabled.isPending || tryItOutSkill.isPending || deleteSkill.isPending;

  // Browser back isn't intercepted — edits silently drop on back-while-dirty.
  const guardArmed = isDirty && (isEditing || view === 'create');

  useEffect(() => {
    if (!guardArmed) return;

    const wouterPush = window.history.pushState.bind(window.history);
    const wouterReplace = window.history.replaceState.bind(window.history);

    function makeGuard(original: typeof window.history.pushState) {
      return function guarded(
        this: History,
        state: unknown,
        unused: string,
        url?: string | URL | null,
      ) {
        if (bypassGuardRef.current) {
          bypassGuardRef.current = false;
          return original(state as never, unused, url as never);
        }
        const target = url == null ? null : typeof url === 'string' ? url : url.toString();
        if (target != null) setPendingNav(target);
      };
    }

    window.history.pushState = makeGuard(wouterPush) as typeof window.history.pushState;
    window.history.replaceState = makeGuard(wouterReplace) as typeof window.history.replaceState;

    return () => {
      window.history.pushState = wouterPush;
      window.history.replaceState = wouterReplace;
    };
  }, [guardArmed]);

  useEffect(() => {
    if (!guardArmed) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [guardArmed]);

  const proceedToPending = useCallback(() => {
    const target = pendingNav;
    setPendingNav(null);
    setIsDirty(false);
    if (!target) return;
    bypassGuardRef.current = true;
    setLocation(target);
  }, [pendingNav, setLocation]);

  const handleGuardSave = useCallback(async () => {
    if (!editorRef.current) return;
    setIsSavingFromGuard(true);
    try {
      const { success } = await editorRef.current.save();
      if (success) proceedToPending();
    } finally {
      setIsSavingFromGuard(false);
    }
  }, [proceedToPending]);

  const handleGuardDiscard = useCallback(() => {
    proceedToPending();
  }, [proceedToPending]);

  const handleGuardStay = useCallback(() => {
    setPendingNav(null);
  }, []);

  const sidebarSlotSpec = useMemo(
    () => ({ body: null, activeSection: 'skills' as const }),
    [],
  );
  useSidebarSlot(sidebarSlotSpec);

  return (
    <>
      <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6 md:px-8">
        {isEditing ? (
          <SkillEditor
            ref={editorRef}
            mode="edit"
            detail={detailQuery.data ?? null}
            isLoadingDetail={detailQuery.isLoading}
            onSave={handleSave}
            onSaveSuccess={handleSaveSuccess}
            onDelete={(d) => setDeleteTarget({ name: d.name })}
            isSaving={updateSkill.isPending}
            isDeleting={deleteSkill.isPending}
            onDirtyChange={setIsDirty}
          />
        ) : view === 'library' ? (
          <SkillsLibraryView
            skills={skills}
            isLoading={skillsQuery.isLoading}
            error={skillsQuery.error}
            isAdminMode={isAdmin}
            isMutating={isMutating}
            createdByMe={createdByMe}
            onToggleCreatedByMe={() => updateUrl({ createdBy: !createdByMe })}
            onToggleEnabled={handleToggleEnabled}
            onTryItOut={handleTryItOut}
            onEdit={handleStartEdit}
            onDelete={(s) => setDeleteTarget({ name: s.name })}
            onCreateSkill={() => updateUrl({ view: 'create' })}
          />
        ) : view === 'create' ? (
          <SkillEditor
            ref={editorRef}
            mode="create"
            detail={null}
            isLoadingDetail={false}
            onSave={handleSave}
            onSaveSuccess={handleSaveSuccess}
            isSaving={createSkill.isPending}
            isDeleting={false}
            onDirtyChange={setIsDirty}
          />
        ) : view === 'trash' ? (
          <SkillsTrashView
            skills={deletedSkills}
            isLoading={deletedSkillsQuery.isLoading}
            isRestoring={restoreSkill.isPending}
            onRestore={handleRestore}
          />
        ) : null}
      </main>

      <ConfirmationModal
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Move skill to Trash"
        description={`Move "${deleteTarget?.name ?? 'this skill'}" to Trash? It will disappear from normal skill lists and can be restored during retention.`}
        confirmText="Move to Trash"
        cancelText="Cancel"
        variant="destructive"
        isLoading={deleteSkill.isPending}
        onConfirm={() => {
          void handleConfirmDelete();
        }}
      />

      <AlertDialog
        open={pendingNav !== null}
        onOpenChange={(open) => {
          if (!open && !isSavingFromGuard) handleGuardStay();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved edits to this skill. If you leave now, those edits will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <TactileButton
              type="button"
              variant="inset"
              onClick={handleGuardStay}
              disabled={isSavingFromGuard}
            >
              Keep editing
            </TactileButton>
            <TactileButton
              type="button"
              variant="inset"
              onClick={handleGuardDiscard}
              disabled={isSavingFromGuard}
            >
              Discard changes
            </TactileButton>
            <TactileButton
              type="button"
              variant="raised"
              onClick={() => void handleGuardSave()}
              disabled={isSavingFromGuard}
              className="flex items-center gap-2"
            >
              {isSavingFromGuard ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save changes
            </TactileButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
