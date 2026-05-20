import type { CSSProperties, ReactNode } from 'react';

interface SkeletonBlockProps {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /** Convenience: render as a circle (overrides border-radius). */
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

const ROUNDED_CLASS: Record<NonNullable<SkeletonBlockProps['rounded']>, string> = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  full: 'rounded-full',
};

/**
 * Shimmering block used to compose page-shaped loading skeletons. Size it
 * with width/height utility classes; the shimmer animation comes from
 * `.skeleton-block` (defined in `client/src/index.css`).
 */
export function SkeletonBlock({ className = '', style, children, rounded }: SkeletonBlockProps) {
  const radius = rounded ? ROUNDED_CLASS[rounded] : '';
  return (
    <div
      aria-hidden="true"
      className={`skeleton-block ${radius} ${className}`.trim()}
      style={style}
    >
      {children}
    </div>
  );
}
