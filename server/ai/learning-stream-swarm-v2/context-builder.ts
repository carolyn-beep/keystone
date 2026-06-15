import type { RunSpec } from '@shared/research-stream';
import { storage } from '../../storage';

const TOTAL_CONTEXT_CHAR_BUDGET = 32_000;
const SOURCE_TITLE_CHAR_BUDGET = 200;
const NOTE_CHAR_BUDGET = 500;
const SPOV_BODY_CHAR_BUDGET = 300;
const AUTHORING_SOURCE_SAMPLE_SIZE = 5;
const AUTHORING_NOTE_SAMPLE_SIZE = 5;
const MAX_AUTHORING_FACTS = 15;
const MAX_AUTHORING_EXPERTS = 10;
const MAX_AUTHORING_SPOVS = 10;

export interface BrainliftDigest {
  id: number;
  title: string;
  displayPurpose: string | null;
  /** Full composed topic sentence from the onboarding wizard ("X, specifically focusing on Y, in order to Z"). */
  onboardingTopic: string | null;
  /** In/Out scope phrases from the onboarding wizard; empty = no scope context. */
  inScope: string[];
  outOfScope: string[];
  facts: Array<{ id: number; fact: string; category: string; score: number }>;
  experts: Array<{ id: number; name: string; twitterHandle: string | null }>;
  spovExcerpts: Array<{ id: number; title: string; body: string }>;
}

export interface SecondBrainDigest {
  totalSources: number;
  totalNotes: number;
  categories: Array<{ id: number; name: string; sourceCount: number; noteCount: number }>;
  sources: Array<{ id: number; title: string; url: string; author: string; categoryName: string | null }>;
  notes: Array<{
    id: number;
    content: string;
    sourceTitle: string | null;
    categoryName: string | null;
    createdAt: string;
  }>;
}

export interface SwarmContext {
  phase: 'research' | 'authoring';
  brainlift: BrainliftDigest;
  secondBrain: SecondBrainDigest;
  topExperts: Array<{ id: number; name: string; twitterHandle: string | null; rankScore: number | null }>;
  existingUrls: string[];
  renderedDigest: string;
  digestCharCount: number;
}

type LearningStreamContext = Awaited<ReturnType<typeof storage.getLearningStreamContext>>;
type NonNullLearningStreamContext = NonNullable<LearningStreamContext>;
type SourceRow = Awaited<ReturnType<typeof storage.getSourcesByBrainlift>>[number];
type NoteRow = Awaited<ReturnType<typeof storage.getNotesByBrainlift>>[number];
type CategoryRow = Awaited<ReturnType<typeof storage.listCategories>>[number] & { noteCount?: number };
type ExpertRow = Awaited<ReturnType<typeof storage.getExpertsByBrainliftId>>[number];

function normalizeTwitterHandle(handle: string | null | undefined): string | null {
  if (!handle) return null;
  return handle.startsWith('@') ? handle.slice(1) : handle;
}

function clampText(value: string, budget: number): string {
  return truncateToBudget(value.trim(), budget);
}

export function truncateToBudget(text: string, charBudget: number): string {
  if (charBudget <= 0) return '';
  if (text.length <= charBudget) return text;
  if (charBudget <= 3) return '.'.repeat(charBudget);
  return `${text.slice(0, charBudget - 3)}...`;
}

function appendBudgetedLine(lines: string[], line: string, budget: number): boolean {
  const candidate = [...lines, line].join('\n');
  if (candidate.length <= budget) {
    lines.push(line);
    return true;
  }
  return false;
}

function renderSource(source: SecondBrainDigest['sources'][number]): string {
  const title = clampText(source.title, SOURCE_TITLE_CHAR_BUDGET);
  return `- ${title} | ${source.author || 'Unknown author'} | ${source.categoryName || 'Uncategorized'} | ${source.url}`;
}

