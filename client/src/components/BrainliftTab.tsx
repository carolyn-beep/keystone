import { Download, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
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
    <div className="bg-card rounded-xl border border-border p-6">
      {/* Header with Download Button */}
      <div className="flex justify-between items-center mb-5 pb-4" style={{ borderBottom: `1px solid ${tokens.border}` }}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-accent">
            <FileText size={20} style={{ color: tokens.primary }} />
          </div>
          <div>
            <h3 className="m-0 text-base font-semibold text-foreground">
              Original Document
            </h3>
            <p className="m-0 text-[13px] text-muted-foreground">
              {sourceType ? `Source: ${sourceType.toUpperCase()}` : 'The source document for this brainlift'}
            </p>
          </div>
        </div>

        {originalContent && (
          <button
            data-testid="button-download-original"
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-card text-foreground cursor-pointer text-[13px] font-medium"
            style={{ border: `1px solid ${tokens.border}` }}
          >
            <Download size={14} />
            Download
          </button>
        )}
      </div>

      {/* Document Content */}
      {originalContent ? (
        <div className="bg-muted rounded-lg p-5 max-h-[600px] overflow-y-auto prose prose-sm dark:prose-invert max-w-none
          prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
          prose-h1:text-xl prose-h1:border-b prose-h1:border-border prose-h1:pb-2
          prose-h2:text-lg
          prose-h3:text-base
          prose-p:text-foreground prose-p:leading-relaxed prose-p:my-2
          prose-ul:my-2 prose-ul:pl-5
          prose-li:text-foreground prose-li:my-0.5
          prose-strong:text-foreground
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline
        ">
          <ReactMarkdown>{originalContent}</ReactMarkdown>
        </div>
      ) : (
        <div className="text-center py-[60px] px-5 text-muted-foreground">
          <FileText size={48} className="opacity-30 mb-4" />
          <p className="m-0 text-[15px]">
            No original document available
          </p>
          <p className="mt-2 mb-0 text-[13px] opacity-70">
            Original content is saved when you import or update a brainlift
          </p>
        </div>
      )}
    </div>
  );
};
