import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import { ExpandableTextarea } from './ExpandableTextarea';
import {
  type SaveSkillRequest,
  type SkillDetail,
  type SkillReferenceInput,
  type SkillVisibility,
} from '@/hooks/useSkills';

const EMPTY_DRAFT: SaveSkillRequest = {
  name: '',
  description: '',
  body: '',
  visibility: 'public',
  references: [],
  shareIdentifiers: [],
};

function splitIdentifiers(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * The server expects reference paths like `references/<slug>.md`. Free-text
 * editing leaks responsibility (path traversal, weird characters, missing
 * extensions, totally different file types) into the user, who then sends
 * a payload the server rejects. Instead we lock the prefix and suffix and let
 * the user type only the slug.
 *
 * `pathToSlug` extracts the editable middle from a stored path. Tolerant of
 * legacy/badly-shaped paths so existing skills don't break on edit — it just
 * pulls the basename without extension and sanitises it.
 *
 * `sanitizeSlug` is the live keystroke filter: lowercase a-z / 0-9 / hyphen
 * only, collapse repeats, strip leading/trailing hyphens. Anything that could
 * confuse the server (slashes, dots, $, %, spaces, control chars) becomes a
 * hyphen and then collapses out.
 *
 * `slugToPath` is the canonical join. The reference is invalid (and the row
 * disabled) when the slug is empty.
 */
function pathToSlug(path: string): string {
  const stripped = path
    .replace(/^references\//i, '')
    .replace(/\.md$/i, '')
    .split('/')
    .pop() ?? '';
  return sanitizeSlug(stripped);
}

function sanitizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugToPath(slug: string): string {
  const safe = sanitizeSlug(slug);
  return safe ? `references/${safe}.md` : '';
}

function dedupeIdentifiers(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function inputClass(extra = ''): string {
  return `w-full rounded-lg border border-border/80 bg-card-elevated px-3 py-2 font-serif text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/50 ${extra}`;
}

function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-[0.32em] font-semibold text-muted-foreground">
      {children}
    </span>
  );
}

interface FieldProps {
  label: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}

/** Vertical-stacked labeled field with eyebrow label and serif description. */
function Field({ label, description, children }: FieldProps) {
  return (
    <div className="grid gap-2">
      <div>
        <MicroLabel>{label}</MicroLabel>
        {description ? (
          <p className="mt-1 font-serif text-[13px] italic leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

interface SkillEditorProps {
  mode: 'create' | 'edit';
  detail: SkillDetail | null;
  isLoadingDetail: boolean;
  onSave: (input: SaveSkillRequest, mode: 'create' | 'edit', currentName: string | null) => Promise<void>;
  onDelete?: (detail: SkillDetail) => void;
  isSaving: boolean;
  isDeleting: boolean;
}

interface ShareChipsInputProps {
  identifiers: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
}

/**
 * Chip-based shares input.
 *
 * - Existing identifiers render as removable chips with an X button.
 * - A single-line input + Enter / "Add" button lets you append one at a time.
 * - A "Paste many" textarea lets you bulk-paste a comma-or-newline-separated
 *   list and merge it into the chips with one click.
 *
 * No silent dedup against case — identifiers are normalised to lowercase for
 * comparison so `Foo@bar.com` and `foo@bar.com` collapse to one chip.
 */
function ShareChipsInput({ identifiers, onChange, disabled }: ShareChipsInputProps) {
  const [singleValue, setSingleValue] = useState('');
  const [bulkValue, setBulkValue] = useState('');

  function addOne() {
    const v = singleValue.trim();
    if (!v) return;
    onChange(dedupeIdentifiers([...identifiers, v]));
    setSingleValue('');
  }

  function addMany() {
    const incoming = splitIdentifiers(bulkValue);
    if (incoming.length === 0) return;
    onChange(dedupeIdentifiers([...identifiers, ...incoming]));
    setBulkValue('');
  }

  function remove(value: string) {
    onChange(identifiers.filter((v) => v !== value));
  }

  return (
    <div className="grid gap-3">
      {identifiers.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {identifiers.map((value) => (
            <span
              key={value}
              className="group inline-flex items-center gap-1.5 rounded-full bg-muted/60 py-1 pl-3 pr-1 font-serif text-[13px] text-foreground"
            >
              <span className="break-all">{value}</span>
              <button
                type="button"
                onClick={() => remove(value)}
                disabled={disabled}
                aria-label={`Remove ${value}`}
                className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[#953A34]/10 hover:text-[#953A34] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="font-serif text-[13px] italic text-muted-light">
          Not shared with anyone yet.
        </p>
      )}

      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <input
          type="email"
          value={singleValue}
          onChange={(e) => setSingleValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addOne();
            }
          }}
          disabled={disabled}
          placeholder="email@example.com or username"
          className={inputClass(disabled ? 'opacity-60' : '')}
        />
        <TactileButton
          type="button"
          variant="raised"
          className="flex items-center gap-2 px-4 py-2 text-[12px]"
          onClick={addOne}
          disabled={disabled || !singleValue.trim()}
        >
          <Plus size={14} />
          Add
        </TactileButton>
      </div>

      <details className="group">
        <summary className="cursor-pointer list-none text-[10px] uppercase tracking-[0.32em] font-semibold text-muted-foreground hover:text-foreground">
          + Paste many at once
        </summary>
        <div className="mt-3 grid gap-2">
          <textarea
            value={bulkValue}
            onChange={(e) => setBulkValue(e.target.value)}
            disabled={disabled}
            placeholder="alex@team.com, blair@team.com, ..."
            className={inputClass(`min-h-[72px] resize-y ${disabled ? 'opacity-60' : ''}`)}
          />
          <div>
            <TactileButton
              type="button"
              variant="inset"
              className="flex items-center gap-2 px-3 py-1.5 text-[12px]"
              onClick={addMany}
              disabled={disabled || !bulkValue.trim()}
            >
              <Plus size={13} />
              Add all
            </TactileButton>
          </div>
        </div>
      </details>
    </div>
  );
}

/**
 * Create / edit form for a skill. Used as the body of the "Create Skill" view
 * (mode='create') and the "Edit" sub-view (mode='edit', detail provided).
 */
export function SkillEditor({
  mode,
  detail,
  isLoadingDetail,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: SkillEditorProps) {
  const [draft, setDraft] = useState<SaveSkillRequest>(EMPTY_DRAFT);
  // Which textarea is expanded into the modal. `null` when none. Strings are
  // 'body' for the skill body and `ref-<index>` for a reference's content.
  // Only one can be open at a time; opening another closes the previous.
  const [expandedField, setExpandedField] = useState<string | null>(null);

  // Hydrate draft from detail when entering edit mode or when detail loads.
  useEffect(() => {
    if (mode === 'create') {
      setDraft({ ...EMPTY_DRAFT, references: [] });
      return;
    }
    if (!detail) return;
    setDraft({
      name: detail.name,
      description: detail.description,
      body: detail.body,
      visibility: detail.visibility,
      references: detail.references.map((r) => ({ path: r.path, content: r.content })),
      shareIdentifiers: detail.shares.map((s) => s.userEmail || s.userName).filter(Boolean),
    });
  }, [mode, detail]);

  function updateReference(index: number, patch: Partial<SkillReferenceInput>) {
    setDraft((current) => ({
      ...current,
      references: current.references.map((reference, i) =>
        i === index ? { ...reference, ...patch } : reference,
      ),
    }));
  }

  function removeReference(index: number) {
    setDraft((current) => ({
      ...current,
      references: current.references.filter((_, i) => i !== index),
    }));
  }

  async function handleSave() {
    // Drop any reference rows with an empty slug — the user added a row but
    // never filled in a name. Sanitise the path one more time as a last line
    // of defense against bad shapes flowing through to the server.
    const cleanedReferences = draft.references
      .map((r) => ({ ...r, path: slugToPath(pathToSlug(r.path)) }))
      .filter((r) => r.path !== '');
    await onSave(
      { ...draft, references: cleanedReferences },
      mode,
      mode === 'edit' ? detail?.name ?? null : null,
    );
  }

  const sharesDisabled = draft.visibility === 'public';
  const shareControlsDisabled = sharesDisabled;

  // Hero copy varies by mode so the user always knows what they're doing.
  const hero = useMemo(() => {
    if (mode === 'create') {
      return {
        eyebrow: 'Creating new skill',
        title: 'New Skill',
        lede: 'Skills are reusable prompts available to chat conversations. Once published, anyone with access (everyone for public skills, or only the people you share with for private skills) can summon this skill from a new chat. Edits affect new conversations only.',
      };
    }
    return {
      eyebrow: 'Editing skill',
      title: detail?.name ?? '...',
      lede: 'Edits affect new conversations. Existing chats keep the version of the skill that was loaded when they started; users will need to start a new conversation to pick up your changes.',
    };
  }, [mode, detail]);

  if (mode === 'edit' && isLoadingDetail && !detail) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (mode === 'edit' && !detail) {
    return (
      <div className="rounded-xl bg-card-elevated px-6 py-10 text-center shadow-card">
        <p className="font-serif text-[18px] text-foreground">Select a skill to edit.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Mode header — large, scannable. Different visual identity per mode. */}
      <section className="overflow-hidden rounded-2xl bg-card-elevated px-8 py-7 shadow-card sm:px-10">
        <p
          className={`text-[10px] uppercase tracking-[0.4em] font-semibold ${
            mode === 'create' ? 'text-[#56643F]' : 'text-primary'
          }`}
        >
          {hero.eyebrow}
        </p>
        <h1 className="mt-2 break-words font-serif text-[40px] leading-tight text-foreground sm:text-[48px]">
          {hero.title}
        </h1>
        <p className="mt-3 font-serif text-[15px] italic leading-relaxed text-muted-foreground">
          {hero.lede}
        </p>
      </section>

      {/* === BODY: form === */}
      <section className="rounded-2xl bg-card-elevated px-8 py-8 shadow-card sm:px-10">
        <div className="grid gap-7">
          {/* Identity */}
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Name">
              <input
                value={draft.name}
                onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))}
                className={inputClass()}
                placeholder="research-coach"
              />
            </Field>
            <Field label="Visibility">
              <select
                value={draft.visibility}
                onChange={(e) => setDraft((c) => ({ ...c, visibility: e.target.value as SkillVisibility }))}
                className={inputClass()}
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </Field>
          </div>

          {/* When to use — drives agent routing */}
          <Field
            label="When to use"
            description={'This is what the agent sees alongside the skill name and uses it to decide whether to invoke this skill — write it as concrete triggers ("Use when…", "Invoke this skill if…"). Keep it short and actionable.'}
          >
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((c) => ({ ...c, description: e.target.value }))}
              className={inputClass('min-h-[80px] resize-y')}
              maxLength={500}
              placeholder={'Use this skill when the student needs to …'}
            />
            <p className="text-right text-[11px] text-muted-light">
              {draft.description.length} / 500
            </p>
          </Field>

          {/* Body */}
          <Field
            label="Skill body"
            description={
              <>
                The actual prompt content sent to the model when this skill is invoked.{' '}
                <strong className="font-serif not-italic font-semibold text-foreground">Markdown is supported</strong> and rendered as plain text (the model reads the raw markdown). Use clear section headings, bullet lists, and explicit instructions for best results.
              </>
            }
          >
            <ExpandableTextarea
              label="Skill body"
              value={draft.body}
              onChange={(v) => setDraft((c) => ({ ...c, body: v }))}
              className={inputClass('min-h-[280px] resize-y font-mono text-[13px]')}
              modalClassName="font-mono text-[14px]"
              placeholder={"# Role\nYou are...\n\n# When to use\n...\n\n# Steps\n1. ...\n2. ..."}
              isOpen={expandedField === 'body'}
              onOpenChange={(open) => setExpandedField(open ? 'body' : null)}
            />
          </Field>

          {/* References */}
          <Field
            label="References"
            description={
              <>
                Optional supporting context loaded alongside the skill body — example outputs, snippets, datasets, anything the model might want to consult.{' '}
                <strong className="font-serif not-italic font-semibold text-foreground">Markdown is supported</strong> in the content. Each reference gets a slug; the path is built as{' '}
                <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[12px]">references/&lt;slug&gt;.md</code>.
              </>
            }
          >
            <div className="grid gap-3">
              {draft.references.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-card px-4 py-5 text-center text-[12px] text-muted-foreground">
                  No references in this draft.
                </div>
              ) : (
                draft.references.map((reference, index) => {
                  const slug = pathToSlug(reference.path);
                  return (
                    <div key={index} className="rounded-lg bg-card px-4 py-4 shadow-sm">
                      <div className="flex gap-3">
                        <div className={`${inputClass('flex items-center gap-1 font-mono text-[12px]')} px-0 py-0`}>
                          <span className="select-none pl-3 text-muted-light">references/</span>
                          <input
                            value={slug}
                            onChange={(e) =>
                              updateReference(index, { path: slugToPath(e.target.value) })
                            }
                            className="min-w-0 flex-1 bg-transparent py-2 text-foreground outline-none placeholder:text-muted-foreground/50"
                            placeholder="my-reference"
                            spellCheck={false}
                            autoCapitalize="off"
                            autoCorrect="off"
                          />
                          <span className="select-none pr-3 text-muted-light">.md</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeReference(index)}
                          aria-label="Remove reference"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#953A34]/10 hover:text-[#953A34]"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="mt-3">
                        <ExpandableTextarea
                          label={`Reference: references/${slug || '<slug>'}.md`}
                          value={reference.content}
                          onChange={(v) => updateReference(index, { content: v })}
                          className={inputClass('min-h-[360px] resize-y font-mono text-[12px]')}
                          modalClassName="font-mono text-[14px]"
                          placeholder="Reference content (markdown)"
                          isOpen={expandedField === `ref-${index}`}
                          onOpenChange={(open) => setExpandedField(open ? `ref-${index}` : null)}
                        />
                      </div>
                    </div>
                  );
                })
              )}
              <div>
                <TactileButton
                  type="button"
                  variant="inset"
                  className="flex items-center gap-2 px-3 py-2 text-[12px]"
                  onClick={() =>
                    setDraft((c) => ({
                      ...c,
                      references: [...c.references, { path: '', content: '' }],
                    }))
                  }
                >
                  <Plus size={14} />
                  Add reference
                </TactileButton>
              </div>
            </div>
          </Field>

          {/* Shares — moved to last */}
          <Field
            label="Shared with"
            description={
              sharesDisabled ? (
                <>
                  Public skills are available to everyone, so this list is disabled. Existing entries are preserved if you switch back to private.
                </>
              ) : (
                <>
                  Manage who can see and invoke this private skill. Add by email or username, one at a time or pasted as a comma-separated list. Click the × on a chip to revoke access.
                </>
              )
            }
          >
            <ShareChipsInput
              identifiers={draft.shareIdentifiers}
              onChange={(next) => setDraft((c) => ({ ...c, shareIdentifiers: next }))}
              disabled={shareControlsDisabled}
            />
          </Field>
        </div>

        {/* Actions — destructive on the left, primary on the right (last
            position = strongest emphasis). */}
        <div className="mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-6">
          {mode === 'edit' && detail && onDelete ? (
            <TactileButton
              type="button"
              variant="inset"
              className="flex items-center gap-2"
              disabled={isDeleting}
              onClick={() => onDelete(detail)}
            >
              <Trash2 size={16} />
              Move to Trash
            </TactileButton>
          ) : null}
          <TactileButton
            type="button"
            variant="raised"
            className="flex items-center gap-2"
            disabled={isSaving}
            onClick={() => void handleSave()}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
            {mode === 'create' ? 'Publish skill' : 'Save changes'}
          </TactileButton>
        </div>
      </section>
    </div>
  );
}
