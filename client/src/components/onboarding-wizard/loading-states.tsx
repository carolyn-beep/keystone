/**
 * Loading states for the onboarding wizard's AI-backed surfaces (suggestion
 * rails, expert discovery). Each skeleton matches the shape of the content it
 * stands in for, so the swap from loading to loaded doesn't reflow the rail.
 * Built from the app-wide primitives: `.skeleton-block` (shimmer) and
 * `.animate-bounce-dots` (sequenced ink dots).
 */

/** Italic serif status line with three sequenced ink dots. */
export function ThinkingLine({
  message,
  'data-testid': testId,
}: {
  message: string;
  'data-testid'?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5" data-testid={testId}>
      <span className="font-serif text-[14px] italic text-muted-light">{message}</span>
      <span className="flex gap-[3px] translate-y-[-1px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="animate-bounce-dots h-[3px] w-[3px] rounded-full bg-muted-foreground"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </span>
    </div>
  );
}

const CHIP_WIDTHS = [104, 138, 88, 122, 96];

/** Pill-shaped placeholders for the chip rail (scope and categories steps). */
export function ChipSkeletons({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-2.5" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="skeleton-block h-[34px] !rounded-full"
          style={{ width: CHIP_WIDTHS[i % CHIP_WIDTHS.length] }}
        />
      ))}
    </div>
  );
}

/** Three-line card placeholders matching the topic rail's suggestion cards. */
export function TopicCardSkeletons({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2.5" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="w-full rounded-lg bg-card px-4 py-3 shadow-card">
          <div className="skeleton-block h-[14px] w-2/5" />
          <div className="skeleton-block mt-2.5 h-[10px] w-4/5" />
          <div className="skeleton-block mt-1.5 h-[10px] w-3/5" />
        </div>
      ))}
    </div>
  );
}

/** Row placeholders matching the starter-pack items (icon tile + text + action). */
export function PackItemSkeletons({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl bg-card-elevated p-2.5 shadow-card"
        >
          <div className="skeleton-block h-10 w-10 shrink-0 !rounded-lg" />
          <div className="min-w-0 flex-1">
            <div className="skeleton-block h-[12px] w-4/5" />
            <div className="skeleton-block mt-1.5 h-[10px] w-1/2" />
          </div>
          <div className="skeleton-block h-[26px] w-[52px] shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Portrait-card placeholders matching the expert candidate cards. */
export function ExpertCardSkeletons({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-3" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="flex w-[164px] flex-col items-center rounded-xl bg-card-elevated p-3 shadow-card"
        >
          <div className="skeleton-block h-[72px] w-[72px] !rounded-full" />
          <div className="skeleton-block mt-3 h-[12px] w-4/5" />
          <div className="skeleton-block mt-2 h-[10px] w-3/5" />
          <div className="skeleton-block mt-4 h-[28px] w-full" />
        </div>
      ))}
    </div>
  );
}
