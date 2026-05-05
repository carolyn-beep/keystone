import { ReactNode } from 'react';
import { RefreshCw, Download, Users, History, Pencil } from 'lucide-react';
import { BrainliftData, BrainliftVersion } from '@shared/schema';
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
  versions: BrainliftVersion[];
  editingAuthor: boolean;
  setEditingAuthor: (editing: boolean) => void;
  authorInput: string;
  setAuthorInput: (input: string) => void;
  onUpdateAuthor: (author: string) => void;
  editingTitle?: boolean;
  setEditingTitle?: (editing: boolean) => void;
  titleInput?: string;
  setTitleInput?: (input: string) => void;
  onUpdateTitle?: (title: string) => void;
  setShowUpdateModal: (show: boolean) => void;
  setShowHistoryModal: (show: boolean) => void;
  handleDownloadPDF: () => void;
  isOwner?: boolean;
  isAdmin?: boolean;
  setShowShareModal?: (show: boolean) => void;
  canModify?: boolean;
  rightSlot?: ReactNode;
  hideDefaultActions?: boolean;
}

export function DashboardHeader({
  data,
  isSharedView,
  isNotBrainlift,
  versions,
  editingAuthor,
  setEditingAuthor,
  authorInput,
  setAuthorInput,
  onUpdateAuthor,
  editingTitle = false,
  setEditingTitle,
  titleInput = '',
  setTitleInput,
  onUpdateTitle,
  setShowUpdateModal,
  setShowHistoryModal,
  handleDownloadPDF,
  isOwner,
  isAdmin,
  setShowShareModal,
  canModify = true,
  rightSlot,
  hideDefaultActions = false,
}: DashboardHeaderProps) {
  const { title, description, displayPurpose } = data;
  const canEditTitle = canModify && !!setEditingTitle && !!setTitleInput && !!onUpdateTitle;

  const beginTitleEdit = () => {
    if (!canEditTitle) return;
    setTitleInput!(title);
    setEditingTitle!(true);
  };

  const commitTitle = () => {
    if (!onUpdateTitle) return;
    const next = titleInput.trim();
    if (!next || next === title) {
      setEditingTitle?.(false);
      return;
    }
    onUpdateTitle(next);
  };

  return (
    <div className="header-content pt-4 pb-4 px-4">
      {/* Identity Block with Profile Image */}
      <div className="header-row flex items-start gap-2.5">
        {/* Profile Image */}
        <div
          className="header-image w-28 h-28 shrink-0 rounded-lg flex items-center justify-center"
        >
          <img
            src={getProfileImage(data.id, data.coverImageUrl)}
            alt=""
            className="header-image-img w-28 h-28 object-contain sepia-[.6] saturate-[.8] brightness-[.92]"
            loading="lazy"
          />
        </div>

        {/* Title, Subtitle, Author */}
        <div className="header-text-col flex-1 min-w-0 flex flex-col gap-1.5">
          {editingTitle && canEditTitle ? (
            <div className="header-title mt-2 flex items-center gap-2">
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput!(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitTitle();
                  if (e.key === 'Escape') setEditingTitle!(false);
                }}
                onBlur={commitTitle}
                autoFocus
                maxLength={200}
                placeholder="Project name..."
                className="flex-1 min-w-0 bg-transparent outline-none border-0 border-b border-border focus:border-primary text-[30px] font-bold text-foreground tracking-tight leading-[1.3] py-0.5 px-0"
                aria-label="Edit project name"
              />
            </div>
          ) : (
            <div className="header-title mt-2 flex items-center gap-2 group">
              <h1
                className={`text-[30px] font-bold text-foreground tracking-tight leading-[1.3] m-0 ${canEditTitle ? 'cursor-pointer' : ''}`}
                onClick={canEditTitle ? beginTitleEdit : undefined}
                title={canEditTitle ? 'Click to rename project' : undefined}
              >
                {title}
              </h1>
              {canEditTitle && (
                <button
                  type="button"
                  onClick={beginTitleEdit}
                  aria-label="Rename project"
                  className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-light hover:text-foreground hover:bg-card border-0 bg-transparent cursor-pointer transition-colors duration-150 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>
          )}

          {/* Subtitle */}
          <p className="header-description text-muted-foreground text-base m-0">
            {renderWithLinks(displayPurpose || description)}
          </p>

          {/* Author */}
          <div
            className={`header-author flex items-center gap-1 ${editingAuthor ? 'cursor-text' : 'cursor-pointer'}`}
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
                className={`owner-name-hover transition-all duration-150 ${
                  data.author
                    ? 'text-muted-foreground'
                    : 'text-gray-400 italic border-b border-dashed border-gray-300 pb-px'
                }`}
              >
                {data.author || 'Set Owner Name...'}
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons - Right aligned, bottom of header */}
        <div className="header-actions flex gap-2 items-end flex-wrap shrink-0 self-end">
          {rightSlot}

          {/* Primary Action: Update */}
          {!hideDefaultActions && canModify && !isSharedView && !isNotBrainlift && (
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
          {!hideDefaultActions && !isNotBrainlift && (
            <button
              data-testid="button-download-pdf"
              onClick={handleDownloadPDF}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-md border-none bg-transparent cursor-pointer text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Download size={14} />
              PDF
            </button>
          )}

          {!hideDefaultActions && (isOwner || isAdmin) && (
            <button
              data-testid="button-share"
              onClick={() => setShowShareModal?.(true)}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-md border-none bg-transparent cursor-pointer text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <Users size={14} />
              Share
            </button>
          )}

          {/* History button */}
          {!hideDefaultActions && canModify && !isSharedView && !isNotBrainlift && versions.length > 0 && (
            <button
              data-testid="button-view-history"
              onClick={() => setShowHistoryModal(true)}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-md border-none bg-transparent cursor-pointer text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <History size={14} />
              History
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
