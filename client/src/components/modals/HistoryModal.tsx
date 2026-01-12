import { X } from 'lucide-react';
import { tokens } from '@/lib/colors';
import type { BrainliftVersion } from '@shared/schema';

interface HistoryModalProps {
  show: boolean;
  onClose: () => void;
  versions: BrainliftVersion[];
}

export function HistoryModal({ show, onClose, versions }: HistoryModalProps) {
  if (!show) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[1000]"
      style={{ backgroundColor: tokens.overlay }}
    >
      <div
        className="p-4 sm:p-8 w-[95%] max-w-[700px] max-h-[90vh] overflow-auto rounded-xl bg-card"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold m-0 text-primary">Version History</h2>
          <button
            data-testid="button-close-history-modal"
            onClick={onClose}
            className="bg-transparent border-none cursor-pointer p-1"
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-muted-foreground text-sm mb-5">
          View previous versions of this brainlift with their preserved grades and data.
        </p>

        {versions.length === 0 ? (
          <p className="text-center text-muted-foreground p-6">
            No previous versions available.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {versions.map((version) => {
              const snapshot = version.snapshot as any;
              return (
                <div
                  key={version.id}
                  data-testid={`version-${version.versionNumber}`}
                  className="rounded-lg px-5 py-4"
                  style={{ border: `1px solid ${tokens.border}` }}
                >
                  <div className="flex justify-between items-center mb-3">
                    <span className="px-2.5 py-1 bg-primary text-card rounded text-xs font-semibold">
                      Version {version.versionNumber}
                    </span>
                    <span className="text-muted-foreground text-[13px]">
                      {new Date(version.createdAt).toLocaleDateString()} at {new Date(version.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="m-0 mb-2 text-[15px] font-semibold text-foreground">
                    {snapshot?.title || 'Untitled'}
                  </p>
                  <div className="flex gap-4 text-[13px] text-muted-foreground">
                    <span>{snapshot?.facts?.length || 0} facts</span>
                    <span>{snapshot?.readingList?.length || 0} reading items</span>
                    <span>Source: {version.sourceType}</span>
                  </div>
                  {snapshot?.grades && snapshot.grades.length > 0 && (
                    <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${tokens.border}` }}>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Preserved Grades:</p>
                      <div className="flex flex-wrap gap-2">
                        {snapshot.grades.filter((g: any) => g.aligns || g.quality).slice(0, 5).map((grade: any, i: number) => (
                          <span
                            key={i}
                            className="px-2 py-1 bg-muted rounded text-[11px]"
                          >
                            {grade.readingListTopic?.substring(0, 30)}... {grade.quality ? `(${grade.quality}/5)` : ''}
                          </span>
                        ))}
                        {snapshot.grades.filter((g: any) => g.aligns || g.quality).length > 5 && (
                          <span className="text-[11px] text-muted-foreground">
                            +{snapshot.grades.filter((g: any) => g.aligns || g.quality).length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
