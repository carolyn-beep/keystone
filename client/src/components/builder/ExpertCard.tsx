import { useState, useCallback } from 'react';
import { Pencil, Trash2, User } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import type { BuilderExpert } from '@shared/schema';

interface ExpertCardProps {
  expert?: BuilderExpert;
  prefill?: BuilderExpert;
  onSave: (fields: {
    name: string;
    who: string;
    where: string;
    focus?: string;
    why?: string;
  }) => Promise<void>;
  onDelete?: () => void;
  onCancel?: () => void;
}

interface FormFields {
  name: string;
  who: string;
  where: string;
  focus: string;
  why: string;
}

function initFields(source?: BuilderExpert): FormFields {
  return {
    name: source?.name ?? '',
    who: source?.who ?? '',
    where: source?.where ?? '',
    focus: source?.focus ?? '',
    why: source?.why ?? '',
  };
}

export function ExpertCard({ expert, prefill, onSave, onDelete, onCancel }: ExpertCardProps) {
  const isNew = !expert;
  const startEditing = isNew || !!prefill;

  const [isEditing, setIsEditing] = useState(startEditing);
  const [fields, setFields] = useState<FormFields>(initFields(prefill ?? expert));
  const [isSaving, setIsSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const trimmedName = fields.name.trim();
  const trimmedWho = fields.who.trim();
  const trimmedWhere = fields.where.trim();
  const canSave = trimmedName.length > 0 && trimmedWho.length > 0 && trimmedWhere.length > 0;

  const handleFieldChange = useCallback(
    (field: keyof FormFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFields((prev) => ({ ...prev, [field]: e.target.value }));
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!canSave || isSaving) return;
    setIsSaving(true);
    try {
      await onSave({
        name: trimmedName,
        who: trimmedWho,
        where: trimmedWhere,
        focus: fields.focus.trim() || undefined,
        why: fields.why.trim() || undefined,
      });
      // If editing an existing expert, transition to read mode
      if (expert) {
        setIsEditing(false);
      }
      // If new/prefill, the parent removes this card on success
    } catch {
      // Error handled by parent mutation
    } finally {
      setIsSaving(false);
    }
  }, [canSave, isSaving, trimmedName, trimmedWho, trimmedWhere, fields.focus, fields.why, onSave, expert]);

  const handleCancel = useCallback(() => {
    if (expert) {
      // Revert to original values and return to read mode
      setFields(initFields(expert));
      setIsEditing(false);
    } else {
      onCancel?.();
    }
  }, [expert, onCancel]);

  const handleEdit = useCallback(() => {
    setFields(initFields(expert));
    setIsEditing(true);
    setConfirmingDelete(false);
  }, [expert]);

  const handleDeleteClick = useCallback(() => {
    setConfirmingDelete(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    onDelete?.();
    setConfirmingDelete(false);
  }, [onDelete]);

  const handleDeleteCancel = useCallback(() => {
    setConfirmingDelete(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && canSave && !isSaving) {
        e.preventDefault();
        handleSave();
      }
    },
    [canSave, isSaving, handleSave]
  );

  // ── Edit mode ──────────────────────────────────────────────────────
  if (isEditing) {
    return (
      <div className="rounded-xl shadow-card bg-card-elevated overflow-hidden">
        <div className="px-8 py-6" onKeyDown={handleKeyDown}>
          {/* Header */}
          <div className="flex items-center gap-2 mb-5">
            <User size={14} className="text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
              {isNew && !prefill ? 'New expert' : prefill ? 'Review suggestion' : 'Edit expert'}
            </span>
          </div>

          {/* Form fields */}
          <div className="space-y-4">
            <FormField
              label="Name"
              required
              value={fields.name}
              onChange={handleFieldChange('name')}
              placeholder="e.g. Dr. Jane Smith"
            />
            <FormField
              label="Who they are"
              required
              value={fields.who}
              onChange={handleFieldChange('who')}
              placeholder="e.g. Professor of Cognitive Science at MIT"
            />
            <FormField
              label="Where to find them"
              required
              value={fields.where}
              onChange={handleFieldChange('where')}
              placeholder="e.g. Google Scholar, university website"
            />
            <FormField
              label="Focus area"
              value={fields.focus}
              onChange={handleFieldChange('focus')}
              placeholder="e.g. Memory consolidation and learning"
            />
            <FormField
              label="Why relevant"
              value={fields.why}
              onChange={handleFieldChange('why')}
              placeholder="e.g. Pioneered research on spaced repetition"
              multiline
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-6 pt-5 border-t border-border">
            <TactileButton
              variant="raised"
              className="text-[12px]"
              onClick={handleSave}
              disabled={!canSave || isSaving}
            >
              {isSaving ? 'Saving...' : prefill ? 'Accept & Save' : 'Save Expert'}
            </TactileButton>
            <TactileButton
              variant="inset"
              className="text-[12px]"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </TactileButton>
          </div>
        </div>
      </div>
    );
  }

  // ── Read mode ──────────────────────────────────────────────────────
  return (
    <div className="rounded-xl shadow-card bg-card-elevated overflow-hidden">
      <div className="px-8 py-6">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-foreground mb-1">
              {expert?.name}
            </div>
            <p className="font-serif text-[13px] italic text-muted-foreground leading-relaxed m-0">
              {expert?.who}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              className="p-1.5 rounded-md bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              onClick={handleEdit}
              aria-label="Edit expert"
            >
              <Pencil size={14} />
            </button>
            {onDelete && (
              <button
                className="p-1.5 rounded-md bg-transparent border-none cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                onClick={handleDeleteClick}
                aria-label="Delete expert"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Detail fields */}
        <div className="space-y-2">
          <DetailRow label="Where" value={expert?.where} />
          {expert?.focus && <DetailRow label="Focus" value={expert.focus} />}
          {expert?.why && <DetailRow label="Why" value={expert.why} />}
        </div>

        {/* Inline delete confirmation */}
        {confirmingDelete && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="font-serif text-[13px] italic text-muted-foreground m-0 mb-3">
              Remove this expert? This cannot be undone.
            </p>
            <div className="flex items-center gap-2">
              <TactileButton
                variant="raised"
                className="text-[11px]"
                onClick={handleDeleteConfirm}
              >
                Remove
              </TactileButton>
              <TactileButton
                variant="inset"
                className="text-[11px]"
                onClick={handleDeleteCancel}
              >
                Keep
              </TactileButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function FormField({
  label,
  required,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const inputClasses =
    'w-full rounded-lg bg-card border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 font-serif focus:outline-none focus:border-primary/40 transition-colors';

  return (
    <div>
      <label className="block text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground mb-1.5">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {multiline ? (
        <textarea
          className={`${inputClasses} resize-none`}
          rows={2}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
        />
      ) : (
        <input
          type="text"
          className={inputClasses}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground shrink-0 w-12">
        {label}
      </span>
      <span className="font-serif text-[13px] text-foreground leading-relaxed">
        {value}
      </span>
    </div>
  );
}
