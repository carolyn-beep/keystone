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
        className="p-4 sm:p-8 w-[95%] max-w-[700px] max-h-[90vh] overflow-auto rounded-xl"
        style={{ backgroundColor: tokens.surface }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: tokens.primary }}>Version History</h2>
          <button
            data-testid="button-close-history-modal"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        <p style={{ color: tokens.textSecondary, fontSize: '14px', marginBottom: '20px' }}>
          View previous versions of this brainlift with their preserved grades and data.
        </p>

        {versions.length === 0 ? (
          <p style={{ textAlign: 'center', color: tokens.textSecondary, padding: '24px' }}>
            No previous versions available.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {versions.map((version) => {
              const snapshot = version.snapshot as any;
              return (
                <div
                  key={version.id}
                  data-testid={`version-${version.versionNumber}`}
                  style={{
                    border: `1px solid ${tokens.border}`,
                    borderRadius: '8px',
                    padding: '16px 20px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{
                      padding: '4px 10px',
                      backgroundColor: tokens.primary,
                      color: tokens.surface,
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}>
                      Version {version.versionNumber}
                    </span>
                    <span style={{ color: tokens.textSecondary, fontSize: '13px' }}>
                      {new Date(version.createdAt).toLocaleDateString()} at {new Date(version.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p style={{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: 600, color: tokens.textPrimary }}>
                    {snapshot?.title || 'Untitled'}
                  </p>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: tokens.textSecondary }}>
                    <span>{snapshot?.facts?.length || 0} facts</span>
                    <span>{snapshot?.readingList?.length || 0} reading items</span>
                    <span>Source: {version.sourceType}</span>
                  </div>
                  {snapshot?.grades && snapshot.grades.length > 0 && (
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${tokens.border}` }}>
                      <p style={{ fontSize: '12px', fontWeight: 600, color: tokens.textSecondary, marginBottom: '8px' }}>Preserved Grades:</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {snapshot.grades.filter((g: any) => g.aligns || g.quality).slice(0, 5).map((grade: any, i: number) => (
                          <span
                            key={i}
                            style={{
                              padding: '4px 8px',
                              backgroundColor: tokens.surfaceAlt,
                              borderRadius: '4px',
                              fontSize: '11px',
                            }}
                          >
                            {grade.readingListTopic?.substring(0, 30)}... {grade.quality ? `(${grade.quality}/5)` : ''}
                          </span>
                        ))}
                        {snapshot.grades.filter((g: any) => g.aligns || g.quality).length > 5 && (
                          <span style={{ fontSize: '11px', color: tokens.textSecondary }}>
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
