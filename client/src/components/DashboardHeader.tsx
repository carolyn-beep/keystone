import { ReactNode } from 'react';
import { Link, useSearch } from 'wouter';
import { RefreshCw, Download, Users, History } from 'lucide-react';
import { BrainliftData, BrainliftVersion } from '@shared/schema';
import { tokens } from '@/lib/colors';
import { TactileButton } from '@/components/ui/tactile-button';

// Import all profile images
import appleImg from '@/assets/bl_profile/apple.webp';
import birdImg from '@/assets/bl_profile/bird.webp';
import booksImg from '@/assets/bl_profile/books.webp';
import brainImg from '@/assets/bl_profile/brain.webp';
import dandelionImg from '@/assets/bl_profile/dandelion.webp';
import doorImg from '@/assets/bl_profile/door.webp';
import hourglassImg from '@/assets/bl_profile/hourglass.webp';
import lighthouseImg from '@/assets/bl_profile/lighthouse.webp';
import listenImg from '@/assets/bl_profile/listen.webp';
import maskImg from '@/assets/bl_profile/mask.webp';
import matchstickImg from '@/assets/bl_profile/matchstick.webp';
import prismImg from '@/assets/bl_profile/prism.webp';
import shipImg from '@/assets/bl_profile/ship.webp';
import stairsImg from '@/assets/bl_profile/stairs.webp';
import telescopeImg from '@/assets/bl_profile/telescope.webp';
import hourglass2Img from '@/assets/bl_profile/hourglass2.webp';
import mindImg from '@/assets/bl_profile/mind.webp';

const PROFILE_IMAGES = [
  appleImg, birdImg, booksImg, brainImg, dandelionImg, doorImg, hourglassImg,
  lighthouseImg, listenImg, maskImg, matchstickImg, prismImg, shipImg,
  stairsImg, telescopeImg, hourglass2Img, mindImg
];

/**
 * Get the profile image for a brainlift.
 * Uses the AI-generated cover image if available, otherwise falls back to a
 * placeholder based on the brainlift ID.
 */
function getProfileImage(id: number, coverImageUrl?: string | null): string {
  if (coverImageUrl) {
    return coverImageUrl;
  }
  const index = id % PROFILE_IMAGES.length;
  return PROFILE_IMAGES[index];
}

/**
 * Render text with markdown links [text](url) as clickable <a> tags
 */
