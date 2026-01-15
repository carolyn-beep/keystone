import { Router } from "express";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { z } from "zod";
import multer from "multer";
import { extractBrainlift } from "../ai/brainliftExtractor";
import { extractTextFromPDF, extractTextFromDocx, extractTextFromHTML } from "../utils/file-extractors";
import { fetchWorkflowyContent, fetchGoogleDocsContent } from "../utils/external-sources";
import { saveBrainliftFromAI } from "../services/brainlift";
import { extractAndRankExperts } from "../ai/expertExtractor";
import { requireAuth } from "../middleware/auth";

export const brainliftsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const PAGE_SIZE = 9;

// Get all brainlifts (filtered by user role, or all if admin with ?all=true)
// Supports pagination via ?page=1 (1-indexed)
brainliftsRouter.get(api.brainlifts.list.path, requireAuth, async (req, res) => {
  const showAll = req.query.all === 'true' && req.authContext!.isAdmin;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { brainlifts, total } = showAll
    ? await storage.getAllBrainliftsPaginated(offset, PAGE_SIZE)
    : await storage.getBrainliftsForUserPaginated(req.authContext!, offset, PAGE_SIZE);

  res.json({
    brainlifts,
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / PAGE_SIZE),
    },
  });
});

// Get single brainlift by slug
brainliftsRouter.get(api.brainlifts.get.path, requireAuth, async (req, res) => {
  const brainlift = await storage.getBrainliftBySlug(req.params.slug);
  if (!brainlift) {
    return res.status(404).json({ message: "Brainlift not found" });
  }
  if (!storage.canAccessBrainlift(brainlift, req.authContext!)) {
    return res.status(403).json({ message: "Access denied" });
  }
  res.json(brainlift);
});

// Create brainlift
brainliftsRouter.post(api.brainlifts.create.path, requireAuth, async (req, res) => {
  try {
    const input = api.brainlifts.create.input.parse(req.body);
    const brainlift = await storage.createBrainlift(
      {
        slug: input.slug,
        title: input.title,
        description: input.description,
        author: input.author || null,
        summary: input.summary
      },
      input.facts,
      input.contradictionClusters,
      input.readingList,
      req.authContext!.userId
    );
    res.status(201).json(brainlift);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        message: err.errors[0].message,
        field: err.errors[0].path.join('.'),
      });
    }
    throw err;
  }
});

// Delete brainlift
brainliftsRouter.delete('/api/brainlifts/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid brainlift ID" });
    }
    const brainlift = await storage.getBrainliftById(id);
    if (!brainlift) {
      return res.status(404).json({ message: "Brainlift not found" });
    }
    if (!storage.canModifyBrainlift(brainlift, req.authContext!)) {
      return res.status(403).json({ message: "Access denied" });
    }
    await storage.deleteBrainlift(id);
    res.json({ message: "Brainlift deleted successfully" });
  } catch (err) {
    console.error('Delete brainlift error:', err);
    res.status(500).json({ message: "Failed to delete brainlift" });
  }
});

// Import brainlift from file or URL
brainliftsRouter.post('/api/brainlifts/import', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const sourceType = req.body.sourceType as string;
    let content: string;
    let sourceLabel: string;

    switch (sourceType) {
      case 'pdf':
        if (!req.file) {
          return res.status(400).json({ message: 'No file uploaded' });
        }
        content = await extractTextFromPDF(req.file.buffer);
        sourceLabel = 'PDF document';
        break;

      case 'docx':
        if (!req.file) {
          return res.status(400).json({ message: 'No file uploaded' });
        }
        content = await extractTextFromDocx(req.file.buffer);
        sourceLabel = 'Word document';
        break;

      case 'html':
        if (!req.file) {
          return res.status(400).json({ message: 'No file uploaded' });
        }
        content = extractTextFromHTML(req.file.buffer.toString('utf-8'));
        sourceLabel = 'HTML file';
        break;

      case 'workflowy':
        const workflowyUrl = req.body.url as string;
        if (!workflowyUrl) {
          return res.status(400).json({ message: 'No Workflowy URL provided' });
        }
        content = await fetchWorkflowyContent(workflowyUrl);
        sourceLabel = 'Workflowy';
        break;

      case 'googledocs':
        const googleUrl = req.body.url as string;
        if (!googleUrl) {
          return res.status(400).json({ message: 'No Google Docs URL provided' });
        }
        content = await fetchGoogleDocsContent(googleUrl);
        sourceLabel = 'Google Docs';
        break;

      case 'text':
        const textContent = req.body.content as string;
        if (!textContent) {
          return res.status(400).json({ message: 'No text content provided' });
        }
        content = textContent;
        sourceLabel = 'text content';
        break;

      default:
        return res.status(400).json({ message: 'Invalid source type' });
    }

    content = content.trim();
    if (!content || content.length < 100) {
      return res.status(400).json({ message: 'Content is too short or empty. Please provide more detailed content (at least 100 characters).' });
    }

    console.log(`Processing ${sourceLabel}, content length: ${content.length} chars`);

    const brainliftData = await extractBrainlift(content, sourceLabel);
    const brainlift = await saveBrainliftFromAI(brainliftData, content, sourceType, req.authContext!.userId);

    res.status(201).json(brainlift);
  } catch (err: any) {
    console.error('Import error:', err);
    res.status(500).json({ message: err.message || 'Failed to import brainlift' });
  }
});

