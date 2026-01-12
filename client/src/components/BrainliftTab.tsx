import { Download, FileText } from 'lucide-react';
import { tokens } from '@/lib/colors';

interface BrainliftTabProps {
  originalContent: string | null | undefined;
  sourceType: string | null | undefined;
  slug: string;
}

export const BrainliftTab = ({ originalContent, sourceType, slug }: BrainliftTabProps) => {
  const handleDownload = () => {
    const blob = new Blob([originalContent || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}-original.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      backgroundColor: tokens.surface,
      borderRadius: '12px',
      border: `1px solid ${tokens.border}`,
      padding: '24px',
    }}>
      {/* Header with Download Button */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: `1px solid ${tokens.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            padding: '10px',
            borderRadius: '8px',
            backgroundColor: tokens.primarySoft,
          }}>
            <FileText size={20} style={{ color: tokens.primary }} />
          </div>
          <div>
            <h3 style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 600,
              color: tokens.textPrimary
            }}>
              Original Document
            </h3>
            <p style={{
              margin: 0,
              fontSize: '13px',
              color: tokens.textSecondary
            }}>
              {sourceType ? `Source: ${sourceType.toUpperCase()}` : 'The source document for this brainlift'}
            </p>
          </div>
        </div>

        {originalContent && (
          <button
            data-testid="button-download-original"
            onClick={handleDownload}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '6px',
              border: `1px solid ${tokens.border}`,
              backgroundColor: tokens.surface,
              color: tokens.textPrimary,
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            <Download size={14} />
            Download
          </button>
        )}
      </div>

      {/* Document Content */}
      {originalContent ? (
        <div style={{
          backgroundColor: tokens.surfaceAlt,
          borderRadius: '8px',
          padding: '20px',
          maxHeight: '600px',
          overflowY: 'auto',
        }}>
          <pre style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: '14px',
            lineHeight: 1.7,
            color: tokens.textPrimary,
          }}>
            {originalContent}
          </pre>
        </div>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: tokens.textSecondary,
        }}>
          <FileText size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
          <p style={{ margin: 0, fontSize: '15px' }}>
            No original document available
          </p>
          <p style={{ margin: '8px 0 0', fontSize: '13px', opacity: 0.7 }}>
            Original content is saved when you import or update a brainlift
          </p>
        </div>
      )}
    </div>
  );
};
