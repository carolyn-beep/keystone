import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Plus, Loader2 } from 'lucide-react';
import { tokens } from '@/lib/colors';
import { queryClient, apiRequest } from '@/lib/queryClient';

interface ManualResource {
  type: string;
  topic: string;
  author: string;
  url: string;
  time: string;
  facts: string;
}

interface AddResourceModalProps {
  show: boolean;
  onClose: () => void;
  slug: string;
  onSuccess?: () => void;
}

const initialResource: ManualResource = {
  type: 'Article',
  author: '',
  topic: '',
  time: '10 min',
  facts: '',
  url: '',
};

export function AddResourceModal({
  show,
  onClose,
  slug,
  onSuccess,
}: AddResourceModalProps) {
  const [resource, setResource] = useState<ManualResource>(initialResource);

  const addResourceMutation = useMutation({
    mutationFn: async (resource: ManualResource) => {
      return apiRequest('POST', `/api/brainlifts/${slug}/reading-list`, resource);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brainlift', slug] });
      setResource(initialResource);
      onSuccess?.();
      onClose();
    }
  });

  if (!show) return null;

  const handleSubmit = () => {
    if (!resource.topic || !resource.author || !resource.url) {
      alert('Please fill in all required fields (Title, Author, URL)');
      return;
    }
    addResourceMutation.mutate(resource);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: tokens.overlay,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div
        className="p-4 sm:p-8 w-[95%] max-w-[500px] max-h-[90vh] overflow-auto rounded-xl"
        style={{ backgroundColor: tokens.surface }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: tokens.primary }}>
            <Plus size={20} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            Add Resource
          </h2>
          <button
            data-testid="button-close-add-resource-modal"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '14px' }}>Type</label>
            <select
              data-testid="select-resource-type"
              value={resource.type}
              onChange={(e) => setResource({ ...resource, type: e.target.value })}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: `1px solid ${tokens.border}`,
                fontSize: '14px',
              }}
            >
              <option value="Article">Article</option>
              <option value="Substack">Substack</option>
              <option value="Twitter">X Thread</option>
              <option value="Academic Paper">Academic Paper</option>
              <option value="Video">Video</option>
              <option value="Podcast">Podcast</option>
              <option value="Blog">Blog Post</option>
              <option value="Book">Book</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '14px' }}>Title / Topic *</label>
            <input
              data-testid="input-resource-topic"
              type="text"
              value={resource.topic}
              onChange={(e) => setResource({ ...resource, topic: e.target.value })}
              placeholder="e.g., The Science of Reading"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: `1px solid ${tokens.border}`,
                fontSize: '14px',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '14px' }}>Author *</label>
            <input
              data-testid="input-resource-author"
              type="text"
              value={resource.author}
              onChange={(e) => setResource({ ...resource, author: e.target.value })}
              placeholder="e.g., Emily Hanford"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: `1px solid ${tokens.border}`,
                fontSize: '14px',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '14px' }}>URL *</label>
            <input
              data-testid="input-resource-url"
              type="url"
              value={resource.url}
              onChange={(e) => setResource({ ...resource, url: e.target.value })}
              placeholder="https://..."
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: `1px solid ${tokens.border}`,
                fontSize: '14px',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '14px' }}>Reading Time</label>
            <input
              data-testid="input-resource-time"
              type="text"
              value={resource.time}
              onChange={(e) => setResource({ ...resource, time: e.target.value })}
              placeholder="e.g., 15 min"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: `1px solid ${tokens.border}`,
                fontSize: '14px',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '14px' }}>Description / Key Facts</label>
            <textarea
              data-testid="input-resource-facts"
              value={resource.facts}
              onChange={(e) => setResource({ ...resource, facts: e.target.value })}
              placeholder="Brief description or key points from this resource..."
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                border: `1px solid ${tokens.border}`,
                fontSize: '14px',
                resize: 'vertical',
              }}
            />
          </div>
        </div>

        <button
          data-testid="button-submit-resource"
          onClick={handleSubmit}
          disabled={addResourceMutation.isPending}
          style={{
            width: '100%',
            marginTop: '24px',
            padding: '14px 20px',
            backgroundColor: tokens.success,
            color: tokens.surface,
            border: 'none',
            borderRadius: '8px',
            cursor: addResourceMutation.isPending ? 'wait' : 'pointer',
            fontSize: '15px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            opacity: addResourceMutation.isPending ? 0.7 : 1,
          }}
        >
          {addResourceMutation.isPending ? (
            <>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
              Adding...
            </>
          ) : (
            <>
              <Plus size={18} />
              Add to Reading List
            </>
          )}
        </button>
      </div>
    </div>
  );
}
