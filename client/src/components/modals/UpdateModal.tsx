import { X, Upload } from 'lucide-react';
import { tokens } from '@/lib/colors';

type SourceType = 'html' | 'workflowy' | 'googledocs';

interface UpdateModalProps {
  show: boolean;
  onClose: () => void;
  sourceType: SourceType;
  onSourceTypeChange: (type: SourceType) => void;
  file: File | null;
  onFileChange: (file: File | null) => void;
  url: string;
  onUrlChange: (url: string) => void;
  onSubmit: (formData: FormData) => void;
  isSubmitting: boolean;
  error?: string;
}

export function UpdateModal({
  show,
  onClose,
  sourceType,
  onSourceTypeChange,
  file,
  onFileChange,
  url,
  onUrlChange,
  onSubmit,
  isSubmitting,
  error,
}: UpdateModalProps) {
  if (!show) return null;

  const canSubmit = (() => {
    if (sourceType === 'html') {
      return !!file;
    } else if (sourceType === 'workflowy' || sourceType === 'googledocs') {
      return !!url.trim();
    }
    return false;
  })();

  const handleSubmit = () => {
    if (!canSubmit) return;
    const formData = new FormData();
    formData.append('sourceType', sourceType);
    if (sourceType === 'html') {
      if (file) formData.append('file', file);
    } else if (sourceType === 'workflowy' || sourceType === 'googledocs') {
      formData.append('url', url);
    }
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[1000]" style={{ backgroundColor: tokens.overlay }}>
      <div
        className="p-4 sm:p-8 w-[95%] max-w-[500px] max-h-[90vh] overflow-auto rounded-xl bg-card"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold m-0 text-primary">Update Brainlift</h2>
          <button
            data-testid="button-close-update-modal"
            onClick={onClose}
            className="bg-transparent border-none cursor-pointer p-1"
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-muted-foreground text-sm mb-5">
          Import new content to update this brainlift. Your current data will be saved to version history.
        </p>

        <div className="flex gap-1 mb-5 flex-wrap">
          {[
            { id: 'workflowy' as const, label: 'Workflowy' },
            { id: 'html' as const, label: 'HTML' },
            { id: 'googledocs' as const, label: 'Google Docs' },
          ].map((tab) => (
            <button
              key={tab.id}
              data-testid={`update-tab-${tab.id}`}
              onClick={() => {
                onSourceTypeChange(tab.id);
                onFileChange(null);
                onUrlChange('');
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-[13px] font-medium cursor-pointer transition-all duration-150"
              style={{
                border: `1px solid ${sourceType === tab.id ? tokens.primary : tokens.border}`,
                backgroundColor: sourceType === tab.id ? tokens.primarySoft : 'transparent',
                color: sourceType === tab.id ? tokens.primary : tokens.textSecondary,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {sourceType === 'html' && (
          <div className="mb-5">
            <label className="block mb-2 font-medium text-sm">Upload File</label>
            <div
              className="rounded-lg p-6 text-center cursor-pointer"
              style={{ border: `2px dashed ${tokens.border}` }}
              onClick={() => document.getElementById('update-file-input')?.click()}
            >
              <Upload size={24} className="mb-2 text-muted-foreground" />
              <p className="m-0 text-sm text-muted-foreground">
                {file ? file.name : 'Click to upload an HTML file (or saved Workflowy page)'}
              </p>
              <input
                type="file"
                id="update-file-input"
                data-testid="input-update-file"
                accept=".html,.htm"
                onChange={(e) => onFileChange(e.target.files?.[0] || null)}
                className="hidden"
              />
            </div>
          </div>
        )}

        {(sourceType === 'workflowy' || sourceType === 'googledocs') && (
          <div className="mb-5">
            <label className="block mb-2 font-medium text-sm">
              {sourceType === 'workflowy' ? 'Workflowy Secret Link' : 'Google Docs URL'}
            </label>
            <input
              type="text"
              data-testid="input-update-url"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder={sourceType === 'workflowy' ? 'https://workflowy.com/s/...' : 'https://docs.google.com/...'}
              className="w-full px-3 py-2.5 rounded-md text-sm box-border"
              style={{ border: `1px solid ${tokens.border}` }}
            />
            <p className="mt-2 text-muted-foreground text-[13px]">
              {sourceType === 'workflowy'
                ? 'Must be a secret link (contains /s/ in URL). Link must point directly to your brainlift\'s root node.'
                : 'Make sure your Google Doc has link sharing enabled (anyone with the link can view).'}
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm mb-4 text-destructive">
            {error}
          </p>
        )}

        <button
          data-testid="button-submit-update"
          onClick={handleSubmit}
          disabled={isSubmitting || !canSubmit}
          className="w-full px-3 py-3 border-none rounded-lg text-sm font-semibold"
          style={{
            backgroundColor: (isSubmitting || !canSubmit) ? tokens.textMuted : tokens.secondary,
            color: tokens.surface,
            cursor: (isSubmitting || !canSubmit) ? 'not-allowed' : 'pointer',
          }}
        >
          {isSubmitting ? 'Updating... (this may take a minute)' : 'Update Brainlift'}
        </button>
      </div>
    </div>
  );
}
