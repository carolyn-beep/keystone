import { useState } from 'react';
import { X, Star, Loader2 } from 'lucide-react';
import { tokens } from '@/lib/colors';
import type { LearningStreamItem } from '@/hooks/useLearningStream';

interface GradeModalProps {
  show: boolean;
  item: LearningStreamItem | null;
  onClose: () => void;
  onSubmit: (quality: number, alignment: boolean) => Promise<void>;
  isSubmitting?: boolean;
}

export function GradeModal({ show, item, onClose, onSubmit, isSubmitting }: GradeModalProps) {
  const [quality, setQuality] = useState<number | null>(null);
  const [alignment, setAlignment] = useState<boolean | null>(null);

  const handleSubmit = async () => {
    if (quality === null || alignment === null) return;
    await onSubmit(quality, alignment);
    // Reset state
    setQuality(null);
    setAlignment(null);
  };

  const handleClose = () => {
    setQuality(null);
    setAlignment(null);
    onClose();
  };

  if (!show || !item) return null;

  const canSubmit = quality !== null && alignment !== null && !isSubmitting;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[1000]"
      style={{ backgroundColor: tokens.overlay }}
      onClick={handleClose}
    >
      <div
        className="p-6 w-[95%] max-w-[450px] rounded-xl"
        style={{ backgroundColor: tokens.surface }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-5">
          <div>
            <h2 className="text-lg font-bold m-0 text-foreground">Grade Resource</h2>
            <p className="text-sm text-muted-foreground mt-1 m-0 line-clamp-2">
              {item.title || item.topic || 'Untitled Resource'}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="bg-transparent border-none cursor-pointer p-1 text-muted-foreground hover:text-foreground"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Quality Rating */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-foreground mb-3">
            Quality (1-5 stars)
          </label>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                onClick={() => setQuality(value)}
                className="p-1.5 transition-all hover:scale-110"
                style={{
                  color: quality !== null && value <= quality ? tokens.warning : tokens.textMuted,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
                aria-label={`Rate ${value} stars`}
              >
                <Star
                  size={28}
                  fill={quality !== null && value <= quality ? tokens.warning : 'none'}
                />
              </button>
            ))}
          </div>
          {quality !== null && (
            <p className="text-xs text-muted-foreground mt-2">
              {quality === 1 && 'Poor quality - not useful'}
              {quality === 2 && 'Below average - limited value'}
              {quality === 3 && 'Average - somewhat useful'}
              {quality === 4 && 'Good quality - helpful resource'}
              {quality === 5 && 'Excellent - highly valuable'}
            </p>
          )}
        </div>

        {/* Alignment */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-foreground mb-3">
            Does this align with your brainlift?
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => setAlignment(true)}
              className="flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: alignment === true ? tokens.successSoft : 'transparent',
                border: `2px solid ${alignment === true ? tokens.success : tokens.border}`,
                color: alignment === true ? tokens.success : tokens.textSecondary,
                cursor: 'pointer',
              }}
            >
              Aligns
            </button>
            <button
              onClick={() => setAlignment(false)}
              className="flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: alignment === false ? tokens.dangerSoft : 'transparent',
                border: `2px solid ${alignment === false ? tokens.danger : tokens.border}`,
                color: alignment === false ? tokens.danger : tokens.textSecondary,
                cursor: 'pointer',
              }}
            >
              Doesn&apos;t Align
            </button>
          </div>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full px-5 py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          style={{
            backgroundColor: canSubmit ? tokens.primary : tokens.border,
            color: canSubmit ? tokens.onPrimary : tokens.textMuted,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Saving...
            </>
          ) : (
            'Submit Grade'
          )}
        </button>
      </div>
    </div>
  );
}
