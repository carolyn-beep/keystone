import { Archive } from 'lucide-react';
import type { DOK3InsightWithLinks } from '@/hooks/useDOK3Insights';

interface ScratchpadTabProps {
  items: DOK3InsightWithLinks[];
  isLoading: boolean;
}

export function ScratchpadTab({ items, isLoading }: ScratchpadTabProps) {
  if (isLoading) {
    return (
      <div className="max-w-[1200px] mx-auto p-12 text-center text-muted-foreground">
        Loading scratchpad...
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto">
      {/* Page Header */}
      <div className="flex flex-col gap-4 mb-6 pb-4">
        <h2 className="text-[30px] font-bold text-foreground tracking-tight leading-[1.1] m-0">
          Scratchpad
        </h2>
        <p className="text-[15px] text-muted-light m-0 max-w-2xl font-serif italic">
          A holding area for insights you've set aside during the linking process.
        </p>
      </div>

      {/* Coming Soon Banner */}
      <div className="bg-primary/5 border border-border rounded-xl p-6 mb-12 flex items-center gap-4">
        <Archive size={20} className="text-primary shrink-0" />
        <p className="text-[14px] text-muted-foreground m-0">
          Full editing capabilities coming soon. For now, scratchpadded insights are listed here as read-only.
        </p>
      </div>

      {/* Items or Empty State */}
      {items.length === 0 ? (
        <div className="bg-card-elevated rounded-xl shadow-card py-20 px-12">
          <div className="flex flex-col items-center text-center">
            <Archive size={40} className="text-muted-light opacity-40 mb-8" />
            <h3 className="font-serif text-[24px] text-foreground m-0 mb-4">
              Nothing Here Yet
            </h3>
            <p className="text-[14px] text-muted-light m-0 max-w-md leading-relaxed">
              When you send DOK3 insights to the scratchpad during linking, they'll appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {items.map(item => (
            <div
              key={item.id}
              className="bg-card-elevated rounded-xl shadow-card px-10 py-8"
            >
              <p className="font-serif text-[16px] leading-[1.8] text-foreground m-0">
                {item.text}
              </p>
              {item.frameworkName && (
                <span className="mt-4 inline-block text-[10px] uppercase tracking-[0.3em] text-muted-light font-semibold">
                  {item.frameworkName}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
