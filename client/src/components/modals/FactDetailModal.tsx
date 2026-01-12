import { X } from 'lucide-react';
import { tokens } from '@/lib/colors';
import type { Fact } from '@shared/schema';

interface FactDetailModalProps {
  fact: Fact | null;
  onClose: () => void;
}

export function FactDetailModal({ fact, onClose }: FactDetailModalProps) {
  if (!fact) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[2000]" style={{ backgroundColor: tokens.overlay }}>
      <div className="p-6 w-[90%] max-w-[600px] max-h-[80vh] overflow-auto rounded-xl bg-card">
        <div className="flex justify-between items-center mb-4">
          <h3 className="m-0 text-lg font-semibold">Original Fact Text</h3>
          <button onClick={onClose} className="bg-transparent border-none cursor-pointer">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 whitespace-pre-wrap text-sm leading-relaxed">
          {fact.fact}
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
