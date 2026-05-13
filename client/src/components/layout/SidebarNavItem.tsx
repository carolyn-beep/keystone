import { ComponentType, MouseEvent } from 'react';
import { Lock } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface SidebarNavItemProps {
  icon?: ComponentType<{ size?: number; className?: string }>;
  label: string;
  isActive: boolean;
  onClick: () => void;
  collapsed?: boolean;
  /**
   * When true, the item renders greyed out with a lock affordance and
   * clicks are swallowed. Hover/focus shows `lockReason` as a tooltip so
   * the user understands why the destination isn't reachable yet.
   */
  locked?: boolean;
  lockReason?: string;
}

export function SidebarNavItem({
  icon: Icon,
  label,
  isActive,
  onClick,
  collapsed = false,
  locked = false,
  lockReason,
}: SidebarNavItemProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (locked) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onClick();
  }

  const button = (
    <button
      onClick={handleClick}
      title={collapsed && !locked ? label : undefined}
      aria-disabled={locked || undefined}
      data-locked={locked || undefined}
      className={cn(
        'group relative w-full flex items-center py-2 rounded-md text-xs font-medium tracking-wide transition-colors duration-500 ease-out',
        collapsed ? 'justify-center px-2' : 'px-3',
        locked
          ? 'cursor-not-allowed text-muted-light/80 hover:bg-sidebar-accent/30 hover:text-muted-foreground'
          : isActive
            ? 'bg-sidebar-primary/15 text-sidebar-accent-foreground'
            : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
      )}
    >
      {Icon ? (
        <Icon
          size={18}
          className={cn(
            'shrink-0 transition-[filter] duration-300 ease-out',
            locked ? 'opacity-50' : 'group-hover:drop-shadow-[0_0_3px_rgba(0,0,0,0.2)]',
          )}
        />
      ) : null}
      <span
        className={cn(
          'overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-300 ease-in-out',
          collapsed ? 'max-w-0 opacity-0 ml-0' : 'max-w-[160px] opacity-100 ml-3',
          locked && 'italic',
        )}
      >
        {label}
      </span>
      {locked && !collapsed ? (
        <Lock
          size={11}
          className="ml-auto shrink-0 text-muted-light"
          aria-hidden
        />
      ) : null}
    </button>
  );

  if (!locked || !lockReason) {
    return button;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent
          side="right"
          align="center"
          sideOffset={8}
          className="max-w-[260px] font-serif text-[12px] italic leading-snug"
        >
          {lockReason}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