function renderWithLinks(text: string): ReactNode {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const [, linkText, url] = match;
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 underline"
      >
        {linkText}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

interface DashboardHeaderProps {
  data: BrainliftData;
  isSharedView: boolean;
  isNotBrainlift: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  versions: BrainliftVersion[];
  editingAuthor: boolean;
  setEditingAuthor: (editing: boolean) => void;
  authorInput: string;
  setAuthorInput: (input: string) => void;
  onUpdateAuthor: (author: string) => void;
  setShowUpdateModal: (show: boolean) => void;
  setShowHistoryModal: (show: boolean) => void;
  handleDownloadPDF: () => void;
  isOwner?: boolean;
  setShowShareModal?: (show: boolean) => void;
  canModify?: boolean;
  isAdmin?: boolean;
}

export function DashboardHeader({
  data,
  isSharedView,
  isNotBrainlift,
  activeTab,
  setActiveTab,
  versions,
  editingAuthor,
  setEditingAuthor,
  authorInput,
  setAuthorInput,
  onUpdateAuthor,
  setShowUpdateModal,
  setShowHistoryModal,
  handleDownloadPDF,
  isOwner,
  setShowShareModal,
  canModify = true, // Default to true for backwards compatibility
  isAdmin = false,
}: DashboardHeaderProps) {
  const { title, description, displayPurpose, slug } = data;

  // Preserve admin param when navigating back
  const searchString = useSearch();
  const isAdminView = new URLSearchParams(searchString).get('admin') === 'true';
  const backLink = isAdminView ? '/?admin=true' : '/';

  return (
    <header
      className="px-4 pt-4 sm:px-8 md:px-12 bg-card"
    >
      {/* Row 1: Back Link */}
      {!isSharedView && (
        <Link href={backLink} className="text-muted-foreground no-underline text-[13px] inline-block mb-2">
          ← All Brainlifts
        </Link>
      )}

      {/* Row 2: Identity Block with Profile Image */}
      <div className="flex items-start gap-2.5">
        {/* Profile Image */}
        <div
          className="w-28 h-28 shrink-0 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: tokens.surfaceAlt }}
        >
          <img
            src={getProfileImage(data.id, data.coverImageUrl)}
            alt=""
            className="w-28 h-28 object-contain"
            style={{ filter: 'sepia(60%) saturate(80%) brightness(92%)' }}
            loading="lazy"
          />
        </div>

        {/* Title, Subtitle, Author */}
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <h1 className="text-[30px] font-bold mt-2 text-foreground tracking-tight leading-[1.3]">{title}</h1>

          {/* Subtitle */}
          <p className="text-muted-foreground text-base m-0">
            {renderWithLinks(displayPurpose || description)}
          </p>

          {/* Author */}
          <div
            className="flex items-center gap-1"
            style={{
              cursor: editingAuthor ? 'text' : 'pointer',
            }}
            onClick={() => {
              if (!editingAuthor) {
                setAuthorInput(data.author || '');
                setEditingAuthor(true);
              }
            }}
            title={editingAuthor ? undefined : "Click to set owner name"}
          >
            <span className="text-muted-foreground text-[13px]">By</span>
            {editingAuthor ? (
              <input
                type="text"
                value={authorInput}
                onChange={(e) => setAuthorInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && authorInput.trim()) {
                    onUpdateAuthor(authorInput.trim());
                  }
                  if (e.key === 'Escape') setEditingAuthor(false);
                }}
                onBlur={() => {
                  if (authorInput.trim()) {
                    onUpdateAuthor(authorInput.trim());
                  } else {
                    setEditingAuthor(false);
                  }
                }}
                autoFocus
                placeholder="Enter name..."
                className="border-none border-b border-b-gray-300 bg-transparent py-0.5 px-0 text-[13px] w-[150px] outline-none text-foreground"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className="owner-name-hover transition-all duration-150"
                style={{
                  color: data.author ? tokens.textMuted : '#9CA3AF',
                  fontStyle: data.author ? 'normal' : 'italic',
                  borderBottom: data.author ? 'none' : '1px dashed #D1D5DB',
                  paddingBottom: data.author ? 0 : '1px',
                }}
              >
                {data.author || 'Set Owner Name...'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Row 5: Navigation Tabs (left) + Actions (right) */}
      <div
        className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-2 sm:gap-0 mt-4 border-b border-border"
      >
        {/* Navigation Tabs - Left aligned, flat underline style */}
        <div className="flex gap-1 flex-wrap">
          {!isNotBrainlift && ['brainlift', 'grading', 'summaries', 'contradictions', 'reading', ...(isAdmin ? ['learning'] : [])].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              data-testid={`tab-${tab}`}
              className="px-5 py-3 bg-transparent border-none cursor-pointer text-sm font-medium transition-colors duration-150 -mb-px font-serif"
              style={{
                borderBottom: activeTab === tab ? `2px solid ${tokens.primary}` : '2px solid transparent',
                color: activeTab === tab ? tokens.primary : tokens.textSecondary,
              }}
              onMouseEnter={(e) => {
                if (activeTab !== tab) {
                  e.currentTarget.style.color = tokens.primary;
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab) {
                  e.currentTarget.style.color = tokens.textSecondary;
                }
              }}
            >
              {tab === 'brainlift' && 'Brainlift'}
              {tab === 'grading' && 'Fact Grading'}
              {tab === 'verification' && 'AI Verification'}
              {tab === 'analytics' && 'Analytics'}
              {tab === 'contradictions' && 'Contradictions'}
              {tab === 'reading' && 'Reading List'}
              {tab === 'learning' && 'Learning Stream'}
              {tab === 'summaries' && 'Summaries'}
            </button>
          ))}
        </div>

        {/* Action Cluster - Right aligned */}
        <div className="flex gap-2 items-center pb-2 flex-wrap">
          {/* Primary Action: Update */}
          {canModify && !isSharedView && !isNotBrainlift && (
            <TactileButton
              variant="raised"
              data-testid="button-update-brainlift"
              onClick={() => setShowUpdateModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-[13px]"
            >
              <RefreshCw size={14} />
              Update
            </TactileButton>
          )}

          {/* Secondary Actions: Ghost buttons */}
          {!isNotBrainlift && (
            <button
              data-testid="button-download-pdf"
              onClick={handleDownloadPDF}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-md border-none bg-transparent cursor-pointer text-[13px] font-medium"
              style={{ color: tokens.textSecondary }}
              onMouseEnter={(e) => e.currentTarget.style.color = tokens.textPrimary}
              onMouseLeave={(e) => e.currentTarget.style.color = tokens.textSecondary}
            >
              <Download size={14} />
              PDF
            </button>
          )}

          {isOwner && (
            <button
              data-testid="button-share"
              onClick={() => setShowShareModal?.(true)}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-md border-none bg-transparent cursor-pointer text-[13px] font-medium"
              style={{ color: tokens.textSecondary }}
              onMouseEnter={(e) => e.currentTarget.style.color = tokens.textPrimary}
              onMouseLeave={(e) => e.currentTarget.style.color = tokens.textSecondary}
            >
              <Users size={14} />
              Share
            </button>
          )}

          {/* History button */}
          {canModify && !isSharedView && !isNotBrainlift && versions.length > 0 && (
            <button
              data-testid="button-view-history"
              onClick={() => setShowHistoryModal(true)}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-md border-none bg-transparent cursor-pointer text-[13px] font-medium"
              style={{ color: tokens.textSecondary }}
              onMouseEnter={(e) => e.currentTarget.style.color = tokens.textPrimary}
              onMouseLeave={(e) => e.currentTarget.style.color = tokens.textSecondary}
            >
              <History size={14} />
              History
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