function renderNote(note: SecondBrainDigest['notes'][number]): string {
  const source = note.sourceTitle ? `source: ${note.sourceTitle}` : 'source: none';
  const category = note.categoryName ? `category: ${note.categoryName}` : 'category: none';
  return `- ${note.createdAt} | ${source} | ${category} | ${clampText(note.content, NOTE_CHAR_BUDGET)}`;
}

function renderExperts(experts: Array<{ name: string; twitterHandle: string | null; rankScore?: number | null }>): string[] {
  if (experts.length === 0) return ['(no experts yet)'];
  return experts.map((expert) => {
    const handle = expert.twitterHandle ? ` @${normalizeTwitterHandle(expert.twitterHandle)}` : '';
    const rank = expert.rankScore == null ? '' : ` rank=${expert.rankScore}`;
    return `- ${expert.name}${handle}${rank}`;
  });
}

function renderSecondBrainSection(secondBrain: SecondBrainDigest, budget: number, includeAll: boolean): string {
  const lines = [
    '## Second Brain',
    `Totals: ${secondBrain.totalSources} sources, ${secondBrain.totalNotes} notes, ${secondBrain.categories.length} categories.`,
    '',
    '### Categories',
  ];

  if (secondBrain.categories.length === 0) {
    lines.push('(no categories yet)');
  } else {
    lines.push(...secondBrain.categories.map((category) =>
      `- ${category.name}: ${category.sourceCount} sources, ${category.noteCount} notes`,
    ));
  }

  lines.push('', '### Sources');
  const sourceRows = includeAll ? secondBrain.sources : secondBrain.sources.slice(0, AUTHORING_SOURCE_SAMPLE_SIZE);
  if (sourceRows.length === 0) {
    lines.push('(no sources yet)');
  } else {
    let omittedSources = 0;
    for (const source of sourceRows) {
      if (!appendBudgetedLine(lines, renderSource(source), budget)) {
        omittedSources += 1;
      }
    }
    if (omittedSources > 0 || sourceRows.length < secondBrain.sources.length) {
      lines.push(`[truncated ${omittedSources + secondBrain.sources.length - sourceRows.length} sources]`);
    }
  }

  lines.push('', '### Notes');
  const noteRows = includeAll ? secondBrain.notes : secondBrain.notes.slice(0, AUTHORING_NOTE_SAMPLE_SIZE);
  if (noteRows.length === 0) {
    lines.push('(no notes yet)');
  } else {
    let omittedNotes = 0;
    for (const note of noteRows) {
      if (!appendBudgetedLine(lines, renderNote(note), budget)) {
        omittedNotes += 1;
      }
    }
    if (omittedNotes > 0 || noteRows.length < secondBrain.notes.length) {
      lines.push(`[truncated ${omittedNotes + secondBrain.notes.length - noteRows.length} notes]`);
    }
  }

  return truncateToBudget(lines.join('\n'), budget);
}

function renderScopeBlock(brainlift: BrainliftDigest, lines: string[], budget: number): void {
  const inScope = brainlift.inScope ?? [];
  const outOfScope = brainlift.outOfScope ?? [];

  if (inScope.length > 0) {
    lines.push('', '### In scope');
    for (const phrase of inScope) {
      appendBudgetedLine(lines, `- ${clampText(phrase, SOURCE_TITLE_CHAR_BUDGET)}`, budget);
    }
  }
  if (outOfScope.length > 0) {
    lines.push('', '### Out of scope (do NOT pursue)');
    for (const phrase of outOfScope) {
      appendBudgetedLine(lines, `- ${clampText(phrase, SOURCE_TITLE_CHAR_BUDGET)}`, budget);
    }
  }
}

