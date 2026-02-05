import { ComponentType } from 'react';

interface SidebarNavItemProps {
  icon?: ComponentType<{ size?: number; className?: string }>;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

export function SidebarNavItem({ icon: Icon, label, isActive, onClick }: SidebarNavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`group w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium tracking-wide transition-colors duration-500 ease-out ${
        isActive
          ? 'bg-sidebar-primary/15 text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
      }`}
    >
      {Icon && <Icon size={18} className="shrink-0 transition-[filter] duration-300 ease-out group-hover:drop-shadow-[0_0_3px_rgba(0,0,0,0.2)]" />}
      <span>{label}</span>
    </button>
  );
}
