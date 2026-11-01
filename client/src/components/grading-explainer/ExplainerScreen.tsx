/**
 * ExplainerScreen — per-screen CONTENT (not the frame).
 *
 * Owns only what differs between screens: the title, optional subtitle,
 * optional hero block, and the body. It does NOT render the modal frame,
 * footer, or close button — those are persistent and owned by the shell, so
 * that only this content cross-fades while the frame stays put and resizes.
 *
 * Each screen still declares its own panel width / max-height via
 * `panelClassName`; the screen registers that with the shell (which applies it
 * to the persistent frame) instead of rendering its own panel. Screen 2's wide
 * rubric layout passes 'max-w-5xl max-h-[92vh]', for example, without any
 * screen owning a frame.
 *
 * Renders:
 *   1. Title as Dialog.Title (serif h2 — neo-editorial typography), centered
 *   2. Optional subtitle (Dialog.Description), centered
 *   3. Optional hero block (alignment owned by screen content)
 *   4. children (the actual screen content), scrollable when constrained
 *
 * Step-position chrome lives in the shell footer ("Step N of total" + dots).
 *
 * Spec: features/pedagogy/dok1-rubric-explainer/specs/01-foundation/spec.md
 */

import { useLayoutEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useExplainerShell } from './ExplainerShell';
import type { ExplainerScreenProps } from './types';

export function ExplainerScreen({
  title,
  subtitle,
  hero,
  panelClassName,
  children,
}: ExplainerScreenProps): JSX.Element {
  // Hand the persistent frame this screen's sizing. Registering it (rather than
  // rendering our own panel) is what lets the frame animate its size as screens
  // of different width / density swap in. useLayoutEffect keeps it in sync
  // before paint so the frame never flashes the wrong width.
  const { registerPanelClassName } = useExplainerShell();
  useLayoutEffect(() => {
    registerPanelClassName(panelClassName);
  }, [panelClassName, registerPanelClassName]);

  return (
    <article className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
      <header className="flex flex-col items-center gap-2 text-center">
        <DialogPrimitive.Title asChild>
          <h2 className="font-serif text-2xl leading-tight text-foreground m-0">
            {title}
          </h2>
        </DialogPrimitive.Title>
        {subtitle ? (
          <DialogPrimitive.Description asChild>
            <p className="font-serif text-sm italic text-muted-foreground leading-relaxed m-0">
              {subtitle}
            </p>
          </DialogPrimitive.Description>
        ) : (
          // Radix Dialog warns when Description is omitted. Provide a hidden
          // fallback so a11y consumers still get a description.
          <DialogPrimitive.Description className="sr-only">
            {title}
          </DialogPrimitive.Description>
        )}
      </header>

      {hero ? <div data-slot="hero">{hero}</div> : null}

      <div data-slot="body" className="flex flex-col gap-4 text-sm text-foreground">
        {children}
      </div>
    </article>
  );
}