function renderBrainliftSection(brainlift: BrainliftDigest, experts: SwarmContext['topExperts'], budget: number, includeAuthoringDetails: boolean): string {
  const lines = [
    '## Brainlift',
    `Title: ${brainlift.title}`,
  ];

  if (brainlift.onboardingTopic) {
    lines.push(`Project: ${brainlift.onboardingTopic}`);
  } else if (brainlift.displayPurpose) {
    lines.push(`Display purpose: ${brainlift.displayPurpose}`);
  }

  renderScopeBlock(brainlift, lines, budget);

  lines.push('', '### Experts', ...renderExperts(experts));

  if (includeAuthoringDetails) {
    lines.push('', '### DOK1 Facts');
    if (brainlift.facts.length === 0) {
      lines.push('(no high-confidence facts yet)');
    } else {
      for (const fact of brainlift.facts) {
        appendBudgetedLine(lines, `- (${fact.score}) ${fact.category}: ${clampText(fact.fact, 500)}`, budget);
      }
    }

    if (brainlift.spovExcerpts.length > 0) {
      lines.push('', '### SPOV Excerpts');
      for (const spov of brainlift.spovExcerpts) {
        appendBudgetedLine(lines, `- ${spov.title}: ${spov.body}`, budget);
      }
    }
  }

  return truncateToBudget(lines.join('\n'), budget);
}

export function renderResearchPhaseDigest(
  brainlift: BrainliftDigest,
  secondBrain: SecondBrainDigest,
  topExperts: SwarmContext['topExperts'],
): string {
  const header = [`# ${brainlift.title}`];
  if (brainlift.displayPurpose) {
    header.push('', brainlift.displayPurpose);
  }

  const secondBrainSection = renderSecondBrainSection(secondBrain, 24_000, true);
  const brainliftSection = renderBrainliftSection(
    { ...brainlift, facts: [], spovExcerpts: [] },
    topExperts,
    8_000,
    false,
  );

  return truncateToBudget(
    [...header, '', secondBrainSection, '', brainliftSection].join('\n'),
    TOTAL_CONTEXT_CHAR_BUDGET,
  );
}

export function renderAuthoringPhaseDigest(
  brainlift: BrainliftDigest,
  secondBrain: SecondBrainDigest,
  topExperts: SwarmContext['topExperts'],
): string {
  const header = [`# ${brainlift.title}`];
  if (brainlift.displayPurpose) {
    header.push('', brainlift.displayPurpose);
  }

  const brainliftSection = renderBrainliftSection(brainlift, topExperts, 20_000, true);
  const secondBrainSection = renderSecondBrainSection(secondBrain, 12_000, false);

  return truncateToBudget(
    [...header, '', brainliftSection, '', secondBrainSection].join('\n'),
    TOTAL_CONTEXT_CHAR_BUDGET,
  );
}

function buildSecondBrainDigest(
  sources: SourceRow[],
  notes: NoteRow[],
  categories: CategoryRow[],
  phase: 'research' | 'authoring',
): SecondBrainDigest {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
  const noteCounts = new Map<number, number>();
  for (const note of notes) {
    if (note.categoryId != null) {
      noteCounts.set(note.categoryId, (noteCounts.get(note.categoryId) ?? 0) + 1);
    }
  }

  const sortedSources = [...sources].sort((a, b) => {
    const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
    const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
    return bTime - aTime || b.id - a.id;
  });
  const sortedNotes = [...notes].sort((a, b) => {
    const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
    const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
    return bTime - aTime || b.id - a.id;
  });

  const selectedSources = phase === 'research'
    ? sortedSources
    : sortedSources.slice(0, AUTHORING_SOURCE_SAMPLE_SIZE);
  const selectedNotes = phase === 'research'
    ? sortedNotes
    : sortedNotes.slice(0, AUTHORING_NOTE_SAMPLE_SIZE);

  return {
    totalSources: sources.length,
    totalNotes: notes.length,
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      sourceCount: category.sourceCount,
      noteCount: category.noteCount ?? noteCounts.get(category.id) ?? 0,
    })),
    sources: selectedSources.map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      author: source.author,
      categoryName: source.categoryName,
    })),
    notes: selectedNotes.map((note) => {
      const source = note.sourceId == null ? null : sourceById.get(note.sourceId) ?? null;
      return {
        id: note.id,
        content: note.content,
        sourceTitle: source?.title ?? null,
        categoryName: note.categoryId == null ? null : categoryNameById.get(note.categoryId) ?? null,
        createdAt: note.createdAt.toISOString(),
      };
    }),
  };
}

