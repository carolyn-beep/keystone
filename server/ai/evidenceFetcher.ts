const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

export interface EvidenceResult {
  url: string | null;
  content: string | null;
  error: string | null;
  fetchedAt: Date;
}

function extractUrlFromSource(source: string): string | null {
  if (!source) return null;
  
  const urlMatch = source.match(/https?:\/\/[^\s\)]+/i);
  if (urlMatch) {
    return urlMatch[0].replace(/[.,;:]+$/, '');
  }
  
  return null;
}

async function fetchWebContent(url: string): Promise<{ content: string | null; error: string | null; isPdf?: boolean }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    console.log(`[Evidence] Fetching web content from: ${url}`);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DOK1Grader/1.0; +https://replit.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`[Evidence] HTTP error for ${url}: ${response.status} ${response.statusText}`);
      return { content: null, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const contentType = response.headers.get('content-type') || '';
    console.log(`[Evidence] Content-Type for ${url}: ${contentType}`);

    // Check if it's a PDF
    const isPdf = contentType.includes('application/pdf') ||
                  url.toLowerCase().endsWith('.pdf') ||
                  url.includes('/pdf/');

    if (isPdf) {
      console.log(`[Evidence] PDF detected - cannot extract text directly, will use AI knowledge`);
      return { content: null, error: 'Source is a PDF document - cannot extract text directly', isPdf: true };
    }

    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      console.log(`[Evidence] Unsupported content type: ${contentType}`);
      return { content: null, error: `Unsupported content type: ${contentType}` };
    }
    
    const html = await response.text();

    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    const content = textContent.slice(0, 8000);
    console.log(`[Evidence] Successfully extracted ${content.length} chars from ${url}`);
    return { content, error: null };
  } catch (err: any) {
    console.log(`[Evidence] Error fetching ${url}: ${err.message}`);
    return { content: null, error: err.message };
  }
}

async function callEvidenceSearchModel(model: string, prompt: string): Promise<string | null> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://replit.com',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response');
  return content;
}

async function searchForEvidence(
  fact: string,
  source: string,
  fetchError?: string | null
): Promise<string | null> {
  if (!OPENROUTER_API_KEY) {
    console.log('[Evidence] No OpenRouter API key configured');
    return null;
  }

  // Build context about why we're using AI search
  let fetchContext = '';
  if (fetchError) {
    fetchContext = `\n\nNOTE: The source URL/document could not be fetched directly (${fetchError}). Use your training knowledge to provide evidence.`;
  }

  const prompt = `You are an educational research expert. Evaluate this claim using your knowledge of the cited source and broader educational research.

CLAIM: "${fact}"

CITED SOURCE: ${source || 'Not specified'}${fetchContext}

Your task:
1. If you recognize the source (book, paper, author), share what you know about its key findings relevant to this claim
2. Cite related research that supports or contradicts this claim (e.g., "Willingham (2009) argues...", "Rosenshine's research shows...")
3. Provide specific evidence: studies, statistics, established principles from cognitive science or educational psychology

IMPORTANT: Many educational claims cite well-known works like:
- Willingham's "Why Don't Students Like School?"
- Rosenshine's Principles of Instruction
- Sweller's Cognitive Load Theory
- Hattie's Visible Learning research
- Knowledge-rich curriculum research (Hirsch, Christodoulou, etc.)

If the claim references such sources, draw on your knowledge of these works. Do NOT just say "I cannot access the source" - instead, provide what you know about the topic from educational research literature.

Provide a substantive evidence summary (max 500 words) with specific references to research. Plain text only, no markdown or emojis.`;

  // Primary: Gemini Flash
  try {
    console.log('[Evidence] Searching with Gemini Flash...');
    const result = await callEvidenceSearchModel('google/gemini-2.0-flash-001', prompt);
    if (result) {
      console.log(`[Evidence] Gemini found ${result.length} chars of evidence`);
      return result;
    }
  } catch (err: any) {
    console.log(`[Evidence] Gemini search failed: ${err.message}, trying Qwen fallback...`);
  }

  // Fallback: Qwen
  try {
    console.log('[Evidence] Searching with Qwen fallback...');
    const result = await callEvidenceSearchModel('qwen/qwen3-32b', prompt);
    if (result) {
      console.log(`[Evidence] Qwen found ${result.length} chars of evidence`);
      return result;
    }
  } catch (err: any) {
    console.log(`[Evidence] Qwen search also failed: ${err.message}`);
  }

  return null;
}

export async function fetchEvidenceForFact(
  fact: string,
  source: string
): Promise<EvidenceResult> {
  const fetchedAt = new Date();

  console.log(`[Evidence] === Starting evidence fetch ===`);
  console.log(`[Evidence] Fact: "${fact.substring(0, 100)}..."`);
  console.log(`[Evidence] Source: "${source}"`);

  const url = extractUrlFromSource(source);
  let fetchError: string | null = null;

  if (url) {
    console.log(`[Evidence] Extracted URL: ${url}`);
    const webResult = await fetchWebContent(url);

    if (webResult.content && webResult.content.length > 100) {
      console.log(`[Evidence] SUCCESS: Got ${webResult.content.length} chars from URL`);
      return {
        url,
        content: webResult.content,
        error: null,
        fetchedAt,
      };
    } else {
      fetchError = webResult.error || 'No content returned';
      console.log(`[Evidence] URL fetch failed: ${fetchError}`);
    }
  } else {
    console.log(`[Evidence] No URL found in source, will use AI search`);
  }

  console.log('[Evidence] Falling back to AI-powered evidence search...');
  const searchedContent = await searchForEvidence(fact, source, fetchError);

  if (searchedContent) {
    console.log(`[Evidence] SUCCESS: AI search found ${searchedContent.length} chars`);
    return {
      url,
      content: searchedContent,
      error: fetchError, // Keep the original fetch error for transparency
      fetchedAt,
    };
  }

  console.log('[Evidence] FAILED: Could not fetch or find evidence');
  return {
    url,
    content: null,
    error: fetchError || 'Could not fetch or find evidence for this source',
    fetchedAt,
  };
}
