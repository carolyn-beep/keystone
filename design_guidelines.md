# DOK1 Grader V3 — Design Guidelines

## Design Approach

**System**: Fluent Design + Linear-inspired aesthetics for professional data tools
**Themes**: Warm Parchment (light) / Midnight Indigo (dark)
**Rationale**: Information-dense productivity interface requiring clarity, scannable hierarchy, and efficient data presentation. No hero images — all visual hierarchy comes from typography, spacing, and component structure.

---

## Typography

**Font Stack** (loaded via Google Fonts CDN):
- **Sans**: `Inter` (weights 400, 500, 600) — body text, UI elements
- **Serif**: `Libre Baskerville` — headings (h1–h6)
- **Mono**: `Menlo, monospace` — code blocks, data display

CSS variables:
```css
--font-sans: 'Inter', 'Helvetica Neue', Arial, sans-serif;
--font-serif: 'Libre Baskerville', Baskerville, Georgia, serif;
--font-mono: Menlo, monospace;
```

**Hierarchy**:
| Role | Classes |
|------|---------|
| Page title | `text-2xl font-semibold font-serif` |
| Section header | `text-lg font-medium font-serif` |
| Nav labels | `text-xs font-medium uppercase tracking-wide` |
| Body content | `text-sm font-normal` |
| Metadata / timestamps | `text-xs text-muted-foreground` |
| Code / data | `text-xs font-mono` |

---

## Color System

Colors are defined as CSS variables in `client/src/index.css` (both `:root` and `.dark`), then referenced in `tailwind.config.ts` via `var()`. Two parallel token sets exist:

- **HSL tokens** → used by Tailwind classes (`bg-primary`, `text-foreground`, etc.)
- **HEX tokens** → used by the `tokens` object in `client/src/lib/colors.ts` for inline styles

### Core Palette

| Token | Light (Warm Parchment) | Dark (Midnight Indigo) |
|-------|----------------------|----------------------|
| Background | `#FBF7F0` warm cream | `#0F172A` midnight navy |
| Surface (card) | `#F9F5ED` | `#1E293B` dark slate |
| Surface alt (sidebar) | `#F5F1E9` | `#334155` slate |
| Border | `#E5E1D6` warm gray | `#334155` |
| Text primary | `#2D2D2D` soft black | `#F8FAFC` near white |
| Text secondary | `#5A5A5A` | `#CBD5E1` light gray |
| Text muted | `#8A867B` | `#64748B` |
| Primary | `#22150D` dark brown | `#3B82F6` bright blue |
| Secondary | `#0F766E` teal | `#14B8A6` turquoise |
| Success | `#56643F` olive green | `#56643F` |
| Warning | `#D97706` amber | `#9D691D` warm tan |
| Danger | `#953A34` burnt red | `#EF4444` bright red |
| Info | `#3B6E8F` slate blue | `#38BDF8` cyan |

### Tailwind Class ↔ Token Mapping

| Tailwind Class | CSS Variable | `tokens` Object |
|----------------|-------------|-----------------|
| `bg-background` | `--background` | `tokens.bg` |
| `bg-card` | `--card` | `tokens.surface` |
| `bg-sidebar` | `--sidebar` | `tokens.surfaceAlt` |
| `text-foreground` | `--foreground` | `tokens.textPrimary` |
| `text-muted-foreground` | `--muted-foreground` | `tokens.textSecondary` |
| `bg-primary` / `text-primary` | `--primary` | `tokens.primary` |
| `bg-secondary` | `--secondary` | `tokens.secondary` |
| `bg-success` | `--success` | `tokens.success` |
| `bg-warning` | `--warning` | `tokens.warning` |
| `bg-destructive` | `--destructive` | `tokens.danger` |
| `bg-info` | `--info` | `tokens.info` |
| `bg-success-soft` | `--success-soft` | `tokens.successSoft` |
| `bg-warning-soft` | `--warning-soft` | `tokens.warningSoft` |

### Rule

**Always define values in CSS first, then reference in Tailwind** — don't hardcode values directly in `tailwind.config.ts`. Direct values can fail to apply reliably; CSS variables work consistently.

```css
/* index.css */
:root { --shadow-card: 0 2px 6px rgba(0,0,0,0.06); }
.dark { --shadow-card: 0 2px 6px rgba(0,0,0,0.25); }
```
```typescript
/* tailwind.config.ts */
boxShadow: { card: "var(--shadow-card)" }
```

---

## Layout

**Structure**: Sidebar + main content (defined in `SidebarLayout.tsx`)

