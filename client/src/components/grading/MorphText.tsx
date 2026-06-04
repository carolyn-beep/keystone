import { AnimatePresence, motion } from 'framer-motion';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface MorphTextProps {
  /**
   * Changing this value triggers the transition. Pass the active view
   * (`'simplified'` / `'raw'`) so the Brief/Deep swap animates.
   */
  morphKey: string;
  children: ReactNode;
  className?: string;
}

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Wraps swappable text (the Brief/Deep rationale) so that changing `morphKey`
 * crossfades the outgoing and incoming text with a soft blur "morph" and a
 * one-shot shimmer sweep, instead of an instant flash.
 *
 * The two text layers are stacked in one grid cell so they overlap during the
 * crossfade. The container's real height is animated between the outgoing and
 * incoming text heights (measured from the live incoming layer) so the
 * surrounding card eases smoothly in both directions instead of popping. Height
 * is interpolated as a CSS value, not a transform, so the text never
 * scales/distorts.
 *
 * The height is kept as a fixed number at rest (not `auto`): on a toggle the
 * container therefore starts pinned at the outgoing height and animates to the
 * incoming one. Releasing to `auto` would let an incoming taller text expand
 * the box instantly (a pop) before the animation could run. A ResizeObserver
 * keeps the pinned height correct when the text reflows (e.g. window resize).
 */
export function MorphText({ morphKey, children, className }: MorphTextProps) {
  const layerRef = useRef<HTMLSpanElement>(null);
  const [height, setHeight] = useState<number | 'auto'>('auto');

  // Pin the container to the incoming layer's height (and keep it in sync on
  // reflow). `items-start` keeps the layer at its natural height regardless of
  // the container's animated height, so this only fires on real content/size
  // changes, never during the height animation itself.
  useLayoutEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [morphKey]);

  return (
    <motion.span
      className={`relative grid items-start overflow-hidden ${className ?? ''}`}
      animate={{ height }}
      transition={{ height: { duration: 0.34, ease: EASE } }}
    >
      {/* Blur + crossfade morph between the two texts */}
      <AnimatePresence initial={false}>
        <motion.span
          key={morphKey}
          ref={layerRef}
          className="[grid-area:1/1] [white-space:inherit]"
          initial={{ opacity: 0, filter: 'blur(7px)', y: 5 }}
          animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
          exit={{ opacity: 0, filter: 'blur(7px)', y: -5 }}
          transition={{ duration: 0.32, ease: EASE }}
        >
          {children}
        </motion.span>
      </AnimatePresence>

      {/* One-shot shimmer sweep, fired on each change */}
      <AnimatePresence initial={false}>
        <motion.span
          key={`sheen-${morphKey}`}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background:
              'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.3) 50%, transparent 65%)',
          }}
          initial={{ x: '-130%' }}
          animate={{ x: '130%' }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: 'easeInOut' }}
        />
      </AnimatePresence>
    </motion.span>
  );
}
