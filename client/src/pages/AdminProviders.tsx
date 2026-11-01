import { useMemo } from 'react';
import { ArrowLeft, ShieldAlert, Activity, AlertTriangle } from 'lucide-react';
import { useLocation } from 'wouter';
import { authClient } from '@/lib/auth-client';
import { useSidebarSlot } from '@/components/layout';
import { TactileButton } from '@/components/ui/tactile-button';
import { useProviderHealth } from '@/hooks/useProviderHealth';
import { LIBRARY_ROUTE_PATH } from '@/components/chat/chat-home-helpers';
import type { ProviderHealthSnapshot, ProviderFailoverEvent } from '@shared/provider-health-types';
import {
  formatFailoverReason,
  formatProviderLabel,
  resolveProviderHealthViewState,
} from './admin-providers-helpers';

function getStateBadge(state: ProviderHealthSnapshot['state']) {
  if (state === 'open') {
    return 'bg-warning/15 text-warning';
  }
  if (state === 'half-open') {
    return 'bg-primary/15 text-primary';
  }
  return 'bg-emerald-500/15 text-emerald-600';
}

function renderFailoverSummary(event: ProviderFailoverEvent) {
  const fromLabel = formatProviderLabel(event.failedProvider);
  const toLabel = formatProviderLabel(event.failoverProvider);
  return `${fromLabel} → ${toLabel}`;
}