function buildBrainliftDigest(
  context: NonNullLearningStreamContext,
  spovs: Awaited<ReturnType<typeof storage.getDOK4Spovs>>,
  topExperts: ExpertRow[],
  phase: 'research' | 'authoring',
): Omit<BrainliftDigest, 'inScope' | 'outOfScope' | 'onboardingTopic'> {
  const authoringFacts = phase === 'authoring'
    ? [...context.facts]
      .filter((fact) => fact.score >= 3)
      .sort((a, b) => b.score - a.score || a.id - b.id)
      .slice(0, MAX_AUTHORING_FACTS)
    : [];
  const authoringExperts = phase === 'authoring'
    ? (context.experts.length > 0 ? context.experts : topExperts)
      .slice(0, MAX_AUTHORING_EXPERTS)
      .map((expert) => ({
        id: expert.id,
        name: expert.name,
        twitterHandle: normalizeTwitterHandle(expert.twitterHandle),
      }))
    : [];
  const spovExcerpts = phase === 'authoring'
    ? spovs.slice(0, MAX_AUTHORING_SPOVS).map((spov) => ({
      id: spov.id,
      title: `SPOV ${spov.id}`,
      body: truncateToBudget(spov.text, SPOV_BODY_CHAR_BUDGET + 3),
    }))
    : [];

  return {
    id: context.id,
    title: context.title,
    displayPurpose: context.displayPurpose,
    facts: authoringFacts,
    experts: authoringExperts,
    spovExcerpts,
  };
}

/**
 * Build a phase-aware digest for v2 research-stream planning and slot prompts.
 *
 * The optional runSpec parameter is reserved for orchestrator/runner reuse in
 * spec 02; spec 01 intentionally does not use it for dedup or filtering.
 */
export async function buildSwarmContext(
  brainliftId: number,
  _runSpec?: RunSpec,
): Promise<SwarmContext> {
  const [
    brainliftRecord,
    learningStreamContext,
    sources,
    notes,
    categories,
    spovs,
    topExpertsRaw,
    existingUrls,
  ] = await Promise.all([
    storage.getBrainliftById(brainliftId),
    storage.getLearningStreamContext(brainliftId),
    storage.getSourcesByBrainlift(brainliftId),
    storage.getNotesByBrainlift(brainliftId),
    storage.listCategories(brainliftId),
    storage.getDOK4Spovs(brainliftId),
    storage.getExpertsByBrainliftId(brainliftId),
    storage.getLearningStreamUrls(brainliftId),
  ]);

  if (!brainliftRecord || !learningStreamContext) {
    throw new Error(`brainlift not found: ${brainliftId}`);
  }

  const phase = brainliftRecord.phase === 'research' ? 'research' : 'authoring';
  const topExperts = topExpertsRaw
    .slice(0, MAX_AUTHORING_EXPERTS)
    .map((expert) => ({
      id: expert.id,
      name: expert.name,
      twitterHandle: normalizeTwitterHandle(expert.twitterHandle),
      rankScore: expert.rankScore,
    }));
  const secondBrain = buildSecondBrainDigest(sources, notes, categories, phase);
  const brainlift: BrainliftDigest = {
    ...buildBrainliftDigest(learningStreamContext, spovs, topExpertsRaw, phase),
    onboardingTopic: learningStreamContext.onboardingTopic ?? null,
    inScope: brainliftRecord.inScope ?? [],
    outOfScope: brainliftRecord.outOfScope ?? [],
  };
  const renderedDigest = phase === 'research'
    ? renderResearchPhaseDigest(brainlift, secondBrain, topExperts)
    : renderAuthoringPhaseDigest(brainlift, secondBrain, topExperts);

  return {
    phase,
    brainlift,
    secondBrain,
    topExperts,
    existingUrls,
    renderedDigest,
    digestCharCount: renderedDigest.length,
  };
}
