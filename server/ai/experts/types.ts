import { z } from 'zod';
import type { Fact, InsertExpert } from '@shared/schema';

export const expertExtractionSchema = z.object({
  experts: z.array(z.object({
    name: z.string(),
    rankScore: z.number().min(1).max(10),
    rationale: z.string(),
    source: z.enum(['listed', 'verification', 'cited']),
    twitterHandle: z.string().nullable(),
  })),
});

export type ExpertExtractionOutput = z.infer<typeof expertExtractionSchema>;

export const expertRerankSchema = z.object({
  experts: z.array(z.object({
    expertId: z.number().int().positive(),
    rankScore: z.number().min(1).max(10).nullable(),
    rationale: z.string().nullable(),
  })),
});

export type ExpertRerankOutput = z.infer<typeof expertRerankSchema>;

export interface ExtractionInput {
  brainliftId: number;
  title: string;
  description: string;
  author: string | null;
  facts: Fact[];
  originalContent?: string;
}

export interface ExpertProfile {
  name: string;
  twitterHandle: string | null;
  description: string;
  factCitations: number;
  noteCitations: number;
  sourceCitations: number;
  isInDok1Section: boolean;
  score5FactCitations: number;
}

export type ParserType = 'h2_header' | 'numbered' | 'bullet_fallback' | 'none';

export interface DocumentExtractionResult {
  experts: ExtractedExpert[];
  parserUsed: ParserType;
  expertsSectionFound: boolean;
  expertsSectionLength: number | null;
}

export interface FormatDiagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  details?: string;
  affectedExperts?: string[];
}

export interface FormatDiagnosticsResult {
  isValid: boolean;
  diagnostics: FormatDiagnostic[];
  summary: {
    expertsFound: number;
    expertsWithStructuredFields: number;
    expertsWithSocialLinks: number;
    hasRequiredFields: boolean;
  };
}

export interface ExtractedExpert {
  name: string;
  twitterHandle: string | null;
  description: string;
  who: string | null;
  why: string | null;
  focus: string | null;
  where: string | null;
}

export { InsertExpert };
