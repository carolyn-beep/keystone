import { tokens } from '@/lib/colors';

interface FilterTabsProps {
  activeFilter: 'all' | 'owned' | 'shared';
  onFilterChange: (filter: 'all' | 'owned' | 'shared') => void;
}

export function FilterTabs({ activeFilter, onFilterChange }: FilterTabsProps) {
  const tabs = [
    { key: 'all' as const, label: 'All' },
    { key: 'owned' as const, label: 'Owned by Me' },
    { key: 'shared' as const, label: 'Shared with Me' },
  ];

  return (
    <div className="flex gap-1 border-b border-border mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onFilterChange(tab.key)}
          className="px-5 py-3 bg-transparent border-none cursor-pointer text-sm font-medium transition-colors duration-150 -mb-px"
          style={{
            borderBottom: activeFilter === tab.key ? `2px solid ${tokens.primary}` : '2px solid transparent',
            color: activeFilter === tab.key ? tokens.primary : tokens.textSecondary,
          }}
          onMouseEnter={(e) => {
            if (activeFilter !== tab.key) {
              e.currentTarget.style.color = tokens.primary;
            }
          }}
          onMouseLeave={(e) => {
            if (activeFilter !== tab.key) {
              e.currentTarget.style.color = tokens.textSecondary;
            }
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
