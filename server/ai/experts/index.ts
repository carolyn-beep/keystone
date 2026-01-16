// Re-export public API for backward compatibility

// Types
export type {
  ExpertExtractionOutput,
  ReadingListItem,
  ExtractionInput,
  ExpertProfile,
  ParserType,
  DocumentExtractionResult,
  FormatDiagnostic,
  FormatDiagnosticsResult,
  ExtractedExpert,
  InsertExpert,
} from './types';

export { expertExtractionSchema } from './types';

// Main extraction and ranking
export { extractAndRankExperts, cleanupExpertNames } from './ranker';

// Parsing utilities
export {
  findExpertsSection,
  parseH2HeaderFormat,
  parseNumberedFormat,
  extractExpertsFromDocumentWithMetadata,
  extractExpertsFromDocument,
} from './parsers';

// Extraction utilities
export {
  extractTwitterHandle,
  extractExpertsFromFactSources,
  sanitizeName,
  countExpertMentions,
} from './extractors';

// Profiling utilities
export { buildExpertProfiles, computeImpactScore } from './profiler';

// Diagnostics
export { diagnoseExpertFormat } from './diagnostics';
