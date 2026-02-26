/**
 * Dev-only test page for Import Agent.
 * Route: /dev/import-agent (behind ProtectedRoute)
 *
 * Phase 1: Storage CRUD testing
 * Phase 2: Chat interface with streaming + persistence
 * Phase 3: Hierarchy init + extraction tool status
 * Phase 5: Gen UI tool cards + canvas panel
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { ImportAgentLayout } from '@/components/import-agent/ImportAgentLayout';

interface BrainliftOption {
  id: number;
  slug: string;
  title: string;
  importStatus: string | null;
}

interface StorageState {
  importStatus: string | null;
  hasHierarchy: boolean;
  conversation: {
    id: number;
    brainliftId: number;
    messages: unknown[];
    currentPhase: string;
    updatedAt: string;
  } | null;
  sources: Array<{
    id: number;
    url: string;
    name: string | null;
    category: string | null;
    status: string;
  }>;
  factsCount: number;
  dok2Count: number;
  dok3Count: number;
  dok3StatusBreakdown: Record<string, number>;
}

export default function DevImportAgentTest() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'storage'>('chat');
  const [createUrl, setCreateUrl] = useState('');
  const queryClient = useQueryClient();

  // Fetch user's brainlifts
  const brainliftsQuery = useQuery<BrainliftOption[]>({
    queryKey: ['dev-brainlifts'],
    queryFn: async () => {
      const res = await fetch('/api/brainlifts', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch brainlifts');
      const data = await res.json();
      return data.brainlifts.map((b: { id: number; slug: string; title: string; importStatus?: string }) => ({
        id: b.id,
        slug: b.slug,
        title: b.title,
        importStatus: b.importStatus ?? null,
      }));
    },
  });

  const selectedBrainlift = brainliftsQuery.data?.find(b => b.id === selectedId);

  // Fetch storage state for selected brainlift
  const storageQuery = useQuery<StorageState>({
    queryKey: ['dev-import-storage', selectedId],
    queryFn: async () => {
      const res = await fetch(`/dev/import-agent/test-storage/${selectedId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch storage state');
      const json = await res.json();
      return json.data;
    },
    enabled: !!selectedId,
  });

  // Clear conversation mutation
  const clearConversationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBrainlift) throw new Error('No brainlift selected');
      const res = await apiRequest('DELETE', `/api/brainlifts/${selectedBrainlift.slug}/import-agent/conversation`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dev-import-storage', selectedId] });
    },
  });

  // Create test data mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/dev/import-agent/test-storage', { brainliftId: selectedId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dev-import-storage', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['dev-brainlifts'] });
    },
  });

  // Clear all test data mutation
  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', `/dev/import-agent/test-storage/${selectedId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dev-import-storage', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['dev-brainlifts'] });
    },
  });

  // Create fresh brainlift from Workflowy URL
  const createFromUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest('POST', '/dev/import-agent/create-from-url', { url });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to create brainlift');
      return json.data as { id: number; slug: string; title: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dev-brainlifts'] });
      setSelectedId(data.id);
      setActiveTab('chat');
      setCreateUrl('');
    },
  });

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b p-4 flex flex-col gap-3 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-foreground">Import Agent Dev</h1>

          {/* Brainlift Selector */}
          <select
            className="flex-1 max-w-md p-2 rounded border bg-background text-foreground text-sm"
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">-- Choose a brainlift --</option>
            {brainliftsQuery.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} (ID: {b.id})
              </option>
            ))}
          </select>

          {/* Tab Switcher */}
          {selectedId && (
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              <button
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  activeTab === 'chat' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
                onClick={() => setActiveTab('chat')}
              >
                Chat
              </button>
              <button
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  activeTab === 'storage' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
                onClick={() => setActiveTab('storage')}
              >
                DB State
              </button>
            </div>
          )}

          {/* Actions */}
          {selectedId && selectedBrainlift && (
            <div className="flex gap-2">
              <button
                className="px-3 py-1.5 text-xs bg-destructive/10 text-destructive rounded font-medium hover:bg-destructive/20 disabled:opacity-50"
                onClick={() => clearConversationMutation.mutate()}
                disabled={clearConversationMutation.isPending}
              >
                Clear Chat
              </button>
              <button
                className="px-3 py-1.5 text-xs bg-muted text-muted-foreground rounded font-medium hover:bg-muted/80"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['dev-import-storage', selectedId] })}
              >
                Refresh DB
              </button>
            </div>
          )}
        </div>

        {/* Create from URL row */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">New from URL:</span>
          <input
            type="text"
            placeholder="Workflowy share URL"
            className="flex-1 max-w-md px-3 py-1.5 border rounded text-sm bg-background text-foreground"
            value={createUrl}
            onChange={(e) => setCreateUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && createUrl.trim()) {
                createFromUrlMutation.mutate(createUrl.trim());
              }
            }}
          />
          <button
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded font-medium disabled:opacity-50"
            onClick={() => createFromUrlMutation.mutate(createUrl.trim())}
            disabled={createFromUrlMutation.isPending || !createUrl.trim()}
          >
            {createFromUrlMutation.isPending ? 'Creating...' : 'Create'}
          </button>
          {createFromUrlMutation.isError && (
            <span className="text-xs text-destructive">{createFromUrlMutation.error.message}</span>
          )}
          {createFromUrlMutation.isSuccess && (
            <span className="text-xs text-success">Created: {createFromUrlMutation.data.title}</span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0">
        {!selectedId ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a brainlift to start testing
          </div>
        ) : activeTab === 'chat' && selectedBrainlift ? (
          <ImportAgentLayout key={selectedBrainlift.slug} slug={selectedBrainlift.slug} />
        ) : (
          <StorageInspector
            selectedId={selectedId}
            storageQuery={storageQuery}
            createMutation={createMutation}
            clearMutation={clearMutation}
          />
        )}
      </div>
    </div>
  );
}

