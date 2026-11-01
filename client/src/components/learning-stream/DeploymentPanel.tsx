import { memo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { DashboardState } from './MissionDashboard';

// Import apparatus images
import apparatusIdleImg from '@/assets/textures/research_apparatus.webp';
import apparatusActiveImg from '@/assets/textures/research_apparatus_active.webp';

interface DeploymentPanelProps {
  phase: DashboardState['phase'];
  agentCount: number;
  completedCount: number;
  totalCount: number;
  startTime?: number;
  totalSearches: number;
  resourcesFound: number;
}

/**
 * Deployment panel content for the Research Observatory.
 * Shows vintage scientific apparatus illustration and mission stats.
 */
export const DeploymentPanel = memo(function DeploymentPanel({
  phase,
  agentCount,
  completedCount,
  totalCount,
  startTime,
  totalSearches,
  resourcesFound,
}: DeploymentPanelProps) {
  const isActive = phase === 'active' || phase === 'deploying' || phase === 'launching' || phase === 'waiting';
  const isComplete = phase === 'complete';

  // Live elapsed time - updates every second when active
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isActive || !startTime) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isActive, startTime]);

  const elapsed = startTime ? Math.floor((now - startTime) / 1000) : 0;
  const formatElapsed = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  // Select apparatus image based on state
  const apparatusImg = isActive ? apparatusActiveImg : apparatusIdleImg;

  return (
    <div>
      {/* Apparatus Illustration Card */}
      <div className="bg-card p-6 border border-border shadow-sm relative overflow-hidden group">
        <div className="flex flex-col items-center justify-center py-8">
          <motion.div
            className="relative w-48 h-48"
            animate={{
              filter: isActive ? 'grayscale(0%) brightness(1.05)' : isComplete ? 'grayscale(0%)' : 'grayscale(100%) sepia(30%)',
            }}
            transition={{ type: 'spring', duration: 0.6, bounce: 0.15 }}
          >
            <img
              src={apparatusImg}
              alt="Research apparatus"
              className="w-full h-full object-contain opacity-90 transition-transform duration-700 group-hover:scale-105"
              style={{ mixBlendMode: 'multiply' }}
            />

            {/* Active glow effect */}
            {isActive && (
              <motion.div
                className="absolute inset-0 rounded-full bg-warning/10"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.3, 0.1, 0.3],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            )}

            {/* Complete checkmark overlay */}
            {isComplete && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>

        {/* Stats */}
        <div className="mt-6 space-y-3 pt-6 border-t border-border">
          <StatRow
            label="Agents"
            value={totalCount > 0 ? `${completedCount} / ${totalCount}` : `${agentCount}`}
            description="Completed / total deployed"
          />
          <StatRow
            label="Web Searches"
            value={String(totalSearches)}
            description="Queries sent across all agents"
          />
          <StatRow
            label="Resources Found"
            value={String(resourcesFound)}
            description="New learning resources discovered"
            highlight={resourcesFound > 0}
          />
          <StatRow
            label="Elapsed"
            value={formatElapsed(elapsed)}
            description="Time since swarm launch"
          />
        </div>
      </div>
    </div>
  );
});

interface StatRowProps {
  label: string;
  value: string;
  description: string;
  highlight?: boolean;
}

function StatRow({ label, value, description, highlight }: StatRowProps) {
  return (
    <div className="group/stat relative flex justify-between items-center text-xs py-1">
      <span className="text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className={`font-semibold ${highlight ? 'text-success' : 'text-foreground'}`}>
        {value}
      </span>

      {/* Tooltip on hover */}
      <div className="absolute bottom-full left-0 right-0 mb-1 opacity-0 group-hover/stat:opacity-100 transition-opacity pointer-events-none z-10">
        <div className="bg-foreground text-background text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap w-fit">
          {description}
        </div>
      </div>
    </div>
  );
}
