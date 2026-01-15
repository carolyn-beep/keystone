import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { Link, useLocation, useSearch } from 'wouter';
import { Brainlift } from '@shared/schema';
import { queryClient } from '@/lib/queryClient';
import { authClient } from '@/lib/auth-client';
import { tokens } from '@/lib/colors';
import { Plus, X, Upload, FileText, Link as LinkIcon, File, Loader2, Check, Clock, AlertTriangle, Trash2, Shield, ChevronDown } from 'lucide-react';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';

type SourceType = 'pdf' | 'docx' | 'html' | 'workflowy' | 'googledocs' | 'text';

const tabs: { id: SourceType; label: string; icon: typeof FileText }[] = [
  { id: 'pdf', label: 'PDF', icon: FileText },
  { id: 'docx', label: 'Word', icon: File },
  { id: 'html', label: 'HTML', icon: FileText },
  { id: 'workflowy', label: 'Workflowy', icon: LinkIcon },
  { id: 'googledocs', label: 'Google Docs', icon: LinkIcon },
  { id: 'text', label: 'Paste Text', icon: FileText },
];

export default function Home() {
  const [, setLocation] = useLocation();
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<SourceType>('pdf');
  const [url, setUrl] = useState('');
  const [textContent, setTextContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [brainliftToDelete, setBrainliftToDelete] = useState<{ id: number; title: string } | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const prefetchRef = useRef<HTMLDivElement>(null);

  // Get session to check if user is admin
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === 'admin';

  // Admin view state from URL query param (?admin=true)
  const searchString = useSearch();
  const adminView = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get('admin') === 'true' && isAdmin;
  }, [searchString, isAdmin]);

  const setAdminView = useCallback((enabled: boolean) => {
    const params = new URLSearchParams(window.location.search);
    if (enabled) {
      params.set('admin', 'true');
    } else {
      params.delete('admin');
    }
    const newSearch = params.toString();
    const newUrl = newSearch ? `?${newSearch}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  interface PaginatedResponse {
    brainlifts: Brainlift[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<PaginatedResponse>({
    queryKey: ['/api/brainlifts', adminView],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams();
      if (adminView) params.set('all', 'true');
      params.set('page', pageParam.toString());
      const res = await fetch(`/api/brainlifts?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
    initialPageParam: 1,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Flatten all pages into single array
  const brainlifts = data?.pages.flatMap(page => page.brainlifts) ?? [];
  const totalCount = data?.pages[0]?.pagination.total ?? 0;
  const loadedCount = brainlifts.length;
  const remainingCount = totalCount - loadedCount;

  // Prefetch next page when user approaches bottom (Intersection Observer)
  useEffect(() => {
    if (!prefetchRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          // Prefetch silently - data will be ready when they click Load More
          fetchNextPage();
        }
      },
      { rootMargin: '200px' } // Trigger 200px before element is visible
    );

    observer.observe(prefetchRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Reset infinite query when toggling admin view
  const handleAdminViewToggle = () => {
    setAdminView(!adminView);
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('sourceType', activeTab);

      if (activeTab === 'pdf' || activeTab === 'docx' || activeTab === 'html') {
        if (!selectedFile) throw new Error('Please select a file');
        formData.append('file', selectedFile);
      } else if (activeTab === 'workflowy' || activeTab === 'googledocs') {
        if (!url.trim()) throw new Error('Please enter a URL');
        formData.append('url', url);
      } else if (activeTab === 'text') {
        if (!textContent.trim()) throw new Error('Please enter some content');
        formData.append('content', textContent);
      }

      const res = await fetch('/api/brainlifts/import', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        let errorMessage = 'Import failed';
        try {
          const data = await res.json();
          errorMessage = data.message || 'Import failed';
        } catch {
          errorMessage = `Server error: ${res.status} ${res.statusText}`;
        }
        throw new Error(errorMessage);
      }

      return res.json();
    },
    onSuccess: (data: Brainlift) => {
      queryClient.invalidateQueries({ queryKey: ['brainlifts'] });
      closeModal();
      if (data?.slug) {
        setLocation(`/grading/${data.slug}`);
      }
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to import');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/brainlifts/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Delete failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brainlifts'] });
      setDeleteModalOpen(false);
      setBrainliftToDelete(null);
    },
  });

  // Author editing state
  const [editingAuthorSlug, setEditingAuthorSlug] = useState<string | null>(null);
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
      setEditingAuthorSlug(null);
      setAuthorInput('');
    },
  });

  const handleAuthorClick = (e: React.MouseEvent, slug: string, currentAuthor: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingAuthorSlug(slug);
    setAuthorInput(currentAuthor || '');
  };

  const handleAuthorSubmit = (slug: string) => {
    if (authorInput.trim()) {
      updateAuthorMutation.mutate({ slug, author: authorInput.trim() });
    } else {
      setEditingAuthorSlug(null);
    }
  };

  const handleDelete = (e: React.MouseEvent, brainlift: { id: number; title: string }) => {
    e.preventDefault();
    e.stopPropagation();
    setBrainliftToDelete(brainlift);
    setDeleteModalOpen(true);
  };

  const confirmDelete = () => {
    if (brainliftToDelete) {
      deleteMutation.mutate(brainliftToDelete.id);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setActiveTab('pdf');
    setUrl('');
    setTextContent('');
    setSelectedFile(null);
    setError('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError('');
    }
  };

  const handleSubmit = () => {
    setError('');
    importMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-background font-['Inter',-apple-system,sans-serif]">
      {/* Header - surface bg with border */}
      <header
        className="flex justify-between items-center flex-wrap gap-3 px-4 py-4 sm:px-8 md:px-12 bg-card border-b border-border"
      >
        <div>
          <h1 className="text-[28px] font-bold text-foreground m-0">DOK1 GRADING</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Grade and manage your educational brainlifts
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Admin View Toggle - Only visible to admins */}
          {isAdmin && (
            <button
              onClick={handleAdminViewToggle}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150"
              style={{
                backgroundColor: adminView ? tokens.primarySoft : 'transparent',
                border: `1px solid ${adminView ? tokens.primary : tokens.border}`,
                color: adminView ? tokens.primary : tokens.textSecondary,
              }}
              onMouseEnter={(e) => {
                if (!adminView) {
                  e.currentTarget.style.borderColor = tokens.primary;
                  e.currentTarget.style.color = tokens.primary;
                }
              }}
              onMouseLeave={(e) => {
                if (!adminView) {
                  e.currentTarget.style.borderColor = tokens.border;
                  e.currentTarget.style.color = tokens.textSecondary;
                }
              }}
            >
              <Shield size={16} />
              Admin View
              <span
                className="relative inline-flex items-center w-9 h-5 rounded-full transition-colors duration-200"
                style={{
                  backgroundColor: adminView ? tokens.primary : tokens.border,
                }}
              >
                <span
                  className="absolute w-4 h-4 bg-white rounded-full shadow transition-transform duration-200"
                  style={{
                    transform: adminView ? 'translateX(18px)' : 'translateX(2px)',
                  }}
                />
              </span>
            </button>
          )}

          <button
            data-testid="button-add-brainlift"
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground border-none rounded-lg px-5 py-2.5 text-sm font-medium cursor-pointer transition-colors duration-150"
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = tokens.primaryHover}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = tokens.primary}
          >
            <Plus size={18} />
            Add Brainlift
          </button>
        </div>
      </header>

      {/* Thin primary indicator line */}
      <div className="h-0.5 bg-primary" />

      <main className="px-4 sm:px-6 md:px-8 py-4 max-w-[1200px] mx-auto">
        {isLoading ? (
          <div className="flex justify-center p-10">
            <Loader2 size={32} className="animate-spin text-muted-foreground" />
          </div>
        ) : brainlifts.length === 0 ? (
          <div className="text-center py-[60px] px-6 bg-[#F9FAFB] rounded-xl border-2 border-dashed border-[#E5E7EB]">
            <Upload size={48} className="mb-4 mx-auto text-muted-foreground" />
            <h3 className="text-lg font-semibold text-primary m-0 mb-2">No brainlifts yet</h3>
            <p className="text-sm text-muted-foreground m-0 mb-5">
              Click "Add Brainlift" to upload your first one.
            </p>
          </div>
        ) : (
          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
            {brainlifts.map((data) => {
              const isNotGradeable = data.classification === 'not_brainlift';
              const summary = data.summary || { meanScore: '0', totalFacts: 0, score5Count: 0, contradictionCount: 0 };
              const meanScore = parseFloat(summary.meanScore || '0');
              const hasContradictions = (summary.contradictionCount || 0) > 0;
              const authorInitials = data.author 
                ? data.author.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
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
                  key={data.slug}
                  href={`/grading/${data.slug}${adminView ? '?admin=true' : ''}`}
                  data-testid={`card-brainlift-${data.slug}`}
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
                      data-testid={`button-delete-${data.id}`}
                      onClick={(e) => handleDelete(e, { id: data.id, title: data.title })}
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
                      {data.title}
                    </h3>
                    <p className="text-sm text-[#6B7280] m-0 leading-normal overflow-hidden line-clamp-2">
                      {data.description}
                    </p>
                  </div>
                  
                  {/* Author & Date */}
                  <div className="flex items-center gap-3 mb-4 text-[13px] text-[#6B7280]">
                    <div
                      className="flex items-center gap-1.5"
                      style={{
                        cursor: editingAuthorSlug === data.slug ? 'text' : 'pointer',
                      }}
                      onClick={(e) => {
                        if (editingAuthorSlug !== data.slug) {
                          handleAuthorClick(e, data.slug, data.author);
                        }
                      }}
                      title={editingAuthorSlug === data.slug ? undefined : "Click to set owner name"}
                    >
                      {/* Avatar circle - always visible */}
                      <span className="w-6 h-6 rounded-full bg-[#E5E7EB] flex items-center justify-center text-[11px] font-semibold text-[#6B7280] shrink-0">
                        {authorInitials}
                      </span>

                      {/* Name or input */}
                      {editingAuthorSlug === data.slug ? (
                        <input
                          type="text"
                          value={authorInput}
                          onChange={(e) => setAuthorInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAuthorSubmit(data.slug);
                            if (e.key === 'Escape') setEditingAuthorSlug(null);
                          }}
                          onBlur={() => handleAuthorSubmit(data.slug)}
                          autoFocus
                          placeholder="Enter owner name..."
                          className="border-0 border-b border-[#D1D5DB] bg-transparent py-0.5 px-0 text-[13px] w-[130px] outline-none text-[#374151]"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          className="owner-name-hover transition-all duration-150"
                          style={{
                            color: data.author ? '#6B7280' : '#9CA3AF',
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
                      {summary.contradictionCount || 0} {hasContradictions ? 'contradictions' : 'contradictions'}
                    </span>

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
            })}
          </div>

          {/* Prefetch sentinel - triggers prefetch 200px before visible */}
          <div ref={prefetchRef} className="h-1" />

          {/* Load More Button */}
          {hasNextPage && (
            <div className="flex justify-center mt-8">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-all duration-150"
                style={{
                  backgroundColor: isFetchingNextPage ? tokens.surfaceAlt : 'transparent',
                  border: `1px solid ${tokens.border}`,
                  color: tokens.textSecondary,
                  cursor: isFetchingNextPage ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!isFetchingNextPage) {
                    e.currentTarget.style.borderColor = tokens.primary;
                    e.currentTarget.style.color = tokens.primary;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isFetchingNextPage) {
                    e.currentTarget.style.borderColor = tokens.border;
                    e.currentTarget.style.color = tokens.textSecondary;
                  }
                }}
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <ChevronDown size={16} />
                    Load More ({remainingCount} remaining)
                  </>
                )}
              </button>
            </div>
          )}

          {/* End of list indicator */}
          {!hasNextPage && brainlifts.length > 0 && (
            <p className="text-center text-muted-foreground text-sm mt-8">
              Showing all {totalCount} brainlifts
            </p>
          )}
          </>
        )}
      </main>

      {showModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-[1000] p-5"
          style={{ backgroundColor: tokens.overlay }}
          onClick={closeModal}
        >
          <div
            className="p-4 sm:p-6 w-full max-w-[600px] max-h-[90vh] overflow-auto rounded-xl bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-xl font-semibold text-foreground m-0">
                Add New Brainlift
              </h2>
              <button
                data-testid="button-close-modal"
                onClick={closeModal}
                className="bg-transparent border-none cursor-pointer text-muted-foreground"
              >
                <X size={24} />
              </button>
            </div>

            <p className="text-muted-foreground text-sm mb-5">
              Add New Brainlift to Grade DOK1 facts and create a curated reading list.
            </p>

            {/* Secondary/ghost tabs */}
            <div className="flex gap-1 mb-5 flex-wrap">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  data-testid={`tab-${tab.id}`}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setError('');
                    setSelectedFile(null);
                    setUrl('');
                    setTextContent('');
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md text-[13px] font-medium cursor-pointer transition-all duration-150"
                  style={{
                    border: `1px solid ${activeTab === tab.id ? tokens.primary : tokens.border}`,
                    backgroundColor: activeTab === tab.id ? tokens.primarySoft : 'transparent',
                    color: activeTab === tab.id ? tokens.primary : tokens.textSecondary,
                  }}
                >
                  <tab.icon size={14} />
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="min-h-[150px]">
              {(activeTab === 'pdf' || activeTab === 'docx' || activeTab === 'html') && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={activeTab === 'pdf' ? '.pdf' : activeTab === 'docx' ? '.docx,.doc' : '.html,.htm'}
                    onChange={handleFileSelect}
                    className="hidden"
                    data-testid="input-file"
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed rounded-lg py-10 px-5 text-center cursor-pointer"
                    style={{
                      borderColor: tokens.border,
                      backgroundColor: selectedFile ? tokens.surfaceAlt : 'transparent',
                    }}
                  >
                    {selectedFile ? (
                      <>
                        <File size={32} color={tokens.secondary} className="mb-2 mx-auto" />
                        <p className="m-0 text-foreground font-medium">{selectedFile.name}</p>
                        <p className="mt-1 mb-0 text-muted-foreground text-[13px]">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </>
                    ) : (
                      <>
                        <Upload size={32} color={tokens.textMuted} className="mb-2 mx-auto" />
                        <p className="m-0 text-muted-foreground">
                          Click to upload {activeTab === 'pdf' ? 'a PDF' : activeTab === 'docx' ? 'a Word' : 'an HTML'} file
                        </p>
                        <p className="mt-1 mb-0 text-muted-foreground text-[13px]">
                          Max file size: 10MB
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {(activeTab === 'workflowy' || activeTab === 'googledocs') && (
                <div>
                  <label className="block mb-2 text-foreground text-sm font-medium">
                    {activeTab === 'workflowy' ? 'Workflowy Share Link' : 'Google Docs URL'}
                  </label>
                  <input
                    type="url"
                    data-testid="input-url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder={activeTab === 'workflowy' ? 'https://workflowy.com/#/...' : 'https://docs.google.com/document/d/...'}
                    className="w-full p-3 rounded-lg border text-sm box-border"
                    style={{ borderColor: tokens.border }}
                  />
                  <p className="mt-2 text-muted-foreground text-[13px]">
                    {activeTab === 'workflowy'
                      ? 'Enter a Workflowy URL (e.g., https://workflowy.com/#/abc123) or node ID. Uses your connected Workflowy account.'
                      : 'Make sure your Google Doc has link sharing enabled (anyone with the link can view).'}
                  </p>
                </div>
              )}

              {activeTab === 'text' && (
                <div>
                  <label className="block mb-2 text-foreground text-sm font-medium">
                    Paste your content
                  </label>
                  <textarea
                    data-testid="input-text"
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder="Paste your educational content here. Include facts, claims, and any source references..."
                    className="w-full h-[200px] p-3 rounded-lg border text-sm resize-y box-border font-[inherit]"
                    style={{ borderColor: tokens.border }}
                  />
                </div>
              )}
            </div>

            {error && (
              <p className="text-destructive text-sm mt-3">
                {error}
              </p>
            )}

            <div className="flex gap-3 mt-5 justify-end">
              {/* Ghost button */}
              <button
                data-testid="button-cancel"
                onClick={closeModal}
                disabled={importMutation.isPending}
                className="px-5 py-2.5 rounded-lg border bg-transparent text-muted-foreground text-sm"
                style={{
                  borderColor: tokens.border,
                  cursor: importMutation.isPending ? 'not-allowed' : 'pointer',
                  opacity: importMutation.isPending ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              {/* Primary button */}
              <button
                data-testid="button-submit-import"
                onClick={handleSubmit}
                disabled={importMutation.isPending}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg border-none text-primary-foreground text-sm font-medium"
                style={{
                  backgroundColor: importMutation.isPending ? tokens.textMuted : tokens.primary,
                  cursor: importMutation.isPending ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (!importMutation.isPending) {
                    e.currentTarget.style.backgroundColor = tokens.primaryHover;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!importMutation.isPending) {
                    e.currentTarget.style.backgroundColor = tokens.primary;
                  }
                }}
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  'Import & Analyze'
                )}
              </button>
            </div>

            {importMutation.isPending && (
              <p className="text-center text-muted-foreground text-[13px] mt-4">
                AI is analyzing your content. This may take 30-60 seconds...
              </p>
            )}
          </div>
        </div>
      )}

      <ConfirmationModal
        open={deleteModalOpen}
        onOpenChange={(open) => {
          setDeleteModalOpen(open);
          if (!open) setBrainliftToDelete(null);
        }}
        title="Delete Brainlift"
        description={`Are you sure you want to delete "${brainliftToDelete?.title || 'this brainlift'}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        variant="destructive"
        isLoading={deleteMutation.isPending}
      />

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
