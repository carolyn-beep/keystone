/**
 * External Source Fetching Utilities
 *
 * Functions for fetching content from external sources like Workflowy and Google Docs.
 */

export async function fetchWorkflowyContent(nodeIdOrUrl: string): Promise<string> {
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

      // Helper function to strip HTML tags from text, preserving links as markdown
      const stripHtml = (html: string): string => {
        return html
          // Convert <a href="url">text</a> to [text](url) markdown format FIRST
          .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi, '[$2]($1)')
          // Then strip remaining HTML tags
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();
      };

      // Recursively extract text from node tree
      // nm = name (the bullet text, can contain HTML)
      // no = notes (additional text under a bullet)
      // ch = children (nested bullets)
      const nodeToText = (node: any, indent: number = 0): string => {
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
      };

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

export async function fetchGoogleDocsContent(url: string): Promise<string> {
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