export default function AdminProviders() {
  const [, setLocation] = useLocation();
  const { data: session, isPending } = authClient.useSession();
  const isAdmin = session?.user?.role === 'admin';
  const providerHealth = useProviderHealth({ enabled: !isPending && isAdmin });
  const sidebarSlotSpec = useMemo(
    () => ({ body: null, activeSection: 'providers' as const }),
    [],
  );
  useSidebarSlot(sidebarSlotSpec);

  const viewState = resolveProviderHealthViewState({
    isSessionPending: isPending,
    isAdmin: !!isAdmin,
    isLoading: providerHealth.isLoading,
    error: providerHealth.error,
  });

  if (viewState === 'loading') {
    return (
      <div className="min-h-screen bg-background px-4 py-16 sm:px-8">
        <div className="mx-auto flex max-w-[920px] flex-col items-center justify-center rounded-[28px] bg-card-elevated px-8 py-20 text-center shadow-card">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-6 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Loading session
          </p>
          <p className="mt-3 font-serif text-[15px] italic leading-[1.8] text-muted-foreground">
            Preparing the provider health surface.
          </p>
        </div>
      </div>
    );
  }

  if (viewState === 'denied') {
    return (
      <div className="min-h-screen bg-background px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-[920px] rounded-[28px] bg-card-elevated px-8 py-16 text-center shadow-card">
          <ShieldAlert className="mx-auto h-12 w-12 text-warning" />
          <p className="mt-6 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Admin surface
          </p>
          <h1 className="mt-4 font-serif text-[34px] leading-[1.2] text-foreground">
            Provider health is restricted to admins
          </h1>
          <p className="mx-auto mt-4 max-w-2xl font-serif text-[15px] italic leading-[1.9] text-muted-foreground">
            The route is protected, but this page still performs its own role check to avoid accidental exposure.
          </p>
          <div className="mt-8 flex justify-center">
            <TactileButton variant="raised" className="flex items-center gap-2" onClick={() => setLocation('/')}>
              <ArrowLeft size={16} />
              Return Home
            </TactileButton>
          </div>
        </div>
      </div>
    );
  }

  if (viewState === 'error') {
    return (
      <div className="min-h-screen bg-background px-4 py-16 sm:px-8">
        <div className="mx-auto max-w-[920px] rounded-[28px] bg-card-elevated px-8 py-16 text-center shadow-card">
          <AlertTriangle className="mx-auto h-12 w-12 text-warning" />
          <p className="mt-6 text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Provider health
          </p>
          <h1 className="mt-4 font-serif text-[34px] leading-[1.2] text-foreground">
            Provider health data is unavailable
          </h1>
          <p className="mx-auto mt-4 max-w-2xl font-serif text-[15px] italic leading-[1.9] text-muted-foreground">
            We could not load the latest breaker states. Try again in a moment.
          </p>
          <div className="mt-8 flex justify-center">
            <TactileButton variant="raised" className="flex items-center gap-2" onClick={() => providerHealth.refetch()}>
              Retry
            </TactileButton>
          </div>
        </div>
      </div>
    );
  }

  const providers = providerHealth.data?.providers ?? [];
  const recentFailovers = providerHealth.data?.recentFailovers ?? [];
  const generatedAt = providerHealth.data?.generatedAt;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8 sm:py-10">
        <section className="relative overflow-hidden rounded-[32px] bg-card-elevated px-6 py-8 shadow-card sm:px-10 sm:py-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,110,143,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(149,58,52,0.12),transparent_32%)]" />
          <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <TactileButton variant="inset" className="flex items-center gap-2" onClick={() => setLocation(LIBRARY_ROUTE_PATH)}>
                  <ArrowLeft size={16} />
                  Library
                </TactileButton>
              </div>

              <h1 className="mt-8 max-w-4xl font-serif text-[42px] leading-[1.05] text-foreground sm:text-[56px]">
                Provider Health
              </h1>
              <p className="mt-5 max-w-3xl font-serif text-[16px] italic leading-[1.9] text-muted-foreground">
                Track breaker state, failover pressure, and the latest provider transitions without manual intervention.
              </p>
            </div>

            <div className="rounded-[18px] bg-card/95 px-4 py-4 shadow-card backdrop-blur-sm">
              <div className="flex items-center gap-3 py-2">
                <Activity className="h-4 w-4 text-primary" />
                <p className="m-0 font-serif text-[16px] leading-[1.25] text-foreground">
                  Snapshot
                </p>
              </div>
              <p className="mt-3 text-[11px] uppercase tracking-[0.3em] font-semibold text-muted-foreground">
                Updated
              </p>
              <p className="mt-2 font-serif text-[14px] text-foreground">
                {generatedAt ? new Date(generatedAt).toLocaleString() : 'Just now'}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-[11px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Providers
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {providers.map((provider) => (
              <div
                key={provider.provider}
                className="rounded-[18px] bg-card-elevated px-5 py-5 shadow-card"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-[18px] text-foreground">
                    {formatProviderLabel(provider.provider)}
                  </h3>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.25em] font-semibold ${getStateBadge(provider.state)}`}
                  >
                    {provider.state}
                  </span>
                </div>
                <p className="mt-4 text-[11px] uppercase tracking-[0.3em] font-semibold text-muted-foreground">
                  Failovers (24h)
                </p>
                <p className="mt-2 font-serif text-[24px] text-foreground">
                  {provider.failoversLast24h}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-[11px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
                Recent Failovers
              </h2>
              <p className="mt-2 font-serif text-[14px] italic text-muted-foreground">
                Latest 24-hour transitions. Scroll horizontally for more.
              </p>
            </div>
          </div>

          {recentFailovers.length === 0 ? (
            <div className="mt-4 rounded-[18px] border border-dashed border-border/70 bg-card-elevated px-5 py-6 text-center">
              <p className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
                No incidents
              </p>
              <p className="mt-3 font-serif text-[14px] italic text-muted-foreground">
                No failovers recorded in the last 24 hours.
              </p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto pb-3">
              <div className="grid w-max auto-cols-[minmax(260px,280px)] grid-flow-col grid-rows-3 gap-4">
                {recentFailovers.map((event) => (
                  <div
                    key={`${event.timestamp}-${event.caller}-${event.failedProvider}`}
                    className="rounded-[18px] bg-card-elevated px-5 py-5 shadow-card"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
                          {formatFailoverReason(event.reason)}
                        </p>
                        <p className="mt-2 font-serif text-[16px] text-foreground">
                          {renderFailoverSummary(event)}
                        </p>
                      </div>
                      <p className="max-w-[92px] text-right text-[11px] text-muted-foreground">
                        {new Date(event.timestamp).toLocaleString()}
                      </p>
                    </div>
                    <p className="mt-3 text-[12px] text-muted-foreground">
                      {event.caller}
                    </p>
                    <div className="mt-4 rounded-[14px] bg-card px-3 py-3 text-[11px] text-muted-foreground">
                      {event.originalModel} → {event.actualModel}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
