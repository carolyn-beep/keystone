interface SkillToggleProps {
  enabled: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: 'sm' | 'md';
}

/**
 * Neo-editorial toggle switch. Reads as a real switch (rounded track + thumb),
 * not as an action button. Earth-tone primary fill when enabled, muted track
 * when disabled.
 */
export function SkillToggle({
  enabled,
  onChange,
  disabled = false,
  label,
  size = 'md',
}: SkillToggleProps) {
  const dimensions = size === 'sm'
    ? { track: 'h-4 w-7', thumb: 'h-3 w-3', translate: 'translate-x-3' }
    : { track: 'h-5 w-9', thumb: 'h-4 w-4', translate: 'translate-x-4' };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 ${dimensions.track} ${
        enabled ? 'bg-primary/85' : 'bg-muted-foreground/25'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background`}
    >
      <span
        className={`inline-block transform rounded-full bg-card-elevated shadow-sm transition-transform duration-200 ${dimensions.thumb} ${
          enabled ? dimensions.translate : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
