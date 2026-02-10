import type { IconType } from 'react-icons';
import { BsSubstack } from 'react-icons/bs';
import { FaGraduationCap, FaYoutube } from 'react-icons/fa';
import { FaPodcast, FaNewspaper } from 'react-icons/fa6';
import { VscTwitter } from 'react-icons/vsc';
import { tokens } from '@/lib/colors';
import { cn } from '@/lib/utils';

const RESOURCE_TYPE_CONFIG: Record<string, { bg: string; text: string; icon: IconType }> = {
  Substack: { bg: tokens.warningSoft, text: tokens.warning, icon: BsSubstack },
  'Academic Paper': { bg: tokens.successSoft, text: tokens.success, icon: FaGraduationCap },
  Twitter: { bg: tokens.infoSoft, text: tokens.info, icon: VscTwitter },
  Video: { bg: tokens.dangerSoft, text: tokens.danger, icon: FaYoutube },
  Podcast: { bg: tokens.secondarySoft, text: tokens.secondary, icon: FaPodcast },
  News: { bg: tokens.primarySoft, text: tokens.primary, icon: FaNewspaper },
  Newsletter: { bg: tokens.warningSoft, text: tokens.warning, icon: BsSubstack },
};

interface ResourceTypeBadgeProps {
  type: string;
  size?: 'default' | 'compact';
  className?: string;
}

export function ResourceTypeBadge({ type, size = 'default', className }: ResourceTypeBadgeProps) {
  const config = RESOURCE_TYPE_CONFIG[type] || { bg: tokens.surfaceAlt, text: tokens.textSecondary, icon: null };
  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded text-[10px] font-semibold uppercase tracking-wider',
        size === 'compact' ? 'px-2 py-0.5' : 'px-2.5 py-1',
        className,
      )}
      style={{ backgroundColor: config.bg, color: config.text }}
    >
      {Icon && <Icon size={size === 'compact' ? 10 : 12} />}
      {type}
    </span>
  );
}
