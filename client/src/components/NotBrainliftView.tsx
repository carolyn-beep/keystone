import { Link } from 'wouter';
import { BrainliftData } from '@shared/schema';
import { AlertTriangle, Lightbulb } from 'lucide-react';

interface NotBrainliftViewProps {
  data: BrainliftData;
  isSharedView: boolean;
  toast: any;
}

export const NotBrainliftView = ({ data, isSharedView, toast }: NotBrainliftViewProps) => {
  return (
    <div className="p-6 sm:p-12 mt-6 rounded-xl bg-sidebar">
      <div className="flex flex-col items-center text-center mb-10">
        <div className="p-5 rounded-full bg-warning-soft mb-4">
          <AlertTriangle size={40} className="text-warning" />
        </div>
        <h2 className="text-[28px] font-semibold text-foreground mb-2">
          Not a Keystone Document
        </h2>
        <p className="text-[15px] text-muted-foreground max-w-[500px]">
          This document isn't a Keystone Document yet, but it can be converted
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

      </div>

      <div className="flex flex-wrap justify-center gap-3 mt-10 pt-6 border-t border-border">
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
