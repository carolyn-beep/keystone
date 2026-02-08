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
  startTime?: number;
}

/**
 * Deployment panel content for the Research Observatory.
 * Shows vintage scientific apparatus illustration and mission stats.
 */
export const DeploymentPanel = memo(function DeploymentPanel({
  phase,
  agentCount,
  completedCount,
  startTime,
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

  // Calculate depth level based on completed agents
  const depthLevel = completedCount >= 8 ? 'Level 4' : completedCount >= 5 ? 'Level 3' : completedCount >= 2 ? 'Level 2' : 'Level 1';

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

          <p className="mt-6 font-serif italic text-lg text-muted-foreground text-center">
            Fig 1.1: Active Neural Apparatus
          </p>
        </div>

        {/* Stats */}
        <div className="mt-6 space-y-3 pt-6 border-t border-border">
          <StatRow label="Latency" value="12ms" />
          <StatRow label="Depth" value={depthLevel} />
          <StatRow label="Elapsed" value={formatElapsed(elapsed)} />
        </div>
      </div>

      {/* Mission Brief */}
      <div className="mt-6 text-xs text-muted-foreground leading-relaxed pl-3 border-l border-border">
        <span className="font-bold text-foreground">Mission Brief:</span> Execute comprehensive analysis with emphasis on scope definition and quality criteria validation.
      </div>
    </div>
  );
});

interface StatRowProps {
  label: string;
  value: string;
}

function StatRow({ label, value }: StatRowProps) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}
