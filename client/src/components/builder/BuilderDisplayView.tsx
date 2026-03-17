import { User, BookOpen, Users, Network, Link2, MessageSquare } from 'lucide-react';
import type { NativeDetailsResponse } from '@shared/routes';

interface BuilderExpertSummary {
  id: number;
  name: string;
  who: string;
}

interface BuilderDisplayViewProps {
  nativeDetails: NativeDetailsResponse;
  experts: BuilderExpertSummary[];
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground mb-2">
      {children}
    </div>
  );
}

function PlaceholderSection({
  icon: Icon,
  label,
}: {
  icon: typeof Network;
  label: string;
}) {
  return (
    <div className="rounded-xl shadow-card bg-card-elevated px-8 py-8">
      <div className="flex items-center gap-3 mb-3">
        <Icon size={16} className="text-muted-foreground opacity-50" />
        <SectionLabel>{label}</SectionLabel>
      </div>
      <p className="m-0 font-serif text-[14px] italic text-muted-foreground leading-relaxed">
        This section will be available in a future phase.
      </p>
    </div>
  );
}

export function BuilderDisplayView({ nativeDetails, experts }: BuilderDisplayViewProps) {
  return (
    <div className="py-10 px-2 max-w-3xl">
      {/* Page header */}
      <h2 className="text-[26px] font-bold text-foreground tracking-tight leading-[1.1] m-0 mb-2">
        Display
      </h2>
      <p className="font-serif text-[14px] italic text-muted-foreground leading-relaxed m-0 mb-12">
        A read-only summary of your brainlift as it stands today.
      </p>

      <div className="space-y-8">
        {/* Owner section */}
        <div className="rounded-xl shadow-card bg-card-elevated px-8 py-8">
          <div className="flex items-center gap-3 mb-3">
            <User size={16} className="text-muted-foreground opacity-50" />
            <SectionLabel>Owner</SectionLabel>
          </div>
          {nativeDetails.owner ? (
            <p className="m-0 font-serif text-[16px] text-foreground leading-relaxed">
              {nativeDetails.owner}
            </p>
          ) : (
            <p className="m-0 font-serif text-[14px] italic text-muted-foreground leading-relaxed">
              No owner specified.
            </p>
          )}
        </div>

        {/* Purpose section */}
        <div className="rounded-xl shadow-card bg-card-elevated px-8 py-8">
          <div className="flex items-center gap-3 mb-3">
            <BookOpen size={16} className="text-muted-foreground opacity-50" />
            <SectionLabel>Purpose</SectionLabel>
          </div>
          <p className="m-0 font-serif text-[16px] text-foreground leading-relaxed">
            {nativeDetails.purpose}
          </p>
        </div>

        {/* Experts section */}
        <div className="rounded-xl shadow-card bg-card-elevated px-8 py-8">
          <div className="flex items-center gap-3 mb-3">
            <Users size={16} className="text-muted-foreground opacity-50" />
            <SectionLabel>Experts</SectionLabel>
          </div>
          {experts.length > 0 ? (
            <ul className="m-0 p-0 list-none space-y-3">
              {experts.map((expert) => (
                <li key={expert.id} className="flex items-baseline gap-3">
                  <span className="font-serif text-[16px] text-foreground font-normal">
                    {expert.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {expert.who}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 font-serif text-[14px] italic text-muted-foreground leading-relaxed">
              No experts added yet. Add experts in Phase 2 of the builder.
            </p>
          )}
        </div>

        {/* Placeholder sections for future phases */}
        <PlaceholderSection icon={Network} label="Knowledge Tree" />
        <PlaceholderSection icon={Link2} label="Connections" />
        <PlaceholderSection icon={MessageSquare} label="Your Stance" />
      </div>
    </div>
  );
}
