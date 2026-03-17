import { useState, useRef, useEffect, useCallback } from 'react';
import { Pencil, Loader2 } from 'lucide-react';
import type { NativeDetailsResponse } from '@shared/routes';

// ─── Validation ─────────────────────────────────────────────────────────────

interface ValidationRule {
  minLength?: number;
  label: string;
}

const FIELD_RULES: Record<string, ValidationRule> = {
  topic: { minLength: 10, label: 'Topic' },
  purpose: { minLength: 20, label: 'Purpose' },
  owner: { label: 'Owner' },
};

function validate(field: string, value: string): string | null {
  const rule = FIELD_RULES[field];
  if (!rule) return null;
  if (rule.minLength && value.trim().length < rule.minLength) {
    return `${rule.label} must be at least ${rule.minLength} characters.`;
  }
  return null;
}

// ─── InlineField ────────────────────────────────────────────────────────────

interface InlineFieldProps {
  field: string;
  label: string;
  value: string;
  placeholder: string;
  multiline?: boolean;
  canModify: boolean;
  onSave: (field: string, value: string) => Promise<void>;
  isSaving: boolean;
}

function InlineField({
  field,
  label,
  value,
  placeholder,
  multiline = false,
  canModify,
  onSave,
  isSaving,
}: InlineFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Sync draft when value changes externally (e.g., after save)
  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [value, editing]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      // Place cursor at end
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  const handleEdit = useCallback(() => {
    if (!canModify || isSaving) return;
    setEditing(true);
    setError(null);
  }, [canModify, isSaving]);

  const handleCancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
    setError(null);
  }, [value]);

  const handleSave = useCallback(async () => {
    const trimmed = draft.trim();

    // Owner can be cleared
    if (field === 'owner' && trimmed === '') {
      try {
        await onSave(field, '');
        setEditing(false);
        setError(null);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Save failed';
        setError(msg);
      }
      return;
    }

    // Validate non-owner fields
    const validationError = validate(field, trimmed);
    if (validationError) {
      setError(validationError);
      return;
    }

    // No change — just close
    if (trimmed === value) {
      setEditing(false);
      setError(null);
      return;
    }

    try {
      await onSave(field, trimmed);
      setEditing(false);
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setError(msg);
    }
  }, [draft, field, value, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter' && !multiline) {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Enter' && e.metaKey && multiline) {
        e.preventDefault();
        handleSave();
      }
    },
    [handleCancel, handleSave, multiline]
  );

  // ── Read mode ──────────────────────────────────────────────────────────

  if (!editing) {
    const displayValue = value || placeholder;
    const isEmpty = !value;

    return (
      <div className="group">
        <div className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground mb-2">
          {label}
        </div>
        <div
          onClick={handleEdit}
          className={`relative rounded-lg px-4 py-3 transition-colors duration-300 ${
            canModify
              ? 'cursor-pointer hover:bg-primary/5'
              : 'cursor-default'
          }`}
        >
          <p
            className={`m-0 leading-relaxed ${
              multiline
                ? 'font-serif text-[16px]'
                : 'font-serif text-[20px] font-normal'
            } ${isEmpty ? 'italic text-muted-foreground' : 'text-foreground'}`}
          >
            {displayValue}
          </p>
          {canModify && (
            <Pencil
              size={14}
              className="absolute top-3 right-3 text-muted-foreground opacity-0 group-hover:opacity-60 transition-opacity duration-300"
            />
          )}
        </div>
      </div>
    );
  }

  // ── Edit mode ──────────────────────────────────────────────────────────

  const sharedClasses =
    'w-full rounded-lg px-4 py-3 bg-card-elevated border border-border text-foreground font-serif leading-relaxed focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-primary/20 transition-colors';

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
          {label}
        </div>
        {isSaving && (
          <Loader2 size={14} className="animate-spin text-muted-foreground" />
        )}
      </div>

      {multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          rows={3}
          placeholder={placeholder}
          className={`${sharedClasses} text-[16px] resize-y min-h-[80px]`}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`${sharedClasses} text-[20px]`}
        />
      )}

      {error && (
        <p className="m-0 mt-2 text-[12px] font-medium" style={{ color: 'var(--danger-hex)' }}>
          {error}
        </p>
      )}

      <p className="m-0 mt-1.5 text-[11px] text-muted-foreground">
        {multiline ? 'Cmd+Enter to save, Escape to cancel.' : 'Enter to save, Escape to cancel.'}
      </p>
    </div>
  );
}

// ─── Phase1Topic ────────────────────────────────────────────────────────────

interface Phase1TopicProps {
  nativeDetails: NativeDetailsResponse;
  onUpdate: (fields: Partial<{ topic: string; purpose: string; owner: string | null }>) => Promise<void>;
  isUpdating: boolean;
  canModify: boolean;
}

export function Phase1Topic({ nativeDetails, onUpdate, isUpdating, canModify }: Phase1TopicProps) {
  const handleSave = useCallback(
    async (field: string, value: string) => {
      if (field === 'owner') {
        await onUpdate({ owner: value === '' ? null : value });
      } else {
        await onUpdate({ [field]: value });
      }
    },
    [onUpdate]
  );

  return (
    <div className="py-10 px-2 max-w-3xl">
      {/* Phase header */}
      <div className="flex items-center gap-4 mb-2">
        <span className="font-serif text-[42px] leading-none text-muted-light font-normal tracking-wide">
          1
        </span>
        <h2 className="text-[26px] font-bold text-foreground tracking-tight leading-[1.1] m-0">
          Topic & Purpose
        </h2>
      </div>
      <p className="font-serif text-[14px] italic text-muted-foreground leading-relaxed m-0 mb-12">
        Define what this brainlift is about and why it matters.
      </p>

      <div className="space-y-10">
        {/* Topic */}
        <InlineField
          field="topic"
          label="Topic"
          value={nativeDetails.topic}
          placeholder="What is this brainlift about?"
          canModify={canModify}
          onSave={handleSave}
          isSaving={isUpdating}
        />

        {/* Purpose */}
        <InlineField
          field="purpose"
          label="Purpose"
          value={nativeDetails.purpose}
          placeholder="Why does this brainlift matter? What should the reader learn?"
          multiline
          canModify={canModify}
          onSave={handleSave}
          isSaving={isUpdating}
        />

        {/* Owner */}
        <InlineField
          field="owner"
          label="Owner"
          value={nativeDetails.owner ?? ''}
          placeholder="Who is the subject matter expert? (optional)"
          canModify={canModify}
          onSave={handleSave}
          isSaving={isUpdating}
        />
      </div>
    </div>
  );
}