// Get grades for a brainlift
brainliftsRouter.get('/api/brainlifts/:slug/grades', requireAuth, async (req, res) => {
  try {
    const brainlift = await storage.getBrainliftBySlug(req.params.slug);
    if (!brainlift) {
      return res.status(404).json({ message: 'Brainlift not found' });
    }
    if (!storage.canAccessBrainlift(brainlift, req.authContext!)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const grades = await storage.getGradesByBrainliftId(brainlift.id);
    res.json(grades);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// Save a grade for a reading list item
const gradeSchema = z.object({
  readingListItemId: z.number(),
  aligns: z.enum(['yes', 'no', 'partial']).nullable().optional(),
  contradicts: z.enum(['yes', 'no']).nullable().optional(),
  newInfo: z.enum(['yes', 'no']).nullable().optional(),
  quality: z.number().min(1).max(5).nullable().optional(),
});

brainliftsRouter.post('/api/brainlifts/:slug/grades', requireAuth, async (req, res) => {
  try {
    const brainlift = await storage.getBrainliftBySlug(req.params.slug);
    if (!brainlift) {
      return res.status(404).json({ message: 'Brainlift not found' });
    }
    if (!storage.canModifyBrainlift(brainlift, req.authContext!)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const parsed = gradeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid grade data', errors: parsed.error.errors });
    }
    const { readingListItemId, aligns, contradicts, newInfo, quality } = parsed.data;

    const grade = await storage.saveGrade({
      readingListItemId,
      aligns: aligns ?? null,
      contradicts: contradicts ?? null,
      newInfo: newInfo ?? null,
      quality: quality ?? null,
    });
    res.json(grade);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// Update brainlift (import new version)
brainliftsRouter.patch('/api/brainlifts/:slug/update', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const { slug } = req.params;

    // Check modify permission
    const existingBrainlift = await storage.getBrainliftBySlug(slug);
    if (!existingBrainlift) {
      return res.status(404).json({ message: 'Brainlift not found' });
    }
    if (!storage.canModifyBrainlift(existingBrainlift, req.authContext!)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const sourceType = req.body.sourceType as string;
    let content: string;
    let sourceLabel: string;

    switch (sourceType) {
      case 'pdf':
        if (!req.file) {
          return res.status(400).json({ message: 'No file uploaded' });
        }
        content = await extractTextFromPDF(req.file.buffer);
        sourceLabel = 'PDF document';
        break;

      case 'docx':
        if (!req.file) {
          return res.status(400).json({ message: 'No file uploaded' });
        }
        content = await extractTextFromDocx(req.file.buffer);
        sourceLabel = 'Word document';
        break;

      case 'html':
        if (!req.file) {
          return res.status(400).json({ message: 'No file uploaded' });
        }
        content = extractTextFromHTML(req.file.buffer.toString('utf-8'));
        sourceLabel = 'HTML file';
        break;

      case 'workflowy':
        const workflowyUrl = req.body.url as string;
        if (!workflowyUrl) {
          return res.status(400).json({ message: 'No Workflowy URL provided' });
        }
        content = await fetchWorkflowyContent(workflowyUrl);
        sourceLabel = 'Workflowy';
        break;

      case 'googledocs':
        const googleUrl = req.body.url as string;
        if (!googleUrl) {
          return res.status(400).json({ message: 'No Google Docs URL provided' });
        }
        content = await fetchGoogleDocsContent(googleUrl);
        sourceLabel = 'Google Docs';
        break;

      case 'text':
        const textContent = req.body.content as string;
        if (!textContent) {
          return res.status(400).json({ message: 'No text content provided' });
        }
        content = textContent;
        sourceLabel = 'text content';
        break;

      default:
        return res.status(400).json({ message: 'Invalid source type' });
    }

    content = content.trim();
    if (!content || content.length < 100) {
      return res.status(400).json({ message: 'Content is too short or empty. Please provide more detailed content (at least 100 characters).' });
    }

    console.log(`Updating ${slug} with ${sourceLabel}, content length: ${content.length} chars`);

    const brainliftData = await extractBrainlift(content, sourceLabel);

    const facts = brainliftData.facts.map((f) => ({
      originalId: f.id,
      category: f.category,
      source: f.source || null,
      fact: f.fact,
      score: f.score,
      contradicts: f.contradicts,
      note: f.aiNotes || null,
    }));

    const clusters = brainliftData.contradictionClusters.map((c) => ({
      name: c.name,
      tension: c.tension,
      status: c.status,
      factIds: c.factIds,
      claims: c.claims,
    }));

    const readingList = brainliftData.readingList.map((r) => ({
      type: r.type,
      author: r.author,
      topic: r.topic,
      time: r.time,
      facts: r.facts,
      url: r.url,
    }));

    const updatedBrainlift = await storage.updateBrainlift(
      slug,
      {
        slug,
        title: brainliftData.title,
        description: brainliftData.description,
        author: (brainliftData as any).author || null,
        summary: brainliftData.summary,
        classification: brainliftData.classification,
        rejectionReason: brainliftData.rejectionReason || null,
        rejectionSubtype: brainliftData.rejectionSubtype || null,
        rejectionRecommendation: brainliftData.rejectionRecommendation || null,
        originalContent: content,
        sourceType: sourceType,
      },
      facts,
      clusters,
      readingList
    );

    // Run expert extraction and redundancy analysis in parallel after update
    await Promise.all([
      // Expert extraction
      (async () => {
        try {
          const expertData = await extractAndRankExperts({
            brainliftId: updatedBrainlift.id,
            title: brainliftData.title,
            description: brainliftData.description,
            author: (brainliftData as any).author || null,
            facts: facts as any[],
            originalContent: content,
            readingList: readingList,
          });

          if (expertData.length > 0) {
            await storage.saveExperts(updatedBrainlift.id, expertData);
          }
        } catch (err) {
          console.error("Expert extraction failed during brainlift update:", err);
        }
      })(),

      // Redundancy analysis
      (async () => {
        try {
          const { analyzeFactRedundancy } = await import('../ai/redundancyAnalyzer');
          const savedFacts = await storage.getFactsForBrainlift(updatedBrainlift.id);
          const redundancyResult = await analyzeFactRedundancy(savedFacts);

          if (redundancyResult.redundancyGroups.length > 0) {
            await storage.saveRedundancyGroups(updatedBrainlift.id, redundancyResult.redundancyGroups.map(g => ({
              groupName: g.groupName,
              factIds: g.factIds,
              primaryFactId: g.primaryFactId,
              similarityScore: g.similarityScore,
              reason: g.reason,
              status: 'pending' as const,
            })));
          }
        } catch (err) {
          console.error("Redundancy analysis failed during brainlift update:", err);
        }
      })(),
    ]);

    res.json(await storage.getBrainliftBySlug(slug));
  } catch (err: any) {
    console.error('Update error:', err);
    res.status(500).json({ message: err.message || 'Failed to update brainlift' });
  }
});

// Update brainlift author/owner
brainliftsRouter.patch('/api/brainlifts/:slug/author', requireAuth, async (req, res) => {
  try {
    const brainlift = await storage.getBrainliftBySlug(req.params.slug);
    if (!brainlift) {
      return res.status(404).json({ message: 'Brainlift not found' });
    }
    if (!storage.canModifyBrainlift(brainlift, req.authContext!)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const { author } = req.body;
    await storage.updateBrainliftFields(brainlift.id, { author: author || null });
    res.json({ success: true, author });
  } catch (err: any) {
    console.error('Update author error:', err);
    res.status(500).json({ message: err.message || 'Failed to update author' });
  }
});

// Get version history for a brainlift
brainliftsRouter.get('/api/brainlifts/:slug/versions', requireAuth, async (req, res) => {
  try {
    const brainlift = await storage.getBrainliftBySlug(req.params.slug);
    if (!brainlift) {
      return res.status(404).json({ message: 'Brainlift not found' });
    }
    if (!storage.canAccessBrainlift(brainlift, req.authContext!)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const versions = await storage.getVersionsByBrainliftId(brainlift.id);
    res.json(versions);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});
