import { Radar, CheckCircle, Loader2 } from 'lucide-react';

interface StreamEmptyStateProps {
  variant: 'generating' | 'all-processed' | 'no-data';
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function StreamEmptyState({ variant, onRefresh, isRefreshing }: StreamEmptyStateProps) {
  if (variant === 'generating') {
    return (
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-8">
        <div className="flex flex-col items-center justify-center text-center">
          {/* Animated radar icon */}
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-full border-2 border-amber-500/30 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full border border-amber-500/50 flex items-center justify-center">
                <Radar
                  size={32}
                  className="text-amber-400 animate-pulse"
                  style={{ animationDuration: '1.5s' }}
                />
              </div>
            </div>
            {/* Radar sweep effect */}
            <div
              className="absolute inset-0 rounded-full border-t-2 border-amber-400 animate-spin"
              style={{ animationDuration: '3s' }}
            />
          </div>

          <h3 className="font-mono text-lg font-bold text-slate-200 tracking-wide mb-2">
            SCANNING FOR RESOURCES...
          </h3>
          <p className="font-mono text-sm text-slate-500 max-w-sm">
            Research units deployed. Awaiting intelligence reports.
          </p>
        </div>
      </div>
    );
  }

  if (variant === 'no-data') {
    return (
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
        {/* Header bar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-1">
            <div className="w-2 h-4 bg-slate-600" />
            <div className="w-2 h-4 bg-slate-700" />
            <div className="w-2 h-4 bg-slate-800" />
          </div>
          <span className="font-mono text-xs text-slate-500 tracking-widest uppercase">
            Research Division
          </span>
        </div>

        <div className="p-8">
          <div className="flex flex-col items-center justify-center text-center">
            {/* Offline radar */}
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full border border-slate-700 flex items-center justify-center bg-slate-900/50">
                  <Radar size={32} className="text-slate-600" />
                </div>
              </div>
              {/* Offline indicator */}
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-slate-500">
                OFFLINE
              </div>
            </div>

            <h3 className="font-mono text-lg font-bold text-slate-300 tracking-wide mb-2">
              NO ACTIVE INTELLIGENCE
            </h3>
            <p className="font-mono text-sm text-slate-500 max-w-md mb-8">
              Research division standing by. Deploy units to scan for learning resources matching your brainlift profile.
            </p>

            {/* Launch button */}
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className={`
                group relative px-8 py-4 font-mono text-sm font-bold tracking-widest uppercase
                border-2 rounded-lg transition-all duration-300
                ${isRefreshing
                  ? 'border-amber-600/50 bg-amber-950/30 text-amber-500/70 cursor-wait'
                  : 'border-amber-500 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                }
              `}
            >
              {/* Corner accents */}
              <span className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-amber-500" />
              <span className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-amber-500" />
              <span className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-amber-500" />
              <span className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-amber-500" />

              {isRefreshing ? (
                <span className="flex items-center gap-3">
                  <Loader2 size={18} className="animate-spin" />
                  INITIALIZING...
                </span>
              ) : (
                <span className="flex items-center gap-3">
                  <Radar size={18} />
                  LAUNCH RESEARCH MISSION
                </span>
              )}
            </button>

            {/* Hint text */}
            <p className="mt-4 font-mono text-[10px] text-slate-600 tracking-wide">
              20 RESEARCH UNITS AVAILABLE FOR DEPLOYMENT
            </p>
          </div>
        </div>
      </div>
    );
  }

  // all-processed variant
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-1">
          <div className="w-2 h-4 bg-emerald-600" />
          <div className="w-2 h-4 bg-emerald-700" />
          <div className="w-2 h-4 bg-emerald-800" />
        </div>
        <span className="font-mono text-xs text-slate-500 tracking-widest uppercase">
          Mission Complete
        </span>
      </div>

      <div className="p-8">
        <div className="flex flex-col items-center justify-center text-center">
          {/* Success indicator */}
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-full border-2 border-emerald-500/30 flex items-center justify-center bg-emerald-500/5">
              <CheckCircle size={40} className="text-emerald-500" />
            </div>
            {/* Glow effect */}
            <div className="absolute inset-0 rounded-full bg-emerald-500/10 blur-xl" />
          </div>

          <h3 className="font-mono text-lg font-bold text-slate-300 tracking-wide mb-2">
            ALL RESOURCES PROCESSED
          </h3>
          <p className="font-mono text-sm text-slate-500 max-w-md mb-8">
            Intelligence queue cleared. Deploy new units to continue research operations.
          </p>

          {/* New mission button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className={`
              group relative px-8 py-4 font-mono text-sm font-bold tracking-widest uppercase
              border-2 rounded-lg transition-all duration-300
              ${isRefreshing
                ? 'border-emerald-600/50 bg-emerald-950/30 text-emerald-500/70 cursor-wait'
                : 'border-emerald-500 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]'
              }
            `}
          >
            {/* Corner accents */}
            <span className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-emerald-500" />
            <span className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-emerald-500" />
            <span className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-emerald-500" />
            <span className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-emerald-500" />

            {isRefreshing ? (
              <span className="flex items-center gap-3">
                <Loader2 size={18} className="animate-spin" />
                DEPLOYING...
              </span>
            ) : (
              <span className="flex items-center gap-3">
                <Radar size={18} />
                NEW RESEARCH MISSION
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
