import { useState, useRef } from 'react';
import { X, Upload, FileText, Link as LinkIcon, File } from 'lucide-react';
import { tokens } from '@/lib/colors';
import { useImportWithProgress } from '@/hooks/useImportWithProgress';
import { ImportProgress } from '@/components/ImportProgress';

type SourceType = 'html' | 'workflowy' | 'googledocs';

const tabs: { id: SourceType; label: string; icon: typeof FileText }[] = [
  { id: 'workflowy', label: 'Workflowy', icon: LinkIcon },
  { id: 'html', label: 'HTML', icon: FileText },
  { id: 'googledocs', label: 'Google Docs', icon: LinkIcon },
];

interface AddBrainliftModalProps {
  show: boolean;
  onClose: () => void;
  onSuccess: (slug: string) => void;
}

export function AddBrainliftModal({ show, onClose, onSuccess }: AddBrainliftModalProps) {
  const [activeTab, setActiveTab] = useState<SourceType>('workflowy');
  const [url, setUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importWithProgress = useImportWithProgress();

  const closeModal = () => {
    if (importWithProgress.isImporting) {
      importWithProgress.cancel();
    }
    importWithProgress.reset();
    onClose();
    setActiveTab('workflowy');
    setUrl('');
    setSelectedFile(null);
    setError('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError('');
    }
  };

  const handleSubmit = async () => {
    setError('');

    const formData = new FormData();
    formData.append('sourceType', activeTab);

    if (activeTab === 'html') {
      if (!selectedFile) {
        setError('Please select a file');
        return;
      }
      formData.append('file', selectedFile);
    } else if (activeTab === 'workflowy' || activeTab === 'googledocs') {
      if (!url.trim()) {
        setError('Please enter a URL');
        return;
      }
      formData.append('url', url);
    }

    const slug = await importWithProgress.importBrainlift(formData);
    if (slug) {
      closeModal();
      onSuccess(slug);
    }
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[1000] p-5"
      style={{ backgroundColor: tokens.overlay }}
      onClick={closeModal}
    >
      <div
        className="p-4 sm:p-6 w-full max-w-[600px] max-h-[90vh] overflow-auto rounded-xl bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-xl font-semibold text-foreground m-0">
            Add New Brainlift
          </h2>
          <button
            data-testid="button-close-modal"
            onClick={closeModal}
            className="bg-transparent border-none cursor-pointer text-muted-foreground"
          >
            <X size={24} />
          </button>
        </div>

        <p className="text-muted-foreground text-sm mb-5">
          Add New Brainlift to Grade DOK1 facts and create a curated reading list.
        </p>

        {/* Secondary/ghost tabs */}
        <div className="flex gap-1 mb-5 flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              data-testid={`tab-${tab.id}`}
              onClick={() => {
                setActiveTab(tab.id);
                setError('');
                setSelectedFile(null);
                setUrl('');
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-[13px] font-medium cursor-pointer transition-all duration-150"
              style={{
                border: `1px solid ${activeTab === tab.id ? tokens.primary : tokens.border}`,
                backgroundColor: activeTab === tab.id ? tokens.primarySoft : 'transparent',
                color: activeTab === tab.id ? tokens.primary : tokens.textSecondary,
              }}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-[150px]">
          {activeTab === 'html' && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm"
                onChange={handleFileSelect}
                className="hidden"
                data-testid="input-file"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-lg py-10 px-5 text-center cursor-pointer"
                style={{
                  borderColor: tokens.border,
                  backgroundColor: selectedFile ? tokens.surfaceAlt : 'transparent',
                }}
              >
                {selectedFile ? (
                  <>
                    <File size={32} color={tokens.secondary} className="mb-2 mx-auto" />
                    <p className="m-0 text-foreground font-medium">{selectedFile.name}</p>
                    <p className="mt-1 mb-0 text-muted-foreground text-[13px]">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </>
                ) : (
                  <>
                    <Upload size={32} color={tokens.textMuted} className="mb-2 mx-auto" />
                    <p className="m-0 text-muted-foreground">
                      Click to upload an HTML file (or saved Workflowy page)
                    </p>
                    <p className="mt-1 mb-0 text-muted-foreground text-[13px]">
                      Max file size: 10MB
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {(activeTab === 'workflowy' || activeTab === 'googledocs') && (
            <div>
              <label className="block mb-2 text-foreground text-sm font-medium">
                {activeTab === 'workflowy' ? 'Workflowy Share Link' : 'Google Docs URL'}
              </label>
              <input
                type="url"
                data-testid="input-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={activeTab === 'workflowy' ? 'https://workflowy.com/s/...' : 'https://docs.google.com/document/d/...'}
                className="w-full p-3 rounded-lg border text-sm box-border"
                style={{ borderColor: tokens.border }}
              />
              <p className="mt-2 text-muted-foreground text-[13px]">
                {activeTab === 'workflowy'
                  ? 'Must be a secret link (contains /s/ in URL). Link must point directly to your brainlift\'s root node — no parent nodes, notes, or other content should be visible.'
                  : 'Make sure your Google Doc has link sharing enabled (anyone with the link can view).'}
              </p>
            </div>
          )}
        </div>

        {/* Show local error or import error */}
        {(error || importWithProgress.error) && !importWithProgress.isImporting && (
          <p className="text-destructive text-sm mt-3">
            {error || importWithProgress.error}
          </p>
        )}

        {/* Progress display - always rendered, animated in/out */}
        <ImportProgress
          currentStage={importWithProgress.currentStage}
          stageLabel={importWithProgress.stageLabel}
          progress={importWithProgress.progress}
          gradingProgress={importWithProgress.gradingProgress}
          error={importWithProgress.error}
          isVisible={importWithProgress.isImporting}
        />

        <div className="flex gap-3 mt-5 justify-end">
          {/* Cancel/Close button */}
          <button
            data-testid="button-cancel"
            onClick={closeModal}
            className="px-5 py-2.5 rounded-lg border bg-transparent text-muted-foreground text-sm"
            style={{
              borderColor: importWithProgress.isImporting ? tokens.danger : tokens.border,
              color: importWithProgress.isImporting ? tokens.danger : tokens.textSecondary,
              cursor: 'pointer',
            }}
          >
            {importWithProgress.isImporting ? 'Cancel Import' : 'Cancel'}
          </button>
          {/* Primary button */}
          {!importWithProgress.isImporting && (
            <button
              data-testid="button-submit-import"
              onClick={handleSubmit}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg border-none text-primary-foreground text-sm font-medium"
              style={{
                backgroundColor: tokens.primary,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = tokens.primaryHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = tokens.primary;
              }}
            >
              Import & Analyze
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
