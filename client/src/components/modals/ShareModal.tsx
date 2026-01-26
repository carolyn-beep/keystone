import { useState } from 'react';
import { X, Users, Loader2, Copy, Check, Eye, Edit3, Trash2 } from 'lucide-react';
import { tokens } from '@/lib/colors';
import { useShares } from '@/hooks/useShares';
import { toast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ShareModalProps {
  show: boolean;
  onClose: () => void;
  slug: string;
  isOwner: boolean;
}

export function ShareModal({ show, onClose, slug, isOwner }: ShareModalProps) {
  const [identifier, setIdentifier] = useState('');
  const [permission, setPermission] = useState<'viewer' | 'editor'>('viewer');
  const [pendingPermission, setPendingPermission] = useState<'viewer' | 'editor'>('viewer');
  const [copiedToken, setCopiedToken] = useState(false);

  const {
    shares,
    isLoading,
    createShare,
    isCreating,
    updatePermission,
    isUpdating,
    deleteShare,
    isDeleting,
    getOrCreateToken,
    isCreatingToken,
  } = useShares(slug, show);

  // Derive displayed permission: use token permission if exists, otherwise pending selection
  const displayedPermission = shares?.tokenShare?.permission ?? pendingPermission;

  if (!show) return null;

  const handleAddUser = async () => {
    if (!identifier.trim()) {
      toast({
        title: 'Invalid input',
        description: 'Please enter an email or username.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createShare({ identifier: identifier.trim(), permission });
      setIdentifier('');
      setPermission('viewer');
    } catch (error) {
      // Error handled in hook
    }
  };

  const handleCopyToken = () => {
    if (!shares?.tokenShare) return;
    const shareUrl = `${window.location.origin}/grading/${slug}?share=${shares.tokenShare.token}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
    toast({
      title: 'Link copied',
      description: 'Share link copied to clipboard.',
    });
  };

  const handleGenerateLink = async () => {
    try {
      await getOrCreateToken(displayedPermission);
    } catch (error) {
      // Error handled in hook
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[1000]"
      style={{ backgroundColor: tokens.overlay }}
    >
      <div
        className="p-8 w-[95%] max-w-[600px] max-h-[90vh] overflow-auto rounded-xl bg-card"
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold m-0 text-primary flex items-center gap-2">
            <Users size={20} />
            Share Brainlift
          </h2>
          <button
            onClick={onClose}
            className="bg-transparent border-none cursor-pointer p-1"
          >
            <X size={20} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : (
          <>
            {/* Collaborators List */}
            {shares && shares.userShares.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold mb-3 text-foreground">People with access</h3>
                <div className="flex flex-col gap-2">
                  {shares.userShares.map((share) => (
                    <div
                      key={share.id}
                      className="flex items-center justify-between p-3 rounded-lg"
                      style={{ backgroundColor: tokens.surfaceAlt }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-foreground truncate">
                          {share.userName}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {share.userEmail}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Select
                          value={share.permission}
                          onValueChange={(value: 'viewer' | 'editor') =>
                            updatePermission({
                              shareId: share.id,
                              permission: value
                            })
                          }
                          disabled={isUpdating}
                        >
                          <SelectTrigger className="w-[100px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">Viewer</SelectItem>
                            <SelectItem value="editor">Editor</SelectItem>
                          </SelectContent>
                        </Select>
                        <button
                          onClick={() => deleteShare(share.id)}
                          disabled={isDeleting}
                          className="p-1.5 bg-transparent border-none cursor-pointer rounded hover:bg-red-100 dark:hover:bg-red-900/20"
                          title="Remove access"
                        >
                          <Trash2 size={16} style={{ color: tokens.danger }} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add People Section */}
            {isOwner && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold mb-3 text-foreground">Add people</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && identifier.trim()) {
                        handleAddUser();
                      }
                    }}
                    placeholder="Email or username"
                    className="flex-1 px-3 py-2.5 rounded-md text-sm"
                    style={{ border: `1px solid ${tokens.border}` }}
                  />
                  <Select value={permission} onValueChange={(value: 'viewer' | 'editor') => setPermission(value)}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                    </SelectContent>
                  </Select>
                  <button
                    onClick={handleAddUser}
                    disabled={isCreating || !identifier.trim()}
                    className="px-4 py-2.5 rounded-md border-none text-sm font-medium"
                    style={{
                      backgroundColor: tokens.primary,
                      color: tokens.surface,
                      cursor: isCreating || !identifier.trim() ? 'not-allowed' : 'pointer',
                      opacity: isCreating || !identifier.trim() ? 0.5 : 1,
                    }}
                  >
                    {isCreating ? <Loader2 size={16} className="animate-spin" /> : 'Add'}
                  </button>
                </div>
              </div>
            )}

            {/* Share Link Section */}
            {isOwner && (
              <div>
                <h3 className="text-sm font-semibold mb-3 text-foreground">Share link</h3>
                <div className="flex gap-2">
                  {/* Link input or placeholder */}
                  <input
                    type="text"
                    value={shares?.tokenShare ? `${window.location.origin}/grading/${slug}?share=${shares.tokenShare.token}` : 'Generate a link to share...'}
                    readOnly
                    className="flex-1 px-3 py-2.5 rounded-md text-sm"
                    style={{
                      border: `1px solid ${tokens.border}`,
                      backgroundColor: shares?.tokenShare ? tokens.surface : tokens.surfaceAlt,
                      color: shares?.tokenShare ? tokens.textPrimary : tokens.textSecondary,
                      fontFamily: shares?.tokenShare ? 'monospace' : 'inherit',
                    }}
                    onClick={(e) => shares?.tokenShare && (e.target as HTMLInputElement).select()}
                  />

                  {/* Permission dropdown */}
                  <Select
                    value={displayedPermission}
                    onValueChange={(value: 'viewer' | 'editor') => {
                      setPendingPermission(value);
                      if (shares?.tokenShare && shares.tokenShare.permission !== value) {
                        // Token exists, update it immediately
                        getOrCreateToken(value);
                      }
                    }}
                    disabled={isCreatingToken}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Action button */}
                  <button
                    onClick={shares?.tokenShare ? handleCopyToken : handleGenerateLink}
                    disabled={isCreatingToken}
                    className="px-4 py-2.5 rounded-md border-none text-sm font-medium flex items-center gap-2"
                    style={{
                      backgroundColor: copiedToken ? tokens.success : tokens.primary,
                      color: tokens.surface,
                      cursor: isCreatingToken ? 'wait' : 'pointer',
                      opacity: isCreatingToken ? 0.7 : 1,
                    }}
                  >
                    {isCreatingToken ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : copiedToken ? (
                      <>
                        <Check size={16} />
                        Copied
                      </>
                    ) : shares?.tokenShare ? (
                      <>
                        <Copy size={16} />
                        Copy
                      </>
                    ) : (
                      'Create'
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {shares?.tokenShare
                    ? 'Anyone with this link can access this brainlift. Change permission to update access level.'
                    : 'Select permission level and create a shareable link.'}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
