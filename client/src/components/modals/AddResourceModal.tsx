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
    <div className="fixed inset-0 flex items-center justify-center z-[1000]" style={{ backgroundColor: tokens.overlay }}>
      <div
        className="p-4 sm:p-8 w-[95%] max-w-[500px] max-h-[90vh] overflow-auto rounded-xl bg-card"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold m-0 text-primary">
            <Plus size={20} className="mr-2 align-middle" />
            Add Resource
          </h2>
          <button
            data-testid="button-close-add-resource-modal"
            onClick={onClose}
            className="bg-transparent border-none cursor-pointer p-1"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="block mb-1.5 font-medium text-sm">Type</label>
            <select
              data-testid="select-resource-type"
              value={resource.type}
              onChange={(e) => setResource({ ...resource, type: e.target.value })}
              className="w-full px-3 py-2.5 rounded-md text-sm"
              style={{ border: `1px solid ${tokens.border}` }}
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
            <label className="block mb-1.5 font-medium text-sm">Title / Topic *</label>
            <input
              data-testid="input-resource-topic"
              type="text"
              value={resource.topic}
              onChange={(e) => setResource({ ...resource, topic: e.target.value })}
              placeholder="e.g., The Science of Reading"
              className="w-full px-3 py-2.5 rounded-md text-sm"
              style={{ border: `1px solid ${tokens.border}` }}
            />
          </div>

          <div>
            <label className="block mb-1.5 font-medium text-sm">Author *</label>
            <input
              data-testid="input-resource-author"
              type="text"
              value={resource.author}
              onChange={(e) => setResource({ ...resource, author: e.target.value })}
              placeholder="e.g., Emily Hanford"
              className="w-full px-3 py-2.5 rounded-md text-sm"
              style={{ border: `1px solid ${tokens.border}` }}
            />
          </div>

          <div>
            <label className="block mb-1.5 font-medium text-sm">URL *</label>
            <input
              data-testid="input-resource-url"
              type="url"
              value={resource.url}
              onChange={(e) => setResource({ ...resource, url: e.target.value })}
              placeholder="https://..."
              className="w-full px-3 py-2.5 rounded-md text-sm"
              style={{ border: `1px solid ${tokens.border}` }}
            />
          </div>

          <div>
            <label className="block mb-1.5 font-medium text-sm">Reading Time</label>
            <input
              data-testid="input-resource-time"
              type="text"
              value={resource.time}
              onChange={(e) => setResource({ ...resource, time: e.target.value })}
              placeholder="e.g., 15 min"
              className="w-full px-3 py-2.5 rounded-md text-sm"
              style={{ border: `1px solid ${tokens.border}` }}
            />
          </div>

          <div>
            <label className="block mb-1.5 font-medium text-sm">Description / Key Facts</label>
            <textarea
              data-testid="input-resource-facts"
              value={resource.facts}
              onChange={(e) => setResource({ ...resource, facts: e.target.value })}
              placeholder="Brief description or key points from this resource..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-md text-sm resize-y"
              style={{ border: `1px solid ${tokens.border}` }}
            />
          </div>
        </div>

        <button
          data-testid="button-submit-resource"
          onClick={handleSubmit}
          disabled={addResourceMutation.isPending}
          className="w-full mt-6 px-5 py-3.5 border-none rounded-lg text-[15px] font-semibold flex items-center justify-center gap-2"
          style={{
            backgroundColor: tokens.success,
            color: tokens.surface,
            cursor: addResourceMutation.isPending ? 'wait' : 'pointer',
            opacity: addResourceMutation.isPending ? 0.7 : 1,
          }}
        >
          {addResourceMutation.isPending ? (
            <>
              <Loader2 size={18} className="animate-spin" />
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