```
┌─────────────────────────────────────────┐
│  Header (bg-card, border-b)             │
├──────────┬──────────────────────────────┤
│ Sidebar  │  Main Content               │
│ w-52     │  flex-1                      │
│ (208px)  │  px-4 sm:px-6 md:px-8 py-4  │
│ bg-sidebar│                             │
│ border-r │  max-w-[1200px] for content  │
│          │                              │
│ Nav items│                              │
│ Avatar   │                              │
└──────────┴──────────────────────────────┘
```

**Spacing Primitives**: Tailwind units of 2, 4, 6, 8
- Component padding: `p-4` to `p-6`
- Section gaps: `gap-4` to `gap-6`
- Icon-text spacing: `gap-2` or `gap-3`
- Content max-width: `max-w-[1200px]`

**Sidebar Navigation** (`AppSidebar.tsx`):
- Nav items: `text-xs font-medium uppercase tracking-wide`
- Active: `bg-sidebar-primary/15 text-sidebar-accent-foreground`
- Inactive: `text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50`
- Icons: 18px, with `drop-shadow` on hover
- Transition: 500ms ease-out color changes
- Child items: Grid expand animation (250ms), staggered opacity (60ms intervals), L-shaped connector lines

---

## Shadow System

Eight-level shadow scale defined as CSS variables, with separate light/dark values:

| Level | Usage |
|-------|-------|
| `shadow-2xs` | Subtle depth for small elements |
| `shadow-xs` | Buttons (outline/badge) |
| `shadow-sm` | Light cards |
| `shadow` | Default elevation |
| `shadow-md` | Elevated cards |
| `shadow-lg` | Dropdowns, popovers |
| `shadow-xl` | Modals |
| `shadow-2xl` | Heavy overlays |

**Card shadows** (special):
- `shadow-card` — default card resting state
- `shadow-card-hover` — card hover state

Light mode uses warm brown-tinted shadows (`hsl(40 20% 30%)`). Dark mode uses deep navy shadows (`hsl(222 47% 5%)`).

---

## Elevation System

Custom utility classes provide automatic contrast overlays on interaction. Defined in `index.css`.

| Class | Behavior |
|-------|----------|
| `hover-elevate` | Applies `--elevate-1` overlay on hover |
| `active-elevate` | Applies `--elevate-1` overlay on active/press |
| `hover-elevate-2` | Applies stronger `--elevate-2` on hover |
| `active-elevate-2` | Applies stronger `--elevate-2` on active/press |
| `toggle-elevate` | Applies `--elevate-2` when `.toggle-elevated` is present |
| `no-default-hover-elevate` | Escape hatch to disable hover elevation |
| `no-default-active-elevate` | Escape hatch to disable active elevation |

Light mode overlays are dark (`rgba(0,0,0, .025/.06)`). Dark mode overlays are light (`rgba(255,255,255, .04/.09)`).

**Usage**: Buttons and badges include `hover-elevate active-elevate-2` by default.

---

## Components

### Button (`client/src/components/ui/button.tsx`)

**Base**: `inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium hover-elevate active-elevate-2`

**Variants**:
| Variant | Style |
|---------|-------|
| `default` | `bg-primary text-primary-foreground border border-primary-border` |
| `secondary` | `bg-secondary text-secondary-foreground border border-secondary-border` |
| `outline` | `border [border-color:var(--button-outline)] shadow-xs` |
| `ghost` | `border border-transparent` |
| `destructive` | `bg-destructive text-destructive-foreground border border-destructive-border` |

**Sizes**:
| Size | Classes |
|------|---------|
| `default` | `min-h-9 px-4 py-2` |
| `sm` | `min-h-8 px-3 text-xs` |
| `lg` | `min-h-10 px-8` |
| `icon` | `h-9 w-9` (square) |

### Tactile Button (`client/src/components/ui/tactile-button.tsx`)

Material Design-inspired button with physical depth. Two variants:

- **Raised** (default): Gradient background (`#E8D9C8` → `#D4C4AD`), multi-layer shadow, `translateY(-1px)` on hover, depresses on click. 150ms transitions.
- **Inset**: Recessed appearance with `inset` shadows, pops out on hover. 300ms transitions.

Base: `px-5 py-2.5 rounded-lg border-none text-sm font-medium`

### Badge (`client/src/components/ui/badge.tsx`)

**Base**: `inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold hover-elevate`

**Variants**:
| Variant | Style |
|---------|-------|
| `default` | `bg-primary text-primary-foreground shadow-xs` |
| `secondary` | `bg-secondary text-secondary-foreground` |
| `destructive` | `bg-destructive text-destructive-foreground shadow-xs` |
| `outline` | `border [border-color:var(--badge-outline)] shadow-xs` |

For pill-shaped status indicators, use `rounded-full px-3 py-1 text-xs` directly (not the Badge component).

