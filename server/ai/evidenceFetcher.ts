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
    fetchContext = `\n\nNOTE: Direct URL fetch failed (${fetchError}). You must rely on your training knowledge about this source. If you cannot verify the claim from your knowledge, clearly state this limitation in your response.`;
  }

  const prompt = `Given this educational claim and its cited source, search for and provide the most relevant evidence that could verify or refute it.

CLAIM: "${fact}"

CITED SOURCE: ${source || 'Not specified'}${fetchContext}

Search your knowledge for:
1. The actual content/findings from this source (if you know it)
2. Related research or data that supports or contradicts this claim
3. Key facts or statistics that could verify this claim

IMPORTANT: If the source is a PDF or book that you cannot access, and you don't have knowledge of its contents, clearly state: "Unable to directly verify - source is [PDF/book] that could not be fetched. Verification based on general knowledge of the topic."

Provide a concise summary of the evidence you find (max 500 words). Focus on specific data, quotes, or findings that directly relate to the claim. Do not use any markdown (no bold, no italics, no bullet points), no formatting, and NO emojis. Provide only the plain text summary.`;

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
