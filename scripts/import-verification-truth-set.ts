import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { withJob } from '../server/utils/withJob';
import { createQABatch, replaceVerificationTruthRows, updateQABatch } from '../server/storage/qa-batches';
import type { VerificationTruthContext, VerificationTruthImportRow } from '../shared/analytics-types';

interface VerificationImportOptions {
  inputPath: string;
  artifactLabel: string;
  baseline: boolean;
  queue: boolean;
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function parseArgs(argv: string[]): VerificationImportOptions {
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    const [flag, inlineValue] = arg.split('=');
    if (flag === '--baseline') {
      flags.set('baseline', inlineValue ? inlineValue !== 'false' : true);
      continue;
    }
    if (flag === '--no-queue') {
      flags.set('queue', false);
      continue;
    }
    if (flag === '--artifact-label') {
      const value = inlineValue ?? argv[++i];
      if (!value) throw new Error('Missing value for --artifact-label');
      flags.set('artifactLabel', value);
      continue;
    }
    throw new Error(`Unsupported flag: ${flag}`);
  }

  const inputPath = positional[0];
  if (!inputPath) {
    throw new Error('Usage: tsx scripts/import-verification-truth-set.ts <truth-set.csv> --artifact-label <label> [--baseline] [--no-queue]');
  }

  return {
    inputPath,
    artifactLabel: String(flags.get('artifactLabel') ?? path.basename(inputPath)),
    baseline: Boolean(flags.get('baseline') ?? false),
    queue: flags.get('queue') !== false,
  };
}

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let currentField = '';
  let currentRow: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    currentRow.push(currentField);
    currentField = '';
  };

  const pushRow = () => {
    rows.push(currentRow);
    currentRow = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentField += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      pushField();
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      pushField();
      if (currentRow.length > 0 || currentField.length > 0) {
        pushRow();
      }
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    pushField();
    pushRow();
  }

  if (rows.length === 0) {
    return [];
  }

  const headers = rows.shift()!.map((header) => header.trim());
  return rows
    .filter((row) => row.some((value) => value.trim().length > 0))
    .map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = (row[index] ?? '').trim();
      });
      return record;
    });
}

function parseJsonField(value: string | undefined): Record<string, unknown> | null {
  if (!value || value.trim().length === 0) {
    return null;
  }

  return JSON.parse(value);
}

function buildFrozenContext(record: Record<string, string>, dokLevel: 1 | 2): VerificationTruthContext {
  const contextValue = record.frozenContext || record.gradingContext || record.context;
  if (contextValue) {
    return JSON.parse(contextValue) as VerificationTruthContext;
  }

  if (dokLevel === 1) {
    return {
      dokLevel: 1,
      fact: record.itemText || record.fact || '',
      source: record.source || null,
    };
  }

  return {
    dokLevel: 2,
    points: record.points ? record.points.split('|').map((point) => point.trim()).filter(Boolean) : [record.itemText || record.summary || ''],
    sourceName: record.sourceName || record.source || 'unknown',
    sourceUrl: record.sourceUrl || null,
    relatedFacts: [],
    purpose: record.purpose || '',
  };
}

function parseTruthSetRecord(record: Record<string, string>): VerificationTruthImportRow {
  const dokLevelRaw = Number.parseInt(record.dokLevel || '1', 10);
  if (dokLevelRaw !== 1 && dokLevelRaw !== 2) {
    throw new Error(`Unsupported dokLevel '${record.dokLevel}' - expected 1 or 2`);
  }

  const dokLevel = dokLevelRaw as 1 | 2;
  const frozenContext = buildFrozenContext(record, dokLevel);
  const aiScore = record.aiScore === undefined || record.aiScore === '' ? null : Number.parseFloat(record.aiScore);
  const humanScore = record.humanScore === undefined || record.humanScore === '' ? null : Number.parseFloat(record.humanScore);
  const metadata = {
    ...parseJsonField(record.metadata ?? undefined),
    humanJudgment: record.humanJudgment || record.judgment || null,
    reviewedBy: record.reviewedBy || null,
    reviewedAt: record.reviewedAt || null,
    active: record.active ? record.active !== 'false' : true,
    reviewedAiScore: aiScore,
    reviewedHumanScore: humanScore,
    sourceItemId: record.sourceItemId ? Number.parseInt(record.sourceItemId, 10) : null,
    brainliftId: record.brainliftId ? Number.parseInt(record.brainliftId, 10) : null,
    itemId: record.itemId ? Number.parseInt(record.itemId, 10) : null,
  };

  return {
    assetKey: record.assetKey || String(record.sourceItemId || sha256(JSON.stringify(frozenContext))),
    dokLevel,
    stableKey: record.stableKey || sha256(JSON.stringify(frozenContext)),
    frozenContext,
    aiScore: Number.isFinite(aiScore as number) ? (aiScore as number) : null,
    humanScore: Number.isFinite(humanScore as number) ? (humanScore as number) : null,
    metadata,
  };
}

async function loadTruthSetRows(inputPath: string): Promise<VerificationTruthImportRow[]> {
  const raw = await readFile(inputPath, 'utf8');
  const records = parseCsv(raw);
  if (records.length === 0) {
    return [];
  }

  return records.map(parseTruthSetRecord);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv);
  const rows = await loadTruthSetRows(options.inputPath);

  const batch = await createQABatch({
    type: 'verification',
    status: 'pending',
    isBaseline: options.baseline,
    artifactLabel: options.artifactLabel,
    sampleCount: rows.length,
  });

  await replaceVerificationTruthRows(batch.id, rows);
  await updateQABatch(batch.id, { sampleCount: rows.length });

  if (options.queue) {
    const jobId = await withJob('analytics:run-verification-batch')
      .forPayload({ batchType: 'verification' })
      .queue();
    console.log(JSON.stringify({ batchId: batch.id, jobId, count: rows.length, artifactLabel: options.artifactLabel }, null, 2));
  } else {
    console.log(JSON.stringify({ batchId: batch.id, count: rows.length, artifactLabel: options.artifactLabel }, null, 2));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { parseCsv, parseTruthSetRecord, parseArgs as parseVerificationArgs, loadTruthSetRows };
