# Research & Fact-Checking Dashboard Design Guidelines

## Design Approach

**System Selected**: Fluent Design + Linear-inspired aesthetics for professional data tools
**Rationale**: Information-dense productivity interface requiring clarity, scannable hierarchy, and efficient data presentation

## Typography System

**Font Stack**: 
- Primary: Inter (via Google Fonts CDN) - weights 400, 500, 600
- Monospace: JetBrains Mono for code/data blocks - weights 400, 500

**Hierarchy**:
- Dashboard title: text-2xl font-semibold
- Section headers: text-lg font-medium
- Tab labels: text-sm font-medium uppercase tracking-wide
- Body content: text-sm font-normal
- Data/debug content: text-xs font-mono
- Metadata/timestamps: text-xs

## Layout System

**Spacing Primitives**: Use Tailwind units of 2, 4, 6, and 8 consistently
- Component padding: p-4 to p-6
- Section gaps: gap-4 to gap-6
- Container margins: m-4 to m-8
- Icon-text spacing: gap-2

**Grid Structure**:
- Main container: max-w-7xl mx-auto px-6 py-8
- Two-column split for main content: 70/30 or full-width with sidebar toggle
- Single column for DEBUG tab to maximize data readability

## Component Library

**Navigation & Tabs**:
- Horizontal tab bar with underline indicator on active tab
- Tabs: "Overview", "Research", "Fact-Check", "DEBUG" 
- Tab bar: border-b with subtle divider, sticky top positioning
- Active state: bold font-weight with animated underline
- Icon integration: Heroicons (CDN) - 20px size for tab icons

**Collapsible/Expandable Sections**:
- Header bar: flex justify-between with chevron icon (rotate transition)
- Click target: full-width interactive header
- Collapsed: shows summary line (source URL, timestamp, item count)
- Expanded: reveals full extracted content with syntax highlighting effect
- Smooth height transition with duration-200
- Nested indent: pl-6 for hierarchical Workflowy content

**Data Display Cards**:
- Bordered containers with subtle shadow
- Rounded corners: rounded-lg
- Internal spacing: p-6
- Metadata row: flex justify-between items-center with text-xs
- Content area: prose max-w-none for readable text blocks

**Debug Content Presentation**:
- Monospace font for all extracted data
- Line numbers for multi-line content (absolute positioned)
- Syntax-like formatting: different font-weights for keys vs values
- Copy-to-clipboard button (top-right of each content block)
- Search/filter bar at top of DEBUG tab
- Timestamp badges for each extraction

**Action Buttons**:
- Primary: Medium size, font-medium, px-6 py-2
- Secondary: Outlined variant, same sizing
- Icon buttons: Square 32px or 40px for utility actions
- Button groups: gap-2 spacing

**Status Indicators**:
- Small pill badges: rounded-full px-3 py-1 text-xs
- Icons from Heroicons: check-circle, exclamation-triangle, clock
- Positioned inline with content titles or top-right of cards

**Data Tables** (if showing extraction logs):
- Minimal borders, strong header row
- Alternating row emphasis through font-weight variation
- Fixed left column for sources
- Monospace for URLs/IDs
- Hover state: subtle background shift

## Layout Specifications

**Dashboard Header**:
- Full-width container with flex justify-between
- Left: Logo + Dashboard title
- Right: User menu, settings icon, notification bell
- Height: h-16, sticky top-0

**Main Content Area**:
- Tab content below header with pt-8
- DEBUG tab: Full-width content, no sidebars
- Collapsible sections: Stack vertically with gap-4
- Each Workflowy extraction: Individual collapsible card

**Collapsible Card Anatomy**:
```
[Header Bar - always visible]
- Left: Chevron icon + Source title/URL
- Right: Timestamp + Item count badge + Action menu (•••)

[Expanded Content]
- Hierarchical bullet structure preserving Workflowy nesting
- Indentation: Multiply pl-6 for each level
- Checkboxes rendered as icons if present in source
- Notes/metadata in lighter font-weight
```

**Search/Filter Bar** (DEBUG tab):
- Sticky below tab bar: sticky top-16
- Input field: Full-width with search icon, rounded-lg
- Filter chips: Inline with search, removable tags
- Sort dropdown: Right-aligned

## Images

**No hero images required** - This is a data-focused dashboard where screen real estate is precious. All visual hierarchy comes from typography, spacing, and component structure.

**Icons Only**: Use Heroicons throughout for:
- Tab icons (document-text, magnifying-glass, bug-ant for DEBUG)
- Status indicators (check, warning, info)
- Action buttons (copy, download, expand/collapse)
- Navigation elements (chevrons, menu icons)

## Animations

**Minimal, Purposeful Motion**:
- Collapsible sections: height transition duration-200 ease-in-out
- Tab switching: Crossfade with duration-150
- Chevron rotation: transform rotate-180 duration-200
- Hover states: No animations, instant feedback only