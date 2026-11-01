import { Upload } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="text-center py-[60px] px-6 bg-[#F9FAFB] rounded-xl border-2 border-dashed border-[#E5E7EB]">
      <Upload size={48} className="mb-4 mx-auto text-muted-foreground" />
      <h3 className="text-lg font-semibold text-primary m-0 mb-2">No Keystone Documents yet</h3>
      <p className="text-sm text-muted-foreground m-0 mb-5">
        Click "Import Document" to upload your first one.
      </p>
    </div>
  );
}
