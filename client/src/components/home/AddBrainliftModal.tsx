import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Upload, FileText, Link as LinkIcon, File, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { tokens } from '@/lib/colors';
import { useImportWithProgress } from '@/hooks/useImportWithProgress';
import { ImportProgress } from '@/components/ImportProgress';
import { DOK3LinkingUI } from '@/components/DOK3LinkingUI';
import { DOK4LinkingUI } from '@/components/DOK4LinkingUI';
import { TactileButton } from '@/components/ui/tactile-button';
import { ImportAgentLayout } from '@/components/import-agent/ImportAgentLayout';
import { ImportAgentProvider } from '@/components/import-agent/ImportAgentContext';
import { useImportConversation } from '@/hooks/useImportConversation';
import { useCreateForAgent } from '@/hooks/useCreateForAgent';
import { useGradingProgress } from '@/hooks/useGradingProgress';
import type { ImportStage } from '@shared/import-progress';
import modalBgTexture from '@/assets/textures/modal_bgv2.webp';

type SourceType = 'html' | 'workflowy' | 'googledocs';

const tabs: { id: SourceType; label: string; icon: typeof FileText }[] = [
  { id: 'workflowy', label: 'Workflowy', icon: LinkIcon },
  { id: 'html', label: 'HTML', icon: FileText },
  { id: 'googledocs', label: 'Google Docs', icon: LinkIcon },
];

const CASCADE_ORDERED_STAGES: Exclude<ImportStage, 'complete' | 'error'>[] = [
  'grading',
  'grading_dok2',
  'grading_dok3',
  'experts',
  'redundancy',
];

