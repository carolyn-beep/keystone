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
      zIndex: 2000,
    }}>
      <div className="p-6 w-[90%] max-w-[600px] max-h-[80vh] overflow-auto rounded-xl" style={{ backgroundColor: tokens.surface }}>
        <div className="flex justify-between items-center mb-4">
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Original Fact Text</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200" style={{ whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: 1.6 }}>
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
