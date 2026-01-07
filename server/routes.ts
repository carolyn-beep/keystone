import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import fs from "fs";
import path from "path";
import multer from "multer";
import * as mammoth from "mammoth";
import { extractBrainlift, BrainliftOutput } from "./ai/brainliftExtractor";
import { summarizeFact } from "./ai/factSummarizer";
import { searchForResources, deepResearch } from "./ai/resourceResearcher";
import { searchRelevantTweets } from "./ai/twitterService";
import { extractAndRankExperts } from "./ai/expertExtractor";
import { verifyFactWithAllModels, calculateConsensus } from "./ai/factVerifier";
import { fetchEvidenceForFact } from "./ai/evidenceFetcher";
import { brainliftsData } from "./seedData";
import { LLM_MODELS, LLM_MODEL_NAMES } from "@shared/schema";
import pLimit from "p-limit";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

async function seedDatabase() {
  console.log("Checking seed data...");
  
  const seedFiles = [
    { slug: 'alpha-schools', file: 'attached_assets/alpha-schools_1767269704970.json' },
    { slug: 'knowledge-rich-curriculum', file: 'attached_assets/knowledge-rich-curriculum_1767269704970.json' },
    { slug: 'zach-groshell-direct-instruction', file: 'attached_assets/zach-groshell-direct-instruction_1767355128825.json' },
    { slug: 'applying-how-vocabulary-is-learned', file: 'attached_assets/applying-how-vocabulary-is-learned_1767356606087.json' },
    { slug: 'alphawrite-writing-revolution', file: 'attached_assets/alphawrite-writing-revolution_1767389329041.json' }
  ];

  for (const item of seedFiles) {
    try {
      if (fs.existsSync(item.file)) {
        const content = fs.readFileSync(item.file, 'utf-8');
        const data = JSON.parse(content);
        
        // Check if brainlift exists and needs update
        const existing = await storage.getBrainliftBySlug(item.slug);
        if (existing) {
          // Check if data matches - compare first fact's source AND score
          const expectedSource = data.facts[0]?.source;
          const expectedScore = data.facts[0]?.score;
          const currentSource = existing.facts[0]?.source;
          const currentScore = existing.facts[0]?.score;
          
          // Also check a few more facts to catch score changes
          const scoresMatch = data.facts.every((f: any, i: number) => {
            const existingFact = existing.facts.find((ef: any) => ef.originalId === f.id);
            return existingFact && existingFact.score === f.score;
          });
          
          if (expectedSource === currentSource && scoresMatch && existing.summary?.meanScore !== "0") {
            console.log(`${item.slug} already up-to-date, skipping`);
            continue;
          }
          // Delete stale data (scores or source changed)
          console.log(`Updating stale data for ${item.slug} (scores or source changed)...`);
          await storage.deleteBrainlift(existing.id);
        }
        
        // Calculate dynamic summary for seeding
        const totalFacts = data.facts.length;
        const gradeableFacts = data.facts.filter((f: any) => f.score > 0);
        const sumScores = gradeableFacts.reduce((sum: number, f: any) => sum + f.score, 0);
        const meanScore = gradeableFacts.length > 0 ? (sumScores / gradeableFacts.length).toFixed(2) : "0";
        const score5Count = data.facts.filter((f: any) => f.score === 5).length;
        const contradictionCount = data.contradictionClusters?.length || 0;

        const dynamicSummary = {
          totalFacts,
          meanScore,
          score5Count,
          contradictionCount
        };

        await storage.createBrainlift(
          {
            slug: item.slug,
            title: data.title,
            description: data.description,
            summary: dynamicSummary,
            author: data.author || null,
            classification: data.classification || 'brainlift',
            rejectionReason: data.rejectionReason || null,
            rejectionSubtype: data.rejectionSubtype || null,
            rejectionRecommendation: data.rejectionRecommendation || null,
            flags: data.flags || null,
          },
          (data.facts || []).map((f: any) => ({
            originalId: f.id,
            category: f.category,
            source: f.source || null,
            fact: f.fact,
            score: f.score,
            contradicts: f.contradicts,
            note: f.note || null,
          })),
          (data.contradictionClusters || []).map((c: any) => ({
            name: c.name,
            tension: c.tension,
            status: c.status,
            factIds: c.factIds,
            claims: c.claims
          })),
          (data.readingList || []).map((r: any) => ({
            type: r.type,
            author: r.author,
            topic: r.topic,
            time: r.time,
            facts: r.facts,
            url: r.url
          }))
        );
        console.log(`Seeded ${item.slug}`);
      }
    } catch (e) {
      console.error(`Failed to seed ${item.slug}:`, e);
    }
  }
}

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const pdfParseModule = await import('pdf-parse');
  const pdfParse = (pdfParseModule as any).default || pdfParseModule;
  const data = await pdfParse(buffer);
  
  // Convert basic PDF structure to pseudo-markdown (e.g., bullet points)
  return data.text.split('\n')
    .map((line: string) => {
      const trimmed = line.trim();
      if (trimmed.length > 50 && !trimmed.includes('-')) return `## ${trimmed}`; // Treat long lines without bullets as headers
      return line;
    })
    .join('\n');
}

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  // Mammoth already supports markdown output
  const result = await mammoth.convertToMarkdown({ buffer });
  return result.value;
}

function extractTextFromHTML(htmlContent: string): string {
  // Parse HTML and extract text, preserving ul/li hierarchy with indentation
  const lines: string[] = [];
  
  // Remove script and style tags first
  let cleaned = htmlContent
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  
  // Track nesting depth for lists and current text accumulator
  let listDepth = 0;
  let inListItem = false;
  let currentText = '';
  
  // Process the HTML looking for tags
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  let lastIndex = 0;
  let match;
  
  while ((match = tagRegex.exec(cleaned)) !== null) {
    // Accumulate text before this tag
    const textBefore = cleaned.substring(lastIndex, match.index);
    if (textBefore.trim()) {
      currentText += ' ' + textBefore.trim();
    }
    
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    const isClosing = fullTag.startsWith('</');
    
    if (tagName === 'ul' || tagName === 'ol') {
      if (!isClosing) {
        listDepth++;
      } else {
        listDepth = Math.max(0, listDepth - 1);
      }
    } else if (tagName === 'li') {
      if (!isClosing) {
        // Starting a new list item - flush any previous accumulated text first
        if (currentText.trim() && inListItem) {
          const indent = '  '.repeat(Math.max(0, listDepth - 1));
          lines.push(indent + '- ' + currentText.trim());
          currentText = '';
        }
        inListItem = true;
      } else {
        // Closing list item - flush accumulated text
        if (currentText.trim()) {
          const indent = '  '.repeat(Math.max(0, listDepth - 1));
          lines.push(indent + '- ' + currentText.trim());
          currentText = '';
        }
        inListItem = false;
      }
    } else if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      // Block-level elements - flush text on close
      if (isClosing && currentText.trim()) {
        if (inListItem) {
          // Don't flush here, let </li> handle it
        } else {
          lines.push(currentText.trim());
          currentText = '';
        }
      }
    } else if (tagName === 'br') {
      // Line break - add space to current text
      currentText += ' ';
    }
    
    lastIndex = match.index + fullTag.length;
  }
  
  // Get any remaining text after last tag
  const remainingText = cleaned.substring(lastIndex).trim();
  if (remainingText) {
    currentText += ' ' + remainingText;
  }
  if (currentText.trim()) {
    lines.push(currentText.trim());
  }
  
  // Decode HTML entities and clean up
  return lines
    .map(line => line
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
    )
    .filter(line => line.length > 0)
    .join('\n');
}

