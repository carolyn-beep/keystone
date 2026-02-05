import { Link } from 'wouter';
import { Brainlift } from '@shared/schema';
import { Trash2 } from 'lucide-react';
import { tokens } from '@/lib/colors';
import paperGrainTexture from '@/assets/textures/paper-grain.webp';

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
 * Format date in a readable way
 */
function formatDate(dateString: string | Date | null | undefined): string {
  if (!dateString) return 'No date';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Get grifo (engraved underline) color based on score
 * 0-2: red tones, 2-3.5: amber tones, 3.5-5: green tones
 */
function getGrifoColor(score: number): string {
  if (score <= 0) return '#9ca3af'; // gray for N/A
  if (score <= 2) return '#b83a3a'; // rich crimson red
  if (score <= 3) return '#c47a2a'; // burnt orange
  if (score <= 3.5) return '#a89030'; // golden amber
  if (score <= 4) return '#6a9a40'; // spring green
  if (score <= 4.5) return '#3a9a5a'; // emerald
  return '#2a8a4a'; // vibrant forest green
}

interface BrainliftCardProps {
  brainlift: Brainlift & {
    shareInfo?: {
      permission?: 'viewer' | 'editor';
      sharedWithCount?: number;
    };
  };
  adminView: boolean;
  onDelete: (e: React.MouseEvent, brainlift: { id: number; title: string }) => void;
}

export function BrainliftCard({ brainlift, adminView, onDelete }: BrainliftCardProps) {
  const summary = brainlift.summary || { meanScore: '0', totalFacts: 0, score5Count: 0, contradictionCount: 0 };
  const meanScore = parseFloat(summary.meanScore || '0');
  const ownerName = brainlift.author || 'Unknown Owner';
  const profileImage = getProfileImage(brainlift.id, brainlift.coverImageUrl);

  return (
    <Link
      href={`/grading/${brainlift.slug}${adminView ? '?admin=true' : ''}`}
      data-testid={`card-brainlift-${brainlift.slug}`}
      className="group rounded-xl no-underline flex relative transition-all duration-200 cursor-pointer h-full box-border overflow-hidden"
      style={{
        backgroundColor: tokens.surface,
        border: `1px solid ${tokens.border}`,
        color: 'inherit',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = tokens.borderStrong;
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(34, 21, 13, 0.08), 0 2px 4px rgba(34, 21, 13, 0.04)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = tokens.border;
        e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)';
        e.currentTarget.style.transform = 'none';
      }}
    >
      {/* Delete Button - Top Right */}
      <button
        data-testid={`button-delete-${brainlift.id}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete(e, { id: brainlift.id, title: brainlift.title });
        }}
        className="absolute top-3 right-3 flex items-center justify-center w-7 h-7 rounded-md cursor-pointer transition-all duration-150 p-0 z-10 opacity-0 group-hover:opacity-100"
        style={{
          backgroundColor: tokens.surface,
          border: `1px solid ${tokens.border}`,
          color: tokens.textMuted,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = tokens.dangerSoft;
          e.currentTarget.style.borderColor = tokens.danger;
          e.currentTarget.style.color = tokens.danger;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = tokens.surface;
          e.currentTarget.style.borderColor = tokens.border;
          e.currentTarget.style.color = tokens.textMuted;
        }}
      >
        <Trash2 size={14} />
      </button>

      {/* Left Side - Profile Image */}
      <div
        className="w-28 shrink-0 flex items-center justify-center p-2"
        style={{ backgroundColor: tokens.surfaceAlt }}
      >
        <img
          src={profileImage}
          alt=""
          className="w-21 h-21 object-contain"
          style={{ filter: 'sepia(60%) saturate(80%) brightness(92%)' }}
          loading="lazy"
        />
      </div>

      {/* Right Side - Content */}
      <div className="flex flex-col justify-between p-5 flex-1 min-w-0">
        {/* Owner Name - Bold, Big */}
        <h3
          className="text-xl font-bold m-0 leading-tight truncate pr-8"
          style={{ color: tokens.textPrimary }}
        >
          {ownerName}
        </h3>

        {/* Date - Regular, Non-bold */}
        <p
          className="text-base m-0 mt-3"
          style={{ color: tokens.textSecondary }}
        >
          {formatDate(brainlift.createdAt)}
        </p>

        {/* Mean Score - Semi-bold with engraved grifo */}
        <p
          className="text-lg font-semibold m-0 mt-3 font-serif"
          style={{ color: tokens.textPrimary }}
        >
          Mean Score:{' '}
          <span
            className="relative inline-block px-1"
            style={{ isolation: 'isolate' }}
          >
            <span
              style={{
                color: meanScore > 0 ? getGrifoColor(meanScore) : tokens.textMuted,
                fontWeight: 700,
                textShadow: meanScore > 0 ? '0 1px 0 rgba(255,255,255,0.3)' : 'none',
              }}
            >
              {meanScore > 0 ? parseFloat(meanScore.toFixed(2)) : 'N/A'}
            </span>
            {/* Engraved grifo underline - only shown for valid scores */}
            {meanScore > 0 && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: '-0.1em',
                  right: '-0.1em',
                  bottom: '0.1em',
                  height: '0.1em',
                  borderRadius: '4px',
                  zIndex: -1,
                  background: `
                    linear-gradient(${getGrifoColor(meanScore)}, ${getGrifoColor(meanScore)}),
                    url(${paperGrainTexture})
                  `,
                  backgroundBlendMode: 'multiply',
                  backgroundSize: 'cover, 100px',
                  boxShadow: `
                    inset 0 1.5px 0 rgba(255,255,255,0.45),
                    inset 0 -1.5px 0 rgba(0,0,0,0.25),
                    0 1px 0 rgba(0,0,0,0.06)
                  `,
                  mixBlendMode: 'multiply',
                  opacity: 0.88,
                }}
              />
            )}
          </span>
        </p>
      </div>
    </Link>
  );
}