### Data Display Cards

- Bordered containers: `bg-card border border-card-border rounded-lg shadow-card`
- Internal spacing: `p-6`
- Metadata row: `flex justify-between items-center text-xs text-muted-foreground`
- Hover state: `shadow-card-hover` transition

### Collapsible Sections

- Full-width click target header with chevron rotation
- Grid-based expand: `grid-template-rows: 0fr → 1fr` (250ms ease-out)
- Child items: opacity + translateX animation (200ms ease-out, staggered 60ms)
- Nested indent: `pl-[42px]` for sidebar children, `pl-6` for content hierarchy

---

## Icons

**Primary**: `lucide-react` (v0.453.0) — used across 38+ component files
```tsx
import { ChevronDown, FileText, Loader2, AlertTriangle } from 'lucide-react';
```

**Specialized**: `react-icons` (v5.4.0) — for domain-specific icons not available in Lucide
```tsx
import { PiCompassToolFill } from 'react-icons/pi';     // DOK1 grading
import { RiQuillPenAiFill } from 'react-icons/ri';       // DOK2 summaries
import { FaBalanceScale } from 'react-icons/fa';          // Contradictions
import { MdDynamicFeed } from 'react-icons/md';           // Learning stream
```

**Custom SVGs**: `client/src/assets/icons/`
- `DeskLampIcon` — DOK3 Insights tab
- `ScratchpadIcon` — Scratchpad tab

**Sizing**: Default icon size in nav is 18px. Inline icons typically use Lucide defaults or `size={16}`.

---

## Score & Status Colors

Score chips use the `getScoreChipColors()` function from `client/src/lib/colors.ts`:

| Score | Background | Text | Meaning |
|-------|-----------|------|---------|
| 5 | `successSoft` | `success` | Verified |
| 4 | `infoSoft` | `info` | Structured |
| 3–2 | `warningSoft` | `warning` | Tension |
| 1 | `dangerSoft` | `danger` | Invalid |

Classification badges:
| Classification | Background | Text |
|---------------|-----------|------|
| `brainlift` | `successSoft` | `success` |
| `partial` | `warningSoft` | `warning` |
| `not_brainlift` | `warningSoft` | `warning` |

---

## Animations

**Principle**: Minimal, purposeful motion. Most transitions are 200–350ms.

### Sidebar
- Children expand: `grid-template-rows 0fr → 1fr` (250ms ease-out)
- Child item reveal: opacity + translateX (200ms ease-out, staggered 60ms)

### Content
- Accordion open/close: 200ms ease-out (Radix)
- Fade-slide-in: 300ms ease-out (import progress)
- Shimmer loading: 2s linear infinite (learning stream skeleton)
- Bounce dots: 1.2s ease-in-out infinite (typing indicator)

### Exit Animations (Learning Stream)
- Bookmark: slide right + slight scale (350ms)
- Grade: scale down to 0.9 (300ms)
- Discard: slide left + slight rotation (350ms)

### Hover States
- Color transitions: `transition-colors` (fast, ~150ms)
- Elevation overlays: instant (no transition on the overlay itself)
- Tactile button: `translateY(-1px)` lift on hover

---

## Styling Rules

1. **Tailwind classes for all static styles** — no inline `style={}` for colors, spacing, or layout
2. **Inline styles only for dynamic runtime values**:
   ```tsx
   // Dynamic — must be inline
   <div style={{ width: `${percentage}%` }}>
   <span style={{ ...getScoreChipColors(score) }}>

   // Static — use Tailwind
   <div className="bg-card p-4 rounded-lg">
   ```
3. **CSS variables defined in `index.css` first**, then referenced in `tailwind.config.ts`
4. **Use `tokens` object** from `lib/colors.ts` when inline styles need color values — never hardcode hex values
5. **Use the `styler` sub-agent** (`.claude/agents/styler.md`) for batch conversion of inline styles to Tailwind

### Border Radius

Custom values in `tailwind.config.ts`:
| Token | Value |
|-------|-------|
| `rounded-lg` | 9px (`.5625rem`) |
| `rounded-md` | 6px (`.375rem`) |
| `rounded-sm` | 3px (`.1875rem`) |

---

## Discussion Panel (Assistant-UI Overrides)

The discussion feature uses `@assistant-ui/react` with custom theme overrides in `index.css`:

- **User messages**: `bg-sidebar`, `rounded-[0.75rem]`
- **Assistant messages**: 14px font, 1.7 line-height, no max-width
- **Composer**: `bg-card`, `border border-border`, `shadow-card`
- **Welcome text**: serif font, italic, muted foreground
- **Suggestion chips**: pill-shaped (`rounded-full`), `bg-card`, hover → `bg-sidebar`