async function fetchWorkflowyContent(nodeIdOrUrl: string): Promise<string> {
  // Workflowy share link extraction - reverse-engineers their internal API
  // Step 1: Fetch share page HTML to get cookies and internal share_id
  // Step 2: Call /get_initialization_data with cookies to get complete tree
  // Step 3: Parse projectTreeData.mainProjectTreeInfo structure
  
  const isShareUrl = nodeIdOrUrl.includes('workflowy.com/s/');
  
  if (isShareUrl) {
    console.log('Workflowy: Extracting from share link via internal API...');
    
    try {
      // Step 1: Fetch the share page to get cookies and extract internal share_id
      const sharePageResponse = await fetch(nodeIdOrUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });
      
      if (!sharePageResponse.ok) {
        throw new Error(`Failed to fetch share page: ${sharePageResponse.status} ${sharePageResponse.statusText}`);
      }
      
      const html = await sharePageResponse.text();
      console.log(`Fetched share page: ${html.length} chars`);
      
      // Extract cookies from response
      // Parse Set-Cookie headers and extract cookie key-value pairs
      const rawSetCookie = sharePageResponse.headers.get('set-cookie') || '';
      console.log('Raw Set-Cookie header:', rawSetCookie.substring(0, 200));
      
      // Extract cookie names and values from Set-Cookie format
      // Format: "name=value; Path=/; other-attributes"
      const cookiePairs: string[] = [];
      
      // Handle multiple cookies (split by comma but be careful of date values)
      const cookieStrings = rawSetCookie.split(/,(?=[^;]*=)/);
      for (const cookieStr of cookieStrings) {
        const match = cookieStr.match(/^\s*([^=]+)=([^;]*)/);
        if (match) {
          cookiePairs.push(`${match[1].trim()}=${match[2].trim()}`);
        }
      }
      
      const cookies = cookiePairs.join('; ');
      console.log('Formatted Cookie header:', cookies);
      
      // Extract internal share_id from HTML (found in PROJECT_TREE_DATA_URL_PARAMS or similar)
      // The share_id looks like "OOhr.VkrgTuHF7t" and is different from the URL slug
      let internalShareId: string | null = null;
      
      // Try multiple patterns to find share_id
      const shareIdPatterns = [
        /share_id['"]\s*:\s*['"]([^'"]+)['"]/,
        /PROJECT_TREE_DATA_URL_PARAMS.*?share_id=([^&'"]+)/,
        /get_initialization_data\?share_id=([^&'"]+)/,
        /"shareId"\s*:\s*"([^"]+)"/,
        /share_id=([A-Za-z0-9._-]+)/,
      ];
      
      for (const pattern of shareIdPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          internalShareId = match[1];
          console.log(`Found internal share_id: ${internalShareId}`);
          break;
        }
      }
      
      if (!internalShareId) {
        console.log('Could not find internal share_id in HTML, trying URL-based approach...');
        // Sometimes the share_id can be extracted differently
        const urlMatch = nodeIdOrUrl.match(/workflowy\.com\/s\/[^\/]+\/([a-zA-Z0-9]+)/);
        if (urlMatch) {
          // Try using the URL key as a starting point
          console.log('URL share key:', urlMatch[1]);
        }
        throw new Error('Could not extract internal share_id from Workflowy share page');
      }
      
      // Step 2: Call the internal API to get the complete tree
      const initUrl = `https://workflowy.com/get_initialization_data?share_id=${encodeURIComponent(internalShareId)}&client_version=21`;
      console.log('Fetching initialization data from:', initUrl);
      
      const initResponse = await fetch(initUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': nodeIdOrUrl,
          'Cookie': cookies,
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
      
      if (!initResponse.ok) {
        throw new Error(`Failed to fetch initialization data: ${initResponse.status} ${initResponse.statusText}`);
      }
      
      const initData = await initResponse.json();
      console.log('Got initialization data, keys:', Object.keys(initData).join(', '));
      
      // Step 3: Parse the projectTreeData structure
      const projectTreeData = initData.projectTreeData;
      if (!projectTreeData) {
        throw new Error('No projectTreeData in response');
      }
      
      console.log('projectTreeData keys:', Object.keys(projectTreeData).join(', '));
      
      // Helper function to strip HTML tags from text
      function stripHtml(html: string): string {
        return html
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();
      }
      
      // Recursively extract text from node tree
      // nm = name (the bullet text, can contain HTML)
      // no = notes (additional text under a bullet)
      // ch = children (nested bullets)
      function nodeToText(node: any, indent: number = 0): string {
        const name = stripHtml(node.nm || node.name || '');
        const note = stripHtml(node.no || node.note || '');
        
        // Use markdown headers for top-level nodes, bullets for others
        let text = '';
        if (indent === 0) {
          text = `# ${name}`;
        } else if (indent === 1) {
          text = `## ${name}`;
        } else {
          const prefix = '  '.repeat(indent - 2);
          text = prefix + '- ' + name;
        }

        if (note) {
          const notePrefix = '  '.repeat(Math.max(0, indent - 1));
          text += '\n' + notePrefix + '> ' + note;
        }
        
        const children = node.ch || node.children || [];
        if (Array.isArray(children)) {
          for (const child of children) {
            text += '\n' + nodeToText(child, indent + 1);
          }
        }
        
        return text;
      }
      
      const lines: string[] = [];
      
      // Check mainProjectTreeInfo first
      const mainInfo = projectTreeData.mainProjectTreeInfo;
      if (mainInfo) {
        console.log('mainProjectTreeInfo keys:', Object.keys(mainInfo).join(', '));
        
        if (mainInfo.rootProject) {
          lines.push(nodeToText(mainInfo.rootProject, 0));
        }
        
        if (mainInfo.rootProjectChildren && Array.isArray(mainInfo.rootProjectChildren)) {
          console.log(`Found ${mainInfo.rootProjectChildren.length} root children`);
          for (const child of mainInfo.rootProjectChildren) {
            lines.push(nodeToText(child, 0));
          }
        }
      }
      
      // Also check auxiliaryProjectTreeInfos for shared docs
      const auxInfos = projectTreeData.auxiliaryProjectTreeInfos;
      if (Array.isArray(auxInfos) && auxInfos.length > 0) {
        console.log(`Found ${auxInfos.length} auxiliary tree infos`);
        for (const aux of auxInfos) {
          if (aux.rootProject) {
            lines.push(nodeToText(aux.rootProject, 0));
          }
          if (aux.rootProjectChildren && Array.isArray(aux.rootProjectChildren)) {
            for (const child of aux.rootProjectChildren) {
              lines.push(nodeToText(child, 0));
            }
          }
        }
      }
      
      const content = lines.join('\n');
      console.log(`Workflowy extraction complete: ${content.length} chars`);
      
      if (content.length > 100) {
        return content;
      } else {
        throw new Error('Extracted content too short - may be private or expired share link');
      }
      
    } catch (e: any) {
      console.log('Workflowy internal API extraction failed:', e.message);
      throw new Error(`Failed to fetch Workflowy share content: ${e.message}`);
    }
  }
  
  // Non-share URLs are not supported - only share links work
  throw new Error('Only Workflowy share links (workflowy.com/s/...) are supported');
}

async function fetchGoogleDocsContent(url: string): Promise<string> {
  const docIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!docIdMatch) {
    throw new Error('Invalid Google Docs URL format');
  }
  
  const docId = docIdMatch[1];
  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
  
  const response = await fetch(exportUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Google Doc is not publicly accessible. Please make sure link sharing is enabled.');
    }
    throw new Error(`Failed to fetch Google Doc: ${response.status}`);
  }
  
  return response.text();
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function generateUniqueSlug(title: string): Promise<string> {
  let baseSlug = generateSlug(title);
  let slug = baseSlug;
  let counter = 1;
  
  while (true) {
    const existing = await storage.getBrainliftBySlug(slug);
    if (!existing) {
      return slug;
    }
    counter++;
    slug = `${baseSlug}-${counter}`;
  }
}