function StorageInspector({
  selectedId,
  storageQuery,
  createMutation,
  clearMutation,
}: {
  selectedId: number;
  storageQuery: ReturnType<typeof useQuery<StorageState>>;
  createMutation: { mutate: () => void; isPending: boolean };
  clearMutation: { mutate: () => void; isPending: boolean };
}) {
  const [hierarchyUrl, setHierarchyUrl] = useState('');
  const [hierarchyResult, setHierarchyResult] = useState<{
    success: boolean;
    method?: string;
    stats?: Record<string, number>;
    error?: string;
  } | null>(null);
  const queryClient = useQueryClient();

  const initHierarchyMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {};
      if (hierarchyUrl.trim()) {
        body.url = hierarchyUrl.trim();
      }
      const res = await apiRequest('POST', `/dev/import-agent/init-hierarchy/${selectedId}`, body);
      return res.json();
    },
    onSuccess: (data) => {
      setHierarchyResult(data);
      queryClient.invalidateQueries({ queryKey: ['dev-import-storage', selectedId] });
    },
    onError: (err: Error) => {
      setHierarchyResult({ success: false, error: err.message });
    },
  });

  return (
    <div className="p-6 overflow-auto h-full">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium text-sm disabled:opacity-50"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create Test Data'}
          </button>
          <button
            className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg font-medium text-sm disabled:opacity-50"
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
          >
            {clearMutation.isPending ? 'Clearing...' : 'Clear All Test Data'}
          </button>
        </div>

        {storageQuery.isLoading && (
          <div className="text-muted-foreground animate-pulse">Loading...</div>
        )}

        {storageQuery.data && (
          <>
            {/* Import Status */}
            <div className="bg-card rounded-lg border p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2">Import Status</h2>
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                storageQuery.data.importStatus === 'agent_in_progress'
                  ? 'bg-warning/20 text-warning'
                  : storageQuery.data.importStatus === 'complete'
                    ? 'bg-success/20 text-success'
                    : 'bg-muted text-muted-foreground'
              }`}>
                {storageQuery.data.importStatus ?? 'pending'}
              </span>
            </div>

            {/* Hierarchy Status */}
            <div className="bg-card rounded-lg border p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2">Import Hierarchy</h2>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                    storageQuery.data.hasHierarchy
                      ? 'bg-success/20 text-success'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {storageQuery.data.hasHierarchy ? 'Populated' : 'Not set'}
                  </span>
                </div>

                {!storageQuery.data.hasHierarchy && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Initialize hierarchy from a Workflowy URL (for URL-imported brainlifts) or from stored HTML content.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Workflowy share URL (optional)"
                        className="flex-1 px-3 py-1.5 border rounded text-sm bg-background text-foreground"
                        value={hierarchyUrl}
                        onChange={(e) => setHierarchyUrl(e.target.value)}
                      />
                      <button
                        className="px-4 py-1.5 bg-primary text-primary-foreground rounded font-medium text-sm disabled:opacity-50 whitespace-nowrap"
                        onClick={() => initHierarchyMutation.mutate()}
                        disabled={initHierarchyMutation.isPending}
                      >
                        {initHierarchyMutation.isPending ? 'Initializing...' : 'Init Hierarchy'}
                      </button>
                    </div>
                  </div>
                )}

                {hierarchyResult && (
                  <div className={`p-3 rounded text-xs ${
                    hierarchyResult.success ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                  }`}>
                    {hierarchyResult.success ? (
                      <div className="space-y-1">
                        <div className="font-medium">Hierarchy initialized ({hierarchyResult.method})</div>
                        {hierarchyResult.stats && (
                          <div className="font-mono">
                            {Object.entries(hierarchyResult.stats).map(([key, val]) => (
                              <span key={key} className="mr-3">{key}: {val}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>{hierarchyResult.error}</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Conversation */}
            <div className="bg-card rounded-lg border p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2">Conversation</h2>
              {storageQuery.data.conversation ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Phase:</span>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      storageQuery.data.conversation.currentPhase === 'final' ? 'bg-success/20 text-success'
                        : storageQuery.data.conversation.currentPhase === 'init' ? 'bg-muted text-muted-foreground'
                          : 'bg-primary/15 text-primary'
                    }`}>
                      {storageQuery.data.conversation.currentPhase}
                    </span>
                  </div>
                  <div><span className="text-muted-foreground">Messages:</span> {Array.isArray(storageQuery.data.conversation.messages) ? storageQuery.data.conversation.messages.length : 0}</div>
                  <div><span className="text-muted-foreground">Updated:</span> {new Date(storageQuery.data.conversation.updatedAt).toLocaleString()}</div>
                  <details>
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground text-xs">Raw JSON</summary>
                    <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-48">
                      {JSON.stringify(storageQuery.data.conversation, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No conversation yet</p>
              )}
            </div>

            {/* Sources */}
            <div className="bg-card rounded-lg border p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2">
                Sources ({storageQuery.data.sources.length})
              </h2>
              {storageQuery.data.sources.length > 0 ? (
                <div className="space-y-2">
                  {storageQuery.data.sources.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 p-2 bg-muted/50 rounded text-sm">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        s.status === 'confirmed' ? 'bg-success/20 text-success'
                          : s.status === 'scratchpadded' ? 'bg-muted text-muted-foreground'
                            : 'bg-warning/20 text-warning'
                      }`}>
                        {s.status}
                      </span>
                      <span className="font-mono text-foreground truncate text-xs">{s.url}</span>
                      {s.name && <span className="text-muted-foreground text-xs">({s.name})</span>}
                      {s.category && <span className="text-muted-foreground text-xs">[{s.category}]</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No sources yet</p>
              )}
            </div>

            {/* DOK1 Facts */}
            <div className="bg-card rounded-lg border p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                DOK1 Facts
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary">
                  {storageQuery.data.factsCount}
                </span>
              </h2>
              {storageQuery.data.factsCount === 0 && (
                <p className="text-muted-foreground text-sm">No facts saved yet</p>
              )}
            </div>

            {/* DOK2 Summaries */}
            <div className="bg-card rounded-lg border p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                DOK2 Summaries
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary">
                  {storageQuery.data.dok2Count}
                </span>
              </h2>
              {storageQuery.data.dok2Count === 0 && (
                <p className="text-muted-foreground text-sm">No DOK2 summaries saved yet</p>
              )}
            </div>

            {/* DOK3 Insights */}
            <div className="bg-card rounded-lg border p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                DOK3 Insights
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary">
                  {storageQuery.data.dok3Count}
                </span>
              </h2>
              {storageQuery.data.dok3Count > 0 && Object.keys(storageQuery.data.dok3StatusBreakdown).length > 0 ? (
                <div className="flex flex-wrap gap-2 mt-1">
                  {Object.entries(storageQuery.data.dok3StatusBreakdown).map(([status, count]) => (
                    <span key={status} className={`px-2 py-0.5 rounded text-xs font-medium ${
                      status === 'graded' ? 'bg-success/20 text-success'
                        : status === 'linked' ? 'bg-info/20 text-info'
                          : status === 'scratchpadded' ? 'bg-muted text-muted-foreground'
                            : 'bg-warning/20 text-warning'
                    }`}>
                      {status}: {count}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No DOK3 insights saved yet</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