// Manual mode: only stages up to DOK2 grading (linking UIs handle the rest)
const MANUAL_ORDERED_STAGES: Exclude<ImportStage, 'complete' | 'error'>[] = [
  'extracting',
  'grading',
  'contradictions',
  'grading_dok2',
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
  const [autoLink, setAutoLink] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Legacy import flow — phase state machine
  const importState = useImportWithProgress();
  const { importPhase } = importState;

  // Agent flow state
  const [agentSlug, setAgentSlug] = useState<string | null>(null);
  const [isGradingMode, setIsGradingMode] = useState(false);
  const createForAgent = useCreateForAgent();
  const grading = useGradingProgress();
  const conversation = useImportConversation(agentSlug);

  // Derived state from phase machine
  const isManualLinking = importPhase === 'dok3_manual_linking' || importPhase === 'dok4_manual_linking';
  const isExpanded = isManualLinking || !!agentSlug;

  // Holds the completed slug when import finishes while user is still linking
  const pendingSlugRef = useRef<string | null>(null);

  // Auto-navigate when import is done and we're not in manual linking
  useEffect(() => {
    // Phase 'complete' from SSE — navigate if not manually linking
    if (importPhase === 'complete' && importState.slug) {
      const slug = importState.slug;
      importState.reset();
      resetAll();
      onClose();
      onSuccess(slug);
      return;
    }
    // Finishing phase with pending slug — SSE already completed before we got here
    if (importPhase === 'finishing' && pendingSlugRef.current && !importState.isImporting) {
      const slug = pendingSlugRef.current;
      pendingSlugRef.current = null;
      importState.reset();
      resetAll();
      onClose();
      onSuccess(slug);
    }
  }, [importPhase, importState.slug, importState.isImporting]);

  // When in manual linking/finishing and SSE completes, store slug for later
  const isManualFlow = isManualLinking || importPhase === 'finishing';
  useEffect(() => {
    if (isManualFlow && importState.slug && !importState.isImporting) {
      pendingSlugRef.current = importState.slug;
    }
  }, [isManualFlow, importState.slug, importState.isImporting]);

  const resetAll = useCallback(() => {
    setActiveTab('workflowy');
    setUrl('');
    setSelectedFile(null);
    setError('');
    setAutoLink(true);
    setAgentSlug(null);
    setIsGradingMode(false);
    pendingSlugRef.current = null;
    createForAgent.reset();
  }, [createForAgent]);

  const closeModal = useCallback(() => {
    if (isManualLinking) return;
    if (isGradingMode && grading.isGrading) return;

    if (importState.isImporting) {
      importState.cancel();
    }
    importState.reset();
    resetAll();
    onClose();
  }, [isManualLinking, isGradingMode, grading.isGrading, importState, resetAll, onClose]);

  // Manual mode: DOK3 linking complete → DOK4 or finishing
  const handleDok3LinkingComplete = useCallback(() => {
    importState.completeDok3Linking();
  }, [importState]);

  // Manual mode: DOK4 linking complete → finishing (progress bar resumes)
  const handleDok4LinkingComplete = useCallback(() => {
    importState.completeDok4Linking();

    // If SSE already completed, navigate immediately
    if (pendingSlugRef.current) {
      const slug = pendingSlugRef.current;
      pendingSlugRef.current = null;
      importState.reset();
      resetAll();
      onClose();
      onSuccess(slug);
    }
  }, [importState, resetAll, onClose, onSuccess]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError('');
    }
  };

  // Legacy import
  const handleSubmit = async () => {
    setError('');

    const formData = new FormData();
    formData.append('sourceType', activeTab);
    formData.append('autoLink', String(autoLink));

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

    const slug = await importState.importBrainlift(formData);
    if (slug) {
      const phase = importState.phaseRef.current;
      // If we're in any manual linking or finishing phase, hold the slug for later navigation
      if (phase === 'dok3_manual_linking' || phase === 'dok4_manual_linking' || phase === 'finishing') {
        pendingSlugRef.current = slug;
      } else {
        importState.reset();
        resetAll();
        onClose();
        onSuccess(slug);
      }
    }
  };

  // Agent flow: create brainlift then expand
  const handleRunAgent = async () => {
    setError('');
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    createForAgent.mutate(
      { url: url.trim(), sourceType: 'workflowy' },
      {
        onSuccess: (data) => {
          setAgentSlug(data.slug);
        },
        onError: (err) => {
          setError(err.message || 'Failed to create brainlift');
        },
      }
    );
  };

  // Agent grading flow
  const handleStartGrading = useCallback(async () => {
    if (!agentSlug) return;
    setIsGradingMode(true);
    const resultSlug = await grading.startGrading(agentSlug);
    if (resultSlug) {
      resetAll();
      onClose();
      onSuccess(resultSlug);
    }
  }, [agentSlug, grading, resetAll, onClose, onSuccess]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[1000] p-5 overflow-hidden"
      style={{ backgroundColor: tokens.overlay }}
      onClick={(isManualLinking || (isGradingMode && grading.isGrading)) ? undefined : closeModal}
    >
      <motion.div
        layout
        transition={{ layout: { duration: 0.4, ease: [0.4, 0, 0.2, 1] } }}
        className="relative overflow-hidden rounded-xl bg-card flex flex-col"
        style={{
          width: isExpanded ? '90vw' : '100%',
          maxWidth: isExpanded ? '1750px' : '600px',
          height: isExpanded ? '92vh' : 'auto',
          maxHeight: isExpanded ? '1080px' : '90vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <AnimatePresence mode="wait">
          {importPhase === 'dok4_manual_linking' ? (
            <motion.div
              key="dok4-linking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col h-full"
            >
              <DOK4LinkingUI
                slug={importState.manualDok3Info?.slug ?? importState.slug ?? ''}
                spovCount={importState.manualDok4Count ?? 0}
                importState={importState}
                onComplete={handleDok4LinkingComplete}
              />
            </motion.div>
          ) : importPhase === 'dok3_manual_linking' ? (
            <motion.div
              key="dok3-linking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col h-full"
            >
              <DOK3LinkingUI
                slug={importState.manualDok3Info!.slug}
                dok3Count={importState.manualDok3Info!.dok3Count}
                importState={importState}
                onComplete={handleDok3LinkingComplete}
              />
            </motion.div>
          ) : agentSlug ? (
            <motion.div
              key="agent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col h-full"
            >
              {/* Agent header */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
                <h2 className="text-sm font-semibold text-foreground">
                  {isGradingMode ? 'Grading in Progress' : 'Import Agent'}
                </h2>
                <button
                  onClick={closeModal}
                  disabled={isGradingMode && grading.isGrading}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Agent body */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {isGradingMode ? (
                  <div className="flex items-center justify-center h-full px-6">
                    <div className="w-full max-w-md">
                      <ImportProgress
                        currentStage={grading.currentStage}
                        stageLabel={grading.stageLabel}
                        progress={grading.progress}
                        gradingProgress={grading.gradingProgress}
                        gradingDok2Progress={grading.gradingDok2Progress}
                        gradingDok3Progress={grading.gradingDok3Progress}
                        error={grading.error}
                        isVisible={true}
                        orderedStages={CASCADE_ORDERED_STAGES}
                      />
                    </div>
                  </div>
                ) : conversation.isLoading ? (
                  <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
                    <Loader2 size={16} className="animate-spin" />
                    <span className="text-sm">Loading conversation...</span>
                  </div>
                ) : (
                  <ImportAgentProvider value={{ startGrading: handleStartGrading }}>
                    <ImportAgentLayout
                      slug={agentSlug}
                      initialMessages={conversation.messages}
                    />
                  </ImportAgentProvider>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="import"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="p-4 sm:p-6"
            >
              {/* Texture overlay */}
              <div
                aria-hidden="true"
                className="absolute inset-0 rounded-xl pointer-events-none z-0"
                style={{
                  backgroundImage: `url(${modalBgTexture})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  opacity: 0.10,
                  mixBlendMode: 'multiply',
                }}
              />
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

              {/* Underline tabs */}
              <div className="relative z-10 mb-5">
                <div className="flex">
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
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-medium cursor-pointer transition-colors duration-200 bg-transparent border-none font-serif"
                      style={{
                        color: activeTab === tab.id ? tokens.primary : tokens.textSecondary,
                      }}
                    >
                      <tab.icon size={14} />
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div
                  className="absolute bottom-0 left-0 h-0.5 transition-all duration-300 ease-out rounded-full"
                  style={{
                    backgroundColor: tokens.primary,
                    width: `${100 / tabs.length}%`,
                    transform: `translateX(${tabs.findIndex(t => t.id === activeTab) * 100}%)`,
                  }}
                />
                <div
                  className="absolute bottom-0 left-0 right-0 h-px"
                  style={{ backgroundColor: tokens.border }}
                />
              </div>

              <div className={`relative z-10 pb-4 ${importState.isImporting ? 'opacity-50 pointer-events-none' : ''}`}>
                {activeTab === 'html' && (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".html,.htm"
                      onChange={handleFileSelect}
                      className="hidden"
                      data-testid="input-file"
                      disabled={importState.isImporting}
                    />
                    <div
                      onClick={() => !importState.isImporting && fileInputRef.current?.click()}
                      className="border-2 border-dashed rounded-lg py-6 px-5 text-center cursor-pointer flex flex-col items-center justify-center"
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
                      disabled={importState.isImporting}
                      placeholder={activeTab === 'workflowy' ? 'https://workflowy.com/s/...' : 'https://docs.google.com/document/d/...'}
                      className="w-full p-3 rounded-lg text-sm box-border border-none outline-none disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: tokens.surfaceAlt,
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06), inset 0 1px 2px rgba(0,0,0,0.08)',
                      }}
                    />
                    <p className="mt-2 text-muted-foreground text-[13px]">
                      {activeTab === 'workflowy'
                        ? 'Must be a secret link (contains /s/ in URL). Link must point directly to your brainlift\'s root node -- no parent nodes, notes, or other content should be visible.'
                        : 'Make sure your Google Doc has link sharing enabled (anyone with the link can view).'}
                    </p>
                  </div>
                )}
              </div>

              {/* Auto-link toggle */}
              <div className={`relative z-10 flex items-center gap-3 py-3 ${importState.isImporting ? 'opacity-50 pointer-events-none' : ''}`}>
                <button
                  onClick={() => !importState.isImporting && setAutoLink(!autoLink)}
                  disabled={importState.isImporting}
                  className={`relative w-10 h-5 rounded-full transition-colors duration-200 border-0 cursor-pointer disabled:cursor-not-allowed ${
                    autoLink ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                  data-testid="toggle-auto-link"
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                      autoLink ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <label
                  className="text-sm text-muted-foreground cursor-pointer select-none"
                  onClick={() => !importState.isImporting && setAutoLink(!autoLink)}
                >
                  Auto-link DOK3s and DOK4s
                </label>
              </div>

              {/* Show local error, agent creation error, or import error */}
              {(error || createForAgent.error?.message || importState.error) && !importState.isImporting && (
                <p className="text-destructive text-sm mt-3">
                  {error || createForAgent.error?.message || importState.error}
                </p>
              )}

              {/* Progress display */}
              <ImportProgress
                currentStage={importState.currentStage}
                stageLabel={importState.stageLabel}
                progress={importState.progress}
                gradingProgress={importState.gradingProgress}
                gradingDok2Progress={importState.gradingDok2Progress}
                gradingDok3Progress={importState.gradingDok3Progress}
                gradingDok4Progress={importState.gradingDok4Progress}
                linkingDok3Progress={importState.linkingDok3Progress}
                linkingDok4Progress={importState.linkingDok4Progress}
                error={importState.error}
                isVisible={importState.isImporting || importPhase === 'finishing'}
                orderedStages={autoLink ? undefined : MANUAL_ORDERED_STAGES}
              />

              <div className="flex gap-3 mt-5 justify-end">
                <TactileButton
                  variant="inset"
                  data-testid="button-cancel"
                  onClick={closeModal}
                  style={{ color: importState.isImporting ? tokens.danger : undefined }}
                >
                  {importState.isImporting ? 'Cancel Import' : 'Cancel'}
                </TactileButton>
                {!importState.isImporting && activeTab === 'workflowy' && (
                  <TactileButton
                    variant="inset"
                    onClick={handleRunAgent}
                    disabled={createForAgent.isPending}
                    className="text-xs"
                  >
                    {createForAgent.isPending ? (
                      <span className="flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" />
                        Creating...
                      </span>
                    ) : (
                      'Run Import Agent (Beta)'
                    )}
                  </TactileButton>
                )}
                <TactileButton
                  variant="raised"
                  data-testid="button-submit-import"
                  onClick={handleSubmit}
                  disabled={importState.isImporting}
                >
                  {importState.isImporting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      Importing...
                    </span>
                  ) : (
                    'Import & Analyze'
                  )}
                </TactileButton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