async function saveBrainliftFromAI(data: BrainliftOutput, originalContent?: string, sourceType?: string, userId?: string) {
  const slug = await generateUniqueSlug(data.title);
  
  const limit = pLimit(5); // Process 5 facts concurrently

  // Run fact processing, contradiction detection, reading list extraction, and expert extraction in parallel
  const [factsWithSummaries, contradictionClusters, extractedReadingList, extractedExperts] = await Promise.all([
    Promise.all(data.facts.map(fact => limit(async () => {
      const summary = await summarizeFact(fact.fact);
      
      // Auto-grading logic
      let evidenceContent = "";
      let finalScore = 0;
      let finalNote = fact.aiNotes || "";

      // If source exists, fetch evidence
      let linkFailed = false;
      if (fact.aiNotes && fact.aiNotes.includes("Source: ")) {
        const sourceUrl = fact.aiNotes.split("Source: ")[1]?.trim();
        if (sourceUrl) {
          try {
            const evidence = await fetchEvidenceForFact(fact.fact, sourceUrl);
            evidenceContent = evidence.content || "";
            if (!evidenceContent) linkFailed = true;
          } catch (err) {
            console.error(`Failed to fetch evidence for fact: ${fact.id}`, err);
            linkFailed = true;
          }
        }
      }

      // Verify with LLMs
      try {
        const verification = await verifyFactWithAllModels(fact.fact, fact.source || "", evidenceContent, linkFailed);
        finalScore = verification.consensus.consensusScore;
        
        // Get the rationale directly from consensus notes
        let rationale = verification.consensus.verificationNotes;
        let isGradeable = true;

        if (verification.consensus.isNonGradeable) {
          rationale = `As the source link is not accessible, this DOK1 could not be graded - ${rationale}`;
          isGradeable = false;
          finalScore = 0;
        }
        
        // Format note: Rationale first, then hyperlinked source at the end
        let sourceHyperlink = "";
        if (fact.aiNotes && fact.aiNotes.includes("Source: ")) {
          const sourceUrl = fact.aiNotes.split("Source: ")[1]?.trim();
          if (sourceUrl) {
            sourceHyperlink = `Source: [${sourceUrl}](${sourceUrl})`;
          }
        } else if (fact.source && fact.source.startsWith("http")) {
          sourceHyperlink = `Source: [${fact.source}](${fact.source})`;
        } else {
          sourceHyperlink = "No sources have been linked to this fact";
        }

        finalNote = `${rationale}\n\n${sourceHyperlink}`;

        return {
          originalId: fact.id,
          category: fact.category,
          source: fact.source || null,
          fact: fact.fact,
          summary,
          score: finalScore,
          contradicts: fact.contradicts,
          note: finalNote,
          flags: fact.flags || [],
          isGradeable,
        };
      } catch (err) {
        console.error(`Verification failed for fact: ${fact.id}`, err);
        return {
          originalId: fact.id,
          category: fact.category,
          source: fact.source || null,
          fact: fact.fact,
          summary,
          score: 0,
          contradicts: fact.contradicts,
          note: `Verification failed due to a system error.\n\n${fact.aiNotes || "No sources have been linked to this fact"}`,
          flags: fact.flags || [],
          isGradeable: false,
        };
      }
    }))),
    // Contradiction detection
    (async () => {
      const { findContradictions } = await import("./ai/brainliftExtractor");
      return findContradictions(data.facts);
    })(),
    // Parallel reading list extraction
    (async () => {
      const { extractReadingList } = await import("./ai/brainliftExtractor");
      return extractReadingList(data.title, data.description, data.facts);
    })(),
    // Parallel expert extraction
    (async () => {
      const { extractAndRankExperts } = await import("./ai/expertExtractor");
      // We need a brainliftId but it's not created yet. 
      // The expertExtractor uses it for the returned object.
      // We'll pass 0 and update it later or handle it in createBrainlift.
      return extractAndRankExperts({
        brainliftId: 0, 
        title: data.title,
        description: data.description,
        author: (data as any).author || null,
        facts: data.facts as any,
        originalContent: originalContent,
        readingList: data.readingList
      });
    })()
  ]);

  // Calculate dynamic summary stats
  const totalFacts = factsWithSummaries.length;
  const gradeableFacts = factsWithSummaries.filter(f => f.isGradeable);
  const sumScores = gradeableFacts.reduce((sum, f) => sum + f.score, 0);
  const meanScore = gradeableFacts.length > 0 ? (sumScores / gradeableFacts.length).toFixed(2) : "0";
  const score5Count = factsWithSummaries.filter(f => f.score === 5).length;

  const clusters = contradictionClusters.map((c: any) => ({
    name: c.name,
    tension: c.tension,
    status: c.status,
    factIds: c.factIds,
    claims: c.claims,
  }));

  const dynamicSummary = {
    totalFacts,
    meanScore,
    score5Count,
    contradictionCount: factsWithSummaries.filter(f => f.contradicts).length || clusters.length
  };
  
  // Use either the extracted reading list or the one from input data (if any)
  const finalReadingList = extractedReadingList.length > 0 ? extractedReadingList : (data.readingList || []).map((r) => ({
    type: r.type,
    author: r.author,
    topic: r.topic,
    time: r.time,
    facts: r.facts,
    url: r.url,
  }));

  return storage.createBrainlift(
    {
      slug,
      title: data.title,
      description: data.description,
      author: null,
      summary: dynamicSummary,
      classification: data.classification,
      improperlyFormatted: data.improperlyFormatted ?? false,
      rejectionReason: data.rejectionReason || null,
      rejectionSubtype: data.rejectionSubtype || null,
      rejectionRecommendation: data.rejectionRecommendation || null,
      originalContent: originalContent || null,
      sourceType: sourceType || null,
    },
    factsWithSummaries,
    clusters,
    finalReadingList,
    userId,
    extractedExperts
  );
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Get all brainlifts
  app.get(api.brainlifts.list.path, async (req, res) => {
    const brainlifts = await storage.getAllBrainlifts();
    res.json(brainlifts);
  });

  app.get(api.brainlifts.get.path, async (req, res) => {
    const brainlift = await storage.getBrainliftBySlug(req.params.slug);
    if (!brainlift) {
      return res.status(404).json({ message: "Brainlift not found" });
    }
    res.json(brainlift);
  });

  app.post(api.brainlifts.create.path, async (req, res) => {
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
        input.readingList
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

  app.delete('/api/brainlifts/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid brainlift ID" });
      }
      await storage.deleteBrainlift(id);
      res.json({ message: "Brainlift deleted successfully" });
    } catch (err) {
      console.error('Delete brainlift error:', err);
      res.status(500).json({ message: "Failed to delete brainlift" });
    }
  });

  app.post('/api/brainlifts/import', upload.single('file'), async (req, res) => {
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
      const brainlift = await saveBrainliftFromAI(brainliftData, content, sourceType);

      res.status(201).json(brainlift);
    } catch (err: any) {
      console.error('Import error:', err);
      res.status(500).json({ message: err.message || 'Failed to import brainlift' });
    }
  });

  // Get grades for a brainlift
  app.get('/api/brainlifts/:slug/grades', async (req, res) => {
    try {
      const brainlift = await storage.getBrainliftBySlug(req.params.slug);
      if (!brainlift) {
        return res.status(404).json({ message: 'Brainlift not found' });
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

  app.post('/api/grades', async (req, res) => {
    try {
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
  app.patch('/api/brainlifts/:slug/update', upload.single('file'), async (req, res) => {
    try {
      const { slug } = req.params;
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
      
      // Use either the extracted reading list or the one from input data (if any)
      const finalReadingList = (brainliftData.readingList || []).map((r) => ({
        type: r.type,
        author: r.author,
        topic: r.topic,
        time: r.time,
        facts: r.facts,
        url: r.url,
      }));

      // Extra ranking for experts during update
      const { extractAndRankExperts } = await import("./ai/expertExtractor");
      const currentBrainlift = await storage.getBrainliftBySlug(slug);
      const extractedExperts = await extractAndRankExperts({
        brainliftId: currentBrainlift?.id || 0,
        title: brainliftData.title,
        description: brainliftData.description,
        author: (brainliftData as any).author || null,
        facts: brainliftData.facts as any,
        originalContent: content,
        readingList: brainliftData.readingList
      });

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
        finalReadingList,
        extractedExperts
      );

      res.json(updatedBrainlift);
    } catch (err: any) {
      console.error('Update error:', err);
      res.status(500).json({ message: err.message || 'Failed to update brainlift' });
    }
  });

  // Get version history for a brainlift
  app.get('/api/brainlifts/:slug/versions', async (req, res) => {
    try {
      const brainlift = await storage.getBrainliftBySlug(req.params.slug);
      if (!brainlift) {
        return res.status(404).json({ message: 'Brainlift not found' });
      }
      const versions = await storage.getVersionsByBrainliftId(brainlift.id);
      res.json(versions);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Search for new resources using Perplexity
  app.post('/api/brainlifts/:slug/research', async (req, res) => {
    try {
      const brainlift = await storage.getBrainliftBySlug(req.params.slug);
      if (!brainlift) {
        return res.status(404).json({ message: 'Brainlift not found' });
      }

      const { mode, query } = req.body;
      const existingTopics = brainlift.readingList.map(r => r.topic);

      // Get experts sorted by rankScore (highest first) for prioritized search
      const experts = await storage.getFollowedExperts(brainlift.id);
      const sortedExperts = [...experts].sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0));
      let prioritizedExpertNames = sortedExperts.map(e => e.name);
      
      // If no followed experts, extract expert names from the brainlift's originalContent
      if (prioritizedExpertNames.length === 0 && brainlift.originalContent) {
        const extractedNames: string[] = [];
        
        // Extract expert names from "Who:" patterns in DOK1 section
        const namePatterns = [
          /Who:\s*([^;]+?)(?:\s*;|$)/gi,
          /Expert\s+\d+[:\s]+(?:Who:\s*)?([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
        ];
        for (const pattern of namePatterns) {
          let match;
          while ((match = pattern.exec(brainlift.originalContent)) !== null) {
            if (match[1]) {
              const name = match[1].trim().replace(/[;,].*$/, '').trim();
              if (name.length > 3 && name.length < 50) {
                extractedNames.push(name);
              }
            }
          }
        }
        
        if (extractedNames.length > 0) {
          prioritizedExpertNames = Array.from(new Set(extractedNames)).slice(0, 10);
          console.log('Research: Using extracted expert names from brainlift content:', prioritizedExpertNames);
        }
      }

      // Get existing feedback for research sources to improve results
      const existingFeedback = await storage.getSourceFeedback(brainlift.id, 'research');
      const feedbackItems = existingFeedback.map(f => ({
        url: f.url,
        title: f.title,
        summary: f.snippet,
        decision: f.decision as 'accepted' | 'rejected',
      }));

      // Get graded sources to inform quality preferences
      const gradedReadingList = await storage.getGradedReadingList(brainlift.id);
      const gradedSources = gradedReadingList.map(item => ({
        type: item.type,
        author: item.author,
        topic: item.topic,
        url: item.url,
        quality: item.quality,
        aligns: item.aligns,
      }));

      let result;
      if (mode === 'deep') {
        const factTexts = brainlift.facts.map(f => f.fact);
        result = await deepResearch(
          brainlift.title,
          brainlift.description,
          factTexts,
          feedbackItems,
          gradedSources,
          prioritizedExpertNames,
          query
        );
      } else {
        result = await searchForResources(
          brainlift.title,
          brainlift.description,
          existingTopics,
          feedbackItems,
          gradedSources,
          prioritizedExpertNames
        );
      }

      res.json(result);
    } catch (err: any) {
      console.error('Research error:', err);
      res.status(500).json({ message: err.message || 'Failed to perform research' });
    }
  });

  // Add a resource from research to reading list
  app.post('/api/brainlifts/:slug/reading-list', async (req, res) => {
    try {
      const brainlift = await storage.getBrainliftBySlug(req.params.slug);
      if (!brainlift) {
        return res.status(404).json({ message: 'Brainlift not found' });
      }

      const { type, author, topic, time, facts, url } = req.body;
      
      const newItem = await storage.addReadingListItem(brainlift.id, {
        type,
        author,
        topic,
        time,
        facts: facts || '',
        url,
      });

      res.json(newItem);
    } catch (err: any) {
      console.error('Add reading list item error:', err);
      res.status(500).json({ message: err.message || 'Failed to add reading list item' });
    }
  });

  // Search Twitter for relevant tweets
  app.post('/api/brainlifts/:slug/tweets', async (req, res) => {
    try {
      const brainlift = await storage.getBrainliftBySlug(req.params.slug);
      if (!brainlift) {
        return res.status(404).json({ message: 'Brainlift not found' });
      }

      const facts = brainlift.facts.map(f => ({
        id: f.originalId || `${f.id}`,
        fact: f.fact,
        source: f.source || '',
      }));

      // Extract expert names from fact sources and reading list authors
      const expertSources = brainlift.facts
        .map(f => f.source || '')
        .filter(s => s.length > 0);
      
      const expertAuthors = brainlift.readingList
        .map(r => r.author || '')
        .filter(a => a.length > 0);

      // Get followed experts sorted by rankScore (highest first) to prioritize their tweets
      const followedExperts = await storage.getFollowedExperts(brainlift.id);
      const sortedExperts = [...followedExperts].sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0));
      
      // CRITICAL: Extract expert handles from originalContent if no followed experts
      // This ensures we search for the actual experts mentioned in the brainlift
      const extractedHandles: string[] = [];
      const extractedNames: string[] = [];
      
      if (brainlift.originalContent) {
        // Extract Twitter handles like @TheWritingRev, @natwexler, @Doug_Lemov
        // IMPORTANT: Preserve original casing - Twitter API from: queries are case-sensitive
        const handleMatches = brainlift.originalContent.match(/@([A-Za-z0-9_]+)/g);
        if (handleMatches) {
          for (const h of handleMatches) {
            const clean = h.replace('@', '');
            const lowerClean = clean.toLowerCase();
            // Filter out common non-person handles
            if (!['gmail', 'email', 'http', 'https', 'assets', 'media'].includes(lowerClean) && clean.length > 2) {
              extractedHandles.push(clean); // Keep original casing
            }
          }
        }
        
        // Extract expert names like "Dr. Judith C. Hochman", "Natalie Wexler", "Doug Lemov"
        const namePatterns = [
          /Who:\s*([^;]+?)(?:\s*;|$)/gi,
          /Expert\s+\d+[:\s]+(?:Who:\s*)?([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
        ];
        for (const pattern of namePatterns) {
          let match;
          while ((match = pattern.exec(brainlift.originalContent)) !== null) {
            if (match[1]) {
              const name = match[1].trim().replace(/[;,].*$/, '').trim();
              if (name.length > 3 && name.length < 50) {
                extractedNames.push(name);
              }
            }
          }
        }
      }
      
      // Combine followed experts with extracted handles
      let followedHandles = sortedExperts
        .filter(e => e.twitterHandle)
        .map(e => e.twitterHandle!.replace('@', ''));
      
      // If no followed experts, use extracted handles from content
      if (followedHandles.length === 0 && extractedHandles.length > 0) {
        followedHandles = Array.from(new Set(extractedHandles)).slice(0, 10);
        console.log('Using extracted expert handles:', followedHandles);
      }
      
      // Build expert objects with name and handle properly paired for similar accounts
      let prioritizedExperts = sortedExperts.map(e => ({
        name: e.name,
        handle: e.twitterHandle?.replace('@', ''),
      }));
      
      // If no followed experts, use extracted names
      if (prioritizedExperts.length === 0 && extractedNames.length > 0) {
        prioritizedExperts = Array.from(new Set(extractedNames)).slice(0, 10).map(name => ({
          name,
          handle: undefined,
        }));
        console.log('Using extracted expert names:', extractedNames.slice(0, 10));
      }

      // Get existing feedback to improve search
      const existingFeedback = await storage.getSourceFeedback(brainlift.id, 'tweet');
      const feedbackItems = existingFeedback.map(f => ({
        tweetId: f.sourceId,
        authorUsername: f.title,
        text: f.snippet,
        decision: f.decision as 'accepted' | 'rejected',
      }));

      // Get graded sources to inform quality preferences
      const gradedReadingList = await storage.getGradedReadingList(brainlift.id);
      const gradedSources = gradedReadingList.map(item => ({
        type: item.type,
        author: item.author,
        topic: item.topic,
        url: item.url,
        quality: item.quality,
        aligns: item.aligns,
      }));

      const result = await searchRelevantTweets(
        brainlift.title,
        brainlift.description,
        facts,
        expertSources,
        expertAuthors,
        feedbackItems,
        gradedSources,
        followedHandles,
        prioritizedExperts
      );

      res.json(result);
    } catch (err: any) {
      console.error('Twitter search error:', err);
      res.status(500).json({ message: err.message || 'Failed to search tweets' });
    }
  });

  // Get source feedback for a brainlift (tweets and research)
  app.get('/api/brainlifts/:slug/feedback', async (req, res) => {
    try {
      const brainlift = await storage.getBrainliftBySlug(req.params.slug);
      if (!brainlift) {
        return res.status(404).json({ message: 'Brainlift not found' });
      }

      const sourceType = req.query.sourceType as string | undefined;
      const feedback = await storage.getSourceFeedback(brainlift.id, sourceType);
      res.json(feedback);
    } catch (err: any) {
      console.error('Get source feedback error:', err);
      res.status(500).json({ message: err.message || 'Failed to get source feedback' });
    }
  });

  // Save source feedback (accept/reject) - unified endpoint for tweets and research
  app.post('/api/brainlifts/:slug/feedback', async (req, res) => {
    try {
      const brainlift = await storage.getBrainliftBySlug(req.params.slug);
      if (!brainlift) {
        return res.status(404).json({ message: 'Brainlift not found' });
      }

      const feedbackSchema = z.object({
        sourceId: z.string(),
        sourceType: z.enum(['tweet', 'research']),
        title: z.string(),
        snippet: z.string(),
        url: z.string(),
        decision: z.enum(['accepted', 'rejected']),
      });

      const validated = feedbackSchema.parse(req.body);
      
      const saved = await storage.saveSourceFeedback({
        brainliftId: brainlift.id,
        ...validated,
      });

      res.json(saved);
    } catch (err: any) {
      console.error('Save source feedback error:', err);
      res.status(500).json({ message: err.message || 'Failed to save source feedback' });
    }
  });

  // Get experts for a brainlift
  app.get('/api/brainlifts/:slug/experts', async (req, res) => {
    try {
      const brainlift = await storage.getBrainliftBySlug(req.params.slug);
      if (!brainlift) {
        return res.status(404).json({ message: 'Brainlift not found' });
      }

      const expertsList = await storage.getExpertsByBrainliftId(brainlift.id);
      res.json(expertsList);
    } catch (err: any) {
      console.error('Get experts error:', err);
      res.status(500).json({ message: err.message || 'Failed to get experts' });
    }
  });

  // Refresh/extract experts for a brainlift using AI
  app.post('/api/brainlifts/:slug/experts/refresh', async (req, res) => {
    try {
      const brainlift = await storage.getBrainliftBySlug(req.params.slug);
      if (!brainlift) {
        return res.status(404).json({ message: 'Brainlift not found' });
      }

      const expertsData = await extractAndRankExperts({
        brainliftId: brainlift.id,
        title: brainlift.title,
        description: brainlift.description,
        author: brainlift.author,
        facts: brainlift.facts,
        originalContent: brainlift.originalContent || '',
        readingList: brainlift.readingList || [],
      });

      const saved = await storage.saveExperts(brainlift.id, expertsData);
      res.json(saved);
    } catch (err: any) {
      console.error('Refresh experts error:', err);
      res.status(500).json({ message: err.message || 'Failed to refresh experts' });
    }
  });

  // Update expert following status
  app.patch('/api/experts/:id/follow', async (req, res) => {
    try {
      const expertId = parseInt(req.params.id);
      const { isFollowing } = req.body;
      
      if (typeof isFollowing !== 'boolean') {
        return res.status(400).json({ message: 'isFollowing must be a boolean' });
      }

      const updated = await storage.updateExpertFollowing(expertId, isFollowing);
      res.json(updated);
    } catch (err: any) {
      console.error('Update expert following error:', err);
      res.status(500).json({ message: err.message || 'Failed to update expert' });
    }
  });

  // Delete an expert
  app.delete('/api/experts/:id', async (req, res) => {
    try {
      const expertId = parseInt(req.params.id);
      await storage.deleteExpert(expertId);
      res.json({ success: true });
    } catch (err: any) {
      console.error('Delete expert error:', err);
      res.status(500).json({ message: err.message || 'Failed to delete expert' });
    }
  });

  // Get followed experts for a brainlift (used by tweet search)
  app.get('/api/brainlifts/:slug/experts/following', async (req, res) => {
    try {
      const brainlift = await storage.getBrainliftBySlug(req.params.slug);
      if (!brainlift) {
        return res.status(404).json({ message: 'Brainlift not found' });
      }

      const followedExperts = await storage.getFollowedExperts(brainlift.id);
      res.json(followedExperts);
    } catch (err: any) {
      console.error('Get followed experts error:', err);
      res.status(500).json({ message: err.message || 'Failed to get followed experts' });
    }
  });

  // ==================== MULTI-LLM FACT VERIFICATION ====================

  // Get all facts with their verification status for a brainlift
  app.get('/api/brainlifts/:slug/verifications', async (req, res) => {
    try {
      const brainlift = await storage.getBrainliftBySlug(req.params.slug);
      if (!brainlift) {
        return res.status(404).json({ message: 'Brainlift not found' });
      }

      const factsWithVerifications = await storage.getFactsWithVerifications(brainlift.id);
      res.json({
        brainliftId: brainlift.id,
        facts: factsWithVerifications,
        models: LLM_MODEL_NAMES,
      });
    } catch (err: any) {
      console.error('Get verifications error:', err);
      res.status(500).json({ message: err.message || 'Failed to get verifications' });
    }
  });

  // Start verification for a single fact
  app.post('/api/facts/:factId/verify', async (req, res) => {
    try {
      const factId = parseInt(req.params.factId);
      
      // Get the fact directly from database (efficient lookup)
      const targetFact = await storage.getFactById(factId);
      
      if (!targetFact) {
        return res.status(404).json({ message: 'Fact not found' });
      }

      // Create or get existing verification record
      const verification = await storage.createFactVerification(factId);
      
      // Update status to in_progress
      await storage.updateFactVerification(verification.id, { status: 'in_progress' });

      // Step 1: Fetch evidence from the source
      console.log(`Fetching evidence for fact ${factId}...`);
      const evidence = await fetchEvidenceForFact(targetFact.fact, targetFact.source || '');
      
      await storage.updateFactVerification(verification.id, {
        evidenceUrl: evidence.url,
        evidenceContent: evidence.content,
        evidenceFetchedAt: evidence.fetchedAt,
        evidenceError: evidence.error,
      });

      // Step 2: Get model weights from accuracy stats (if any human feedback exists)
      const accuracyStats = await storage.getModelAccuracyStats();
      const modelWeights: Record<string, number> = {};
      for (const stat of accuracyStats) {
        modelWeights[stat.model] = parseFloat(stat.weight) || 1;
      }

      // Step 3: Run multi-LLM verification with weighted consensus
      console.log(`Running multi-LLM verification for fact ${factId}...`);
      const verificationResult = await verifyFactWithAllModels(
        targetFact.fact,
        targetFact.source || '',
        evidence.content || '',
        modelWeights as any
      );

      // Step 3: Save individual model scores
      for (const modelResult of verificationResult.modelResults) {
        await storage.saveModelScore(verification.id, {
          model: modelResult.model,
          score: modelResult.score,
          rationale: modelResult.rationale,
          status: modelResult.status,
          error: modelResult.error,
        });
      }

      // Step 4: Check if all models failed
      const allFailed = verificationResult.modelResults.every(r => r.status === 'failed');
      const finalStatus = allFailed ? 'failed' : 'completed';

      // Step 5: Save consensus
      await storage.updateFactVerification(verification.id, {
        status: finalStatus,
        consensusScore: verificationResult.consensus.consensusScore,
        confidenceLevel: verificationResult.consensus.confidenceLevel,
        needsReview: verificationResult.consensus.needsReview,
        verificationNotes: verificationResult.consensus.verificationNotes,
      });

      // Return updated verification
      const updatedVerification = await storage.getFactVerification(factId);
      res.json(updatedVerification);
    } catch (err: any) {
      console.error('Verify fact error:', err);
      res.status(500).json({ message: err.message || 'Failed to verify fact' });
    }
  });

  // Start verification for all facts in a brainlift
  app.post('/api/brainlifts/:slug/verify-all', async (req, res) => {
    try {
      const brainlift = await storage.getBrainliftBySlug(req.params.slug);
      if (!brainlift) {
        return res.status(404).json({ message: 'Brainlift not found' });
      }

      // Return immediately, process in background
      res.json({ 
        message: 'Verification started', 
        totalFacts: brainlift.facts.length,
        status: 'in_progress' 
      });

      // Process facts one by one in background
      (async () => {
        for (const fact of brainlift.facts) {
          try {
            console.log(`Verifying fact ${fact.id}: ${fact.fact.slice(0, 50)}...`);
            
            const verification = await storage.createFactVerification(fact.id);
            await storage.updateFactVerification(verification.id, { status: 'in_progress' });

            const evidence = await fetchEvidenceForFact(fact.fact, fact.source || '');
            await storage.updateFactVerification(verification.id, {
              evidenceUrl: evidence.url,
              evidenceContent: evidence.content,
              evidenceFetchedAt: evidence.fetchedAt,
              evidenceError: evidence.error,
            });

            // Get model weights
            const accuracyStats = await storage.getModelAccuracyStats();
            const modelWeights: Record<string, number> = {};
            for (const stat of accuracyStats) {
              modelWeights[stat.model] = parseFloat(stat.weight) || 1;
            }

            const verificationResult = await verifyFactWithAllModels(
              fact.fact,
              fact.source || '',
              evidence.content || '',
              modelWeights as any
            );

            for (const modelResult of verificationResult.modelResults) {
              await storage.saveModelScore(verification.id, {
                model: modelResult.model,
                score: modelResult.score,
                rationale: modelResult.rationale,
                status: modelResult.status,
                error: modelResult.error,
              });
            }

            const allFailed = verificationResult.modelResults.every(r => r.status === 'failed');
            const finalStatus = allFailed ? 'failed' : 'completed';

            await storage.updateFactVerification(verification.id, {
              status: finalStatus,
              consensusScore: verificationResult.consensus.consensusScore,
              confidenceLevel: verificationResult.consensus.confidenceLevel,
              needsReview: verificationResult.consensus.needsReview,
              verificationNotes: verificationResult.consensus.verificationNotes,
            });

            console.log(`Fact ${fact.id} verified: ${verificationResult.consensus.consensusScore}/5 (${finalStatus})`);
          } catch (e: any) {
            console.error(`Failed to verify fact ${fact.id}:`, e);
          }
        }
        console.log(`Verification complete for brainlift: ${brainlift.slug}`);
      })();
    } catch (err: any) {
      console.error('Verify all facts error:', err);
      res.status(500).json({ message: err.message || 'Failed to start verification' });
    }
  });

  // Human override for a fact verification
  app.post('/api/verifications/:verificationId/override', async (req, res) => {
    try {
      const verificationId = parseInt(req.params.verificationId);
      const { score, notes } = req.body;
      
      if (!score || score < 1 || score > 5) {
        return res.status(400).json({ message: 'Score must be between 1 and 5' });
      }

      const updated = await storage.setHumanOverride(verificationId, score, notes || '');
      res.json(updated);
    } catch (err: any) {
      console.error('Human override error:', err);
      res.status(500).json({ message: err.message || 'Failed to set human override' });
    }
  });

  // Human grade for a fact (creates verification if needed, sets human override)
  app.post('/api/facts/:factId/human-grade', async (req, res) => {
    try {
      const factId = parseInt(req.params.factId);
      const { score, notes } = req.body;
      
      if (!score || score < 1 || score > 5) {
        return res.status(400).json({ message: 'Score must be between 1 and 5' });
      }

      // Get or create verification for this fact
      let verification = await storage.getFactVerification(factId);
      if (!verification) {
        verification = await storage.createFactVerification(factId) as any;
      }

      // Set human override
      const updated = await storage.setHumanOverride(verification.id, score, notes || '');
      res.json(updated);
    } catch (err: any) {
      console.error('Human grade error:', err);
      res.status(500).json({ message: err.message || 'Failed to set human grade' });
    }
  });

  // Get human grades for all facts in a brainlift
  app.get('/api/brainlifts/:slug/human-grades', async (req, res) => {
    try {
      const brainlift = await storage.getBrainliftBySlug(req.params.slug);
      if (!brainlift) {
        return res.status(404).json({ message: 'Brainlift not found' });
      }

      const factsWithVerifications = await storage.getFactsWithVerifications(brainlift.id);
      
      // Return map of factId -> human grade info
      const grades: Record<number, { score: number | null; notes: string | null }> = {};
      for (const f of factsWithVerifications) {
        if (f.verification?.humanOverrideScore) {
          grades[f.id] = {
            score: f.verification.humanOverrideScore,
            notes: f.verification.humanOverrideNotes,
          };
        }
      }
      
      res.json(grades);
    } catch (err: any) {
      console.error('Get human grades error:', err);
      res.status(500).json({ message: err.message || 'Failed to get human grades' });
    }
  });

  // ==================== REDUNDANCY DETECTION ====================

  // Analyze facts for redundancy
  app.post('/api/brainlifts/:slug/analyze-redundancy', async (req, res) => {
    try {
      const brainlift = await storage.getBrainliftBySlug(req.params.slug);
      if (!brainlift) {
        return res.status(404).json({ message: 'Brainlift not found' });
      }

      const { analyzeFactRedundancy } = await import('./ai/redundancyAnalyzer');
      const facts = await storage.getFactsForBrainlift(brainlift.id);
      
      const result = await analyzeFactRedundancy(facts);
      
      // Save redundancy groups to database
      if (result.redundancyGroups.length > 0) {
        await storage.saveRedundancyGroups(brainlift.id, result.redundancyGroups.map(g => ({
          groupName: g.groupName,
          factIds: g.factIds,
          primaryFactId: g.primaryFactId,
          similarityScore: g.similarityScore,
          reason: g.reason,
          status: 'pending' as const,
        })));
      }

      res.json({
        ...result,
        message: `Found ${result.redundancyGroups.length} redundancy groups affecting ${result.redundantFactCount} facts`,
      });
    } catch (err: any) {
      console.error('Redundancy analysis error:', err);
      res.status(500).json({ message: err.message || 'Failed to analyze redundancy' });
    }
  });

  // Get redundancy groups for a brainlift
  app.get('/api/brainlifts/:slug/redundancy', async (req, res) => {
    try {
      const brainlift = await storage.getBrainliftBySlug(req.params.slug);
      if (!brainlift) {
        return res.status(404).json({ message: 'Brainlift not found' });
      }

      const groups = await storage.getRedundancyGroups(brainlift.id);
      const facts = await storage.getFactsForBrainlift(brainlift.id);
      
      // Build a fact lookup map
      const factMap = new Map(facts.map(f => [f.id, f]));
      
      // Calculate stats
      const allRedundantFactIds = new Set<number>();
      groups.filter(g => g.status === 'pending').forEach(g => {
        g.factIds.forEach(id => allRedundantFactIds.add(id));
      });
      
      const pendingGroups = groups.filter(g => g.status === 'pending');
      const uniqueFactCount = facts.length - allRedundantFactIds.size + pendingGroups.length;
      
      res.json({
        groups: groups.map(g => ({
          ...g,
          facts: g.factIds.map(id => factMap.get(id)).filter(Boolean),
          primaryFact: factMap.get(g.primaryFactId || 0),
        })),
        stats: {
          totalFacts: facts.length,
          uniqueFactCount,
          redundantFactCount: allRedundantFactIds.size - pendingGroups.length,
          pendingReview: pendingGroups.length,
        },
      });
    } catch (err: any) {
      console.error('Get redundancy error:', err);
      res.status(500).json({ message: err.message || 'Failed to get redundancy data' });
    }
  });

  // Update redundancy group status (keep, dismiss, merge)
  app.patch('/api/redundancy-groups/:groupId', async (req, res) => {
    try {
      const groupId = parseInt(req.params.groupId);
      const { status } = req.body;
      
      if (!['pending', 'kept', 'merged', 'dismissed'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }

      const updated = await storage.updateRedundancyGroupStatus(groupId, status);
      res.json(updated);
    } catch (err: any) {
      console.error('Update redundancy group error:', err);
      res.status(500).json({ message: err.message || 'Failed to update redundancy group' });
    }
  });

  // Get verification status summary for a brainlift
  app.get('/api/brainlifts/:slug/verification-summary', async (req, res) => {
    try {
      const brainlift = await storage.getBrainliftBySlug(req.params.slug);
      if (!brainlift) {
        return res.status(404).json({ message: 'Brainlift not found' });
      }

      const factsWithVerifications = await storage.getFactsWithVerifications(brainlift.id);
      
      const summary = {
        totalFacts: factsWithVerifications.length,
        verified: 0,
        pending: 0,
        inProgress: 0,
        needsReview: 0,
        byScore: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>,
        averageConsensus: 0,
        highConfidence: 0,
        mediumConfidence: 0,
        lowConfidence: 0,
      };

      let totalScores = 0;
      for (const fact of factsWithVerifications) {
        if (!fact.verification) {
          summary.pending++;
        } else if (fact.verification.status === 'in_progress') {
          summary.inProgress++;
        } else if (fact.verification.status === 'completed') {
          summary.verified++;
          
          const score = fact.verification.humanOverrideScore || fact.verification.consensusScore || 0;
          if (score >= 1 && score <= 5) {
            summary.byScore[score]++;
            totalScores += score;
          }
          
          if (fact.verification.needsReview) {
            summary.needsReview++;
          }
          
          if (fact.verification.confidenceLevel === 'high') summary.highConfidence++;
          else if (fact.verification.confidenceLevel === 'medium') summary.mediumConfidence++;
          else summary.lowConfidence++;
        }
      }

      summary.averageConsensus = summary.verified > 0 ? Math.round((totalScores / summary.verified) * 10) / 10 : 0;

      res.json(summary);
    } catch (err: any) {
      console.error('Verification summary error:', err);
      res.status(500).json({ message: err.message || 'Failed to get verification summary' });
    }
  });

  // Model accuracy analytics - Shows which LLMs are most accurate vs human review
  app.get('/api/analytics/model-accuracy', async (req, res) => {
    try {
      const stats = await storage.getModelAccuracyStats();
      const feedback = await storage.getLlmFeedbackHistory(50);
      
      // Sort by accuracy (lowest MAE = most accurate)
      const sortedStats = [...stats].sort((a, b) => 
        parseFloat(a.meanAbsoluteError) - parseFloat(b.meanAbsoluteError)
      );
      
      // Calculate accuracy tier for each model
      const modelAnalytics = sortedStats.map((stat, index) => {
        const mae = parseFloat(stat.meanAbsoluteError);
        let accuracyTier: 'excellent' | 'good' | 'fair' | 'poor';
        if (mae <= 0.5) accuracyTier = 'excellent';
        else if (mae <= 1.0) accuracyTier = 'good';
        else if (mae <= 1.5) accuracyTier = 'fair';
        else accuracyTier = 'poor';
        
        return {
          model: stat.model,
          modelName: LLM_MODEL_NAMES[stat.model as keyof typeof LLM_MODEL_NAMES] || stat.model,
          totalSamples: stat.totalSamples,
          meanAbsoluteError: mae.toFixed(3),
          weight: parseFloat(stat.weight).toFixed(3),
          accuracyTier,
          rank: index + 1,
        };
      });
      
      // Get recent feedback by model
      const recentByModel: Record<string, { llmScore: number; humanScore: number; diff: number }[]> = {};
      for (const fb of feedback) {
        if (!recentByModel[fb.llmModel]) recentByModel[fb.llmModel] = [];
        recentByModel[fb.llmModel].push({
          llmScore: fb.llmScore,
          humanScore: fb.humanScore,
          diff: fb.scoreDifference,
        });
      }
      
      res.json({
        models: modelAnalytics,
        totalOverrides: stats.reduce((sum, s) => sum + s.totalSamples, 0),
        recentFeedback: recentByModel,
      });
    } catch (err: any) {
      console.error('Model accuracy analytics error:', err);
      res.status(500).json({ message: err.message || 'Failed to get model accuracy analytics' });
    }
  });

  await seedDatabase();
  
  // Backfill originalContent for existing brainlifts that are missing it
  await backfillOriginalContent();

  return httpServer;
}

// Backfill function to update existing brainlifts with originalContent from seedData
async function backfillOriginalContent() {
  console.log("Checking for brainlifts missing originalContent...");
  
  for (const bl of brainliftsData) {
    const seedOriginalContent = (bl as any).original_content;
    const seedSourceType = (bl as any).source_type;
    
    if (!seedOriginalContent) continue;
    
    try {
      const existing = await storage.getBrainliftBySlug(bl.slug);
      if (existing && !existing.originalContent) {
        console.log(`Backfilling originalContent for ${bl.slug}...`);
        await storage.updateBrainliftFields(existing.id, {
          originalContent: seedOriginalContent,
          sourceType: seedSourceType || 'html'
        });
        console.log(`Updated ${bl.slug} with originalContent`);
      }
    } catch (e) {
      console.error(`Failed to backfill ${bl.slug}:`, e);
    }
  }
}
