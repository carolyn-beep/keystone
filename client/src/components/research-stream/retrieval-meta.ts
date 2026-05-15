import type { IconType } from 'react-icons';
import { BsSubstack } from 'react-icons/bs';
import { FaGraduationCap, FaPodcast, FaNewspaper, FaYoutube } from 'react-icons/fa';
import { VscTwitter } from 'react-icons/vsc';
import type { RetrievalType } from '@shared/research-stream';

export interface RetrievalTypeMeta {
  icon: IconType;
  label: string;
  /** Short copy used in slot rows when no focus is set. */
  hint: string;
  /** Pastel background tint, matches neo-editorial palette. */
  bg: string;
  /** Saturated ink color for the icon. */
  ink: string;
}

// Pastel backgrounds + saturated ink, all keyed to CSS vars in
// client/src/index.css (light + dark variants defined there).
export const RETRIEVAL_TYPE_META: Record<RetrievalType, RetrievalTypeMeta> = {
  Substack: {
    icon: BsSubstack,
    label: 'Substack',
    hint: 'Long-form essays & newsletters',
    bg: 'var(--warning-soft-hex)',
    ink: 'var(--warning-hex)',
  },
  AcademicPaper: {
    icon: FaGraduationCap,
    label: 'Academic',
    hint: 'Latest research & working papers',
    bg: 'var(--success-soft-hex)',
    ink: 'var(--success-hex)',
  },
  Twitter: {
    icon: VscTwitter,
    label: 'X / Twitter',
    hint: 'High-signal threads & discourse',
    bg: 'var(--info-soft-hex)',
    ink: 'var(--info-hex)',
  },
  Video: {
    icon: FaYoutube,
    label: 'Video',
    hint: 'Keynotes, interviews & deep dives',
    bg: 'var(--danger-soft-hex)',
    ink: 'var(--danger-hex)',
  },
  Podcast: {
    icon: FaPodcast,
    label: 'Podcast',
    hint: 'Conversations with practitioners',
    bg: 'var(--podcast-soft-hex)',
    ink: 'var(--podcast-hex)',
  },
  News: {
    icon: FaNewspaper,
    label: 'News',
    hint: 'Recent press & coverage',
    bg: 'var(--news-soft-hex)',
    ink: 'var(--news-hex)',
  },
};

/** Default Mixed-distribution preview used by both the launcher's compact
 *  view and the chat-side proposal card when no explicit types are pinned. */
export const PREVIEW_SLOTS: ReadonlyArray<{ type: RetrievalType }> = [
  { type: 'Podcast' },
  { type: 'AcademicPaper' },
  { type: 'Video' },
  { type: 'Substack' },
  { type: 'News' },
];
