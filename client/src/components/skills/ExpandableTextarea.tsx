import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X } from 'lucide-react';

interface ExpandableTextareaProps {
  /** Small-caps label shown in the modal header. */
  label: string;
  value: string;
  onChange: (next: string) => void;
  /** Class applied to the inline textarea. */
  className?: string;
  /** Class applied to the modal textarea (for mono/font tweaks). */
  modalClassName?: string;
  placeholder?: string;
  /** Controlled open state (lifted so the parent can decide). */
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Textarea with an "expand" button that opens the same content in a near-full-
 * screen modal for editing with more breathing room.
 *
 * Both the inline and modal textareas bind to the same `value` / `onChange`,
 * so edits in either propagate immediately to the parent's state. Closing the
 * modal does not commit anything separately — there's nothing to commit.
 *
 * Open state is controlled by the parent so multiple expandable fields on the
 * same form can't fight each other and so Esc-to-close lives at the page level.
 */
export function ExpandableTextarea({
  label,
  value,
  onChange,
  className,
  modalClassName,
  placeholder,
  isOpen,
  onOpenChange,
}: ExpandableTextareaProps) {
  // Esc to close. Mounted only while open so we don't burn an extra listener
  // on every textarea on the page.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onOpenChange]);

  // Prevents text selections that end on the backdrop from closing the modal:
  // browsers fire `click` on the common ancestor of mousedown/mouseup, which
  // is the backdrop in that case.
  const mouseDownOnBackdropRef = useRef(false);

  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-label={`Expand ${label}`}
        title="Expand to full screen"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-card-elevated/80 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-card-elevated hover:text-foreground"
      >
        <Maximize2 size={14} />
      </button>

      {isOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[1000] flex items-center justify-center px-4 py-6"
              style={{ backgroundColor: 'rgba(45, 45, 45, 0.55)' }}
              onMouseDown={(e) => {
                mouseDownOnBackdropRef.current = e.target === e.currentTarget;
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget && mouseDownOnBackdropRef.current) {
                  onOpenChange(false);
                }
                mouseDownOnBackdropRef.current = false;
              }}
            >
              <div className="flex h-[90vh] w-[95vw] max-w-[1400px] flex-col overflow-hidden rounded-2xl bg-card-elevated shadow-card">
                <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.32em] font-semibold text-muted-foreground">
                      Editing
                    </p>
                    <p className="mt-0.5 font-serif text-[20px] text-foreground">{label}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    aria-label="Close"
                    className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X size={18} />
                  </button>
                </div>
                <textarea
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder={placeholder}
                  autoFocus
                  className={`flex-1 resize-none border-0 bg-card-elevated px-6 py-5 text-foreground outline-none placeholder:text-muted-foreground/50 ${modalClassName ?? ''}`}
                />
                <div className="border-t border-border px-6 py-3 text-right text-[11px] text-muted-light">
                  Esc or click outside to close. Changes are saved automatically to the form.
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
