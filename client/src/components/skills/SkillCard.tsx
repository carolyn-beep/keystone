import { ArrowRight, Pencil, Trash2 } from 'lucide-react';
import { SkillToggle } from './SkillToggle';
import { pickSkillIcon } from './skill-icon';
import inkQuillIcon from '@/assets/icons/ink-quill.svg';
import type { SkillListItem } from '@/hooks/useSkills';

interface SkillCardProps {
  skill: SkillListItem;
  isAdminMode: boolean;
  isBusy: boolean;
  onToggleEnabled: (skill: SkillListItem) => void;
  onTryItOut: (skill: SkillListItem) => void;
  onEdit: (skill: SkillListItem) => void;
  onDelete: (skill: SkillListItem) => void;
}

function tagColors(label: string): { bg: string; text: string } {
  // Stable hash → palette index
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0;
  const palettes = [
    { bg: 'bg-success/15', text: 'text-success' },
    { bg: 'bg-info/15', text: 'text-info' },
    { bg: 'bg-warning/15', text: 'text-warning' },
    { bg: 'bg-primary/10', text: 'text-primary' },
    { bg: 'bg-danger/10', text: 'text-danger' },
  ];
  return palettes[Math.abs(hash) % palettes.length];
}

function deriveTags(skill: SkillListItem): string[] {
  const tags: string[] = [];
  tags.push(skill.visibility === 'private' ? 'Private' : 'Public');
  if (skill.isCreatedByMe) tags.push('Mine');
  if (skill.referenceCount > 0) tags.push(`${skill.referenceCount} refs`);
  return tags;
}


export function SkillCard({
  skill,
  isAdminMode,
  isBusy,
  onToggleEnabled,
  onTryItOut,
  onEdit,
  onDelete,
}: SkillCardProps) {
  const tags = deriveTags(skill);
  const icon = pickSkillIcon(skill.name);

  return (
    <article
      className={`group relative flex min-h-[260px] flex-col rounded-xl bg-card-elevated px-5 py-5 shadow-card transition-shadow duration-300 hover:shadow-card-hover ${
        skill.enabled ? '' : 'opacity-70'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: icon.tint }}
          >
            <img
              src={icon.src}
              alt=""
              className="h-8 w-8 select-none object-contain"
              loading="lazy"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="break-words font-serif text-[20px] leading-tight text-foreground">
              {skill.name}
            </h3>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.32em] text-muted-foreground">
              by {skill.createdByName}
            </p>
          </div>
        </div>
        <SkillToggle
          enabled={skill.enabled}
          disabled={isBusy}
          onChange={() => onToggleEnabled(skill)}
          label={`${skill.enabled ? 'Disable' : 'Enable'} ${skill.name}`}
          size="sm"
        />
      </div>

      <p className="mt-4 flex-1 line-clamp-3 font-serif text-[14px] italic leading-relaxed text-muted-foreground">
        {skill.description || 'No description provided.'}
      </p>

      {tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const { bg, text } = tagColors(tag);
            return (
              <span
                key={tag}
                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${bg} ${text}`}
              >
                {tag}
              </span>
            );
          })}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/70 pt-4">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onTryItOut(skill)}
          className="group/cta flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.22em] text-primary transition-colors hover:text-foreground disabled:opacity-50"
        >
          <img src={inkQuillIcon} alt="" className="h-3.5 w-3.5 select-none" />
          <span>Try it out</span>
          <ArrowRight size={13} className="transition-transform duration-200 group-hover/cta:translate-x-0.5" />
        </button>
        {isAdminMode ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(skill)}
              aria-label={`Edit ${skill.name}`}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onDelete(skill)}
              aria-label={`Delete ${skill.name}`}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#953A34]/10 hover:text-[#953A34] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#953A34]/40 disabled:opacity-50"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
