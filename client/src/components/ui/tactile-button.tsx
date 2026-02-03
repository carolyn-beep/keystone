import * as React from 'react';
import { tokens } from '@/lib/colors';
import { cn } from '@/lib/utils';

type TactileVariant = 'raised' | 'inset';

interface TactileButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: TactileVariant;
  children: React.ReactNode;
}

const shadows = {
  raised: {
    default: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 12px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.15)',
    hover: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 6px 16px rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.15)',
    active: 'inset 0 1px 2px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.15)',
  },
  inset: {
    default: 'inset 0 2px 4px rgba(0,0,0,0.06), inset 0 1px 2px rgba(0,0,0,0.08)',
    hover: '0 4px 12px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.08)',
    active: 'inset 0 2px 4px rgba(0,0,0,0.08), inset 0 1px 2px rgba(0,0,0,0.1)',
  },
};

export const TactileButton = React.forwardRef<HTMLButtonElement, TactileButtonProps>(
  ({ variant = 'raised', className, style, children, disabled, ...props }, ref) => {
    const [isHovered, setIsHovered] = React.useState(false);
    const [isPressed, setIsPressed] = React.useState(false);

    const isRaised = variant === 'raised';
    const shadowSet = shadows[variant];

    const getCurrentShadow = () => {
      if (disabled) return 'none';
      if (isPressed) return shadowSet.active;
      if (isHovered) return shadowSet.hover;
      return shadowSet.default;
    };

    const getTransform = () => {
      if (disabled) return '';
      if (isRaised) {
        if (isPressed) return 'translateY(0)';
        if (isHovered) return 'translateY(-1px)';
        return '';
      } else {
        if (isPressed) return '';
        if (isHovered) return 'translateY(-1px)';
        return '';
      }
    };

    // Warm cream/tan gradient for raised buttons - fits parchment theme
    const raisedGradient = {
      top: '#E8D9C8',      // Soft creamy pastel
      bottom: '#D4C4AD',   // Warm pastel tan
      text: '#3D2A1A',     // Dark brown text for contrast
      disabledBg: '#C4C4C4',
    };

    const baseStyles: React.CSSProperties = isRaised
      ? {
          background: disabled
            ? raisedGradient.disabledBg
            : `linear-gradient(to bottom, ${raisedGradient.top}, ${raisedGradient.bottom})`,
          color: raisedGradient.text,
        }
      : {
          backgroundColor: tokens.surfaceAlt,
          color: tokens.textSecondary,
        };

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'px-5 py-2.5 rounded-lg border-none text-sm font-medium',
          isRaised ? 'transition-all duration-150' : 'transition-all duration-300 ease-out',
          disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
          className
        )}
        style={{
          ...baseStyles,
          boxShadow: getCurrentShadow(),
          transform: getTransform(),
          ...style,
        }}
        onMouseEnter={(e) => {
          if (!disabled) setIsHovered(true);
          props.onMouseEnter?.(e);
        }}
        onMouseLeave={(e) => {
          setIsHovered(false);
          setIsPressed(false);
          props.onMouseLeave?.(e);
        }}
        onMouseDown={(e) => {
          if (!disabled) setIsPressed(true);
          props.onMouseDown?.(e);
        }}
        onMouseUp={(e) => {
          setIsPressed(false);
          props.onMouseUp?.(e);
        }}
        {...props}
      >
        {children}
      </button>
    );
  }
);

TactileButton.displayName = 'TactileButton';
