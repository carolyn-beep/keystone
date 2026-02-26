import { createContext, useContext } from 'react';

export interface ImportAgentContextValue {
  startGrading: () => void;
}

const ImportAgentContext = createContext<ImportAgentContextValue | null>(null);

export const ImportAgentProvider = ImportAgentContext.Provider;

export function useImportAgentContext(): ImportAgentContextValue {
  const ctx = useContext(ImportAgentContext);
  if (!ctx) {
    throw new Error('useImportAgentContext must be used within ImportAgentProvider');
  }
  return ctx;
}
