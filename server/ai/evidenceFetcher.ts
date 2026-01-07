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

async function fetchWebContent(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DOK1Grader/1.0; +https://replit.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`Failed to fetch ${url}: ${response.status}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      console.log(`Unsupported content type for ${url}: ${contentType}`);
      return null;
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
    
    return textContent.slice(0, 8000);
  } catch (err: any) {
    console.log(`Error fetching ${url}:`, err.message);
    return null;
  }
}

async function searchForEvidence(
  fact: string,
  source: string
): Promise<string | null> {
  if (!OPENROUTER_API_KEY) {
    return null;
  }

  const prompt = `Given this educational claim and its cited source, search for and provide the most relevant evidence that could verify or refute it.

CLAIM: "${fact}"

CITED SOURCE: ${source || 'Not specified'}

Search your knowledge for:
1. The actual content/findings from this source (if you know it)
2. Related research or data that supports or contradicts this claim
3. Key facts or statistics that could verify this claim

Provide a concise summary of the evidence you find (max 500 words). Focus on specific data, quotes, or findings that directly relate to the claim. Do not use any markdown (no bold, no italics, no bullet points), no formatting, and NO emojis. Provide only the plain text summary.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://replit.com',
      },
      body: JSON.stringify({
        model: 'qwen/qwen3-vl-32b-instruct',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      console.error('Evidence search failed:', response.status);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err: any) {
    console.error('Evidence search error:', err.message);
    return null;
  }
}

export async function fetchEvidenceForFact(
  fact: string,
  source: string
): Promise<EvidenceResult> {
  const fetchedAt = new Date();
  
  const url = extractUrlFromSource(source);
  
  if (url) {
    console.log(`Fetching evidence from URL: ${url}`);
    const webContent = await fetchWebContent(url);
    
    if (webContent && webContent.length > 100) {
      return {
        url,
        content: webContent,
        error: null,
        fetchedAt,
      };
    }
  }
  
  console.log('URL fetch failed or no URL, searching for evidence via AI...');
  const searchedContent = await searchForEvidence(fact, source);
  
  if (searchedContent) {
    return {
      url,
      content: searchedContent,
      error: null,
      fetchedAt,
    };
  }
  
  return {
    url,
    content: null,
    error: 'Could not fetch or find evidence for this source',
    fetchedAt,
  };
}
