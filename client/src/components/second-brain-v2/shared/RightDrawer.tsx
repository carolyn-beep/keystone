import { ReactNode, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';

export interface RightDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Used for aria-label only. Defaults to 'Detail'. */
  ariaLabel?: string;
  /** Width in pixels at the lg+ breakpoint. Defaults to 480. */
  desktopWidth?: number;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Right-anchored slide-in panel. Built on `AnimatePresence` so children
 * unmount cleanly after the exit animation. Backdrop click or Escape
 * closes. On mobile (<768px) the drawer renders full-screen instead of
 * the fixed desktop width.
 *
 * Focus is captured on open and restored to the previously focused
 * element on close.
 */
export function RightDrawer({
  open,
  onClose,
  children,
  ariaLabel = 'Detail',
  desktopWidth = 480,
}: RightDrawerProps) {
  const isMobile = useIsMobile();
  const drawerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Capture trigger element + focus first focusable on open;
  // restore focus on close.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      focusable?.[0]?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      const target = previouslyFocused.current;
      if (target && typeof target.focus === 'function') {
        // Defer so React unmount finishes first.
        window.setTimeout(() => target.focus(), 0);
      }
    };
  }, [open]);

  // Escape to close (only when open).
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handleBackdropClick = useCallback(() => {
    onClose();
  }, [onClose]);

  const width = isMobile ? '100vw' : `${desktopWidth}px`;

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50" aria-hidden={false}>
          <motion.div
            className="absolute inset-0 bg-foreground/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={handleBackdropClick}
            data-testid="right-drawer-backdrop"
          />
          <motion.aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            className="absolute right-0 top-0 h-full overflow-y-auto bg-card shadow-card-hover"
            style={{ width }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 36 }}
          >
            {children}
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
