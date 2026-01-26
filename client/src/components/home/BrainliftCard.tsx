import { useState, ReactNode } from 'react';
import { Link } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { Brainlift } from '@shared/schema';
import { queryClient } from '@/lib/queryClient';
import { Check, Clock, AlertTriangle, Trash2, Eye, Edit3, Users } from 'lucide-react';
import { tokens } from '@/lib/colors';

/**
 * Render text with markdown links [text](url) as clickable <a> tags
 */
function renderWithLinks(text: string): ReactNode {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    // Add text before the link
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    // Add the link
    const [, linkText, url] = match;
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-teal-600 hover:text-teal-700 underline"
      >
        {linkText}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
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
  const [editingAuthor, setEditingAuthor] = useState(false);
  const [authorInput, setAuthorInput] = useState('');

  const updateAuthorMutation = useMutation({
    mutationFn: async ({ slug, author }: { slug: string; author: string }) => {
      const res = await fetch(`/api/brainlifts/${slug}/author`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author }),
      });
      if (!res.ok) throw new Error('Failed to update author');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brainlifts'] });
      setEditingAuthor(false);
      setAuthorInput('');
    },
  });

  const handleAuthorClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingAuthor(true);
    setAuthorInput(brainlift.author || '');
  };

  const handleAuthorSubmit = () => {
    if (authorInput.trim()) {
      updateAuthorMutation.mutate({ slug: brainlift.slug, author: authorInput.trim() });
    } else {
      setEditingAuthor(false);
    }
  };

  const isNotGradeable = brainlift.classification === 'not_brainlift';
  const summary = brainlift.summary || { meanScore: '0', totalFacts: 0, score5Count: 0, contradictionCount: 0 };
  const meanScore = parseFloat(summary.meanScore || '0');
  const hasContradictions = (summary.contradictionCount || 0) > 0;
  const authorInitials = brainlift.author
    ? brainlift.author.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  const getScoreColor = () => {
    if (meanScore >= 4.5) return '#10B981';
    if (meanScore >= 4.0) return '#0D9488';
    if (meanScore >= 3.0) return '#EAB308';
    return '#EF4444';
  };

  const getStatus = () => {
    if (isNotGradeable) return { label: 'Not a Brainlift', bg: '#FEF3C7', color: '#B45309', border: '#F59E0B', icon: AlertTriangle };
    if ((summary.totalFacts || 0) > 0) return { label: 'Graded', bg: '#ECFDF5', color: '#059669', border: '#10B981', icon: Check };
    return { label: 'Pending', bg: '#FEF3C7', color: '#B45309', border: '#F59E0B', icon: Clock };
  };

  const status = getStatus();
  const StatusIcon = status.icon;

  return (
    <Link
      href={`/grading/${brainlift.slug}${adminView ? '?admin=true' : ''}`}
      data-testid={`card-brainlift-${brainlift.slug}`}
      className="rounded-xl p-5 pr-6 no-underline flex flex-col relative transition-all duration-200 cursor-pointer h-full box-border"
      style={{
        backgroundColor: isNotGradeable ? '#F9FAFB' : 'white',
        border: isNotGradeable ? '1px dashed #D1D5DB' : '1px solid #E5E7EB',
        color: 'inherit',
        opacity: isNotGradeable ? 0.7 : 1,
      }}
      onMouseEnter={(e) => {
        if (!isNotGradeable) {
          e.currentTarget.style.borderColor = '#0D9488';
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(13, 148, 136, 0.12)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        } else {
          e.currentTarget.style.opacity = '0.85';
          e.currentTarget.style.borderColor = '#9CA3AF';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = isNotGradeable ? '#D1D5DB' : '#E5E7EB';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.opacity = isNotGradeable ? '0.7' : '1';
      }}
    >
      {/* Top Right Actions */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-[2]">
        {/* Delete Button */}
        <button
          data-testid={`button-delete-${brainlift.id}`}
          onClick={(e) => onDelete(e, { id: brainlift.id, title: brainlift.title })}
          className="flex items-center justify-center w-7 h-7 rounded-md border border-[#E5E7EB] bg-white text-[#9CA3AF] cursor-pointer transition-all duration-150 p-0"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#FEE2E2';
            e.currentTarget.style.borderColor = '#FCA5A5';
            e.currentTarget.style.color = '#DC2626';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'white';
            e.currentTarget.style.borderColor = '#E5E7EB';
            e.currentTarget.style.color = '#9CA3AF';
          }}
        >
          <Trash2 size={14} />
        </button>

        {/* Status Badge */}
        <span
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
          style={{
            backgroundColor: status.bg,
            color: status.color,
            border: `1px solid ${status.border}`,
          }}
        >
          <StatusIcon size={10} />
          {status.label}
        </span>
      </div>

      {/* Card Header */}
      <div className="mb-3 pr-[145px]">
        <h3 className="text-[17px] font-semibold text-[#111827] m-0 mb-1.5 leading-[1.3] break-words">
          {brainlift.title}
        </h3>
        <p className="text-sm text-[#6B7280] m-0 leading-normal overflow-hidden line-clamp-2">
          {renderWithLinks(brainlift.displayPurpose || brainlift.description)}
        </p>
      </div>

      {/* Author & Date */}
      <div className="flex items-center gap-3 mb-4 text-[13px] text-[#6B7280]">
        <div
          className="flex items-center gap-1.5"
          style={{
            cursor: editingAuthor ? 'text' : 'pointer',
          }}
          onClick={(e) => {
            if (!editingAuthor) {
              handleAuthorClick(e);
            }
          }}
          title={editingAuthor ? undefined : "Click to set owner name"}
        >
          {/* Avatar circle - always visible */}
          <span className="w-6 h-6 rounded-full bg-[#E5E7EB] flex items-center justify-center text-[11px] font-semibold text-[#6B7280] shrink-0">
            {authorInitials}
          </span>

          {/* Name or input */}
          {editingAuthor ? (
            <input
              type="text"
              value={authorInput}
              onChange={(e) => setAuthorInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAuthorSubmit();
                if (e.key === 'Escape') setEditingAuthor(false);
              }}
              onBlur={() => handleAuthorSubmit()}
              autoFocus
              placeholder="Enter owner name..."
              className="border-0 border-b border-[#D1D5DB] bg-transparent py-0.5 px-0 text-[13px] w-[130px] outline-none text-[#374151]"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="owner-name-hover transition-all duration-150"
              style={{
                color: brainlift.author ? '#6B7280' : '#9CA3AF',
                fontStyle: brainlift.author ? 'normal' : 'italic',
                borderBottom: brainlift.author ? 'none' : '1px dashed #D1D5DB',
                paddingBottom: brainlift.author ? 0 : '1px',
              }}
            >
              {brainlift.author || 'Set Owner Name...'}
            </span>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-2 pt-4 border-t border-[#F3F4F6] mt-auto flex-wrap">
        {/* Facts Badge */}
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium"
          style={{
            backgroundColor: isNotGradeable && (summary.totalFacts || 0) === 0 ? '#FEE2E2' : '#F0FDFA',
            color: isNotGradeable && (summary.totalFacts || 0) === 0 ? '#DC2626' : '#0D9488',
          }}
        >
          <span className="font-bold">{summary.totalFacts || 0}</span> facts
        </span>

        {/* Contradictions Badge */}
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium"
          style={{
            backgroundColor: hasContradictions ? '#FFF7ED' : '#F3F4F6',
            color: hasContradictions ? '#EA580C' : '#6B7280',
          }}
        >
          {hasContradictions && <AlertTriangle size={12} />}
          {summary.contradictionCount || 0} contradictions
        </span>

        {/* Viewer Badge */}
        {brainlift.shareInfo?.permission === 'viewer' && (
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium"
            style={{ backgroundColor: tokens.infoSoft, color: tokens.info }}
          >
            <Eye size={12} />
            Viewer
          </span>
        )}

        {/* Editor Badge */}
        {brainlift.shareInfo?.permission === 'editor' && (
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium"
            style={{ backgroundColor: tokens.successSoft, color: tokens.success }}
          >
            <Edit3 size={12} />
            Editor
          </span>
        )}

        {/* Shared with count */}
        {brainlift.shareInfo?.sharedWithCount !== undefined && brainlift.shareInfo.sharedWithCount > 0 && (
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium"
            style={{ backgroundColor: tokens.primarySoft, color: tokens.primary }}
          >
            <Users size={12} />
            Shared with {brainlift.shareInfo.sharedWithCount}
          </span>
        )}

        {/* Score Preview */}
        <div className="ml-auto flex items-center gap-2">
          <div className="text-[11px] text-[#6B7280] text-right leading-[1.3]">
            Mean<br/>Score
          </div>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-bold"
            style={{
              fontSize: isNotGradeable || (summary.totalFacts || 0) === 0 ? '12px' : '14px',
              color: isNotGradeable || (summary.totalFacts || 0) === 0 ? '#6B7280' : 'white',
              backgroundColor: isNotGradeable || (summary.totalFacts || 0) === 0 ? '#E5E7EB' : getScoreColor(),
            }}
          >
            {isNotGradeable || (summary.totalFacts || 0) === 0 ? 'N/A' : meanScore.toFixed(1)}
          </div>
        </div>
      </div>
    </Link>
  );
}
