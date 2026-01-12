import { X, Upload, Loader2 } from 'lucide-react';
import { tokens } from '@/lib/colors';

interface UpdateModalProps {
  show: boolean;
  onClose: () => void;
  sourceType: 'pdf' | 'docx' | 'html' | 'text' | 'workflowy' | 'googledocs';
  onSourceTypeChange: (type: 'pdf' | 'docx' | 'html' | 'text' | 'workflowy' | 'googledocs') => void;
  file: File | null;
  onFileChange: (file: File | null) => void;
  url: string;
  onUrlChange: (url: string) => void;
  text: string;
  onTextChange: (text: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  canSubmit: boolean;
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
  text,
  onTextChange,
  onSubmit,
  isSubmitting,
  canSubmit,
  error,
}: UpdateModalProps) {
  if (!show) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: tokens.overlay,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div
        className="p-4 sm:p-8 w-[95%] max-w-[500px] max-h-[90vh] overflow-auto rounded-xl"
        style={{ backgroundColor: tokens.surface }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: tokens.primary }}>Update Brainlift</h2>
          <button
            data-testid="button-close-update-modal"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        <p style={{ color: tokens.textSecondary, fontSize: '14px', marginBottom: '20px' }}>
          Import new content to update this brainlift. Your current data will be saved to version history.
        </p>

        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {[
            { id: 'pdf', label: 'PDF' },
            { id: 'docx', label: 'Word' },
            { id: 'html', label: 'HTML' },
            { id: 'text', label: 'Text' },
            { id: 'workflowy', label: 'Workflowy' },
            { id: 'googledocs', label: 'Google Docs' },
          ].map((tab) => (
            <button
              key={tab.id}
              data-testid={`update-tab-${tab.id}`}
              onClick={() => {
                onSourceTypeChange(tab.id as any);
                onFileChange(null);
                onUrlChange('');
                onTextChange('');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '6px',
                border: `1px solid ${sourceType === tab.id ? tokens.primary : tokens.border}`,
                backgroundColor: sourceType === tab.id ? tokens.primarySoft : 'transparent',
                color: sourceType === tab.id ? tokens.primary : tokens.textSecondary,
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {(sourceType === 'pdf' || sourceType === 'docx' || sourceType === 'html') && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px' }}>Upload File</label>
            <div style={{
              border: `2px dashed ${tokens.border}`,
              borderRadius: '8px',
              padding: '24px',
              textAlign: 'center',
              cursor: 'pointer',
            }}
            onClick={() => document.getElementById('update-file-input')?.click()}
            >
              <Upload size={24} style={{ marginBottom: '8px', color: tokens.textSecondary }} />
              <p style={{ margin: 0, fontSize: '14px', color: tokens.textSecondary }}>
                {file ? file.name : `Click to upload ${sourceType === 'html' ? 'an HTML' : sourceType === 'pdf' ? 'a PDF' : 'a Word'} file`}
              </p>
              <input
                type="file"
                id="update-file-input"
                data-testid="input-update-file"
                accept={sourceType === 'pdf' ? '.pdf' : sourceType === 'docx' ? '.docx' : '.html,.htm'}
                onChange={(e) => onFileChange(e.target.files?.[0] || null)}
                style={{ display: 'none' }}
              />
            </div>
          </div>
        )}

        {(sourceType === 'workflowy' || sourceType === 'googledocs') && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px' }}>
              {sourceType === 'workflowy' ? 'Workflowy URL' : 'Google Docs URL'}
            </label>
            <input
              type="text"
              data-testid="input-update-url"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder={sourceType === 'workflowy' ? 'https://workflowy.com/#/...' : 'https://docs.google.com/...'}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: `1px solid ${tokens.border}`,
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {sourceType === 'text' && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px' }}>Content</label>
            <textarea
              data-testid="input-update-text"
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder="Paste your educational content here..."
              style={{
                width: '100%',
                minHeight: '150px',
                padding: '10px 12px',
                borderRadius: '6px',
                border: `1px solid ${tokens.border}`,
                fontSize: '14px',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {error && (
          <p style={{ color: tokens.danger, fontSize: '14px', marginBottom: '16px' }}>
            {error}
          </p>
        )}

        <button
          data-testid="button-submit-update"
          onClick={onSubmit}
          disabled={isSubmitting || !canSubmit}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: (isSubmitting || !canSubmit) ? tokens.textMuted : tokens.secondary,
            color: tokens.surface,
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: (isSubmitting || !canSubmit) ? 'not-allowed' : 'pointer',
          }}
        >
          {isSubmitting ? 'Updating... (this may take a minute)' : 'Update Brainlift'}
        </button>
      </div>
    </div>
  );
}
