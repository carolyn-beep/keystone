import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface SelectionChip {
  id: string;
  text: string;
  action?: string; // "Set as DOK1", "Set as DOK2", or undefined
}

interface SelectionChipsContextValue {
  chips: SelectionChip[];
  addChip: (text: string, action?: string) => void;
  removeChip: (id: string) => void;
  clearChips: () => void;
}

const SelectionChipsContext = createContext<SelectionChipsContextValue | null>(null);

export function SelectionChipsProvider({ children }: { children: ReactNode }) {
  const [chips, setChips] = useState<SelectionChip[]>([]);

  const addChip = useCallback((text: string, action?: string) => {
    setChips((prev) => {
      // Deduplicate by text + action
      const exists = prev.some((c) => c.text === text && c.action === action);
      if (exists) return prev;
      return [...prev, { id: crypto.randomUUID(), text, action }];
    });
  }, []);

  const removeChip = useCallback((id: string) => {
    setChips((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearChips = useCallback(() => {
    setChips([]);
  }, []);

  return (
    <SelectionChipsContext.Provider value={{ chips, addChip, removeChip, clearChips }}>
      {children}
    </SelectionChipsContext.Provider>
  );
}

export function useSelectionChips(): SelectionChipsContextValue {
  const ctx = useContext(SelectionChipsContext);
  if (!ctx) throw new Error('useSelectionChips must be used within SelectionChipsProvider');
  return ctx;
}
