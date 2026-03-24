import { ComponentType } from 'react';

interface SidebarNavItemProps {
  icon?: ComponentType<{ size?: number; className?: string }>;
  label: string;
  isActive: boolean;
  onClick: () => void;
  collapsed?: boolean;
}

export function SidebarNavItem({ icon: Icon, label, isActive, onClick, collapsed = false }: SidebarNavItemProps) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`group w-full flex items-center ${collapsed ? 'justify-center px-2' : 'px-3'} py-2 rounded-md text-xs font-medium tracking-wide transition-colors duration-500 ease-out ${
        isActive
          ? 'bg-sidebar-primary/15 text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
      }`}
    >
      {Icon && <Icon size={18} className="shrink-0 transition-[filter] duration-300 ease-out group-hover:drop-shadow-[0_0_3px_rgba(0,0,0,0.2)]" />}
      <span
        className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-300 ease-in-out ${
          collapsed
            ? 'max-w-0 opacity-0 ml-0'
            : 'max-w-[160px] opacity-100 ml-3'
        }`}
      >
        {label}
      </span>
    </button>
  );
}
