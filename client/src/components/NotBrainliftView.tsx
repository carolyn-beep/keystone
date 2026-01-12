import { useState } from 'react';
import { Link } from 'wouter';
import { BrainliftData } from '@shared/schema';
import { Share2, ChevronDown, AlertTriangle, FileText, Lightbulb } from 'lucide-react';
import { tokens } from '@/lib/colors';

interface NotBrainliftViewProps {
  data: BrainliftData;
  isSharedView: boolean;
  toast: any;
}

export const NotBrainliftView = ({ data, isSharedView, toast }: NotBrainliftViewProps) => {
  const [debugExpanded, setDebugExpanded] = useState(false);

  return (
    <div className="p-6 sm:p-12 mt-6 rounded-xl bg-sidebar">
      <div className="flex flex-col items-center text-center mb-10">
        <div className="p-5 rounded-full bg-warning-soft mb-4">
          <AlertTriangle size={40} className="text-warning" />
        </div>
        <h2 className="text-[28px] font-semibold text-foreground mb-2">
          Not a Brainlift
        </h2>
        <p className="text-[15px] text-muted-foreground max-w-[500px]">
          This document isn't a brainlift yet, but it can be converted
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-[900px] mx-auto">
        {data.rejectionSubtype && (
          <div className="p-6 bg-card rounded-xl border border-border">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-3 font-semibold">
              What It Is
            </div>
            <div className="text-base text-foreground font-medium leading-normal">
              {data.rejectionSubtype}
            </div>
          </div>
        )}

        {data.rejectionReason && (
          <div className="p-6 bg-card rounded-xl border border-border">
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-3 font-semibold">
              Why It Can't Be Graded
            </div>
            <div className="text-sm text-foreground leading-relaxed">
              {data.rejectionReason}
            </div>
          </div>
        )}

        {data.rejectionRecommendation && (
          <div className="lg:col-span-2 p-6 bg-success-soft rounded-xl border-2 border-success">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb size={18} className="text-success" />
              <div className="text-[11px] text-success uppercase tracking-wider font-semibold">
                How to Fix
              </div>
            </div>
            <div className="text-sm text-foreground leading-relaxed">
              {data.rejectionRecommendation}
            </div>
          </div>
        )}

        {/* DEBUG Section for Not a Brainlift */}
        <div className="lg:col-span-2 mt-4 p-6 rounded-xl border border-border bg-card transition-all duration-200">
          <button
            data-testid="button-toggle-debug-content-not-brainlift"
            onClick={() => setDebugExpanded(!debugExpanded)}
            className="w-full flex items-center justify-between group bg-transparent border-none cursor-pointer p-0"
          >
            <div className="flex items-center gap-3">
              <div
                className="p-2 rounded-lg transition-colors"
                style={{ backgroundColor: debugExpanded ? tokens.primarySoft : tokens.surfaceAlt }}
              >
                <FileText
                  size={20}
                  style={{ color: debugExpanded ? tokens.primary : tokens.textSecondary }}
                />
              </div>
              <div className="text-left">
                <h3 className="text-base font-semibold text-foreground m-0">
                  DEBUG: Extracted Raw Content
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 mb-0">
                  {data.sourceType || 'Workflowy'} extraction result • {data.originalContent?.length || 0} characters
                </p>
              </div>
            </div>
            <div
              className="p-2 rounded-full bg-sidebar transition-transform duration-200 flex items-center justify-center"
              style={{
                transform: debugExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
              }}
            >
              <ChevronDown size={18} className="text-muted-foreground" />
            </div>
          </button>

          {debugExpanded && (
            <div className="mt-6 pt-6 border-t border-border animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(data.originalContent || '');
                    toast({ title: 'Copied to clipboard', description: 'Raw content has been copied.' });
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-sidebar text-muted-foreground border-none cursor-pointer hover-elevate"
                >
                  <Share2 size={14} />
                  Copy Raw Text
                </button>
              </div>
              <div className="p-4 rounded-lg overflow-x-auto font-mono text-xs leading-relaxed bg-sidebar text-foreground max-h-[400px] overflow-y-auto border border-border">
                <pre className="m-0 whitespace-pre-wrap break-words font-mono">
                  {data.originalContent || 'No raw content available.'}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-3 mt-10 pt-6 border-t border-border">
        <Link href="/grading/knowledge-rich-curriculum">
          <button
            data-testid="button-view-example"
            className="px-6 py-3 bg-card text-primary rounded-lg cursor-pointer text-sm font-medium flex items-center gap-2 hover-elevate active-elevate-2"
            style={{ border: `1px solid ${tokens.primary}` }}
          >
            <FileText size={16} />
            View Example Brainlift
          </button>
        </Link>
        {!isSharedView && (
          <Link href="/">
            <button
              data-testid="button-back-to-list"
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg border-none cursor-pointer text-sm font-medium hover-elevate active-elevate-2"
            >
              Back to List
            </button>
          </Link>
        )}
      </div>
    </div>
  );
};
